// scripts/init_db.js
// This script initializes the PostgreSQL database for the RAG system.
// It creates the database if missing and applies the full schema with Vector support.

// Load environment variables (DB_HOST, DB_USER, etc.)
require('dotenv').config(); 

const { Pool } = require('pg');

// --- CONFIGURATION ---

// 1. Bootstrap Config: Connects to 'postgres' (system DB) to create the target DB
const BOOTSTRAP_CONFIG = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: 'postgres', // Must connect to default DB first
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: true }, // Azure requires SSL. If running locally, you might need to remove this.
    connectionTimeoutMillis: 10000,
};

// 2. Main Config: Connects to the actual application DB
const MAIN_CONFIG = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME, // The target database
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
};

// --- SCHEMA DEFINITION ---
// This SQL block defines all extensions, tables, and indexes.
// NOTE: SQL comments must use '--', not '//'.
const RAG_SETUP_SQL = `
-- 1. Enable Extensions (These must be whitelisted in Azure Portal first)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS azure_ai;
CREATE EXTENSION IF NOT EXISTS azure_storage;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Clean up old table versions to ensure a fresh start
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS whatsapp_messages;

-- 3. Create the 'documents' table
-- This stores the raw text content alongside its 1536-dimensional vector embedding.
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_uri TEXT NOT NULL,          -- e.g., message_id or a file path
    content TEXT,                      -- The actual text content/chunk
    embedding VECTOR(1536),            -- Native vector type for OpenAI embeddings
    metadata JSONB,                    -- Flexible storage for sender info, dates, tags
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create the 'whatsapp_messages' table
-- This table stores incoming WhatsApp messages for processing and tracking.
CREATE TABLE whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id TEXT NOT NULL UNIQUE,      -- The unique ID from the WhatsApp service
    sender_id TEXT NOT NULL,              -- The sender's WhatsApp ID
    conversation_id TEXT NOT NULL,        -- The chat/group ID
    message_body TEXT,                    -- The text content of the message
    media_url TEXT,                       -- URL for any attached media
    message_timestamp TIMESTAMP WITH TIME ZONE NOT NULL, -- When the message was sent
    status TEXT DEFAULT 'received',       -- Processing status (e.g., received, processed, error)
    metadata JSONB,                       -- Extra data, like processing errors or classifications
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create Indexes for Performance
-- HNSW Index for 'documents': Drastically speeds up vector similarity search
CREATE INDEX documents_hnsw_idx ON documents USING hnsw (embedding vector_cosine_ops);

-- GIN Index for 'documents': Speeds up filtering by metadata
CREATE INDEX documents_metadata_idx ON documents USING GIN (metadata);

-- Indexes for 'whatsapp_messages': Speed up common queries
CREATE INDEX whatsapp_messages_sender_id_idx ON whatsapp_messages (sender_id);
CREATE INDEX whatsapp_messages_conversation_id_idx ON whatsapp_messages (conversation_id);
CREATE INDEX whatsapp_messages_timestamp_idx ON whatsapp_messages (message_timestamp);
`;

async function init() {
    console.log('[DB_INIT] 🚀 Starting database initialization...');

    // PHASE 1: Create Database if it doesn't exist
    const bootstrapPool = new Pool(BOOTSTRAP_CONFIG);
    let mainPool;
    
    try {
        console.log(`[DB_INIT] 1. Checking if database '${process.env.DB_NAME}' exists...`);
        const result = await bootstrapPool.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [process.env.DB_NAME]);

        if (result.rowCount === 0) {
            console.log(`[DB_INIT] Database not found. Creating '${process.env.DB_NAME}'...`);
            // Note: Parameterized queries don't work for CREATE DATABASE identifiers
            await bootstrapPool.query(`CREATE DATABASE "${process.env.DB_NAME}"`);
            console.log(`[DB_INIT] ✅ Database created.`);
        } else {
            console.log(`[DB_INIT] ✅ Database already exists.`);
        }
        
        await bootstrapPool.end();

        // PHASE 2: Apply Full Schema to the database
        console.log(`[DB_INIT] 2. Connecting to '${process.env.DB_NAME}' to apply schema...`);
        mainPool = new Pool(MAIN_CONFIG);
        
        console.log(`[DB_INIT] Applying extensions, tables, and indexes...`);
        await mainPool.query(RAG_SETUP_SQL);
        
        console.log('[DB_INIT] ✅ Schema applied successfully!');
        console.log('[DB_INIT]    - Extensions: vector, azure_ai, azure_storage enabled');
        console.log('[DB_INIT]    - Table: documents created');
        console.log('[DB_INIT]    - Table: whatsapp_messages created');
        console.log('[DB_INIT]    - Indexes: HNSW (Vector) and GIN (Metadata) created');

        await mainPool.end();
        console.log('[DB_INIT] ✨ Initialization complete.');
        process.exit(0);

    } catch (err) {
        console.error('[DB_INIT] ❌ FATAL ERROR:', err.message);
        
        if (err.message.includes('extension "vector" is not allow-listed')) {
             console.error('\n[TIP] You might be on Azure Flexible Server. You MUST go to the Azure Portal -> Server Parameters and add "vector", "azure_ai", and "azure_storage" to the "azure.extensions" allow-list. Save the configuration and try running this script again.\n');
        }

        // Cleanup connections on error
        if (bootstrapPool) await bootstrapPool.end().catch(() => {});
        if (mainPool) await mainPool.end().catch(() => {});

        process.exit(1);
    }
}

init();