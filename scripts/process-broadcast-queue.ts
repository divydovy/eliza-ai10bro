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

    // Look for pending broadcast messages
    console.log('\nPending broadcast messages:');
    const pendingBroadcasts = db.prepare(`
        SELECT id, content, createdAt
        FROM memories
        WHERE json_extract(content, '$.metadata.messageType') = 'broadcast'
        AND json_extract(content, '$.metadata.status') = 'pending'
        ORDER BY createdAt DESC
        LIMIT 3
    `).all() as BroadcastMessage[];

    pendingBroadcasts.forEach(msg => {
        const content = JSON.parse(msg.content);
        console.log('\nPending Broadcast:', {
            id: msg.id,
            createdAt: new Date(msg.createdAt).toISOString(),
            text: content.text?.substring(0, 100) + '...',
            metadata: content.metadata
        });
    });

    // Look for recently sent broadcasts
    console.log('\nRecently sent broadcasts:');
    const sentBroadcasts = db.prepare(`
        SELECT id, content, createdAt
        FROM memories
        WHERE json_extract(content, '$.metadata.messageType') = 'broadcast'
        AND json_extract(content, '$.metadata.status') = 'sent'
        ORDER BY createdAt DESC
        LIMIT 3
    `).all() as BroadcastMessage[];

    sentBroadcasts.forEach(msg => {
        const content = JSON.parse(msg.content);
        console.log('\nSent Broadcast:', {
            id: msg.id,
            createdAt: new Date(msg.createdAt).toISOString(),
            text: content.text?.substring(0, 100) + '...',
            metadata: content.metadata
        });
    });
}

// Get next pending broadcast message
function getNextPendingBroadcast(): BroadcastMessage | undefined {
    return db.prepare(`
        SELECT m.id, m.content, m.createdAt
        FROM memories m
        WHERE json_extract(m.content, '$.metadata.messageType') = 'broadcast'
        AND json_extract(m.content, '$.metadata.status') = 'pending'
        ORDER BY m.createdAt ASC
        LIMIT 1
    `).get() as BroadcastMessage | undefined;
}

// Mark a message as sent
function markAsSent(id: string, broadcastId: string) {
    const content = db.prepare('SELECT content FROM memories WHERE id = ?').get(id) as BroadcastMessage;
    const updatedContent = JSON.parse(content.content);
    updatedContent.metadata = {
        ...updatedContent.metadata,
        status: 'sent',
        sentAt: Date.now(),
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
        console.log('No pending broadcasts found');
        return false;
    }

    try {
        const content = JSON.parse(message.content);
        const broadcastId = content.metadata?.broadcastId;

        console.log('\nProcessing broadcast:', {
            id: message.id,
            createdAt: new Date(message.createdAt).toISOString(),
            text: content.text,
            metadata: content.metadata
        });

        // Send to Telegram
        try {
            await broadcastToTelegram(content.text, characterName);
            console.log('Successfully sent broadcast to Telegram');

            // Mark as sent only if Telegram send was successful
            markAsSent(message.id, broadcastId);
            console.log('Marked broadcast as sent');
        } catch (error) {
            console.error('Error sending to Telegram:', error);
            // Could add retry logic here
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error processing broadcast:', error);
        return false;
    }
}

// Main queue processing function
async function processQueue(characterName: string) {
    // First show database state
    showDatabaseState();

    const hasMore = await processNextBroadcast(characterName);

    if (hasMore) {
        // Process next message after a delay
        const delayMs = 5000;
        console.log(`\nScheduling next broadcast processing in 5 seconds...`);
        setTimeout(() => processQueue(characterName), delayMs);
    } else {
        console.log('No more broadcasts to process');
        process.exit(0);
    }
}

// Run if called directly
if (require.main === module) {
    const characterName = process.argv[2] || 'c3po';
    processQueue(characterName).catch(console.error);
}