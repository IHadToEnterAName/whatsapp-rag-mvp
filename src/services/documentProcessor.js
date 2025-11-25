const path = require('path');
const fs = require('fs');
const os = require('os');
const util = require('util');
const stream = require('stream');
const pipeline = util.promisify(stream.pipeline);
const unzipper = require('unzipper');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');
const { analyzeDocument } = require('./azureOCR');
const { uploadFile } = require('./azureBlobs');

async function extractImagesFromZip(localPath, mediaPathPrefix) {
  const tempFiles = [];
  const directory = await unzipper.Open.file(localPath);
  for (const entry of directory.files) {
    if (entry.path.startsWith(mediaPathPrefix) && !entry.path.endsWith('/')) {
      const fileName = path.basename(entry.path);
      const dest = path.join(os.tmpdir(), `${Date.now()}-${fileName}`);
      await pipeline(entry.stream(), fs.createWriteStream(dest));
      tempFiles.push(dest);
    }
  }
  return tempFiles;
}

async function processDocument({ localPath, originalName, blobUrl }) {
  const ext = path.extname(originalName).toLowerCase();
  let fullText = '';
  try {
    if (['.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.gif'].includes(ext)) {
      // Image file: run Azure OCR directly on uploaded blob
      fullText = await analyzeDocument(blobUrl);
      return { fullText };
    }

    if (ext === '.pdf') {
      // Extract text with pdf-parse for a local fallback
      const dataBuffer = fs.readFileSync(localPath);
      try {
        const pdfRes = await pdfParse(dataBuffer);
        if (pdfRes && pdfRes.text) fullText += pdfRes.text + '\n';
      } catch (e) {
        // ignore pdf-parse failures and rely on Azure
      }

      // Use Azure Read API on the uploaded blob to capture text (including images inside)
      try {
        const azureText = await analyzeDocument(blobUrl);
        if (azureText) fullText += azureText;
      } catch (e) {
        // if Azure fails, continue with whatever we have
        console.error('Azure read failed for PDF:', e.message);
      }

      return { fullText: fullText.trim() };
    }

    if (ext === '.docx') {
      // Extract text via mammoth
      try {
        const { value } = await mammoth.extractRawText({ path: localPath });
        if (value) fullText += value + '\n';
      } catch (e) {
        console.error('Mammoth failed:', e.message);
      }

      // Extract embedded images from word/media
      const tempImages = await extractImagesFromZip(localPath, 'word/media/');
      for (const imgPath of tempImages) {
        try {
          const imgUrl = await uploadFile(imgPath, path.basename(imgPath));
          const imgText = await analyzeDocument(imgUrl);
          if (imgText) fullText += '\n' + imgText;
        } catch (e) {
          console.error('Image OCR failed for', imgPath, e.message);
        }
      }

      // cleanup temp images
      for (const p of tempImages) {
        try { fs.unlinkSync(p); } catch (e) {}
      }

      return { fullText: fullText.trim() };
    }

    if (ext === '.xlsx' || ext === '.xls') {
      // Extract cell text using xlsx
      try {
        const wb = XLSX.readFile(localPath, { cellDates: true });
        for (const sheetName of wb.SheetNames) {
          const sheet = wb.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
          for (const row of json) {
            if (Array.isArray(row)) fullText += row.join(' ') + '\n';
          }
        }
      } catch (e) {
        console.error('XLSX parse failed:', e.message);
      }

      // Extract embedded images from xl/media
      const tempImages = await extractImagesFromZip(localPath, 'xl/media/');
      for (const imgPath of tempImages) {
        try {
          const imgUrl = await uploadFile(imgPath, path.basename(imgPath));
          const imgText = await analyzeDocument(imgUrl);
          if (imgText) fullText += '\n' + imgText;
        } catch (e) {
          console.error('Image OCR failed for', imgPath, e.message);
        }
      }

      for (const p of tempImages) {
        try { fs.unlinkSync(p); } catch (e) {}
      }

      return { fullText: fullText.trim() };
    }

    // Fallback: ask Azure to analyze the uploaded file (works for many document types)
    try {
      const azureText = await analyzeDocument(blobUrl);
      if (azureText) fullText += azureText;
    } catch (e) {
      console.error('Azure read failed (fallback):', e.message);
    }

    return { fullText: fullText.trim() };
  } catch (err) {
    console.error('processDocument error:', err);
    return { fullText: '' };
  }
}

module.exports = { processDocument };
