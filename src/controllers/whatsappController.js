const axios = require('axios');
const fs = require('fs');
const path = require('path');
const util = require('util');
const stream = require('stream');
const pipeline = util.promisify(stream.pipeline);
const { sendTextMessage } = require('../services/whatsappClient');
const db = require('../services/db');

require('dotenv').config();

function verifyWebhook(req, res) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('WEBHOOK_VERIFIED');
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }
  res.sendStatus(400);
}

async function handleWebhook(req, res) {
  // Respond quickly
  res.sendStatus(200);

  // Process asynchronously: only handle text messages here.
  (async () => {
    try {
      const body = req.body;
      if (!body) return;

      // Typical structure: body.entry[].changes[].value.messages[]
      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const value = change.value || change;
          const messages = (value.messages || []);
          for (const msg of messages) {
            const from = msg.from;
            if (!from) continue;

            if (msg.type === 'text') {
              const text = msg.text && msg.text.body;
              if (!text) continue;

              // Use RAG: retrieve relevant docs by embedding similarity and ask the LLM to answer
              try {
                const { answer } = await require('../services/rag').answer(text);
                if (answer) {
                  const shortReply = answer.length > 1900 ? answer.slice(0, 1900) + '...' : answer;
                  await sendTextMessage(from, shortReply);
                } else {
                  await sendTextMessage(from, 'I could not find an answer in the documents. Please upload relevant documents via the web interface.');
                }
              } catch (dbErr) {
                console.error('RAG error', dbErr);
                await sendTextMessage(from, 'Error retrieving an answer. Please try again later.');
              }

            } else {
              // For non-text messages, instruct the user to use the web upload
              await sendTextMessage(from, 'Please upload documents via the web interface or frontend. I will only respond using stored documents.');
            }
          }
        }
      }
    } catch (err) {
      console.error('Error processing webhook:', err?.response?.data || err.message || err);
    }
  })();
}

module.exports = { verifyWebhook, handleWebhook };
