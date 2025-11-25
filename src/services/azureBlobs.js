const { BlobServiceClient } = require('@azure/storage-blob');
const crypto = require('crypto');
require('dotenv').config();

const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_BLOB_CONNECTION);
const containerClient = blobServiceClient.getContainerClient(process.env.AZURE_BLOB_CONTAINER);

async function uploadFile(filePath, originalName) {
  const blobName = crypto.randomUUID() + '-' + originalName;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.uploadFile(filePath);
  return blockBlobClient.url;
}

module.exports = { uploadFile };
