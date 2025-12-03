const path = require('path');
const fs = require('fs');
const os = require('os');
const util = require('util');
const { execFile } = require('child_process');
const stream = require('stream');
const pipeline = util.promisify(stream.pipeline);
const unzipper = require('unzipper');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const ExcelJS = require('exceljs');
const { analyzeDocument, analyzeImageBuffer } = require('./azureOCR');
const { uploadFile } = require('./azureBlobs');

const execFileAsync = util.promisify(execFile);
const MIN_IMAGE_WIDTH = 100;
const MIN_IMAGE_HEIGHT = 100;

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

async function listPdfImages(localPath) {
  try {
    const { stdout } = await execFileAsync('pdfimages', ['-list', localPath]);
    const lines = stdout.split(/\r?\n/).slice(2); // skip headers
    const images = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;
      const page = Number(parts[0]);
      const num = Number(parts[1]);
      const width = Number(parts[3]);
      const height = Number(parts[4]);
      if (Number.isNaN(page) || Number.isNaN(num) || Number.isNaN(width) || Number.isNaN(height)) continue;
      images.push({ page, num, width, height });
    }
    return images;
  } catch (e) {
    console.error('pdfimages -list failed:', e.message);
    return [];
  }
}

async function extractPdfImages(localPath, outputPrefix) {
  try {
    await execFileAsync('pdfimages', ['-png', localPath, outputPrefix]);
    return true;
  } catch (e) {
    console.error('pdfimages extract failed:', e.message);
    return false;
  }
}

function cleanupDir(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return;
    for (const file of fs.readdirSync(dirPath)) {
      try { fs.unlinkSync(path.join(dirPath, file)); } catch (e) {}
    }
    try { fs.rmdirSync(dirPath); } catch (e) {}
  } catch (e) {}
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
      // Extract text with pdf-parse for standard PDF text
      const dataBuffer = fs.readFileSync(localPath);
      try {
        const pdfRes = await pdfParse(dataBuffer);
        if (pdfRes && pdfRes.text) fullText += pdfRes.text + '\n';
      } catch (e) {
        console.error('pdf-parse failed:', e.message);
      }

      // Locate and OCR meaningful-sized images via poppler (pdfimages)
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfimgs-'));
      const outputPrefix = path.join(tempDir, 'img');
      try {
        const images = await listPdfImages(localPath);
        const candidates = images.filter(
          (img) => img.width >= MIN_IMAGE_WIDTH && img.height >= MIN_IMAGE_HEIGHT
        );

        if (candidates.length) {
          const extracted = await extractPdfImages(localPath, outputPrefix);
          if (extracted) {
            for (const img of candidates) {
              const filePath = `${outputPrefix}-${String(img.num).padStart(3, '0')}.png`;
              if (!fs.existsSync(filePath)) continue;
              try {
                const buffer = fs.readFileSync(filePath);
                const text = await analyzeImageBuffer(buffer);
                if (text) fullText += '\n' + text;
              } catch (e) {
                console.error('Image OCR failed for', filePath, e.message);
              }
            }
          }
        }
      } finally {
        cleanupDir(tempDir);
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
      // Extract cell text using exceljs (safer alternative to sheetjs/xlsx)
      try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(localPath);
        workbook.eachSheet((worksheet) => {
          worksheet.eachRow((row) => {
            // row.values may include an empty first slot; filter falsy values
            const vals = (row.values || []).filter(v => v !== null && v !== undefined && v !== '');
            const rowText = vals.map(v => String(v).trim()).join(' ');
            if (rowText) fullText += rowText + '\n';
          });
        });
      } catch (e) {
        console.error('XLSX parse failed (exceljs):', e.message);
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
