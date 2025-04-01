import { broadcastToTelegram } from './broadcast-to-telegram.js';
import { broadcastToTwitter } from './broadcast-to-twitter.js';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'agent', 'data', 'db.sqlite');
const db = new Database(dbPath);

interface Broadcast {
    id: string;
    documentId: string;
    telegram_message_id?: string;
    twitter_message_id?: string;
    telegram_status: 'pending' | 'sent' | 'failed';
    twitter_status: 'pending' | 'sent' | 'failed';
    telegram_sent_at?: number;
    twitter_sent_at?: number;
    createdAt: number;
}

interface Memory {
    id: string;
    content: string;
}

interface PlatformMessage {
    telegram?: {
        text: string;
        format: 'markdown' | 'html' | 'plain';
    };
    twitter?: {
        text: string;
        threadId?: string;
    };
}

// Debug function to show database state
function showDatabaseState() {
    console.log('\nAnalyzing database state...');

    // Get total count
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM broadcasts').get() as { count: number };
    console.log(`Total broadcasts in database: ${totalCount.count}`);

    // Get pending broadcasts
    console.log('\nPending broadcasts:');
    const pendingBroadcasts = db.prepare(`
        SELECT b.id, b.documentId, b.telegram_status, b.twitter_status,
               json_extract(d.content, '$.metadata.frontmatter.title') as title,
               json_extract(d.content, '$.metadata.frontmatter.source') as source
        FROM broadcasts b
        JOIN memories d ON d.id = b.documentId
        WHERE b.telegram_status = 'pending' OR b.twitter_status = 'pending'
        ORDER BY b.createdAt DESC
    `).all() as Array<{
        id: string;
        documentId: string;
        telegram_status: string;
        twitter_status: string;
        title: string;
        source: string;
    }>;

    for (const broadcast of pendingBroadcasts) {
        console.log(`\nBroadcast ID: ${broadcast.id}`);
        console.log(`Document ID: ${broadcast.documentId}`);
        console.log(`Title: ${broadcast.title || 'No title'}`);
        console.log(`Source: ${broadcast.source || 'Unknown'}`);
        console.log(`Telegram Status: ${broadcast.telegram_status}`);
        console.log(`Twitter Status: ${broadcast.twitter_status}`);
    }
}

// Get next pending broadcast for a specific platform
function getNextPendingBroadcast(platform: 'telegram' | 'twitter'): (Broadcast & { content: string }) | undefined {
    const statusField = platform === 'telegram' ? 'telegram_status' : 'twitter_status';
    const messageIdField = platform === 'telegram' ? 'telegram_message_id' : 'twitter_message_id';

    return db.prepare(`
        SELECT b.*, m.content
        FROM broadcasts b
        JOIN memories m ON m.id = b.${messageIdField}
        WHERE b.${statusField} = 'pending'
        AND b.${messageIdField} IS NOT NULL
        ORDER BY b.createdAt ASC
        LIMIT 1
    `).get() as (Broadcast & { content: string }) | undefined;
}

// Mark a broadcast as sent for a specific platform
function markAsSent(id: string, platform: 'telegram' | 'twitter') {
    const statusField = platform === 'telegram' ? 'telegram_status' : 'twitter_status';
    const sentAtField = platform === 'telegram' ? 'telegram_sent_at' : 'twitter_sent_at';

    db.prepare(`
        UPDATE broadcasts
        SET ${statusField} = 'sent',
            ${sentAtField} = unixepoch() * 1000
        WHERE id = ?
    `).run(id);
}

// Mark a broadcast as failed for a specific platform
function markAsFailed(id: string, platform: 'telegram' | 'twitter') {
    const statusField = platform === 'telegram' ? 'telegram_status' : 'twitter_status';

    db.prepare(`
        UPDATE broadcasts
        SET ${statusField} = 'failed'
        WHERE id = ?
    `).run(id);
}

// Process broadcasts for a specific platform
async function processNextBroadcast(platform: 'telegram' | 'twitter', characterName: string) {
    const broadcast = getNextPendingBroadcast(platform);
    if (!broadcast) {
        console.log(`No pending broadcasts found for ${platform}`);
        return false;
    }

    try {
        const content = JSON.parse(broadcast.content);
        console.log(`\nProcessing ${platform} broadcast:`, {
            id: broadcast.id,
            documentId: broadcast.documentId,
            messageId: broadcast.telegram_message_id || broadcast.twitter_message_id,
            createdAt: new Date(broadcast.createdAt).toISOString()
        });

        let success = false;

        if (platform === 'telegram') {
            try {
                await broadcastToTelegram(content.text, characterName);
                console.log('Successfully sent broadcast to Telegram');
                markAsSent(broadcast.id, 'telegram');
                success = true;
            } catch (error) {
                console.error('Error sending to Telegram:', error);
                markAsFailed(broadcast.id, 'telegram');
            }
        } else {
            try {
                await broadcastToTwitter(content.text, characterName);
                console.log('Successfully sent broadcast to Twitter');
                markAsSent(broadcast.id, 'twitter');
                success = true;
            } catch (error) {
                console.error('Error sending to Twitter:', error);
                markAsFailed(broadcast.id, 'twitter');
            }
        }

        return success;
    } catch (error) {
        console.error(`Error processing ${platform} broadcast:`, error);
        markAsFailed(broadcast.id, platform);
        return false;
    }
}

// Main queue processing function
async function processQueue(characterName: string) {
    // First show database state
    showDatabaseState();

    // Process one message for each platform
    console.log('\nProcessing Telegram broadcasts...');
    await processNextBroadcast('telegram', characterName);

    console.log('\nProcessing Twitter broadcasts...');
    await processNextBroadcast('twitter', characterName);

    console.log('Finished processing broadcast messages');
    process.exit(0);
}

// Run if called directly
const characterName = process.argv[2] || 'c3po';
processQueue(characterName).catch(console.error);