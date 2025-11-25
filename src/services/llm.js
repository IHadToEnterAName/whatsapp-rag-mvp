const axios = require('axios');
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_BASE = process.env.OPENAI_API_BASE;
const COMPLETION_DEPLOYMENT = process.env.OPENAI_COMPLETION_DEPLOYMENT;

async function generateAnswer(query, context) {
  if (!OPENAI_API_BASE || !OPENAI_API_KEY || !COMPLETION_DEPLOYMENT) {
    throw new Error('OpenAI/Azure completion configuration missing in .env');
  }

  const systemPrompt = `You are an assistant that answers user questions using the context provided. If the answer is not present in the context, say you don't know and ask for clarification.`;
  const userPrompt = `Context:\n${context}\n\nUser question:\n${query}`;

  const url = `${OPENAI_API_BASE}/openai/deployments/${COMPLETION_DEPLOYMENT}/chat/completions?api-version=2023-10-01-preview`;
  const resp = await axios.post(
    url,
    {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 512,
      temperature: 0.0,
    },
    { headers: { 'api-key': OPENAI_API_KEY, 'Content-Type': 'application/json' } }
  );

  if (!resp.data || !resp.data.choices || !resp.data.choices[0]) return null;
  // Azure returns content under choices[0].message.content
  const msg = resp.data.choices[0].message;
  return msg ? msg.content : null;
}

module.exports = { generateAnswer };
