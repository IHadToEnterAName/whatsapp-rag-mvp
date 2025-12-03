// Example: scripts/init_db.js or test-connect.js
require('dotenv').config(); // Load environment variables from .env file
const { Client } = require('pg');

async function connectDirectly() {
    console.log('--- DIRECT CONNECTION DIAGNOSTIC START ---');
    
    // Database configuration loaded from environment variables
    const DB_CONFIG = {
        host: process.env.DB_HOST, 
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME,       // Use the target database name
        user: process.env.DB_USERNAME,       // Fully qualified username
        password: process.env.DB_PASSWORD,   // Password from .env file
        ssl: { 
            rejectUnauthorized: false // Required for some Azure development environments
        },
        connectionTimeoutMillis: 20000,
    };
    
    const client = new Client(DB_CONFIG);
    console.log(`Connecting as ${DB_CONFIG.user} to ${DB_CONFIG.host}...`);

    try {
        await client.connect();
        console.log('✅ SUCCESS! Connected to Azure Postgres directly.');
        
        // Run a simple query to confirm data transfer
        const result = await client.query('SELECT NOW()');
        console.log('✅ Test query successful. DB Time:', result.rows[0].now);
        
    } catch (err) {
        console.error('❌ CONNECTION FAILED');
        console.error('Error Code:', err.code);
        console.error('Error Message:', err.message);
        
        if (err.code === '28P01') {
            console.error('\n👉 FINAL CONCLUSION: The password in your .env file does not match the password stored in the Azure server. You MUST reset the password in the Azure Portal/CLI and update your .env file.');
        }
    } finally {
        await client.end().catch(() => {});
        console.log('--- DIAGNOSTIC END ---');
    }
}

connectDirectly();