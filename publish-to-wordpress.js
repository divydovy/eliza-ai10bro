#!/usr/bin/env node

/**
 * WordPress Publisher for AI10BRO
 * 
 * Publishes quality broadcasts (alignment >= 0.20) to WordPress as Daily Insight articles
 */

const Database = require('better-sqlite3');
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.wordpress' });

// Configuration
const CONFIG = {
  WP_BASE_URL: process.env.WP_BASE_URL || 'http://localhost:8885',
  WP_USERNAME: process.env.WP_USERNAME || 'admin',
  WP_APP_PASSWORD: process.env.WP_APP_PASSWORD,
  DB_PATH: process.env.DB_PATH || './agent/data/db.sqlite',
  ALIGNMENT_THRESHOLD: parseFloat(process.env.WP_ALIGNMENT_THRESHOLD || '0.20'),
  DRY_RUN: process.argv.includes('--dry-run'),
  LIMIT: parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '1'),
  BROADCAST_ID: process.env.BROADCAST_ID || null,
};

// Bio theme mapping
const BIO_THEME_MAP = {
  'biomimicry': 2,
  'synbio': 3,
  'materials': 4,
  'energy': 5,
  'agtech': 6,
  'health': 7,
  'ai': 8,
  'innovation': 9,
  'environment': 10,
  'space': 11,
  'manufacturing': 12,
};

/**
 * Ensure WordPress tracking columns exist
 */
function ensureWordPressColumns(db) {
  const columns = db.prepare("PRAGMA table_info(broadcasts)").all();
  const columnNames = columns.map(c => c.name);

  if (!columnNames.includes('wordpress_published')) {
    console.log('📊 Adding WordPress tracking columns...');
    
    db.exec(`ALTER TABLE broadcasts ADD COLUMN wordpress_published BOOLEAN DEFAULT FALSE`);
    db.exec(`ALTER TABLE broadcasts ADD COLUMN wordpress_post_id INTEGER`);
    db.exec(`ALTER TABLE broadcasts ADD COLUMN wordpress_published_at DATETIME`);
    db.exec(`ALTER TABLE broadcasts ADD COLUMN wordpress_status TEXT`);
    db.exec(`ALTER TABLE broadcasts ADD COLUMN wordpress_error TEXT`);
    
    console.log('✅ WordPress columns added\n');
  }
}

/**
 * Fetch broadcasts to publish
 */
function fetchBroadcastsToPublish(db) {
  if (CONFIG.BROADCAST_ID) {
    return db.prepare(`
      SELECT
        b.id,
        b.documentId,
        b.content,
        b.alignment_score,
        b.image_url,
        m.content as document_content
      FROM broadcasts b
      LEFT JOIN memories m ON b.documentId = m.id
      WHERE b.id = ?
        AND (b.wordpress_published IS NULL OR b.wordpress_published = FALSE)
    `).all(CONFIG.BROADCAST_ID);
  } else {
    return db.prepare(`
      SELECT
        b.id,
        b.documentId,
        b.content,
        b.alignment_score,
        b.image_url,
        m.content as document_content
      FROM broadcasts b
      LEFT JOIN memories m ON b.documentId = m.id
      WHERE b.alignment_score >= ?
        AND (b.wordpress_published IS NULL OR b.wordpress_published = FALSE)
        AND b.status = 'pending'
      ORDER BY b.alignment_score DESC, b.createdAt DESC
      LIMIT ?
    `).all(CONFIG.ALIGNMENT_THRESHOLD, CONFIG.LIMIT);
  }
}

/**
 * Extract bio theme from document
 */
function extractBioTheme(documentContent) {
  try {
    const content = typeof documentContent === 'string' ? documentContent : documentContent;
    
    // Check YAML frontmatter
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (yamlMatch) {
      const frontmatter = yamlMatch[1];
      
      // Check category
      const categoryMatch = frontmatter.match(/category:\s*(\w+)/);
      if (categoryMatch) {
        const category = categoryMatch[1].toLowerCase();
        const categoryMap = {
          'microbiology': 'synbio',
          'biotechnology': 'synbio',
          'materials': 'materials',
          'energy': 'energy',
          'agriculture': 'agtech',
          'medicine': 'health',
          'health': 'health',
        };
        if (categoryMap[category]) return categoryMap[category];
      }
    }
    
    // Keyword matching
    const contentLower = content.toLowerCase();
    if (contentLower.includes('synthetic biology') || contentLower.includes('bioengineering')) return 'synbio';
    if (contentLower.includes('material')) return 'materials';
    if (contentLower.includes('energy') || contentLower.includes('battery')) return 'energy';
    if (contentLower.includes('agriculture') || contentLower.includes('farming')) return 'agtech';
    if (contentLower.includes('medicine') || contentLower.includes('therapeutic')) return 'health';
    
    return 'innovation'; // default
  } catch (error) {
    return 'innovation';
  }
}

/**
 * Extract source URL from document
 */
function extractSourceUrl(documentContent) {
  try {
    const content = typeof documentContent === 'string' ? documentContent : documentContent;
    
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (yamlMatch) {
      const sourceMatch = yamlMatch[1].match(/source:\s*(https?:\/\/[^\s]+)/);
      if (sourceMatch) return sourceMatch[1];
      
      const doiMatch = yamlMatch[1].match(/doi:\s*["']?(10\.\d+\/[^\s"']+)["']?/);
      if (doiMatch) return `https://doi.org/${doiMatch[1]}`;
    }
    
    const urlMatch = content.match(/https?:\/\/[^\s<)]+/);
    if (urlMatch) return urlMatch[0];
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Generate article content
 */
function generateArticleContent(broadcast, sourceDocument) {
  // Parse broadcast content if it's JSON
  let broadcastText;
  try {
    const parsed = JSON.parse(broadcast.content);
    broadcastText = parsed.text || broadcast.content;
  } catch (e) {
    // If not JSON, use as-is
    broadcastText = broadcast.content;
  }
  
  // For now, create a simple article
  // TODO: Integrate LLM for richer generation

  // Extract title (first line, or first sentence)
  const firstLine = broadcastText.split('\n')[0].trim();
  const title = firstLine.slice(0, 80).replace(/🔗.*$/, '').trim();

  // Extract excerpt (remove emoji and source links)
  const excerpt = broadcastText
    .replace(/🔗.*$/gm, '')
    .replace(/\n+/g, ' ')
    .slice(0, 160)
    .trim();
  
  // Split into paragraphs, removing source links
  const cleanText = broadcastText
    .replace(/🔗.*$/gm, '')
    .trim();

  const paragraphs = cleanText.split('\n\n').filter(p => p.trim());
  const firstPara = paragraphs[0] || cleanText;

  const content = `<p>${firstPara}</p>

<h2>The Research</h2>

${paragraphs.slice(1).map(p => `<p>${p}</p>`).join('\n\n') || `<p>${cleanText}</p>`}

<h2>Why This Matters</h2>

<p>This development represents a significant advancement in the field. The research provides new insights that could inform future innovations in biotechnology and materials science.</p>

<h2>Looking Ahead</h2>

<p>As this research progresses, we can expect to see further applications and refinements. The findings lay important groundwork for future breakthroughs in this area.</p>

<p><small><em>Article generated from research broadcast. Full source document analysis available in original paper.</em></small></p>`;

  return {
    title,
    content,
    excerpt,
    wordCount: content.split(/\s+/).length
  };
}

/**
 * Upload image to WordPress
 */
async function uploadImage(imagePath, title) {
  const auth = Buffer.from(`${CONFIG.WP_USERNAME}:${CONFIG.WP_APP_PASSWORD}`).toString('base64');
  
  const form = new FormData();
  form.append('file', fs.createReadStream(imagePath));
  form.append('title', title);
  form.append('alt_text', title);

  const response = await fetch(`${CONFIG.WP_BASE_URL}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}` },
    body: form
  });

  if (!response.ok) {
    throw new Error(`Image upload failed: ${response.status}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Create WordPress post
 */
async function createPost(article, bioTheme, alignmentScore, sourceUrl, featuredMediaId) {
  const auth = Buffer.from(`${CONFIG.WP_USERNAME}:${CONFIG.WP_APP_PASSWORD}`).toString('base64');

  const postData = {
    title: article.title,
    content: article.content,
    excerpt: article.excerpt,
    status: CONFIG.DRY_RUN ? 'draft' : 'publish',
    bio_theme: [BIO_THEME_MAP[bioTheme] || BIO_THEME_MAP['innovation']],
    featured_media: featuredMediaId || undefined,
    meta: {
      alignment_score: alignmentScore.toFixed(3),
      source_url: sourceUrl || '',
      is_featured: false
    }
  };

  const response = await fetch(`${CONFIG.WP_BASE_URL}/wp-json/wp/v2/insight`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(postData)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Post creation failed: ${response.status} ${error}`);
  }

  return response.json();
}

/**
 * Update broadcast WordPress status
 */
function updateBroadcastStatus(db, broadcastId, postId, status, error = null) {
  db.prepare(`
    UPDATE broadcasts
    SET
      wordpress_published = ?,
      wordpress_post_id = ?,
      wordpress_published_at = datetime('now'),
      wordpress_status = ?,
      wordpress_error = ?
    WHERE id = ?
  `).run(
    status === 'publish' || status === 'draft' ? 1 : 0,
    postId,
    status,
    error,
    broadcastId
  );
}

/**
 * Process a single broadcast
 */
async function processBroadcast(db, broadcast) {
  console.log(`\n📝 Processing broadcast ${broadcast.id.slice(0, 8)}...`);
  console.log(`   Alignment: ${broadcast.alignment_score.toFixed(3)}`);

  try {
    // Extract metadata
    const bioTheme = extractBioTheme(broadcast.document_content);
    const sourceUrl = extractSourceUrl(broadcast.document_content);
    console.log(`   Theme: ${bioTheme} (ID: ${BIO_THEME_MAP[bioTheme]})`);
    console.log(`   Source: ${sourceUrl || 'none'}`);

    // Generate article
    const article = generateArticleContent(broadcast, broadcast.document_content);
    console.log(`   Title: "${article.title}"`);
    console.log(`   Words: ${article.wordCount}`);

    // Handle featured image
    let featuredMediaId = null;
    if (broadcast.image_url) {
      const imagePath = path.resolve(broadcast.image_url);
      if (fs.existsSync(imagePath)) {
        console.log(`   Uploading image...`);
        try {
          featuredMediaId = await uploadImage(imagePath, article.title);
          console.log(`   ✅ Image uploaded (ID: ${featuredMediaId})`);
        } catch (error) {
          console.warn(`   ⚠️  Image upload failed: ${error.message}`);
        }
      }
    }

    // Create post
    console.log(`   Creating ${CONFIG.DRY_RUN ? 'DRAFT' : 'PUBLISHED'} post...`);
    const post = await createPost(article, bioTheme, broadcast.alignment_score, sourceUrl, featuredMediaId);
    
    console.log(`   ✅ Post created: ${post.link}`);

    // Update database
    updateBroadcastStatus(db, broadcast.id, post.id, CONFIG.DRY_RUN ? 'draft' : 'publish');

    return {
      success: true,
      broadcastId: broadcast.id,
      postId: post.id,
      postUrl: post.link,
      bioTheme,
      wordCount: article.wordCount
    };

  } catch (error) {
    console.error(`   ❌ Failed: ${error.message}`);
    updateBroadcastStatus(db, broadcast.id, null, 'error', error.message);
    
    return {
      success: false,
      broadcastId: broadcast.id,
      error: error.message
    };
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 AI10BRO WordPress Publisher\n');

  if (CONFIG.DRY_RUN) {
    console.log('🧪 DRY RUN MODE - Posts will be created as drafts\n');
  }

  if (!CONFIG.WP_APP_PASSWORD) {
    console.error('❌ Error: WP_APP_PASSWORD not configured');
    console.error('   Set it in .env.wordpress\n');
    process.exit(1);
  }

  console.log(`📊 Configuration:`);
  console.log(`   WordPress: ${CONFIG.WP_BASE_URL}`);
  console.log(`   Threshold: >= ${CONFIG.ALIGNMENT_THRESHOLD}`);
  console.log(`   Limit: ${CONFIG.LIMIT} broadcasts\n`);

  const db = new Database(CONFIG.DB_PATH);
  
  // Ensure columns exist
  ensureWordPressColumns(db);

  // Fetch broadcasts
  console.log('🔍 Fetching broadcasts...');
  const broadcasts = fetchBroadcastsToPublish(db);

  if (broadcasts.length === 0) {
    console.log('✨ No broadcasts found matching criteria\n');
    db.close();
    return;
  }

  console.log(`📚 Found ${broadcasts.length} broadcast(s)\n`);

  // Process each broadcast
  const results = [];
  for (const broadcast of broadcasts) {
    const result = await processBroadcast(db, broadcast);
    results.push(result);

    if (broadcasts.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY\n');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}\n`);

  if (successful.length > 0) {
    console.log('Published posts:');
    successful.forEach(r => {
      console.log(`   • ${r.postUrl}`);
      console.log(`     Theme: ${r.bioTheme}, Words: ${r.wordCount}`);
    });
  }

  if (failed.length > 0) {
    console.log('\nFailed broadcasts:');
    failed.forEach(r => {
      console.log(`   • ${r.broadcastId.slice(0, 8)}: ${r.error}`);
    });
  }

  console.log('\n' + '='.repeat(60));

  db.close();
}

// Run
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
