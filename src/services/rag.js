const db = require('./db');
const { embedText } = require('./embeddings');
const { generateAnswer } = require('./llm');

function cosineSimilarity(a, b) {
  let dot = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function retrieve(query, k = 5) {
  const qEmbedding = await embedText(query);
  const res = await db.query('SELECT id, text_content, metadata FROM documents');
  const scored = [];
  for (const row of res.rows) {
    const meta = row.metadata || {};
    const emb = meta.embedding;
    if (!emb || !Array.isArray(emb)) continue;
    const score = cosineSimilarity(qEmbedding, emb);
    scored.push({ score, text: row.text_content });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(s => s.text);
}

async function answer(query) {
  const contexts = await retrieve(query, 5);
  const contextText = contexts.join('\n\n---\n\n');
  const answer = await generateAnswer(query, contextText);
  return { answer, contexts };
}

module.exports = { retrieve, answer };
