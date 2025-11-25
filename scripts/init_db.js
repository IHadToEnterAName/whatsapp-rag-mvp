require('dotenv').config();
const db = require('../src/services/db');

async function init() {
  try {
    // Try to create vector extension; if not allowed, fall back to storing embeddings in metadata
    try {
      await db.pool.query("CREATE EXTENSION IF NOT EXISTS vector;");
      await db.pool.query(`
        CREATE TABLE IF NOT EXISTS documents (
          id SERIAL PRIMARY KEY,
          text_content TEXT,
          embedding VECTOR(1536),
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT now()
        );
      `);
      console.log('DB initialized with vector extension and documents table');
    } catch (extErr) {
      console.warn('Vector extension not available or failed to create, falling back. Error:', extErr.message);
      await db.pool.query(`
        CREATE TABLE IF NOT EXISTS documents (
          id SERIAL PRIMARY KEY,
          text_content TEXT,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT now()
        );
      `);
      console.log('DB initialized without vector extension (embeddings will be stored in metadata)');
    }
    process.exit(0);
  } catch (err) {
    console.error('DB init failed', err);
    process.exit(1);
  }
}

init();
