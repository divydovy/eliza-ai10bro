import { Database } from "better-sqlite3";
import { BroadcastMessage, BroadcastClient, BroadcastStatus } from "../types";
import { randomUUID } from "node:crypto";

export class BroadcastDB {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    createBroadcast(documentId: string, client: BroadcastClient, content: string, alignmentScore: number, status: string): string {
        const id = randomUUID();
        this.db.prepare(`
            INSERT INTO broadcasts (
                id,
                documentId,
                client,
                content,
                status,
                alignment_score,
                createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            documentId,
            client,
            content,
            status,
            alignmentScore,
            Date.now()
        );
        return id;
    }

    getNextPendingBroadcast(client: BroadcastClient): BroadcastMessage | undefined {
        return this.db.prepare(`
            SELECT *
            FROM broadcasts
            WHERE client = ? AND status = 'pending'
            ORDER BY createdAt ASC
            LIMIT 1
        `).get(client) as BroadcastMessage | undefined;
    }

    updateBroadcastStatus(id: string, status: BroadcastStatus, sentAt?: number): void {
        this.db.prepare(`
            UPDATE broadcasts
            SET status = ?,
                sent_at = ?
            WHERE id = ?
        `).run(status, sentAt || null, id);
    }

    getBroadcastById(id: string): BroadcastMessage | undefined {
        return this.db.prepare(`
            SELECT *
            FROM broadcasts
            WHERE id = ?
        `).get(id) as BroadcastMessage | undefined;
    }

    getBroadcastsByStatus(status: BroadcastStatus): BroadcastMessage[] {
        return this.db.prepare(`
            SELECT *
            FROM broadcasts
            WHERE status = ?
            ORDER BY createdAt DESC
        `).all(status) as BroadcastMessage[];
    }

    deleteBroadcast(id: string): void {
        this.db.prepare(`
            DELETE FROM broadcasts
            WHERE id = ?
        `).run(id);
    }

    getBroadcastByDocumentId(documentId: string): BroadcastMessage | undefined {
        return this.db.prepare(`
            SELECT *
            FROM broadcasts
            WHERE documentId = ?
            LIMIT 1
        `).get(documentId) as BroadcastMessage | undefined;
    }

    getBroadcastStats(): { pending: number; sent: number; failed: number } {
        const result = this.db.prepare(`
            SELECT 
                status,
                COUNT(*) as count
            FROM broadcasts 
            GROUP BY status
        `).all() as { status: string; count: number }[];
        
        const stats = { pending: 0, sent: 0, failed: 0 };
        result.forEach(row => {
            if (row.status in stats) {
                stats[row.status as keyof typeof stats] = row.count;
            }
        });
        
        return stats;
    }
}