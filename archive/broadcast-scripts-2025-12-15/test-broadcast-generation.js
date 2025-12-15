#!/usr/bin/env node

/**
 * Comprehensive test suite for broadcast generation
 * Tests truncation fixes, URL inclusion, and platform-specific limits
 */

const { generatePlatformBroadcasts, PLATFORM_LIMITS } = require('./generate-platform-broadcasts');
const Database = require('better-sqlite3');
const path = require('path');

// Test content samples
const TEST_SAMPLES = [
    {
        name: "Scientific breakthrough with URL",
        content: `New quantum computing breakthrough at MIT achieves 99.9% error correction rate, 
                 marking a significant milestone toward practical quantum computers. The research team 
                 developed a novel approach using topological qubits that are inherently resistant to 
                 environmental noise. Source: https://www.nature.com/articles/quantum-computing-breakthrough-2025`,
        expectedUrl: "https://www.nature.com/articles/quantum-computing-breakthrough-2025"
    },
    {
        name: "Long content that needs truncation",
        content: `Revolutionary solar panel technology developed by Stanford researchers achieves 
                 unprecedented 47% efficiency, nearly double the current commercial standard. The breakthrough 
                 uses perovskite-silicon tandem cells with a novel nanostructure that captures previously 
                 wasted infrared light. This advancement could dramatically reduce the cost of solar energy 
                 and accelerate the transition to renewable power. The team estimates that widespread adoption 
                 could reduce global carbon emissions by 2.5 gigatons annually by 2030. Manufacturing costs 
                 are projected to be only 20% higher than conventional panels, with the increased efficiency 
                 more than offsetting the additional expense. Field tests in various climates have shown 
                 remarkable durability, maintaining over 95% efficiency after 5 years of operation. 
                 Source: https://science.org/solar-breakthrough`,
        expectedUrl: "https://science.org/solar-breakthrough"
    },
    {
        name: "Content without URL",
        content: `Local community garden initiative transforms abandoned lot into thriving urban farm, 
                 providing fresh produce to over 200 families and creating 15 new jobs in the process.`,
        expectedUrl: ""
    },
    {
        name: "Multiple URLs (should pick first)",
        content: `Climate study reveals Arctic warming faster than predicted. 
                 Main source: https://climate.nasa.gov/arctic-2025 
                 Additional data: https://noaa.gov/climate-data`,
        expectedUrl: "https://climate.nasa.gov/arctic-2025"
    },
    {
        name: "Edge case - exactly at limit",
        content: `AI model achieves human parity in medical diagnosis accuracy for rare diseases.
                 https://medical-ai.com/breakthrough`,
        expectedUrl: "https://medical-ai.com/breakthrough"
    }
];

// Quality check functions
function checkBroadcastQuality(broadcast, platform, sample) {
    const issues = [];
    const limit = PLATFORM_LIMITS[platform];
    
    // Check length
    if (broadcast.length > limit) {
        issues.push(`EXCEEDS LIMIT: ${broadcast.length} > ${limit} chars`);
    }
    
    // Check for mid-sentence truncation
    const lastChar = broadcast.slice(-1);
    const lastWord = broadcast.split(' ').pop();
    
    if (broadcast.endsWith('...')) {
        // This is intentional truncation, check if it's at a reasonable point
        const beforeEllipsis = broadcast.slice(0, -3).trim();
        const lastCharBefore = beforeEllipsis.slice(-1);
        if (!['.', '!', '?', ','].includes(lastCharBefore) && !beforeEllipsis.endsWith('ing')) {
            issues.push('TRUNCATION: Ends with ellipsis mid-thought');
        }
    } else if (!['.', '!', '?', '"', ')', ']'].includes(lastChar)) {
        // Check if it ends mid-sentence
        if (!lastWord.match(/^\d+(\.\d+)?%?$/)) { // Allow ending with numbers/percentages
            issues.push(`INCOMPLETE: Doesn't end with punctuation (ends with "${lastChar}")`);
        }
    }
    
    // Check for URL inclusion
    if (sample.expectedUrl && !broadcast.includes(sample.expectedUrl)) {
        issues.push('MISSING URL: Expected URL not included');
    }
    
    // Check for random cut-offs
    const suspiciousEndings = ['and', 'the', 'to', 'of', 'in', 'for', 'with', 'that', 'this'];
    const lastWords = broadcast.trim().split(' ').slice(-2);
    if (suspiciousEndings.includes(lastWords[lastWords.length - 1].toLowerCase())) {
        issues.push(`SUSPICIOUS ENDING: Ends with "${lastWords[lastWords.length - 1]}"`);
    }
    
    // Check URL formatting
    if (sample.expectedUrl && broadcast.includes(sample.expectedUrl)) {
        if (!broadcast.includes('🔗 ' + sample.expectedUrl)) {
            issues.push('URL FORMAT: URL present but not properly formatted with 🔗');
        }
    }
    
    return {
        platform,
        length: broadcast.length,
        limit,
        withinLimit: broadcast.length <= limit,
        issues,
        quality: issues.length === 0 ? 'PASS' : 'FAIL'
    };
}

async function runTests() {
    console.log('🧪 Broadcast Generation Test Suite');
    console.log('===================================\n');
    
    const results = {
        passed: 0,
        failed: 0,
        details: []
    };
    
    for (const sample of TEST_SAMPLES) {
        console.log(`\n📝 Testing: ${sample.name}`);
        console.log(`   Content length: ${sample.content.length} chars`);
        console.log(`   Expected URL: ${sample.expectedUrl || 'None'}`);
        console.log('\n   Generating broadcasts...\n');
        
        try {
            const broadcasts = await generatePlatformBroadcasts(
                `test-${Date.now()}`,
                sample.content,
                sample.expectedUrl
            );
            
            for (const [platform, data] of Object.entries(broadcasts)) {
                if (data && data.text) {
                    const quality = checkBroadcastQuality(data.text, platform, sample);
                    
                    // Display results
                    const icon = quality.quality === 'PASS' ? '✅' : '❌';
                    console.log(`   ${icon} ${platform.toUpperCase()}`);
                    console.log(`      Length: ${quality.length}/${quality.limit} chars`);
                    
                    // Show preview
                    const preview = data.text.length > 100 
                        ? data.text.substring(0, 100) + '...' 
                        : data.text;
                    console.log(`      Preview: "${preview.replace(/\n/g, ' ')}"`);
                    
                    if (quality.issues.length > 0) {
                        console.log(`      Issues:`);
                        quality.issues.forEach(issue => {
                            console.log(`        ⚠️  ${issue}`);
                        });
                        results.failed++;
                    } else {
                        console.log(`      ✓ Complete thought, includes URL if needed`);
                        results.passed++;
                    }
                    
                    results.details.push({
                        sample: sample.name,
                        platform,
                        ...quality
                    });
                }
            }
        } catch (error) {
            console.error(`   ❌ Error generating broadcasts: ${error.message}`);
            results.failed++;
        }
    }
    
    // Summary
    console.log('\n\n📊 TEST SUMMARY');
    console.log('================');
    console.log(`Total Tests: ${results.passed + results.failed}`);
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
    
    // Platform breakdown
    console.log('\n📱 Platform Breakdown:');
    const platformStats = {};
    results.details.forEach(r => {
        if (!platformStats[r.platform]) {
            platformStats[r.platform] = { passed: 0, failed: 0, issues: [] };
        }
        if (r.quality === 'PASS') {
            platformStats[r.platform].passed++;
        } else {
            platformStats[r.platform].failed++;
            platformStats[r.platform].issues.push(...r.issues);
        }
    });
    
    for (const [platform, stats] of Object.entries(platformStats)) {
        console.log(`\n   ${platform}:`);
        console.log(`   - Passed: ${stats.passed}`);
        console.log(`   - Failed: ${stats.failed}`);
        if (stats.issues.length > 0) {
            console.log(`   - Common issues:`);
            const uniqueIssues = [...new Set(stats.issues.map(i => i.split(':')[0]))];
            uniqueIssues.forEach(issue => {
                const count = stats.issues.filter(i => i.startsWith(issue)).length;
                console.log(`     • ${issue} (${count}x)`);
            });
        }
    }
    
    // Check real database broadcasts
    console.log('\n\n🔍 Checking Recent Database Broadcasts');
    console.log('======================================');
    
    const dbPath = path.join(__dirname, 'agent/data/db.sqlite');
    const db = new Database(dbPath);
    
    const recentBroadcasts = db.prepare(`
        SELECT id, client, content, created_at
        FROM broadcasts
        WHERE created_at > ?
        ORDER BY created_at DESC
        LIMIT 10
    `).all(Date.now() - 3600000); // Last hour
    
    console.log(`Found ${recentBroadcasts.length} broadcasts from the last hour\n`);
    
    let dbIssues = 0;
    recentBroadcasts.forEach(broadcast => {
        try {
            const content = JSON.parse(broadcast.content);
            const text = content.text || '';
            const platform = broadcast.client;
            const limit = PLATFORM_LIMITS[platform] || 500;
            
            // Quick quality check
            const issues = [];
            if (text.length > limit) {
                issues.push(`Exceeds ${platform} limit: ${text.length}/${limit}`);
            }
            if (text.endsWith('and') || text.endsWith('the') || text.endsWith('to')) {
                issues.push('Ends mid-thought');
            }
            if (!text.includes('http') && platform !== 'telegram') {
                issues.push('No URL included');
            }
            
            const icon = issues.length === 0 ? '✅' : '⚠️';
            console.log(`${icon} ${platform} (${broadcast.id.substring(0, 8)}...)`);
            console.log(`   Length: ${text.length}/${limit}`);
            if (issues.length > 0) {
                console.log(`   Issues: ${issues.join(', ')}`);
                dbIssues++;
            }
            console.log(`   Preview: "${text.substring(0, 80)}..."\n`);
        } catch (e) {
            console.log(`❌ Error parsing broadcast ${broadcast.id}: ${e.message}\n`);
            dbIssues++;
        }
    });
    
    if (dbIssues > 0) {
        console.log(`⚠️  Found ${dbIssues} problematic broadcasts in database`);
    } else if (recentBroadcasts.length > 0) {
        console.log('✅ All recent database broadcasts look good!');
    }
    
    db.close();
    
    // Final recommendations
    console.log('\n\n💡 RECOMMENDATIONS');
    console.log('==================');
    
    if (results.failed > 0) {
        console.log('⚠️  Some tests failed. Common issues to address:');
        const allIssues = results.details.filter(r => r.quality === 'FAIL').flatMap(r => r.issues);
        const issueTypes = [...new Set(allIssues.map(i => i.split(':')[0]))];
        issueTypes.forEach(issue => {
            console.log(`   • ${issue}`);
        });
    } else {
        console.log('✅ All tests passed! The broadcast generation system is working correctly.');
    }
    
    console.log('\n✨ Test suite complete!\n');
}

// Check if Ollama is running
async function checkOllama() {
    try {
        const { execSync } = require('child_process');
        execSync('curl -s http://localhost:11434/api/tags', { timeout: 2000 });
        return true;
    } catch (e) {
        return false;
    }
}

// Run tests
(async () => {
    const ollamaRunning = await checkOllama();
    if (!ollamaRunning) {
        console.error('❌ Ollama is not running. Please start Ollama first:');
        console.error('   ollama serve');
        process.exit(1);
    }
    
    await runTests();
})().catch(console.error);