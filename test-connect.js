// Example: scripts/init_db.js or test-connect.js
const { Client } = require('pg');

async function connectDirectly() {
    console.log('--- DIRECT CONNECTION DIAGNOSTIC START ---');
    
    // ⚠️ WARNING: Hardcoding credentials is bad practice. 
    // This is ONLY for troubleshooting the password sync issue.
    const DB_CONFIG = {
        host: "whatsappragmvp.postgres.database.azure.com", 
        port: 5432,
        database: "whatsapp_rag", // Use the target database name
        user: "rag_user@whatsappragmvp", // Fully qualified username
        password: "SNT-1234", // ⚠️ MUST MATCH the password currently set in Azure
        ssl: { 
            rejectUnauthorized: false // Required for Azure dev environment
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
            console.error('\n👉 FINAL CONCLUSION: The password ("SNT-1234") in this script does not match the password stored in the Azure server. You MUST reset the password in the Azure Portal/CLI and update this script.');
        }
    } finally {
        await client.end().catch(() => {});
        console.log('--- DIAGNOSTIC END ---');
    }
}

connectDirectly();