const axios = require('axios');
require('dotenv').config();

async function pollReadOperation(operationLocation) {
  while (true) {
    const poll = await axios.get(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': process.env.AZURE_OCR_KEY },
    });

    if (poll.data.status === 'succeeded') {
      return poll.data.analyzeResult.readResults;
    }
    if (poll.data.status === 'failed') {
      throw new Error('OCR failed');
    }

    await new Promise((r) => setTimeout(r, 1000));
  }
}

function readResultsToText(readResults) {
  return readResults
    .map((page) => page.lines.map((line) => line.text).join(' '))
    .join('\n');
}

async function analyzeDocument(fileUrl) {
  const ocrResponse = await axios.post(
    `${process.env.AZURE_OCR_ENDPOINT}/vision/v4.1/read/analyze`,
    { url: fileUrl },
    { headers: { 'Ocp-Apim-Subscription-Key': process.env.AZURE_OCR_KEY } }
  );

  const operationLocation = ocrResponse.headers['operation-location'];
  const readResults = await pollReadOperation(operationLocation);
  return readResultsToText(readResults);
}

async function analyzeImageBuffer(buffer) {
  const ocrResponse = await axios.post(
    `${process.env.AZURE_OCR_ENDPOINT}/vision/v4.1/read/analyze`,
    buffer,
    {
      headers: {
        'Ocp-Apim-Subscription-Key': process.env.AZURE_OCR_KEY,
        'Content-Type': 'application/octet-stream',
      },
    }
  );

  const operationLocation = ocrResponse.headers['operation-location'];
  const readResults = await pollReadOperation(operationLocation);
  return readResultsToText(readResults);
}

module.exports = { analyzeDocument, analyzeImageBuffer };


/*1. pollReadOperation(operationLocation)
Purpose: Polls Azure's OCR API for the result of an asynchronous read operation
How it works:
Takes an operationLocation URL returned by Azure after starting an OCR job
Continuously checks the status every 1 second
Waits until the operation completes (status === 'succeeded')
Returns the extracted text results from analyzeResult.readResults
Throws an error if the operation fails
Why async: Azure's OCR is asynchronous - it returns a job ID immediately and you must poll for results
2. readResultsToText(readResults)
Purpose: Converts Azure's structured OCR output into plain text
How it works:
Takes the array of page results from Azure
Extracts text from each line on each page
Joins lines within a page with spaces
Joins pages with newlines
Returns a single text string
Example: Transforms [{lines: [{text: "Hello"}, {text: "World"}]}] → "Hello World"
3. analyzeDocument(fileUrl)
Purpose: Performs OCR on a document/image hosted at a URL
How it works:
Sends the URL to Azure's /vision/v4.1/read/analyze endpoint
Azure processes it asynchronously and returns an operation-location header
Calls pollReadOperation() to wait for the result
Converts results to text using readResultsToText()
Returns the extracted text
Authentication: Uses AZURE_OCR_KEY from environment variables
Use cases: Direct image uploads, PDF images, embedded images in documents
4. analyzeImageBuffer(buffer)
Purpose: Performs OCR on raw image data (buffer)
How it works:
Sends raw image bytes to Azure's /vision/v4.1/read/analyze endpoint
Sets Content-Type: application/octet-stream header
Calls pollReadOperation() to wait for result
Converts results to text using readResultsToText()
Returns the extracted text
Difference from analyzeDocument: Takes raw bytes instead of a URL
Use cases: Images extracted from PDFs by Poppler, in-memory image processing
documentProcessor.js Functions
1. extractImagesFromZip(localPath, mediaPathPrefix)
Purpose: Extracts image files from ZIP-based document formats (DOCX, XLSX)
How it works:
Opens the ZIP file using unzipper
Searches for files matching the mediaPathPrefix (e.g., word/media/ for Word docs)
Streams each image to a temporary directory with a timestamp prefix
Returns array of temporary file paths
Why temporary files: Need to write images to disk to process them separately
Use cases: Extracting images from .docx and .xlsx files
2. listPdfImages(localPath)
Purpose: Lists all images found in a PDF with their dimensions
How it works:
Executes Poppler's pdfimages -list command on the PDF
Parses the output to extract: page number, image number, width, height
Returns array of image metadata objects
Catches errors gracefully (returns empty array if Poppler unavailable)
Filtering: Only returns parseable results with valid numeric values
Next step: Used to identify which images are large enough (≥100x100 pixels) to OCR
3. extractPdfImages(localPath, outputPrefix)
Purpose: Physically extracts images from a PDF file
How it works:
Executes Poppler's pdfimages -png command
Converts extracted images to PNG format
Saves them with the specified outputPrefix (e.g., img-000.png, img-001.png)
Returns true if successful, false if it fails
Error handling: Catches Poppler errors gracefully
4. cleanupDir(dirPath)
Purpose: Safely deletes temporary directories and files
How it works:
Checks if directory exists
Deletes all files in the directory
Removes the empty directory
Silently ignores any errors
Why necessary: Temporary files from Poppler extraction need cleanup to avoid disk clutter
5. processDocument({ localPath, originalName, blobUrl }) (Main orchestrator)
Purpose: Central function that routes documents to appropriate processors based on file type

Input parameters:

localPath: Path to file on local disk
originalName: Original filename (determines file type by extension)
blobUrl: URL of file in Azure Blob Storage
Handles these file types:

File Type	Strategy
Images (.png, .jpg, .jpeg, .tiff, .bmp, .gif)	Direct Azure OCR via analyzeDocument(blobUrl)
PDFs (.pdf)	1. Extract text with pdf-parse 2. Use Poppler to find images 3. OCR images with Azure
Word (.docx)	1. Extract text with mammoth 2. Extract embedded images 3. Upload images to Azure 4. OCR via analyzeDocument()
Excel (.xlsx, .xls)	1. Extract cell text with ExcelJS 2. Extract embedded images 3. Upload images to Azure 4. OCR via analyzeDocument()
Other formats	Fallback: Send to Azure analyzeDocument()
Returns: Object with { fullText: "combined extracted text" }

Error handling: Wraps everything in try-catch, returns empty string on failure*/
