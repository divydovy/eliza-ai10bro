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
            telegram_message_id TEXT,
            twitter_message_id TEXT,
            telegram_status TEXT NOT NULL DEFAULT 'pending',
            twitter_status TEXT NOT NULL DEFAULT 'pending',
            telegram_sent_at INTEGER,
            twitter_sent_at INTEGER,
            createdAt INTEGER NOT NULL,
            FOREIGN KEY (documentId) REFERENCES memories(id)
        );
    `);

    // Copy data from the old table to the new table
    db.exec(`
        INSERT INTO broadcasts_new (
            id,
            documentId,
            telegram_message_id,
            twitter_message_id,
            telegram_status,
            twitter_status,
            createdAt
        )
        SELECT
            id,
            documentId,
            messageId as telegram_message_id,
            messageId as twitter_message_id,
            status as telegram_status,
            status as twitter_status,
            createdAt
        FROM broadcasts;
    `);

    // Drop the old table
    db.exec('DROP TABLE broadcasts;');

    // Rename the new table
    db.exec('ALTER TABLE broadcasts_new RENAME TO broadcasts;');

    // Create indexes for efficient querying
    db.exec(`
        CREATE INDEX idx_broadcasts_telegram_status ON broadcasts(telegram_status);
        CREATE INDEX idx_broadcasts_twitter_status ON broadcasts(twitter_status);
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