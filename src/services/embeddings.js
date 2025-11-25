const axios = require('axios');
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_BASE = process.env.OPENAI_API_BASE;
const EMBEDDING_DEPLOYMENT = process.env.OPENAI_EMBEDDING_DEPLOYMENT;

async function embedText(text) {
  if (!OPENAI_API_BASE || !OPENAI_API_KEY || !EMBEDDING_DEPLOYMENT) {
    throw new Error('OpenAI/Azure embedding configuration missing in .env');
  }

  const url = `${OPENAI_API_BASE}/openai/deployments/${EMBEDDING_DEPLOYMENT}/embeddings?api-version=2023-10-01-preview`;
  const resp = await axios.post(
    url,
    { input: text },
    { headers: { 'api-key': OPENAI_API_KEY, 'Content-Type': 'application/json' } }
  );

  if (!resp.data || !resp.data.data || !resp.data.data[0]) {
    throw new Error('Invalid embedding response');
  }
  return resp.data.data[0].embedding;
}

module.exports = { embedText };
