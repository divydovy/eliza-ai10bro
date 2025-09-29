#!/usr/bin/env node

/**
 * Unified broadcast creation script
 * This is the SINGLE entry point for all broadcast creation triggers:
 * - Dashboard button clicks (via action-api.js)
 * - Cron jobs
 * - Agent action commands
 * - Manual CLI execution
 *
 * Usage: node create-broadcasts.js [targetBroadcasts]
 * Default target: 10 valid broadcasts (will review up to 100 documents to achieve this)
 */

const { processUnprocessedDocuments } = require('./process-unprocessed-docs.js');

async function main() {
    const targetBroadcasts = process.argv[2] ? parseInt(process.argv[2]) : 10;

    console.log('═'.repeat(60));
    console.log('🚀 UNIFIED BROADCAST CREATION SYSTEM');
    console.log('═'.repeat(60));
    console.log(`Target: Create ${targetBroadcasts} valid broadcasts`);
    console.log(`Will review up to 100 documents to achieve this`);
    console.log(`Triggered at: ${new Date().toISOString()}`);
    console.log('─'.repeat(60));

    try {
        const result = await processUnprocessedDocuments(targetBroadcasts);

        console.log('═'.repeat(60));
        console.log('✅ BROADCAST CREATION COMPLETE');
        console.log(`   Broadcasts created: ${result.processed}`);
        console.log(`   Documents skipped: ${result.failed}`);
        console.log('═'.repeat(60));

        process.exit(0);
    } catch (error) {
        console.error('❌ ERROR:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };