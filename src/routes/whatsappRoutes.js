const express = require('express');
const router = express.Router();
const { verifyWebhook, handleWebhook } = require('../controllers/whatsappController');

// Verification endpoint used by Meta during webhook setup
router.get('/webhook', verifyWebhook);

// Webhook receiver for incoming messages/events
router.post('/webhook', express.json(), handleWebhook);

// Keep send endpoint here as well
const { sendTextMessage } = require('../services/whatsappClient');
router.post('/api/whatsapp/send', express.json(), async (req, res) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) return res.status(400).json({ error: 'Missing to or message' });
    const data = await sendTextMessage(to, message);
    res.json({ success: true, data });
  } catch (err) {
    console.error('send message error', err?.response?.data || err.message || err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
