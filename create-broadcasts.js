#!/usr/bin/env node

/**
 * Unified broadcast creation script
 * This is the SINGLE entry point for all broadcast creation triggers:
 * - Dashboard button clicks (via action-api.js)
 * - Cron jobs
 * - Agent action commands
 * - Manual CLI execution
 *
 * Usage: node create-broadcasts.js [limit]
 * Default limit: 10 documents
 */

const { processUnprocessedDocuments } = require('./process-unprocessed-docs.js');

async function main() {
    const limit = process.argv[2] ? parseInt(process.argv[2]) : 10;

    console.log('═'.repeat(60));
    console.log('🚀 UNIFIED BROADCAST CREATION SYSTEM');
    console.log('═'.repeat(60));
    console.log(`Processing up to ${limit} documents...`);
    console.log(`Triggered at: ${new Date().toISOString()}`);
    console.log('─'.repeat(60));

    try {
        const result = await processUnprocessedDocuments(limit);

        console.log('═'.repeat(60));
        console.log('✅ BROADCAST CREATION COMPLETE');
        console.log(`   Processed: ${result.processed}`);
        console.log(`   Skipped: ${result.failed}`);
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