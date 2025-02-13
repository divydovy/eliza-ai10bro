import { broadcastToTelegram } from './broadcast-to-telegram.js';
import { broadcastToTwitter } from './broadcast-to-twitter.js';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'agent', 'data', 'db.sqlite');
const db = new Database(dbPath);

interface Broadcast {
    id: string;
    documentId: string;
    messageId: string;
    createdAt: number;
    status: string;
}

interface Memory {
    id: string;
    content: string;
}

// Debug function to show database state
function showDatabaseState() {
    console.log('\nAnalyzing database state...');

    // Check total number of broadcasts
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM broadcasts').get() as { count: number };
    console.log(`Total broadcasts in database: ${totalCount.count}`);

    // Look for pending broadcasts
    console.log('\nPending broadcasts:');
    const pendingBroadcasts = db.prepare(`
        SELECT b.*, m.content
        FROM broadcasts b
        JOIN memories m ON m.id = b.documentId
        WHERE b.status = 'pending'
        ORDER BY b.createdAt DESC
        LIMIT 3
    `).all() as (Broadcast & { content: string })[];

    pendingBroadcasts.forEach(broadcast => {
        const content = JSON.parse(broadcast.content);
        console.log('\nPending Broadcast:', {
            id: broadcast.id,
            documentId: broadcast.documentId,
            messageId: broadcast.messageId,
            createdAt: new Date(broadcast.createdAt).toISOString(),
            title: content.title || content.metadata?.frontmatter?.title || 'No title',
            source: content.source || content.metadata?.frontmatter?.source || 'Unknown'
        });
    });

    // Look for recently sent broadcasts
    console.log('\nRecently sent broadcasts:');
    const sentBroadcasts = db.prepare(`
        SELECT b.*, m.content
        FROM broadcasts b
        JOIN memories m ON m.id = b.documentId
        WHERE b.status = 'sent'
        ORDER BY b.createdAt DESC
        LIMIT 3
    `).all() as (Broadcast & { content: string })[];

    sentBroadcasts.forEach(broadcast => {
        const content = JSON.parse(broadcast.content);
        console.log('\nSent Broadcast:', {
            id: broadcast.id,
            documentId: broadcast.documentId,
            messageId: broadcast.messageId,
            createdAt: new Date(broadcast.createdAt).toISOString(),
            title: content.title || content.metadata?.frontmatter?.title || 'No title',
            source: content.source || content.metadata?.frontmatter?.source || 'Unknown'
        });
    });
}

// Get next pending broadcast
function getNextPendingBroadcast(): (Broadcast & { content: string }) | undefined {
    return db.prepare(`
        SELECT b.*, m.content
        FROM broadcasts b
        JOIN memories m ON m.id = b.messageId
        WHERE b.status = 'pending'
        AND NOT EXISTS (
            SELECT 1 FROM broadcasts b2
            WHERE b2.documentId = b.documentId
            AND b2.status = 'sent'
        )
        ORDER BY b.createdAt ASC
        LIMIT 1
    `).get() as (Broadcast & { content: string }) | undefined;
}

// Mark a broadcast as sent
function markAsSent(id: string) {
    db.prepare(`
        UPDATE broadcasts
        SET status = 'sent'
        WHERE id = ?
    `).run(id);
}

// Process one message from the queue
async function processNextBroadcast(characterName: string) {
    const broadcast = getNextPendingBroadcast();
    if (!broadcast) {
        console.log('No pending broadcasts found');
        return false;
    }

    try {
        const content = JSON.parse(broadcast.content);
        console.log('\nProcessing broadcast:', {
            id: broadcast.id,
            documentId: broadcast.documentId,
            messageId: broadcast.messageId,
            createdAt: new Date(broadcast.createdAt).toISOString(),
            title: content.title || content.metadata?.frontmatter?.title || 'No title',
            source: content.source || content.metadata?.frontmatter?.source || 'Unknown'
        });

        // Get the message content from the agent's memory
        const message = db.prepare(`
            SELECT content FROM memories
            WHERE id = ?
        `).get(broadcast.messageId) as Memory | undefined;

        if (!message) {
            console.error('Could not find message content for broadcast');
            return false;
        }

        const messageContent = JSON.parse(message.content);

        // Get the source document content to check for nsource
        const sourceDoc = db.prepare(`
            SELECT content
            FROM memories
            WHERE id = ?
        `).get(broadcast.documentId) as { content: string };

        let messageText = messageContent.text;

        // If source document has nsource and message doesn't already have a source URL, append it
        if (sourceDoc && !messageText.includes('Source:')) {
            const sourceContent = JSON.parse(sourceDoc.content);
            const sourceUrl = sourceContent.metadata?.frontmatter?.source;
            if (sourceUrl) {
                messageText = `${messageText}\n\nSource: ${sourceUrl}`;
            }
        }

        let success = true;

        // Send to Telegram
        try {
            await broadcastToTelegram(messageText, characterName);
            console.log('Successfully sent broadcast to Telegram');
        } catch (error) {
            console.error('Error sending to Telegram:', error);
            success = false;
        }

        // Send to Twitter
        try {
            await broadcastToTwitter(messageText, characterName);
            console.log('Successfully sent broadcast to Twitter');
        } catch (error) {
            console.error('Error sending to Twitter:', error);
            success = false;
        }

        if (success) {
            // Mark as sent only if at least one broadcast was successful
            markAsSent(broadcast.id);
            console.log('Marked broadcast as sent');
        }

        return success;
    } catch (error) {
        console.error('Error processing broadcast:', error);
        return false;
    }
}

// Main queue processing function
async function processQueue(characterName: string) {
    // First show database state
    showDatabaseState();

    // Process just one message and exit
    await processNextBroadcast(characterName);
    console.log('Finished processing one broadcast message');
    process.exit(0);
}

// Run if called directly
const characterName = process.argv[2] || 'c3po';
processQueue(characterName).catch(console.error);