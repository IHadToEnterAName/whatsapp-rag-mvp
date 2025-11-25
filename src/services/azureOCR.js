const axios = require('axios');
require('dotenv').config();

async function analyzeDocument(fileUrl) {
  const ocrResponse = await axios.post(
    `${process.env.AZURE_OCR_ENDPOINT}/vision/v4.1/read/analyze`,
    { url: fileUrl },
    { headers: { 'Ocp-Apim-Subscription-Key': process.env.AZURE_OCR_KEY } }
  );

  const operationLocation = ocrResponse.headers['operation-location'];

  // Poll until OCR finishes
  let result;
  while (true) {
    const poll = await axios.get(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': process.env.AZURE_OCR_KEY },
    });
    if (poll.data.status === 'succeeded') {
      result = poll.data.analyzeResult.readResults;
      break;
    } else if (poll.data.status === 'failed') {
      throw new Error('OCR failed');
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Extract text
  const fullText = result
    .map(page => page.lines.map(line => line.text).join(' '))
    .join('\n');

  return fullText;
}

module.exports = { analyzeDocument };
