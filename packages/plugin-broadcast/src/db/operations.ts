import { Database } from "better-sqlite3";
import { BroadcastMessage, BroadcastClient, BroadcastStatus } from "../types";
import { randomUUID } from "node:crypto";

export class BroadcastDB {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    createBroadcast(documentId: string, client: BroadcastClient, messageId: string, alignmentScore: number, status: string): string {
        // Check if a broadcast already exists for this document and client
        const existing = this.db.prepare(`
            SELECT id FROM broadcasts
            WHERE documentId = ? AND client = ?
        `).get(documentId, client) as { id: string } | undefined;

        if (existing) {
            // If broadcast exists and is pending, update it
            if (status === 'pending') {
                this.db.prepare(`
                    UPDATE broadcasts
                    SET message_id = ?,
                        alignment_score = ?,
                        status = ?,
                        createdAt = ?
                    WHERE id = ?
                `).run(messageId, alignmentScore, status, Date.now(), existing.id);
                return existing.id;
            }
            // If broadcast exists and is not pending, return existing id
            return existing.id;
        }

        // Create new broadcast if none exists
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