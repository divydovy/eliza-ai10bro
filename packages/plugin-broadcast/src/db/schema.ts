import { Database } from "better-sqlite3";

export const initializeBroadcastSchema = (db: Database): void => {
    // Check if table exists and if content column exists
    try {
        const tableInfo = db.prepare("PRAGMA table_info(broadcasts)").all() as any[];
        
        if (tableInfo.length > 0) {
            const hasContentColumn = tableInfo.some((col: any) => col.name === 'content');
            
            if (!hasContentColumn) {
                console.log("📊 Migrating broadcasts table - dropping and recreating with content column");
                // Drop the old table and recreate with new schema
                db.exec(`DROP TABLE IF EXISTS broadcasts`);
            }
        }
    } catch (e) {
        console.log("📊 Error checking broadcasts table, will create fresh:", e);
    }
    
    // Create broadcasts table with the correct schema
    db.exec(`
        CREATE TABLE IF NOT EXISTS broadcasts (
            id TEXT PRIMARY KEY,
            documentId TEXT NOT NULL,
            client TEXT NOT NULL,
            content TEXT,
            message_id TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            alignment_score FLOAT,
            sent_at INTEGER,
            createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
            FOREIGN KEY (documentId) REFERENCES memories(id)
        );

        CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts(status);
        CREATE INDEX IF NOT EXISTS idx_broadcasts_client ON broadcasts(client);
        CREATE INDEX IF NOT EXISTS idx_broadcasts_document_id ON broadcasts(documentId);
    `);
};