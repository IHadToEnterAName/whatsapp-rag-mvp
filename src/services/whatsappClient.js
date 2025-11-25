const axios = require('axios');
require('dotenv').config();

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

if (!WHATSAPP_TOKEN) {
  console.warn('Warning: WHATSAPP_TOKEN not set in .env');
}

async function sendTextMessage(to, message) {
  if (!PHONE_ID) throw new Error('WHATSAPP_PHONE_ID not configured');
  const url = `https://graph.facebook.com/v15.0/${PHONE_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: message },
  };

  const res = await axios.post(url, body, {
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
  });
  return res.data;
}

module.exports = { sendTextMessage };
