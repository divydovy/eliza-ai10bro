import fs from 'fs';
import path from 'path';
import { broadcastToTelegram } from './broadcast-to-telegram.js';
import Database from 'better-sqlite3';

const dbPath = path.join(process.cwd(), 'agent', 'data', 'db.sqlite');
const db = new Database(dbPath);

interface MessageContent {
    text: string;
    metadata: {
        messageType: 'broadcast';
        status: 'pending' | 'sent';
    };
}

interface DatabaseMemory {
    id: string;
    content: string;
}

interface CharacterSettings {
    name: string;
    settings?: {
        broadcastPrompt?: string;
    };
}

async function createBroadcastMessage(characterName: string = 'c3po') {
    try {
        // Load character settings
        const characterPath = path.join(process.cwd(), '..', 'characters', `${characterName}.character.json`);
        const characterSettings: CharacterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

        // Default prompt if not specified in character settings
        const defaultPrompt = "Based on the new knowledge you've acquired, create a single social media style message summarizing the key insights. Do not try to save this as a file - just return the message text.";
        const broadcastPrompt = characterSettings.settings?.broadcastPrompt || defaultPrompt;

        // Check for pending broadcasts
        const pendingBroadcasts = db.prepare(`
            SELECT * FROM memories
            WHERE json_extract(content, '$.metadata.messageType') = 'broadcast'
            AND json_extract(content, '$.metadata.status') = 'pending'
            LIMIT 1
        `).all() as DatabaseMemory[];

        if (pendingBroadcasts.length > 0) {
            console.log("Found pending broadcasts. Processing those first...");
            // Process the pending broadcast instead of creating a new one
            const broadcast = pendingBroadcasts[0];
            const content = JSON.parse(broadcast.content) as MessageContent;
            await broadcastToTelegram(content.text, characterName);

            // Update the status
            db.prepare(`
                UPDATE memories
                SET content = json_set(content, '$.metadata.status', 'sent')
                WHERE id = ?
            `).run(broadcast.id);

            return [content];
        }

        // Send system message to the agent's API
        const response = await fetch(`http://localhost:3000/${characterName}/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: broadcastPrompt,
                type: "system",
                userId: "system",
                userName: "system",
                metadata: {
                    messageType: "broadcast",
                    status: "pending"
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create broadcast message: ${response.status} ${response.statusText}\n${errorText}`);
        }

        const data = await response.json();
        console.log("Broadcast message created successfully.");
        console.log("Response:", JSON.stringify(data, null, 2));

        // Extract the message text and broadcast it
        if (data && Array.isArray(data) && data.length > 0 && data[0].text) {
            console.log("Broadcasting message to Telegram...");
            await broadcastToTelegram(data[0].text, characterName);

            // Update the message status in the database
            if (data[0].id) {
                db.prepare(`
                    UPDATE memories
                    SET content = json_set(content, '$.metadata.status', 'sent')
                    WHERE id = ?
                `).run(data[0].id);
            }
        } else {
            console.error("No valid message text found in response");
        }

        return data;
    } catch (error) {
        console.error("Error creating broadcast message:", error);
        throw error;
    }
}

export { createBroadcastMessage };