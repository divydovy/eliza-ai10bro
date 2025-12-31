#!/usr/bin/env node

/**
 * Fix pending broadcasts with incomplete YouTube URLs
 *
 * Problem: Broadcasts have "youtube.com/watch" without the ?v=VIDEO_ID
 * Solution: Look up full URL from source document and update broadcast
 */

const Database = require('better-sqlite3');
const db = new Database('./agent/data/db.sqlite');

console.log('🔧 Fixing Incomplete YouTube URLs in Broadcasts\n');

// Find broadcasts with incomplete YouTube URLs
const problematicBroadcasts = db.prepare(`
    SELECT id, documentId, content, client
    FROM broadcasts
    WHERE status = 'pending'
    AND (
        json_extract(content, '$.text') LIKE '%youtube.com/watch%'
        OR json_extract(content, '$.text') LIKE '%youtu.be/%'
    )
`).all();

console.log(`Found ${problematicBroadcasts.length} broadcasts with YouTube URLs to check\n`);

let fixed = 0;
let skipped = 0;
let errors = 0;

problematicBroadcasts.forEach((broadcast, index) => {
    try {
        const content = JSON.parse(broadcast.content);
        const text = content.text || content.content || '';

        // Check if URL is actually incomplete
        const hasIncompleteYouTube = (
            (text.includes('youtube.com/watch') && !text.includes('youtube.com/watch?v=')) ||
            (text.includes('youtu.be/') && text.split('youtu.be/')[1]?.length < 11)
        );

        if (!hasIncompleteYouTube) {
            skipped++;
            return; // URL is fine, skip
        }

        // Get source document
        const document = db.prepare(`
            SELECT content FROM memories WHERE id = ?
        `).get(broadcast.documentId);

        if (!document) {
            console.log(`⚠️  Broadcast ${broadcast.id}: Document not found`);
            errors++;
            return;
        }

        const docContent = JSON.parse(document.content);
        const docText = docContent.text || '';

        // Extract YouTube URLs from document
        const youtubeRegex = /https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/g;
        const youtubeUrls = docText.match(youtubeRegex);

        if (!youtubeUrls || youtubeUrls.length === 0) {
            console.log(`⚠️  Broadcast ${broadcast.id}: No complete YouTube URL found in document`);
            errors++;
            return;
        }

        // Use the first YouTube URL found
        const fullYoutubeUrl = youtubeUrls[0];

        // Replace the incomplete URL in broadcast text
        let fixedText = text;

        // Handle youtube.com/watch case
        if (text.includes('youtube.com/watch') && !text.includes('youtube.com/watch?v=')) {
            fixedText = text.replace(
                /https?:\/\/(www\.)?youtube\.com\/watch([^\s]*)/g,
                fullYoutubeUrl
            );
        }

        // Handle youtu.be case
        if (text.includes('youtu.be/') && fixedText === text) {
            fixedText = text.replace(
                /https?:\/\/youtu\.be\/[^\s]*/g,
                fullYoutubeUrl
            );
        }

        // Update broadcast
        if (fixedText !== text) {
            content.text = fixedText;

            db.prepare(`
                UPDATE broadcasts
                SET content = ?
                WHERE id = ?
            `).run(JSON.stringify(content), broadcast.id);

            console.log(`✅ Fixed broadcast ${broadcast.id} (${broadcast.client})`);
            console.log(`   Old: ${text.substring(text.indexOf('youtube'), Math.min(text.length, text.indexOf('youtube') + 50))}...`);
            console.log(`   New: ${fullYoutubeUrl}`);
            fixed++;
        } else {
            skipped++;
        }

    } catch (error) {
        console.log(`❌ Error fixing broadcast ${broadcast.id}: ${error.message}`);
        errors++;
    }
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Summary');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log(`✅ Fixed: ${fixed}`);
console.log(`⏭️  Skipped (already correct): ${skipped}`);
console.log(`❌ Errors: ${errors}`);
console.log(`\n✅ YouTube URL fix complete!\n`);

db.close();
