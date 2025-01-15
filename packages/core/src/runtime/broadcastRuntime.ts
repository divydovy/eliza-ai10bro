import { AgentRuntime } from '../runtime';
import { Memory, UUID } from '../types';
import { stringToUuid } from '../uuid';
import { getEmbeddingZeroVector } from '../embedding';
import { v4 } from 'uuid';

export class BroadcastRuntime extends AgentRuntime {
    async broadcastToAllRooms(content: string) {
        // Get all active rooms where the agent is a participant
        const sql = `
            SELECT DISTINCT roomId
            FROM participants
            WHERE userId = (SELECT id FROM accounts LIMIT 1)
        `;

        const rooms = this.databaseAdapter.db.prepare(sql).all() as { roomId: string }[];

        if (rooms.length === 0) {
            console.log('No active rooms found to broadcast to');
            return;
        }

        // Create broadcast message for each room
        for (const room of rooms) {
            const memory: Memory = {
                id: v4() as UUID,
                userId: this.agentId,
                agentId: this.agentId,
                roomId: stringToUuid(room.roomId),
                content: {
                    text: content,
                    source: 'broadcast'
                },
                createdAt: Date.now(),
                embedding: getEmbeddingZeroVector()
            };

            await this.messageManager.createMemory(memory);
        }

        console.log(`Broadcasted message to ${rooms.length} room(s)`);
    }
}
