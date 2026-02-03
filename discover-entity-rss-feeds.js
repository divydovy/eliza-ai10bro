#!/usr/bin/env node

/**
 * Automated Entity RSS Feed Discovery
 *
 * For each tracked entity:
 * 1. Crawl entity website looking for RSS feed links
 * 2. Check common RSS locations (/feed, /rss, /blog/feed, etc.)
 * 3. Validate feed: valid XML, recent posts (last 6 months), biotech relevance
 * 4. Store discovered feeds in tracked_entities.rss_feed column
 * 5. Generate report for manual review
 *
 * Usage: node discover-entity-rss-feeds.js [--dry-run] [--entity-type=company]
 */

import Database from 'better-sqlite3';
import fetch from 'node-fetch';
import { parse } from 'node-html-parser';
import { parseString } from 'xml2js';
import { promisify } from 'util';

const parseXml = promisify(parseString);

const db = new Database('agent/data/db.sqlite');

// Common RSS feed patterns to check
const RSS_PATTERNS = [
    '/feed',
    '/feed/',
    '/rss',
    '/rss/',
    '/blog/feed',
    '/blog/rss',
    '/news/feed',
    '/news/rss',
    '/insights/feed',
    '/atom.xml',
    '/rss.xml',
    '/feed.xml',
];

// Biotech relevance keywords (for scoring feed quality)
const BIOTECH_KEYWORDS = [
    'synthetic biology', 'synbio', 'biotech', 'biotechnology',
    'CRISPR', 'gene editing', 'genetic engineering',
    'fermentation', 'biomanufacturing', 'bioprocessing',
    'protein engineering', 'enzyme', 'metabolic engineering',
    'cell culture', 'bioreactor', 'strain development',
    'FDA approval', 'clinical trial', 'therapeutic',
    'cultivated meat', 'precision fermentation', 'cellular agriculture',
];

/**
 * Discover RSS feeds from entity homepage
 */
async function discoverRSSFromPage(url, timeout = 10000) {
    try {
        console.log(`   🔍 Checking homepage: ${url}`);

        const response = await fetch(url, {
            headers: { 'User-Agent': 'AI10BRO-RSS-Discovery/1.0' },
            timeout,
        });

        if (!response.ok) {
            console.log(`   ⚠️  HTTP ${response.status}: ${url}`);
            return [];
        }

        const html = await response.text();
        const root = parse(html);

        // Look for RSS link tags in HTML head
        const rssLinks = [];

        // <link rel="alternate" type="application/rss+xml">
        const linkTags = root.querySelectorAll('link[type*="rss"], link[type*="atom"], link[type*="feed"]');
        for (const link of linkTags) {
            const href = link.getAttribute('href');
            if (href) {
                const absoluteUrl = new URL(href, url).href;
                rssLinks.push(absoluteUrl);
                console.log(`   ✅ Found RSS link tag: ${absoluteUrl}`);
            }
        }

        // Look for common RSS URL patterns
        const baseUrl = new URL(url);
        for (const pattern of RSS_PATTERNS) {
            const testUrl = `${baseUrl.protocol}//${baseUrl.host}${pattern}`;
            rssLinks.push(testUrl);
        }

        return [...new Set(rssLinks)]; // Deduplicate
    } catch (error) {
        console.log(`   ❌ Error fetching ${url}: ${error.message}`);
        return [];
    }
}

/**
 * Validate RSS feed (valid XML, recent posts)
 */
async function validateRSSFeed(feedUrl, timeout = 10000) {
    try {
        const response = await fetch(feedUrl, {
            headers: { 'User-Agent': 'AI10BRO-RSS-Discovery/1.0' },
            timeout,
        });

        if (!response.ok) {
            return { valid: false, reason: `HTTP ${response.status}` };
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('xml') && !contentType.includes('rss') && !contentType.includes('atom')) {
            return { valid: false, reason: 'Not XML/RSS content' };
        }

        const xml = await response.text();

        // Parse RSS/Atom feed
        const feed = await parseXml(xml);

        // Extract items (RSS or Atom)
        let items = [];
        if (feed.rss && feed.rss.channel) {
            items = feed.rss.channel[0].item || [];
        } else if (feed.feed && feed.feed.entry) {
            items = feed.feed.entry || [];
        }

        if (items.length === 0) {
            return { valid: false, reason: 'No items in feed' };
        }

        // Check for recent posts (last 6 months)
        const sixMonthsAgo = Date.now() - (6 * 30 * 24 * 60 * 60 * 1000);
        let recentPosts = 0;

        for (const item of items.slice(0, 10)) { // Check first 10 items
            const pubDate = item.pubDate?.[0] || item.published?.[0] || item.updated?.[0];
            if (pubDate) {
                const postDate = new Date(pubDate).getTime();
                if (postDate > sixMonthsAgo) {
                    recentPosts++;
                }
            }
        }

        if (recentPosts === 0) {
            return { valid: false, reason: 'No posts in last 6 months' };
        }

        // Score biotech relevance (check recent post titles/descriptions)
        let relevanceScore = 0;
        for (const item of items.slice(0, 5)) {
            const title = item.title?.[0] || '';
            const description = item.description?.[0] || item.summary?.[0] || '';
            const content = (title + ' ' + description).toLowerCase();

            for (const keyword of BIOTECH_KEYWORDS) {
                if (content.includes(keyword.toLowerCase())) {
                    relevanceScore++;
                }
            }
        }

        return {
            valid: true,
            totalItems: items.length,
            recentPosts,
            relevanceScore,
            url: feedUrl,
        };
    } catch (error) {
        return { valid: false, reason: error.message };
    }
}

/**
 * Discover and validate RSS feeds for an entity
 */
async function discoverEntityRSS(entity) {
    console.log(`\n📡 ${entity.name} (${entity.type})`);

    if (!entity.website) {
        console.log(`   ⏭️  No website - skipping`);
        return null;
    }

    // Discover potential RSS feed URLs
    const potentialFeeds = await discoverRSSFromPage(entity.website);

    if (potentialFeeds.length === 0) {
        console.log(`   ❌ No RSS feeds found`);
        return null;
    }

    console.log(`   🔎 Testing ${potentialFeeds.length} potential feeds...`);

    // Validate each potential feed
    const validFeeds = [];
    for (const feedUrl of potentialFeeds) {
        console.log(`   🧪 Testing: ${feedUrl}`);
        const validation = await validateRSSFeed(feedUrl);

        if (validation.valid) {
            console.log(`   ✅ VALID: ${validation.totalItems} items, ${validation.recentPosts} recent, relevance: ${validation.relevanceScore}`);
            validFeeds.push(validation);
        } else {
            console.log(`   ❌ Invalid: ${validation.reason}`);
        }

        // Rate limit: wait 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Pick best feed (highest relevance score, then most recent posts)
    if (validFeeds.length > 0) {
        validFeeds.sort((a, b) => {
            if (b.relevanceScore !== a.relevanceScore) {
                return b.relevanceScore - a.relevanceScore;
            }
            return b.recentPosts - a.recentPosts;
        });

        const bestFeed = validFeeds[0];
        console.log(`   🎯 BEST FEED: ${bestFeed.url} (relevance: ${bestFeed.relevanceScore})`);
        return bestFeed;
    }

    console.log(`   ❌ No valid feeds found`);
    return null;
}

/**
 * Main execution
 */
async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const entityTypeFilter = args.find(arg => arg.startsWith('--entity-type='))?.split('=')[1];

    console.log('🤖 AI10BRO Entity RSS Discovery\n');
    console.log(`Mode: ${dryRun ? 'DRY RUN (no database updates)' : 'LIVE (will update database)'}`);
    if (entityTypeFilter) {
        console.log(`Filter: Only ${entityTypeFilter} entities`);
    }
    console.log('');

    // Add rss_feed column if it doesn't exist
    try {
        db.exec(`ALTER TABLE tracked_entities ADD COLUMN rss_feed TEXT`);
        console.log('✅ Added rss_feed column to tracked_entities table\n');
    } catch (e) {
        if (e.message.includes('duplicate column')) {
            console.log('✅ rss_feed column already exists\n');
        } else {
            throw e;
        }
    }

    // Get entities to process
    let query = `
        SELECT id, name, type, website, rss_feed
        FROM tracked_entities
        WHERE website IS NOT NULL AND website != ''
    `;

    if (entityTypeFilter) {
        query += ` AND type = '${entityTypeFilter}'`;
    }

    query += ` ORDER BY type, name`;

    const entities = db.prepare(query).all();

    console.log(`Found ${entities.length} entities with websites\n`);
    console.log('═'.repeat(80));

    const discovered = [];
    const failed = [];
    const skipped = [];

    for (const entity of entities) {
        // Skip if already has RSS feed
        if (entity.rss_feed && !dryRun) {
            console.log(`\n⏭️  ${entity.name}: Already has RSS feed (${entity.rss_feed})`);
            skipped.push({ entity, reason: 'Already has feed' });
            continue;
        }

        const bestFeed = await discoverEntityRSS(entity);

        if (bestFeed) {
            discovered.push({ entity, feed: bestFeed });

            if (!dryRun) {
                // Update database
                db.prepare(`
                    UPDATE tracked_entities
                    SET rss_feed = ?
                    WHERE id = ?
                `).run(bestFeed.url, entity.id);
                console.log(`   💾 Saved to database`);
            }
        } else {
            failed.push({ entity, reason: 'No valid feed found' });
        }

        // Rate limit between entities
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Summary report
    console.log('\n' + '═'.repeat(80));
    console.log('\n📊 DISCOVERY SUMMARY\n');
    console.log(`Total entities processed: ${entities.length}`);
    console.log(`✅ RSS feeds discovered: ${discovered.length}`);
    console.log(`❌ Failed to find feeds: ${failed.length}`);
    console.log(`⏭️  Skipped (already have feed): ${skipped.length}`);

    if (discovered.length > 0) {
        console.log('\n📡 DISCOVERED FEEDS:\n');
        for (const { entity, feed } of discovered) {
            console.log(`${entity.name} (${entity.type})`);
            console.log(`  URL: ${feed.url}`);
            console.log(`  Quality: ${feed.totalItems} items, ${feed.recentPosts} recent, relevance: ${feed.relevanceScore}`);
            console.log('');
        }
    }

    if (failed.length > 0 && failed.length <= 10) {
        console.log('\n❌ FAILED (no valid feeds):\n');
        for (const { entity } of failed) {
            console.log(`  ${entity.name} (${entity.type}) - ${entity.website}`);
        }
        console.log('');
    }

    if (dryRun) {
        console.log('\n⚠️  DRY RUN MODE - No database updates were made');
        console.log('Run without --dry-run to save discovered feeds to database');
    }

    console.log('\n✅ Discovery complete!');
}

main().catch(console.error);
