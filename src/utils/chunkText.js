// Simple text chunking for embeddings
function chunkText(text, maxLength = 1000) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + maxLength));
    start += maxLength;
  }
  return chunks;
}

module.exports = { chunkText };
