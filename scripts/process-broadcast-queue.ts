import { broadcastToTelegram } from './broadcast-to-telegram.js';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'agent', 'data', 'db.sqlite');
const db = new Database(dbPath);

interface BroadcastMessage {
    id: string;
    content: string;
    createdAt: number;
}

// Debug function to show database state
function showDatabaseState() {
    console.log('\nAnalyzing database state...');

    // Check total number of messages
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number };
    console.log(`Total messages in database: ${totalCount.count}`);

    // Look for system messages about knowledge creation
    console.log('\nSystem messages about knowledge:');
    const knowledgeMessages = db.prepare(`
        SELECT id, content, createdAt
        FROM memories
        WHERE json_extract(content, '$.text') LIKE '%Create knowledge%'
        OR json_extract(content, '$.action') = 'CREATE_KNOWLEDGE'
        ORDER BY createdAt DESC
        LIMIT 3
    `).all() as BroadcastMessage[];

    knowledgeMessages.forEach(msg => {
        const content = JSON.parse(msg.content);
        console.log('\nKnowledge Message:', {
            id: msg.id,
            createdAt: new Date(msg.createdAt).toISOString(),
            text: content.text,
            type: content.type,
            userId: content.userId,
            action: content.action,
            knowledge: content.knowledge
        });
    });

    // Look for messages containing the broadcast prompt
    console.log('\nBroadcast prompt messages:');
    const promptMessages = db.prepare(`
        SELECT id, content, createdAt
        FROM memories
        WHERE json_extract(content, '$.text') LIKE '%[BROADCAST_REQUEST:%'
        ORDER BY createdAt DESC
        LIMIT 3
    `).all() as BroadcastMessage[];

    promptMessages.forEach(msg => {
        const content = JSON.parse(msg.content);
        console.log('\nBroadcast Prompt:', {
            id: msg.id,
            createdAt: new Date(msg.createdAt).toISOString(),
            text: content.text?.substring(0, 100) + '...',
            type: content.type,
            userId: content.userId
        });

        // Look for responses to broadcast prompts
        const responses = db.prepare(`
            SELECT m.id, m.content, m.createdAt,
                   (SELECT COUNT(*) FROM memories
                    WHERE json_extract(content, '$.parentMessageId') = m.id) as has_children
            FROM memories m
            WHERE json_extract(m.content, '$.parentMessageId') = ?
            AND json_extract(m.content, '$.type') = 'assistant'
            AND json_extract(m.content, '$.text') LIKE '%[BROADCAST:%'
            ORDER BY m.createdAt ASC
        `).all(msg.id) as (BroadcastMessage & { has_children: number })[];

        if (responses.length === 0) {
            console.log('  No responses to this prompt');
        } else {
            responses.forEach(response => {
                const responseContent = JSON.parse(response.content);
                console.log('\nResponse to Broadcast Prompt:', {
                    id: response.id,
                    createdAt: new Date(response.createdAt).toISOString(),
                    text: responseContent.text,
                    type: responseContent.type,
                    role: responseContent.role,
                    metadata: responseContent.metadata,
                    has_children: response.has_children
                });
            });
        }
    });

    // Also look for any assistant messages right after knowledge creation
    console.log('\nMessages after knowledge creation:');
    const afterKnowledge = db.prepare(`
        WITH knowledge_times AS (
            SELECT createdAt
            FROM memories
            WHERE json_extract(content, '$.action') = 'CREATE_KNOWLEDGE'
            OR json_extract(content, '$.text') = 'Create knowledge base'
        )
        SELECT m.id, m.content, m.createdAt
        FROM memories m, knowledge_times kt
        WHERE m.createdAt > kt.createdAt
        AND m.createdAt < kt.createdAt + 5000  -- within 5 seconds
        AND json_extract(m.content, '$.type') = 'assistant'
        ORDER BY m.createdAt DESC
        LIMIT 5
    `).all() as BroadcastMessage[];

    afterKnowledge.forEach(msg => {
        const content = JSON.parse(msg.content);
        console.log('\nPost-Knowledge Message:', {
            id: msg.id,
            createdAt: new Date(msg.createdAt).toISOString(),
            text: content.text,
            type: content.type,
            role: content.role,
            metadata: content.metadata
        });
    });
}

// Get potential broadcast messages for analysis
function getNextPendingBroadcast(): BroadcastMessage | undefined {
    // First, look for any unprocessed broadcast responses
    const pendingBroadcasts = db.prepare(`
        SELECT m.id, m.content, m.createdAt
        FROM memories m
        WHERE json_extract(m.content, '$.text') LIKE '[BROADCAST:%'
        AND json_extract(m.content, '$.metadata.analyzed') IS NULL
        AND NOT EXISTS (
            SELECT 1 FROM memories m2
            WHERE json_extract(m2.content, '$.metadata.broadcastId') = json_extract(m.content, '$.metadata.broadcastId')
            AND json_extract(m2.content, '$.metadata.analyzed') = true
        )
        ORDER BY m.createdAt ASC
        LIMIT 1
    `).get() as BroadcastMessage | undefined;

    if (pendingBroadcasts) {
        const content = JSON.parse(pendingBroadcasts.content);
        console.log('\nFound pending broadcast:', {
            id: pendingBroadcasts.id,
            text: content.text,
            metadata: content.metadata,
            createdAt: new Date(pendingBroadcasts.createdAt).toISOString()
        });
    }

    return pendingBroadcasts;
}

// Mark a message as analyzed
function markAsAnalyzed(id: string, isBroadcast: boolean, broadcastId?: string) {
    const content = db.prepare('SELECT content FROM memories WHERE id = ?').get(id) as BroadcastMessage;
    const updatedContent = JSON.parse(content.content);
    updatedContent.metadata = {
        ...updatedContent.metadata,
        analyzed: true,
        isBroadcast,
        broadcastId
    };

    db.prepare(`
        UPDATE memories
        SET content = ?
        WHERE id = ?
    `).run(JSON.stringify(updatedContent), id);
}

// Process one message from the queue
async function processNextBroadcast(characterName: string) {
    const message = getNextPendingBroadcast();
    if (!message) {
        console.log('No pending messages found');
        return false;
    }

    try {
        const content = JSON.parse(message.content);

        console.log('\nAnalyzing message:', {
            id: message.id,
            createdAt: new Date(message.createdAt).toISOString(),
            text: content.text,
            type: content.type,
            userId: content.userId,
            userName: content.userName,
            metadata: content.metadata,
            action: content.action,
            role: content.role,
            parentMessageId: content.parentMessageId
        });

        // Check if this is a broadcast message by looking for the [BROADCAST:id] marker
        const isBroadcast = content.text?.match(/^\[BROADCAST:([^\]]+)\]/);
        if (isBroadcast) {
            const broadcastId = isBroadcast[1];
            console.log(`Found broadcast message with ID: ${broadcastId}`);

            // Clean the message by removing the broadcast marker
            const cleanMessage = content.text.replace(/^\[BROADCAST:[^\]]+\]\s*/, '').trim();

            // Send to Telegram if configured
            try {
                await broadcastToTelegram(cleanMessage, characterName);
                console.log('Successfully sent broadcast to Telegram');
            } catch (error) {
                console.error('Error sending to Telegram:', error);
            }

            // Mark the message as analyzed with the broadcast ID
            markAsAnalyzed(message.id, true, broadcastId);
        } else {
            // Mark non-broadcast messages as analyzed
            markAsAnalyzed(message.id, false);
        }

        return true;
    } catch (error) {
        console.error('Error processing message:', error);
        return false;
    }
}

// Main queue processing function
async function processQueue(characterName: string) {
    // First show database state
    showDatabaseState();

    const hasMore = await processNextBroadcast(characterName);

    if (hasMore) {
        // Reduce delay for testing to 5 seconds
        const delayMs = 5000;
        console.log(`\nScheduling next message analysis in 5 seconds...`);
        setTimeout(() => processQueue(characterName), delayMs);
    } else {
        console.log('No more messages to analyze');
        process.exit(0);
    }
}

// Run if called directly
const characterName = process.argv[2] || 'ai10bro';
processQueue(characterName).catch(console.error);

export { processQueue, processNextBroadcast };