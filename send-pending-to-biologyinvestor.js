#!/usr/bin/env node

const sqlite3 = require('better-sqlite3');
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '.env' });

// BiologyInvestor Configuration
const BIOINVESTOR_CONFIG = {
    url: 'http://localhost:8886',
    username: 'eliza',
    password: 'UfoT MbyuxLhH 2SXl 19PF uZda'
};

/**
 * Extract investment theme from document content
 */
function extractInvestmentTheme(documentContent) {
    try {
        const content = typeof documentContent === 'string' ? documentContent : JSON.stringify(documentContent);
        const contentLower = content.toLowerCase();

        // Check for funding/deal keywords
        if (contentLower.match(/series [a-d]|funding|raised \$|venture|investment/i)) return 'funding';
        if (contentLower.match(/ipo|acquisition|m&a|exit|merger/i)) return 'deals';
        if (contentLower.match(/fda approved|clinical trial|phase [i-iii]/i)) return 'regulatory';
        if (contentLower.match(/partnership|collaboration|strategic/i)) return 'partnerships';
        if (contentLower.match(/market|revenue|commercial|customer/i)) return 'commercial';

        return 'innovation'; // default
    } catch (error) {
        return 'innovation';
    }
}

/**
 * Extract source URL from document content
 */
function extractSourceUrl(documentContent) {
    try {
        const content = typeof documentContent === 'string' ? documentContent : JSON.stringify(documentContent);

        // Check YAML frontmatter
        const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (yamlMatch) {
            const sourceMatch = yamlMatch[1].match(/source:\s*(https?:\/\/[^\s]+)/);
            if (sourceMatch) return sourceMatch[1];

            const doiMatch = yamlMatch[1].match(/doi:\s*["']?(10\.\d+\/[^\s"']+)["']?/);
            if (doiMatch) return `https://doi.org/${doiMatch[1]}`;
        }

        // Find first URL in content
        const urlMatch = content.match(/https?:\/\/[^\s<)]+/);
        if (urlMatch) return urlMatch[0];

        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Upload image to BiologyInvestor WordPress
 */
async function uploadImage(imagePath, title, auth, baseUrl) {
    const form = new FormData();
    form.append('file', fs.createReadStream(imagePath));
    form.append('title', title);
    form.append('alt_text', title);

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}` },
        body: form
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Image upload failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.id;
}

/**
 * Create BiologyInvestor investment insight post
 */
async function createPost(article, theme, alignmentScore, sourceUrl, featuredMediaId, auth, baseUrl, publishStatus = 'publish') {
    const postData = {
        title: article.title,
        content: article.content,
        excerpt: article.excerpt,
        status: publishStatus,
        featured_media: featuredMediaId || undefined,
        meta: {
            alignment_score: alignmentScore.toFixed(3),
            source_url: sourceUrl || '',
            eliza_document_id: article.documentId || '',
            is_featured: false
        }
    };

    // Add deal-specific metadata if available
    if (article.funding_amount) {
        postData.meta.funding_amount = article.funding_amount;
    }
    if (article.company_name) {
        postData.meta.company_name = article.company_name;
    }
    if (article.lead_investors) {
        postData.meta.lead_investors = article.lead_investors;
    }

    const endpoint = article.type === 'deal_brief' ? 'deal-brief' : 'investment-insight';

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(postData)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Post creation failed: ${response.status} - ${error}`);
    }

    return response.json();
}

/**
 * Send pending BiologyInvestor broadcasts
 */
async function sendPendingBroadcasts() {
    const CLIENT_FILTER = process.env.CLIENT || 'biologyinvestor_insight';

    const auth = Buffer.from(`${BIOINVESTOR_CONFIG.username}:${BIOINVESTOR_CONFIG.password}`).toString('base64');

    // Open database
    const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
    const db = sqlite3(dbPath);

    console.log(`📤 Checking for pending ${CLIENT_FILTER} broadcasts...`);

    // Get pending broadcasts
    const limit = CLIENT_FILTER === 'biologyinvestor_deepdive' ? 2 : 9;
    const pendingBroadcasts = db.prepare(`
        SELECT id, documentId, content, image_url, alignment_score, client
        FROM broadcasts
        WHERE status = 'pending'
        AND client = ?
        ORDER BY alignment_score DESC, createdAt ASC
        LIMIT ?
    `).all(CLIENT_FILTER, limit);

    console.log(`   Found ${pendingBroadcasts.length} pending broadcasts`);

    if (pendingBroadcasts.length === 0) {
        console.log('✅ No pending BiologyInvestor broadcasts to send');
        db.close();
        return;
    }

    for (const broadcast of pendingBroadcasts) {
        console.log(`\n📝 Publishing ${broadcast.client} broadcast ${broadcast.id.slice(0, 8)}...`);

        try {
            const article = JSON.parse(broadcast.content);
            console.log(`   Title: "${article.title}"`);

            const doc = db.prepare(`SELECT content FROM memories WHERE id = ?`).get(broadcast.documentId);
            if (!doc) throw new Error('Source document not found');

            const docContent = JSON.parse(doc.content);
            const theme = extractInvestmentTheme(docContent);
            const sourceUrl = extractSourceUrl(docContent);

            console.log(`   Investment theme: ${theme}`);
            console.log(`   Source: ${sourceUrl || 'none'}`);

            let featuredMediaId = null;
            if (broadcast.image_url && fs.existsSync(broadcast.image_url)) {
                try {
                    console.log(`   📷 Uploading featured image...`);
                    featuredMediaId = await uploadImage(
                        broadcast.image_url,
                        article.title,
                        auth,
                        BIOINVESTOR_CONFIG.url
                    );
                    console.log(`   ✅ Image uploaded: ID ${featuredMediaId}`);
                } catch (imageError) {
                    console.log(`   ⚠️  Image upload failed: ${imageError.message}`);
                }
            }

            console.log(`   📤 Creating BiologyInvestor post...`);
            const post = await createPost(
                article,
                theme,
                broadcast.alignment_score,
                sourceUrl,
                featuredMediaId,
                auth,
                BIOINVESTOR_CONFIG.url,
                'publish'
            );

            db.prepare(`
                UPDATE broadcasts
                SET status = 'sent',
                    message_id = ?,
                    sent_at = ?,
                    wordpress_post_id = ?
                WHERE id = ?
            `).run(post.link, Date.now(), post.id, broadcast.id);

            console.log(`   ✅ Published: ${post.link}`);

        } catch (error) {
            console.log(`   ❌ Failed: ${error.message}`);
            db.prepare(`
                UPDATE broadcasts
                SET status = 'failed',
                    wordpress_error = ?
                WHERE id = ?
            `).run(error.message, broadcast.id);
        }
    }

    console.log(`\n✅ BiologyInvestor publishing complete`);
    db.close();
}

if (require.main === module) {
    sendPendingBroadcasts().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { sendPendingBroadcasts };
