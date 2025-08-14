import { Database } from "better-sqlite3";
import { BroadcastMessage, BroadcastClient, BroadcastStatus } from "../types";
import { randomUUID } from "node:crypto";

export class BroadcastDB {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    createBroadcast(documentId: string, client: BroadcastClient, messageId: string, alignmentScore: number, status: string): string {
        const id = randomUUID();
        this.db.prepare(`
            INSERT INTO broadcasts (
                id,
                documentId,
                client,
                message_id,
                status,
                alignment_score,
                createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            documentId,
            client,
            messageId,
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
}