import fs from 'fs';
import path from 'path';
import { broadcastToTelegram } from './broadcast-to-telegram.js';
import Database from 'better-sqlite3';

console.log('Starting broadcast message creation...');

const dbPath = path.join(process.cwd(), '..', 'agent', 'data', 'db.sqlite');
console.log('Database path:', dbPath);
const db = new Database(dbPath);
console.log('Successfully connected to database');

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
    console.log('Checking for last broadcast...');
    const lastBroadcast = db.prepare(`
        SELECT createdAt
        FROM memories
        WHERE json_extract(content, '$.metadata.messageType') = 'broadcast'
        AND json_extract(content, '$.metadata.status') = 'sent'
        ORDER BY createdAt DESC
        LIMIT 1
    `).get() as { createdAt: number } | undefined;

    console.log('Last broadcast timestamp:', lastBroadcast?.createdAt || 'No previous broadcasts found');

    console.log('Querying for new knowledge...');
    const newKnowledge = db.prepare(`
        SELECT *
        FROM memories
        WHERE createdAt > ?
        AND json_extract(content, '$.action') = 'CREATE_KNOWLEDGE'
        ORDER BY createdAt DESC
        LIMIT 5
    `).all(lastBroadcast?.createdAt || 0) as DatabaseMemory[];

    console.log(`Found ${newKnowledge.length} new knowledge entries`);
    return newKnowledge.map(memory => JSON.parse(memory.content));
}

async function sendMessageToAgent(characterName: string, message: any) {
    console.log('\nSending message to agent:', {
        characterName,
        messageType: message.type,
        messageLength: message.text.length,
        metadata: message.metadata
    });

    const response = await fetch(`http://localhost:3000/${characterName}/message`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send message: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    console.log('\nReceived response:', {
        status: response.status,
        responseLength: data.length,
        messages: data.map((msg: any) => ({
            textLength: msg.text?.length,
            type: msg.type,
            metadata: msg.metadata
        }))
    });

    return data;
}

async function createBroadcastMessage(characterName: string = 'c3po') {
    try {
        console.log(`\n=== Starting broadcast creation for character: ${characterName} ===`);

        // Load character settings
        const characterPath = path.join(process.cwd(), '..', 'characters', `${characterName}.character.json`);
        console.log('Looking for character settings at:', characterPath);
        const characterSettings: CharacterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));
        console.log('Successfully loaded character settings');

        // Check for pending broadcasts
        console.log('\nChecking for pending broadcasts...');
        const pendingBroadcasts = db.prepare(`
            SELECT * FROM memories
            WHERE json_extract(content, '$.metadata.messageType') = 'broadcast'
            AND json_extract(content, '$.metadata.status') = 'pending'
            LIMIT 1
        `).all() as DatabaseMemory[];

        if (pendingBroadcasts.length > 0) {
            console.log("Found pending broadcast, processing it...");
            const broadcast = pendingBroadcasts[0];
            const content = JSON.parse(broadcast.content) as MessageContent;
            console.log("Broadcasting pending message to Telegram...");
            await broadcastToTelegram(content.text, characterName);

            console.log("Updating broadcast status to sent...");
            db.prepare(`
                UPDATE memories
                SET content = json_set(content, '$.metadata.status', 'sent')
                WHERE id = ?
            `).run(broadcast.id);
            console.log("Successfully processed pending broadcast");

            return [content];
        }

        console.log('\nNo pending broadcasts found, checking for new knowledge...');
        const newKnowledge = await getNewKnowledgeSinceLastBroadcast();
        if (newKnowledge.length === 0) {
            console.log("No new knowledge found since last broadcast");
            return [];
        }

        console.log(`\nFound ${newKnowledge.length} new knowledge entries to process`);
        console.log("Knowledge summary:", newKnowledge.map(k => ({
            user: k.user,
            textLength: k.text.length,
            action: k.action
        })));

        // Default prompt if not specified in character settings
        console.log('\nPreparing broadcast prompt...');
        const defaultPrompt = "Based on this new knowledge I'm sharing with you, create a single social media style message summarizing the key insights. Focus on what's most significant and impactful. Keep it under 280 characters, be specific about what was learned, and cite the source if available. Here's the new knowledge:\n\n";

        // Create a more concise summary of the knowledge
        const knowledgeSummary = newKnowledge.map(k => ({
            text: k.text.substring(0, 50) + "...", // Just the first 50 chars
            user: k.user,
            action: k.action,
            timestamp: k.createdAt
        }));

        const broadcastPrompt = (characterSettings.settings?.broadcastPrompt || defaultPrompt) +
            "New knowledge entries: " + knowledgeSummary.length + "\n\n" +
            knowledgeSummary.map(k => `- ${k.text}`).join('\n');

        // Send system message to the agent's API with retries
        console.log("\nSending request to agent API...");
        let retryCount = 0;
        const maxRetries = 3;
        const retryDelay = 2000;

        while (retryCount < maxRetries) {
            try {
                const data = await sendMessageToAgent(characterName, {
                    text: broadcastPrompt,
                    type: "system",
                    userId: "system",
                    userName: "system",
                    metadata: {
                        messageType: "broadcast",
                        status: "pending",
                        action: "CREATE_KNOWLEDGE",
                        silent: true
                    }
                });

                if (data && Array.isArray(data) && data.length > 0 && data[0].text) {
                    console.log("\nBroadcasting message to Telegram...");
                    await broadcastToTelegram(data[0].text, characterName);

                    // Find the most recent memory with this text
                    console.log("\nLooking for memory to update...");
                    console.log("Searching for text:", data[0].text);
                    const recentMemory = db.prepare(`
                        SELECT id, content FROM memories
                        WHERE json_extract(content, '$.text') = ?
                        ORDER BY createdAt DESC LIMIT 1
                    `).get(data[0].text) as DatabaseMemory;

                    if (recentMemory) {
                        console.log("\nUpdating memory status...");
                        console.log("Memory ID:", recentMemory.id);
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
                        console.log("\nWARNING: Could not find memory to update");
                        console.log("Showing recent memories for debugging...");
                        const recentMemories = db.prepare(`
                            SELECT id, content FROM memories
                            ORDER BY createdAt DESC LIMIT 5
                        `).all();
                        console.log("Recent memories:", JSON.stringify(recentMemories, null, 2));
                    }

                    return data;
                } else {
                    console.error("\nERROR: No valid message text found in response");
                    console.error("Response data:", data);
                }
            } catch (error) {
                console.error(`\nERROR in retry ${retryCount + 1}:`, error);
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }

        console.error("\nERROR: All retries failed");
        throw new Error("All retries failed");
    } catch (error) {
        console.error("\nERROR in createBroadcastMessage:", error);
        throw error;
    }
}

// Get character name from command line arguments
const characterName = process.argv[2] || 'c3po';
console.log('Using character:', characterName);

// Call the function
createBroadcastMessage(characterName)
    .then(result => {
        console.log('Broadcast message creation completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('Failed to create broadcast message:', error);
        process.exit(1);
    });

export { createBroadcastMessage };