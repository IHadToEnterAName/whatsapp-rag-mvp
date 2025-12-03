// src/services/db.js
require('dotenv').config();
const { Pool } = require('pg');

// Verify essential variables are present
if (!process.env.DB_HOST || !process.env.DB_USERNAME || !process.env.DB_PASSWORD) {
    console.error('❌ Missing database environment variables. Check your .env file.');
    process.exit(1);
}

// Create a new pool using the specific variables from your .env
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    // NOTE: DB_USERNAME must be 'rag_user', NOT 'rag_user@servername' for Flexible Server
    user: process.env.DB_USERNAME, 
    password: process.env.DB_PASSWORD,
    
    // --- CORRECTED SSL CONFIGURATION FOR AZURE ---
    // Azure requires SSL encryption, which means the pg client must be configured
    // to verify the server certificate.
    ssl: {
        // Enforce SSL connection
        // Setting rejectUnauthorized to true is the most secure option. 
        // If you encounter certificate issues later, change this to false.
        rejectUnauthorized: true, 
    },
    
    // Timeouts to prevent hanging
    connectionTimeoutMillis: 10000, // Wait 10s for a connection
    idleTimeoutMillis: 30000,       // Close idle clients after 30s
});

// Listener for unexpected errors on idle clients
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle database client', err);
    // In a production app, you might not exit here, but log the error.
    // For init scripts, exiting is appropriate.
    process.exit(1); 
});

module.exports = { pool };