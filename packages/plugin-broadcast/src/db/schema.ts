import { Database } from "better-sqlite3";

export const initializeBroadcastSchema = (db: Database): void => {
    // Create broadcasts table
    db.exec(`
        CREATE TABLE IF NOT EXISTS broadcasts (
            id TEXT PRIMARY KEY,
            documentId TEXT NOT NULL,
            client TEXT NOT NULL,
            messageId TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            sentAt INTEGER,
            createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
            content TEXT NOT NULL,
            FOREIGN KEY (documentId) REFERENCES memories(id)
        );

        CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts(status);
        CREATE INDEX IF NOT EXISTS idx_broadcasts_client ON broadcasts(client);
        CREATE INDEX IF NOT EXISTS idx_broadcasts_document_id ON broadcasts(documentId);
    `);
};