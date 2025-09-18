#!/usr/bin/env node

/**
 * Test script to demonstrate round-robin broadcast distribution
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the round-robin function
import { getNextBroadcastsRoundRobin } from './packages/plugin-dashboard/src/services/process-queue-round-robin.js';

// Connect to database
const dbPath = path.join(__dirname, 'agent/data/db.sqlite');
const db = new Database(dbPath, { readonly: true });

console.log('🎯 Round-Robin Broadcast Distribution Test\n');
console.log('=' .repeat(50));

// Test different scenarios
async function testScenarios() {
    // Check current pending broadcasts
    const pendingByPlatform = db.prepare(`
        SELECT client, COUNT(*) as count
        FROM broadcasts
        WHERE status = 'pending'
        GROUP BY client
    `).all();

    console.log('\n📊 Current Pending Broadcasts:');
    pendingByPlatform.forEach(p => {
        console.log(`  ${p.client}: ${p.count} pending`);
    });
    console.log();

    // Test scenarios
    const scenarios = [
        { count: 1, desc: 'Single broadcast' },
        { count: 3, desc: 'One per platform' },
        { count: 6, desc: 'Two per platform' },
        { count: 10, desc: 'Uneven distribution' }
    ];

    for (const scenario of scenarios) {
        console.log(`\n📋 Scenario: ${scenario.desc} (requesting ${scenario.count})`);
        console.log('-'.repeat(40));

        const broadcasts = await getNextBroadcastsRoundRobin(db, scenario.count);

        if (broadcasts.length === 0) {
            console.log('  No broadcasts available');
        } else {
            console.log(`  Selected ${broadcasts.length} broadcast(s):`);

            // Show order and platform distribution
            broadcasts.forEach((b, i) => {
                const content = JSON.parse(b.content || '{}');
                const preview = content.text ? content.text.substring(0, 50) + '...' : 'No content';
                console.log(`    ${i + 1}. [${b.client}] ${preview}`);
            });

            // Show platform counts
            const platformCounts = {};
            broadcasts.forEach(b => {
                platformCounts[b.client] = (platformCounts[b.client] || 0) + 1;
            });

            console.log('\n  Platform distribution:');
            Object.entries(platformCounts).forEach(([platform, count]) => {
                console.log(`    ${platform}: ${count}`);
            });
        }
    }

    // Demonstrate interleaving
    console.log('\n\n🔄 Interleaving Demonstration:');
    console.log('-'.repeat(40));

    const interleavedBroadcasts = await getNextBroadcastsRoundRobin(db, 9);
    if (interleavedBroadcasts.length > 0) {
        console.log('Order of broadcasts (showing round-robin pattern):');
        interleavedBroadcasts.forEach((b, i) => {
            console.log(`  ${i + 1}. ${b.client}`);
        });
    } else {
        console.log('Not enough broadcasts to demonstrate interleaving');
    }
}

// Run tests
testScenarios()
    .then(() => {
        console.log('\n✅ Test complete!');
        db.close();
    })
    .catch(error => {
        console.error('❌ Error:', error);
        db.close();
        process.exit(1);
    });