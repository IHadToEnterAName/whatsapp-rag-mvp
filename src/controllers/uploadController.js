const { uploadFile } = require('../services/azureBlobs');
const { analyzeDocument } = require('../services/azureOCR');
const { processDocument } = require('../services/documentProcessor');
const db = require('../services/db');
const { embedText } = require('../services/embeddings');
const { chunkText } = require('../utils/chunkText');

async function uploadDocument(req, res) {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Upload to Blob
    const fileUrl = await uploadFile(file.path, file.originalname);

    // Process document (extract text, run OCR on embedded images if needed)
    const { fullText } = await processDocument({ localPath: file.path, originalName: file.originalname, blobUrl: fileUrl });

    // Chunking & store chunks for embeddings later
    const chunks = chunkText(fullText);

    // Store all chunks in Postgres with embeddings inside metadata JSONB (fallback for environments without vector extension)
    for (const chunk of chunks) {
      try {
        const embedding = await embedText(chunk);
        // store embedding in metadata so we can compute similarity in application code if vector extension isn't available
        const metadata = { embedding };
        await db.query('INSERT INTO documents(text_content, metadata) VALUES($1, $2)', [chunk, metadata]);
      } catch (e) {
        console.error('Embedding/store failed for chunk:', e);
        // Fallback: store without embedding
        await db.query('INSERT INTO documents(text_content) VALUES($1)', [chunk]);
      }
    }

    res.json({ message: 'File uploaded and processed', text: fullText });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { uploadDocument };
