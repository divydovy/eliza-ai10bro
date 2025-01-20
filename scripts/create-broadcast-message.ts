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

async function getNewKnowledgeSinceLastBroadcast() {
    const lastBroadcast = db.prepare(`
        SELECT createdAt
        FROM memories
        WHERE json_extract(content, '$.metadata.messageType') = 'broadcast'
        AND json_extract(content, '$.metadata.status') = 'sent'
        ORDER BY createdAt DESC
        LIMIT 1
    `).get() as { createdAt: number } | undefined;

    const newKnowledge = db.prepare(`
        SELECT *
        FROM memories
        WHERE createdAt > ?
        AND json_extract(content, '$.action') = 'CREATE_KNOWLEDGE'
        ORDER BY createdAt DESC
        LIMIT 5
    `).all(lastBroadcast?.createdAt || 0) as DatabaseMemory[];

    return newKnowledge.map(memory => JSON.parse(memory.content));
}

async function createBroadcastMessage(characterName: string = 'c3po') {
    try {
        // Load character settings
        const characterPath = path.join(process.cwd(), 'characters', `${characterName}.character.json`);
        const characterSettings: CharacterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

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

        // Check for new knowledge
        const newKnowledge = await getNewKnowledgeSinceLastBroadcast();
        if (newKnowledge.length === 0) {
            console.log("No new knowledge found since last broadcast");
            return [];
        }

        console.log("Found new knowledge:", JSON.stringify(newKnowledge, null, 2));

        // Default prompt if not specified in character settings
        const defaultPrompt = "Based on this new knowledge I'm sharing with you, create a single social media style message summarizing the key insights. Focus on what's most significant and impactful. Keep it under 280 characters, be specific about what was learned, and cite the source if available. Here's the new knowledge:\n\n";
        const broadcastPrompt = (characterSettings.settings?.broadcastPrompt || defaultPrompt) +
            JSON.stringify(newKnowledge, null, 2);

        // Send system message to the agent's API
        console.log("Sending request to agent API...");
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
        console.log("Response data:", JSON.stringify(data, null, 2));

        // Extract the message text and broadcast it
        if (data && Array.isArray(data) && data.length > 0 && data[0].text) {
            console.log("Broadcasting message to Telegram...");
            await broadcastToTelegram(data[0].text, characterName);

            // Find the most recent memory with this text
            console.log("Looking for memory with text:", data[0].text);
            const recentMemory = db.prepare(`
                SELECT id, content FROM memories
                WHERE json_extract(content, '$.text') = ?
                ORDER BY createdAt DESC LIMIT 1
            `).get(data[0].text) as DatabaseMemory;

            if (recentMemory) {
                console.log("Found memory to update:", recentMemory.id);
                console.log("Original content:", recentMemory.content);
                const content = JSON.parse(recentMemory.content);
                content.metadata = {
                    messageType: 'broadcast',
                    status: 'sent'
                };
                const updatedContent = JSON.stringify(content);
                console.log("Updated content:", updatedContent);

                db.prepare(`
                    UPDATE memories
                    SET content = ?
                    WHERE id = ?
                `).run(updatedContent, recentMemory.id);
                console.log("Memory updated successfully");

                // Verify the update
                const verifyMemory = db.prepare(`
                    SELECT content FROM memories WHERE id = ?
                `).get(recentMemory.id) as DatabaseMemory;
                console.log("Verified content:", verifyMemory.content);
            } else {
                console.log("Could not find memory to update");
                // Show recent memories for debugging
                const recentMemories = db.prepare(`
                    SELECT id, content FROM memories
                    ORDER BY createdAt DESC LIMIT 5
                `).all();
                console.log("Recent memories:", JSON.stringify(recentMemories, null, 2));
            }
        } else {
            console.error("No valid message text found in response. Response data:", data);
        }

        return data;
    } catch (error) {
        console.error("Error creating broadcast message:", error);
        throw error;
    }
}

export { createBroadcastMessage };