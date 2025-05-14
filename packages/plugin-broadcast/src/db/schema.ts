import { Database } from "better-sqlite3";

export const initializeBroadcastSchema = (db: Database): void => {
    // Create broadcasts table
    db.exec(`
        CREATE TABLE IF NOT EXISTS broadcasts (
            id TEXT PRIMARY KEY,
            documentId TEXT NOT NULL,
            client TEXT NOT NULL,
            message_id TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            alignment_score FLOAT,
            sent_at INTEGER,
            createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
            FOREIGN KEY (documentId) REFERENCES memories(id)
        );

        CREATE TABLE IF NOT EXISTS broadcast_attempts (
            documentId TEXT PRIMARY KEY,
            lastAttemptedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
            attemptCount INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (documentId) REFERENCES memories(id)
        );

        CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts(status);
        CREATE INDEX IF NOT EXISTS idx_broadcasts_client ON broadcasts(client);
        CREATE INDEX IF NOT EXISTS idx_broadcasts_document_id ON broadcasts(documentId);
        CREATE INDEX IF NOT EXISTS idx_broadcast_attempts_last_attempted ON broadcast_attempts(lastAttemptedAt);
    `);
};