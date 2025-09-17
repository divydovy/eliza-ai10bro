#!/usr/bin/env node

const sqlite3 = require('better-sqlite3');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

async function testAllSendScripts() {
    try {
        console.log('🧪 Testing All Send Scripts');
        console.log('============================\n');

        // Open database
        const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
        const db = sqlite3(dbPath);

        // Get broadcast counts by platform
        const platforms = ['telegram', 'farcaster', 'bluesky'];
        const scripts = [
            'send-pending-to-telegram.js',
            'send-pending-to-farcaster.js',
            'send-pending-to-bluesky.js'
        ];

        console.log('📊 Current Broadcast Status:');
        console.log('-----------------------------');

        for (let i = 0; i < platforms.length; i++) {
            const platform = platforms[i];
            const pending = db.prepare('SELECT COUNT(*) as count FROM broadcasts WHERE client = ? AND status = ?').get(platform, 'pending');
            const sent = db.prepare('SELECT COUNT(*) as count FROM broadcasts WHERE client = ? AND status = ?').get(platform, 'sent');

            console.log(`${platform.toUpperCase()}:`);
            console.log(`  ✅ Sent: ${sent.count}`);
            console.log(`  ⏳ Pending: ${pending.count}`);
            console.log('');
        }

        // Test each script
        console.log('🚀 Testing Send Scripts:');
        console.log('-------------------------');

        const testResults = {};

        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i];
            const platform = platforms[i];

            try {
                console.log(`\n📝 Testing ${script}...`);

                // Check if script file exists
                const fs = require('fs');
                if (!fs.existsSync(script)) {
                    testResults[platform] = {
                        success: false,
                        error: 'Script file does not exist'
                    };
                    console.log(`❌ ${script} not found`);
                    continue;
                }

                // Get one pending broadcast ID for this platform
                const broadcast = db.prepare(`
                    SELECT id FROM broadcasts
                    WHERE client = ? AND status = 'pending'
                    LIMIT 1
                `).get(platform);

                if (!broadcast) {
                    testResults[platform] = {
                        success: true,
                        message: 'No pending broadcasts to test',
                        skipped: true
                    };
                    console.log(`⚠️ No pending ${platform} broadcasts to test`);
                    continue;
                }

                console.log(`🎯 Testing with broadcast ID: ${broadcast.id}`);

                // Test the script with a specific broadcast ID
                const startTime = Date.now();
                const { stdout, stderr } = await execAsync(
                    `BROADCAST_ID=${broadcast.id} node ${script}`,
                    { timeout: 30000 } // 30 second timeout
                );
                const duration = Date.now() - startTime;

                // Check if broadcast was actually sent
                const updatedBroadcast = db.prepare('SELECT status FROM broadcasts WHERE id = ?').get(broadcast.id);

                if (updatedBroadcast.status === 'sent') {
                    testResults[platform] = {
                        success: true,
                        message: 'Successfully sent broadcast',
                        duration: duration,
                        broadcastId: broadcast.id
                    };
                    console.log(`✅ ${platform} script working - broadcast sent in ${duration}ms`);
                } else {
                    testResults[platform] = {
                        success: false,
                        error: 'Broadcast not marked as sent',
                        status: updatedBroadcast.status
                    };
                    console.log(`❌ ${platform} script issue - broadcast status: ${updatedBroadcast.status}`);
                }

            } catch (error) {
                testResults[platform] = {
                    success: false,
                    error: error.message
                };
                console.log(`❌ ${platform} script failed: ${error.message}`);
            }
        }

        db.close();

        // Print summary
        console.log('\n📋 Test Summary:');
        console.log('================');

        let passedTests = 0;
        let totalTests = 0;

        for (const platform of platforms) {
            totalTests++;
            const result = testResults[platform];

            if (result.success) {
                passedTests++;
                if (result.skipped) {
                    console.log(`🟡 ${platform.toUpperCase()}: SKIPPED - ${result.message}`);
                } else {
                    console.log(`🟢 ${platform.toUpperCase()}: PASSED - ${result.message}`);
                    if (result.broadcastId) {
                        console.log(`   📨 Sent broadcast: ${result.broadcastId}`);
                        console.log(`   ⚡ Duration: ${result.duration}ms`);
                    }
                }
            } else {
                console.log(`🔴 ${platform.toUpperCase()}: FAILED - ${result.error}`);
            }
        }

        console.log(`\n🎯 Results: ${passedTests}/${totalTests} tests passed`);

        if (passedTests === totalTests) {
            console.log('✅ All send scripts are working correctly!');
        } else {
            console.log('❌ Some send scripts need attention.');
            process.exit(1);
        }

    } catch (error) {
        console.error('💥 Critical error in test script:', error);
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    testAllSendScripts().catch(error => {
        console.error('💥 Unhandled error:', error);
        process.exit(1);
    });
}

module.exports = { testAllSendScripts };