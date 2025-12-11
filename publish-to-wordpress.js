#!/usr/bin/env node

/**
 * WordPress Publisher for AI10BRO
 *
 * Publishes quality broadcasts (alignment >= 0.20) to WordPress site as enriched Daily Insight articles.
 *
 * Usage:
 *   node publish-to-wordpress.js --dry-run --limit=1        # Test mode (drafts only)
 *   node publish-to-wordpress.js --limit=5                  # Publish 5 articles
 *   BROADCAST_ID=uuid node publish-to-wordpress.js          # Publish specific broadcast
 *
 * Environment Variables (.env.wordpress):
 *   WP_BASE_URL     - WordPress site URL (e.g., http://localhost:8885)
 *   WP_USERNAME     - WordPress username
 *   WP_APP_PASSWORD - WordPress application password
 *   GEMINI_API_KEY  - Gemini API key for image generation
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.wordpress' });

// Configuration
const CONFIG = {
  WP_BASE_URL: process.env.WP_BASE_URL || 'http://localhost:8885',
  WP_USERNAME: process.env.WP_USERNAME || 'admin',
  WP_APP_PASSWORD: process.env.WP_APP_PASSWORD,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  DB_PATH: process.env.DB_PATH || './agent/data/db.sqlite',
  ALIGNMENT_THRESHOLD: parseFloat(process.env.WP_ALIGNMENT_THRESHOLD || '0.20'),
  DRY_RUN: process.argv.includes('--dry-run'),
  LIMIT: parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '1'),
  BROADCAST_ID: process.env.BROADCAST_ID || null,
};

// Bio theme mapping (from ELIZA_AGENT_GUIDE.md)
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

// Reverse mapping for display
const BIO_THEME_NAMES = Object.fromEntries(
  Object.entries(BIO_THEME_MAP).map(([k, v]) => [v, k])
);

/**
 * Database connection
 */
async function getDb() {
  return open({
    filename: CONFIG.DB_PATH,
    driver: sqlite3.Database
  });
}

/**
 * Add WordPress tracking columns to broadcasts table
 */
async function ensureWordPressColumns(db) {
  const schema = await db.get("PRAGMA table_info(broadcasts)");
  const columns = await db.all("PRAGMA table_info(broadcasts)");
  const columnNames = columns.map(c => c.name);

  if (!columnNames.includes('wordpress_published')) {
    console.log('📊 Adding WordPress tracking columns to broadcasts table...');

    await db.exec(`
      ALTER TABLE broadcasts ADD COLUMN wordpress_published BOOLEAN DEFAULT FALSE;
    `);
    await db.exec(`
      ALTER TABLE broadcasts ADD COLUMN wordpress_post_id INTEGER;
    `);
    await db.exec(`
      ALTER TABLE broadcasts ADD COLUMN wordpress_published_at DATETIME;
    `);
    await db.exec(`
      ALTER TABLE broadcasts ADD COLUMN wordpress_status TEXT;
    `);
    await db.exec(`
      ALTER TABLE broadcasts ADD COLUMN wordpress_error TEXT;
    `);

    console.log('✅ WordPress columns added successfully');
  }
}

/**
 * Fetch broadcasts ready for WordPress publishing
 */
async function fetchBroadcastsToPublish(db) {
  let query, params;

  if (CONFIG.BROADCAST_ID) {
    // Specific broadcast
    query = `
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
    `;
    params = [CONFIG.BROADCAST_ID];
  } else {
    // Query quality broadcasts not yet published
    query = `
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
      ORDER BY b.alignment_score DESC, b.createdAt DESC
      LIMIT ?
    `;
    params = [CONFIG.ALIGNMENT_THRESHOLD, CONFIG.LIMIT];
  }

  return db.all(query, params);
}

/**
 * Extract bio theme from document content
 */
function extractBioTheme(documentContent) {
  try {
    const content = typeof documentContent === 'string'
      ? documentContent
      : JSON.parse(documentContent).text;

    // Try to find tags in YAML frontmatter
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (yamlMatch) {
      const frontmatter = yamlMatch[1];
      const tagsMatch = frontmatter.match(/tags:\s*\[(.*?)\]/);
      if (tagsMatch) {
        const tags = tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
        for (const tag of tags) {
          const normalized = tag.toLowerCase().replace(/[_\s-]+/g, '');
          for (const [theme, _] of Object.entries(BIO_THEME_MAP)) {
            if (normalized.includes(theme) || theme.includes(normalized)) {
              return theme;
            }
          }
        }
      }

      // Try category field
      const categoryMatch = frontmatter.match(/category:\s*(\w+)/);
      if (categoryMatch) {
        const category = categoryMatch[1].toLowerCase();
        // Map common categories to bio themes
        const categoryMap = {
          'microbiology': 'synbio',
          'biotechnology': 'synbio',
          'materials': 'materials',
          'energy': 'energy',
          'agriculture': 'agtech',
          'medicine': 'health',
          'health': 'health',
          'ai': 'ai',
          'computing': 'ai',
          'environment': 'environment',
          'space': 'space',
          'manufacturing': 'manufacturing',
        };
        if (categoryMap[category]) {
          return categoryMap[category];
        }
      }
    }

    // Fallback: keyword matching in content
    const contentLower = content.toLowerCase();
    const themeKeywords = {
      'biomimicry': ['biomimicry', 'nature-inspired', 'bio-inspired'],
      'synbio': ['synthetic biology', 'genetic engineering', 'crispr', 'gene editing', 'bioengineering'],
      'materials': ['material', 'composite', 'polymer', 'carbon fiber'],
      'energy': ['energy', 'solar', 'battery', 'hydrogen', 'renewable'],
      'agtech': ['agriculture', 'farming', 'crop', 'vertical farm', 'precision fermentation'],
      'health': ['medicine', 'therapeutic', 'drug', 'clinical', 'patient'],
      'ai': ['artificial intelligence', 'machine learning', 'neural network', 'alphafold'],
      'innovation': ['funding', 'investment', 'startup', 'market', 'ipo'],
      'environment': ['climate', 'carbon', 'emission', 'conservation', 'sustainability'],
      'space': ['space', 'orbit', 'satellite', 'mars', 'iss'],
      'manufacturing': ['manufacturing', 'production', 'industrial', 'factory'],
    };

    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      if (keywords.some(kw => contentLower.includes(kw))) {
        return theme;
      }
    }

    // Default fallback
    return 'innovation';

  } catch (error) {
    console.warn('⚠️  Could not extract bio theme:', error.message);
    return 'innovation';
  }
}

/**
 * Generate rich Daily Insight article from broadcast + source document
 */
async function generateRichArticle(broadcast, sourceDocument) {
  const broadcastText = typeof broadcast.content === 'string'
    ? broadcast.content
    : JSON.parse(broadcast.content).text;

  const documentText = typeof sourceDocument === 'string'
    ? sourceDocument
    : JSON.parse(sourceDocument).text;

  const prompt = `You are AI10BRO, a science journalism AI specializing in bio/sustainability/tech innovations.

TASK: Transform this broadcast into a comprehensive 800-1200 word Daily Insight article.

BROADCAST:
${broadcastText}

SOURCE DOCUMENT:
${documentText}

ARTICLE STRUCTURE:

1. HOOK (1-2 sentences)
Write a compelling opening that captures the breakthrough. Use one of these styles:
- Direct news lead: "[Company/Institution] just cracked the code for..."
- Impact first: "Your [x] could [outcome] thanks to..."
- Problem-solution: "The [problem] just met its match..."
- Future vision: "By [year], [outcome] could become reality..."

2. OVERVIEW (2-3 paragraphs, ~200 words)
- Who: Company/research institution
- What: The innovation/breakthrough
- When: Timeline/announcement date
- Key numbers/facts

3. CONTEXT & DETAILS (3-4 paragraphs, ~300 words)
- How does the technology work? (Accessible explanation, use analogies)
- What makes it novel/significant?
- Technical details without jargon
- Comparison to existing approaches

4. WHY IT MATTERS (2-3 paragraphs, ~200 words)
- Industry implications
- Potential impact on sustainability/bio sector
- Market opportunity/size
- Regulatory or policy context (if relevant)

5. RELATED DEVELOPMENTS (1-2 paragraphs, ~100 words)
- Mention similar innovations in the space
- Broader trend context

6. LOOKING AHEAD (1 paragraph, ~100 words)
- Future milestones
- Timeline to commercialization/scaling
- What to watch for

TONE: Informative journalism (like TechCrunch, Axios, MIT Technology Review)
- Not academic, not hype
- Credible but accessible
- Optimistic but grounded

STYLE:
- Short paragraphs (2-4 sentences each)
- H2 subheadings for each section
- Bullet lists for key points (sparingly)
- Natural keyword integration
- No fluff, no repetition
- NO AI-isms like "It's important to note", "delve into", "landscape", "realm"
- NO generic conclusions like "Only time will tell"

OUTPUT FORMAT:
- HTML with <p>, <h2>, <h3>, <ul>, <li>, <strong>, <em> tags only
- DO NOT include title or meta tags (WordPress handles those)
- First paragraph should be plain <p> (no heading)

Generate the article now:`;

  // This is where you'd call your LLM API
  // For now, return a template that can be manually edited
  // In production, this would call Ollama, Claude, or another LLM

  console.log('🤖 Generating article with LLM...');

  // TODO: Implement actual LLM call here
  // For now, create a structured template from the broadcast

  const title = broadcastText.split('\n')[0].slice(0, 80);
  const excerpt = broadcastText.slice(0, 160).replace(/\n/g, ' ');

  const articleHTML = `<p>${broadcastText.split('\n\n')[0]}</p>

<h2>The Breakthrough</h2>

<p>${broadcastText}</p>

<h2>Why This Matters</h2>

<p>This development represents a significant step forward in the field. The implications for sustainability and innovation are substantial.</p>

<h2>Looking Ahead</h2>

<p>As this technology matures, we can expect to see broader adoption and further refinements. The next 12-18 months will be critical for validation and scale-up.</p>

<p><em>Note: This article was auto-generated from research content. Enhanced version coming soon.</em></p>`;

  return {
    title,
    content: articleHTML,
    excerpt,
    wordCount: articleHTML.split(/\s+/).length
  };
}

/**
 * Upload image to WordPress media library
 */
async function uploadImageToWordPress(imagePath, title) {
  if (!CONFIG.WP_APP_PASSWORD) {
    throw new Error('WP_APP_PASSWORD not configured');
  }

  const auth = Buffer.from(`${CONFIG.WP_USERNAME}:${CONFIG.WP_APP_PASSWORD}`).toString('base64');

  const form = new FormData();
  form.append('file', fs.createReadStream(imagePath));
  form.append('title', title);
  form.append('alt_text', title);

  const response = await fetch(`${CONFIG.WP_BASE_URL}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
    },
    body: form
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Image upload failed: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Create WordPress post via REST API
 */
async function createWordPressPost(article, bioTheme, alignmentScore, sourceUrl, featuredMediaId) {
  if (!CONFIG.WP_APP_PASSWORD) {
    throw new Error('WP_APP_PASSWORD not configured');
  }

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

  const data = await response.json();
  return data;
}

/**
 * Extract source URL from document content
 */
function extractSourceUrl(documentContent) {
  try {
    const content = typeof documentContent === 'string'
      ? documentContent
      : JSON.parse(documentContent).text;

    // Try to find source in YAML frontmatter
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (yamlMatch) {
      const sourceMatch = yamlMatch[1].match(/source:\s*(https?:\/\/[^\s]+)/);
      if (sourceMatch) {
        return sourceMatch[1];
      }

      const doiMatch = yamlMatch[1].match(/doi:\s*["']?(10\.\d+\/[^\s"']+)["']?/);
      if (doiMatch) {
        return `https://doi.org/${doiMatch[1]}`;
      }
    }

    // Fallback: find any URL in content
    const urlMatch = content.match(/https?:\/\/[^\s<)]+/);
    if (urlMatch) {
      return urlMatch[0];
    }

    return null;
  } catch (error) {
    console.warn('⚠️  Could not extract source URL:', error.message);
    return null;
  }
}

/**
 * Update broadcast with WordPress metadata
 */
async function updateBroadcastWordPressStatus(db, broadcastId, postId, status, error = null) {
  await db.run(`
    UPDATE broadcasts
    SET
      wordpress_published = ?,
      wordpress_post_id = ?,
      wordpress_published_at = datetime('now'),
      wordpress_status = ?,
      wordpress_error = ?
    WHERE id = ?
  `, [
    status === 'publish' || status === 'draft' ? 1 : 0,
    postId,
    status,
    error,
    broadcastId
  ]);
}

/**
 * Process a single broadcast
 */
async function processBroadcast(db, broadcast) {
  console.log(`\n📝 Processing broadcast ${broadcast.id.slice(0, 8)}...`);
  console.log(`   Alignment score: ${broadcast.alignment_score.toFixed(3)}`);

  try {
    // Extract bio theme
    const bioTheme = extractBioTheme(broadcast.document_content);
    console.log(`   Bio theme: ${bioTheme} (term ID: ${BIO_THEME_MAP[bioTheme]})`);

    // Generate rich article
    const article = await generateRichArticle(broadcast, broadcast.document_content);
    console.log(`   Generated article: "${article.title}"`);
    console.log(`   Word count: ${article.wordCount}`);

    if (article.wordCount < 200) {
      console.warn('⚠️  Article too short, needs manual review');
    }

    // Extract source URL
    const sourceUrl = extractSourceUrl(broadcast.document_content);
    console.log(`   Source URL: ${sourceUrl || 'none'}`);

    // Handle featured image
    let featuredMediaId = null;
    if (broadcast.image_url) {
      const imagePath = path.resolve(broadcast.image_url);
      if (fs.existsSync(imagePath)) {
        console.log(`   Uploading image: ${path.basename(imagePath)}`);
        try {
          featuredMediaId = await uploadImageToWordPress(imagePath, article.title);
          console.log(`   ✅ Image uploaded (media ID: ${featuredMediaId})`);
        } catch (error) {
          console.warn(`   ⚠️  Image upload failed: ${error.message}`);
        }
      } else {
        console.warn(`   ⚠️  Image file not found: ${imagePath}`);
      }
    }

    // Create WordPress post
    console.log(`   Creating WordPress post (${CONFIG.DRY_RUN ? 'DRAFT' : 'PUBLISH'})...`);
    const post = await createWordPressPost(
      article,
      bioTheme,
      broadcast.alignment_score,
      sourceUrl,
      featuredMediaId
    );

    console.log(`   ✅ Post created: ${post.link}`);

    // Update broadcast in database
    await updateBroadcastWordPressStatus(
      db,
      broadcast.id,
      post.id,
      CONFIG.DRY_RUN ? 'draft' : 'publish'
    );

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

    // Update broadcast with error
    await updateBroadcastWordPressStatus(
      db,
      broadcast.id,
      null,
      'error',
      error.message
    );

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
    console.error('   Generate an application password in WordPress:');
    console.error('   Users → Profile → Application Passwords');
    console.error('   Then add to .env.wordpress:');
    console.error('   WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx\n');
    process.exit(1);
  }

  console.log(`📊 Configuration:`);
  console.log(`   WordPress: ${CONFIG.WP_BASE_URL}`);
  console.log(`   Alignment threshold: >= ${CONFIG.ALIGNMENT_THRESHOLD}`);
  console.log(`   Limit: ${CONFIG.LIMIT} broadcasts`);
  console.log(`   Database: ${CONFIG.DB_PATH}\n`);

  const db = await getDb();

  // Ensure WordPress columns exist
  await ensureWordPressColumns(db);

  // Fetch broadcasts to publish
  console.log('🔍 Fetching broadcasts...');
  const broadcasts = await fetchBroadcastsToPublish(db);

  if (broadcasts.length === 0) {
    console.log('✨ No broadcasts found matching criteria');
    console.log(`   - Alignment score >= ${CONFIG.ALIGNMENT_THRESHOLD}`);
    console.log(`   - Not yet published to WordPress\n`);
    await db.close();
    return;
  }

  console.log(`📚 Found ${broadcasts.length} broadcast(s) to process\n`);

  // Process each broadcast
  const results = [];
  for (const broadcast of broadcasts) {
    const result = await processBroadcast(db, broadcast);
    results.push(result);

    // Small delay between posts to avoid rate limiting
    if (broadcasts.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 PUBLISHING SUMMARY\n');

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

  await db.close();
}

// Run
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
