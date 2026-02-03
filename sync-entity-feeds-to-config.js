#!/usr/bin/env node

/**
 * Sync Entity RSS Feeds to search_config.yml
 *
 * Reads entities with discovered RSS feeds from database and adds them
 * to the news sources section of search_config.yml in gdelt-obsidian repo.
 *
 * Usage: node sync-entity-feeds-to-config.js [--dry-run]
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import yaml from 'js-yaml';

const db = new Database('agent/data/db.sqlite');
const CONFIG_PATH = '/Users/davidlockie/Documents/Projects/gdelt-obsidian/search_config.yml';

/**
 * Get entities with RSS feeds from database
 */
function getEntitiesWithFeeds() {
    return db.prepare(`
        SELECT id, name, type, website, rss_feed, focus_area, confidence
        FROM tracked_entities
        WHERE rss_feed IS NOT NULL AND rss_feed != ''
        ORDER BY type, name
    `).all();
}

/**
 * Convert entity to news source entry
 */
function entityToNewsSource(entity) {
    const typeLabels = {
        company: 'Company Blog',
        lab: 'Research Lab News',
        vc: 'VC Insights',
    };

    const categories = [];

    // Add type-specific categories
    if (entity.type === 'company') {
        categories.push('company-news', 'commercial-biotech');
    } else if (entity.type === 'lab') {
        categories.push('research-updates', 'academic-research');
    } else if (entity.type === 'vc') {
        categories.push('investment-news', 'portfolio-updates');
    }

    // Add focus area as category
    if (entity.focus_area) {
        categories.push(entity.focus_area.toLowerCase().replace(/\s+/g, '-'));
    }

    return {
        name: `${entity.name} - ${typeLabels[entity.type] || 'Blog'}`,
        url: entity.rss_feed,
        type: 'rss',
        signal_quality: entity.confidence === 'high' ? 'high' : 'medium',
        categories,
        note: `Auto-discovered from tracked entity: ${entity.name} (${entity.focus_area || entity.type})`,
    };
}

/**
 * Add entity feeds to config
 */
function syncEntityFeedsToConfig(dryRun = false) {
    console.log('🔄 Syncing entity RSS feeds to search_config.yml\n');

    // Load current config
    const configYaml = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const config = yaml.load(configYaml);

    // Get entities with feeds
    const entities = getEntitiesWithFeeds();
    console.log(`Found ${entities.length} entities with RSS feeds\n`);

    if (entities.length === 0) {
        console.log('⚠️  No entity feeds to sync');
        console.log('Run discover-entity-rss-feeds.js first to discover feeds');
        return;
    }

    // Get existing feed URLs to avoid duplicates
    const existingUrls = new Set(
        config.platform_config.news.sources.map(source => source.url)
    );

    // Group entities by type
    const byType = {
        company: entities.filter(e => e.type === 'company'),
        lab: entities.filter(e => e.type === 'lab'),
        vc: entities.filter(e => e.type === 'vc'),
    };

    console.log('Entities by type:');
    console.log(`  Companies: ${byType.company.length}`);
    console.log(`  Labs: ${byType.lab.length}`);
    console.log(`  VCs: ${byType.vc.length}`);
    console.log('');

    // Find where to insert entity feeds (after existing feeds)
    const newsSources = config.platform_config.news.sources;
    let insertIndex = newsSources.length;

    // Check if we already have entity feeds section
    const entityFeedsStartIndex = newsSources.findIndex(
        source => source.note && source.note.includes('Auto-discovered from tracked entity')
    );

    if (entityFeedsStartIndex !== -1) {
        console.log('ℹ️  Found existing entity feeds section, will replace\n');
        // Remove all existing entity feeds
        const filteredSources = newsSources.filter(
            source => !source.note || !source.note.includes('Auto-discovered from tracked entity')
        );
        config.platform_config.news.sources = filteredSources;
        insertIndex = filteredSources.length;
    }

    // Convert entities to news sources
    const newSources = [];
    const skipped = [];

    for (const entity of entities) {
        if (existingUrls.has(entity.rss_feed)) {
            skipped.push(entity);
            console.log(`⏭️  Skipping ${entity.name}: Feed already in config`);
            continue;
        }

        const newsSource = entityToNewsSource(entity);
        newSources.push(newsSource);
        console.log(`✅ Adding ${entity.name} (${entity.type}): ${entity.rss_feed}`);
    }

    if (newSources.length === 0) {
        console.log('\n⚠️  No new entity feeds to add (all already exist in config)');
        return;
    }

    // Add comment header for entity feeds section
    const entityFeedsSection = [
        ...newSources,
    ];

    // Insert entity feeds at the end
    config.platform_config.news.sources.push(...entityFeedsSection);

    console.log(`\n📊 Summary:`);
    console.log(`  New feeds added: ${newSources.length}`);
    console.log(`  Skipped (already exist): ${skipped.length}`);
    console.log(`  Total feeds in config: ${config.platform_config.news.sources.length}`);

    if (dryRun) {
        console.log('\n⚠️  DRY RUN MODE - No files were modified');
        console.log('\nPreview of new feeds that would be added:\n');
        for (const source of newSources) {
            console.log(`  ${source.name}`);
            console.log(`    URL: ${source.url}`);
            console.log(`    Categories: ${source.categories.join(', ')}`);
            console.log('');
        }
        return;
    }

    // Write updated config
    const updatedYaml = yaml.dump(config, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
    });

    fs.writeFileSync(CONFIG_PATH, updatedYaml, 'utf-8');
    console.log(`\n✅ Updated ${CONFIG_PATH}`);
    console.log('\nNext steps:');
    console.log('  1. cd /Users/davidlockie/Documents/Projects/gdelt-obsidian');
    console.log('  2. git diff search_config.yml  # Review changes');
    console.log('  3. git add search_config.yml && git commit -m "Add entity RSS feeds"');
    console.log('  4. git push origin master');
}

/**
 * Main execution
 */
function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');

    syncEntityFeedsToConfig(dryRun);
}

main();
