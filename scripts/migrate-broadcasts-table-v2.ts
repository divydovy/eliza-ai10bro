import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'agent', 'data', 'db.sqlite');
const db = new Database(dbPath);

// Start a transaction
db.exec('BEGIN TRANSACTION;');

try {
    // Create a temporary table with the new schema
    db.exec(`
        CREATE TABLE broadcasts_new (
            id TEXT PRIMARY KEY,
            documentId TEXT NOT NULL,
            client TEXT NOT NULL,
            message_id TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            sent_at INTEGER,
            createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
            FOREIGN KEY (documentId) REFERENCES memories(id)
        );
    `);

    // Copy data from the old table to the new table, creating separate records for each client
    db.exec(`
        INSERT INTO broadcasts_new (id, documentId, client, message_id, status, sent_at, createdAt)
        SELECT
            id || '_telegram' as id,
            documentId,
            'telegram' as client,
            telegram_message_id as message_id,
            telegram_status as status,
            telegram_sent_at as sent_at,
            createdAt
        FROM broadcasts
        WHERE telegram_message_id IS NOT NULL
        UNION ALL
        SELECT
            id || '_twitter' as id,
            documentId,
            'twitter' as client,
            twitter_message_id as message_id,
            twitter_status as status,
            twitter_sent_at as sent_at,
            createdAt
        FROM broadcasts
        WHERE twitter_message_id IS NOT NULL;
    `);

    // Drop the old table
    db.exec('DROP TABLE broadcasts;');

    // Rename the new table
    db.exec('ALTER TABLE broadcasts_new RENAME TO broadcasts;');

    // Create indexes for efficient querying
    db.exec(`
        CREATE INDEX idx_broadcasts_status ON broadcasts(status);
        CREATE INDEX idx_broadcasts_client ON broadcasts(client);
        CREATE INDEX idx_broadcasts_document_id ON broadcasts(documentId);
    `);

    // Commit the transaction
    db.exec('COMMIT;');

    console.log('Successfully migrated broadcasts table to new schema');
} catch (error) {
    // Rollback on error
    db.exec('ROLLBACK;');
    console.error('Error migrating broadcasts table:', error);
    process.exit(1);
}

process.exit(0);