import { elizaLogger } from "../packages/core/dist/index.js";
import { SqliteDatabaseAdapter } from '../packages/adapter-sqlite/dist/index.js';
import BetterSqlite3 from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { messageHandlerTemplate } from "../packages/client-direct/dist/index.js";
import { stringToUuid } from "../packages/core/dist/index.js";
import { Telegraf } from 'telegraf';

const DB_PATH = path.join(process.cwd(), 'agent', 'data', 'db.sqlite');

interface Room {
    roomId: string;
}

async function broadcastKnowledge(characterPath: string, documentPath: string) {
    // Load character settings
    const characterContent = await fs.readFile(characterPath, 'utf-8');
    const characterSettings = JSON.parse(characterContent);

    // Generate ID from name if not present
    if (!characterSettings.id) {
        characterSettings.id = stringToUuid(characterSettings.name);
    }

    console.log('Character ID:', characterSettings.id);

    // Initialize Telegram bot
    const telegramToken = characterSettings.settings?.secrets?.TELEGRAM_BOT_TOKEN;
    if (!telegramToken) {
        throw new Error('TELEGRAM_BOT_TOKEN not found in character settings');
    }
    const bot = new Telegraf(telegramToken);

    const agentId = characterSettings.id;

    // Get active rooms from database directly
    const db = new BetterSqlite3(DB_PATH);
    // Get active rooms for the agent
    const activeRooms = db.prepare(`
        SELECT DISTINCT r.id as roomId
        FROM rooms r
        INNER JOIN participants p ON r.id = p.roomId
        WHERE p.userId = ?
    `).all(characterSettings.id) as { roomId: string }[];

    console.log('Active rooms:', activeRooms);

    // Read and process document
    const documentContent = await fs.readFile(documentPath, 'utf-8');

    // Broadcast to each room
    for (const room of activeRooms) {
        // Get the latest message from this room to find the chat ID
        const latestMessage = db.prepare(`
            SELECT m.content, m.roomId
            FROM memories m
            WHERE m.roomId = ?
            AND m.type = 'messages'
            AND json_extract(m.content, '$.source') = 'telegram'
            ORDER BY m.createdAt DESC
            LIMIT 1
        `).get(room.roomId) as { content: string, roomId: string } | undefined;

        if (!latestMessage) {
            console.log(`No Telegram messages found for room ${room.roomId}`);
            continue;
        }

        // The room ID is created from the chat ID and agent ID
        // Format: stringToUuid(chatId + "-" + agentId)
        // We need to extract the original chat ID
        const originalChatId = room.roomId.split('-')[0];
        const numericChatId = parseInt(originalChatId, 16);
        if (isNaN(numericChatId)) {
            console.log(`Could not extract numeric chat ID from room ${room.roomId}`);
            continue;
        }

        console.log(`Broadcasting to chat ${numericChatId}`);
        try {
            await bot.telegram.sendMessage(numericChatId, documentContent);
            console.log(`Successfully broadcast message to chat ${numericChatId}`);
        } catch (error) {
            console.error(`Failed to send message to chat ${numericChatId}:`, error);
        }
    }
}

// Main execution
if (process.argv.length !== 4) {
    console.error('Usage: tsx scripts/broadcast-knowledge.ts <character-path> <document-path>');
    process.exit(1);
}

const [,, inputCharacterPath, inputDocumentPath] = process.argv;
broadcastKnowledge(inputCharacterPath, inputDocumentPath).catch(error => {
    console.error('Error:', error);
    process.exit(1);
});