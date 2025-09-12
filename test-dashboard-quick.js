#!/usr/bin/env node

const { chromium } = require('playwright');

async function testDashboard() {
    const browser = await chromium.launch({ 
        headless: true // Run headless for speed
    });
    const page = await browser.newPage();
    
    console.log('🧪 Dashboard Functionality Test\n');
    console.log('================================\n');
    
    try {
        // 1. Load the dashboard
        console.log('📋 Loading dashboard...');
        await page.goto('http://localhost:3001/broadcast-dashboard.html');
        await page.waitForTimeout(1000);
        
        // 2. Check main statistics
        console.log('\n📊 Main Statistics:');
        const stats = await page.evaluate(() => {
            const elements = {
                totalDocs: document.querySelector('.stats-grid .stat-card:nth-child(1) .stat-value')?.textContent,
                docsWithBroadcasts: document.querySelector('.stats-grid .stat-card:nth-child(2) .stat-value')?.textContent,
                coverage: document.querySelector('.stats-grid .stat-card:nth-child(3) .stat-value')?.textContent,
                pendingBroadcasts: document.querySelector('.stats-grid .stat-card:nth-child(4) .stat-value')?.textContent
            };
            return elements;
        });
        console.log(`   Total Documents: ${stats.totalDocs}`);
        console.log(`   Docs with Broadcasts: ${stats.docsWithBroadcasts}`);
        console.log(`   Coverage: ${stats.coverage}`);
        console.log(`   Pending Broadcasts: ${stats.pendingBroadcasts}`);
        
        // 3. Test API endpoints
        console.log('\n🔌 API Endpoints:');
        
        const endpoints = [
            { name: 'Stats', url: 'http://localhost:3001/api/stats' },
            { name: 'Sources', url: 'http://localhost:3001/api/sources' },
            { name: 'Recent', url: 'http://localhost:3001/api/recent' },
            { name: 'Broadcasts', url: 'http://localhost:3001/api/broadcasts' }
        ];
        
        for (const endpoint of endpoints) {
            const response = await page.evaluate(async (url) => {
                try {
                    const res = await fetch(url);
                    const data = await res.json();
                    return { 
                        ok: res.ok, 
                        status: res.status,
                        hasData: !!data
                    };
                } catch (e) {
                    return { ok: false, error: e.message };
                }
            }, endpoint.url);
            
            console.log(`   ${endpoint.name}: ${response.ok ? '✅' : '❌'} (Status: ${response.status || 'Failed'})`);
        }
        
        // 4. Check Knowledge Sources
        console.log('\n📚 Knowledge Sources:');
        const sources = await page.evaluate(() => {
            const sourceElements = document.querySelectorAll('#knowledge-sources .source-item');
            return Array.from(sourceElements).slice(0, 5).map(el => ({
                name: el.querySelector('.source-name')?.textContent,
                count: el.querySelector('.doc-count')?.textContent,
                lastImport: el.querySelector('.last-import')?.textContent
            }));
        });
        
        if (sources.length > 0) {
            sources.forEach(s => {
                console.log(`   • ${s.name}: ${s.count}`);
            });
        } else {
            console.log('   No sources found');
        }
        
        // 5. Check Recent Knowledge
        console.log('\n📄 Recently Imported (Last 3):');
        const recentDocs = await page.evaluate(() => {
            const docElements = document.querySelectorAll('#recent-knowledge .knowledge-item');
            return Array.from(docElements).slice(0, 3).map(el => ({
                title: el.querySelector('.knowledge-title')?.textContent,
                source: el.querySelector('.knowledge-source')?.textContent,
                time: el.querySelector('.knowledge-time')?.textContent
            }));
        });
        
        if (recentDocs.length > 0) {
            recentDocs.forEach(d => {
                const title = d.title ? d.title.substring(0, 60) + '...' : 'No title';
                console.log(`   • ${title}`);
                console.log(`     Source: ${d.source || 'Unknown'}`);
            });
        } else {
            console.log('   No recent documents');
        }
        
        // 6. Check Recent Broadcasts
        console.log('\n📢 Recent Broadcasts (Last 3):');
        const broadcasts = await page.evaluate(() => {
            const broadcastElements = document.querySelectorAll('#recent-broadcasts .broadcast-item');
            return Array.from(broadcastElements).slice(0, 3).map(el => ({
                text: el.querySelector('.broadcast-text')?.textContent,
                platform: el.querySelector('.broadcast-platform')?.textContent,
                status: el.querySelector('.broadcast-status')?.textContent || 
                        el.querySelector('.broadcast-time')?.textContent
            }));
        });
        
        if (broadcasts.length > 0) {
            broadcasts.forEach(b => {
                const text = b.text ? b.text.substring(0, 60) + '...' : 'No text';
                console.log(`   • ${text}`);
                console.log(`     Platform: ${b.platform || 'Unknown'} | ${b.status || ''}`);
            });
        } else {
            console.log('   No recent broadcasts');
        }
        
        // 7. Check for JavaScript errors
        console.log('\n🔍 Page Health:');
        const jsErrors = [];
        page.on('pageerror', error => jsErrors.push(error.message));
        page.on('console', msg => {
            if (msg.type() === 'error') {
                jsErrors.push(msg.text());
            }
        });
        
        // Reload to catch any errors
        await page.reload();
        await page.waitForTimeout(1000);
        
        if (jsErrors.length > 0) {
            console.log('   ❌ JavaScript errors found:');
            jsErrors.forEach(e => console.log(`      ${e}`));
        } else {
            console.log('   ✅ No JavaScript errors');
        }
        
        // 8. Check button functionality
        console.log('\n🔘 Action Buttons:');
        const buttons = await page.evaluate(() => {
            const buttonInfo = [];
            const actionButtons = document.querySelectorAll('.actions button');
            actionButtons.forEach(btn => {
                buttonInfo.push({
                    text: btn.textContent.trim(),
                    hasOnclick: !!btn.onclick || btn.hasAttribute('onclick'),
                    disabled: btn.disabled
                });
            });
            return buttonInfo;
        });
        
        buttons.forEach(btn => {
            const status = btn.disabled ? '⏸️ Disabled' : (btn.hasOnclick ? '✅ Active' : '❌ No handler');
            console.log(`   ${btn.text}: ${status}`);
        });
        
        // 9. Data accuracy check
        console.log('\n📐 Data Accuracy Checks:');
        
        // Check if stats are numeric
        const numericChecks = await page.evaluate(() => {
            const totalDocs = document.querySelector('.stats-grid .stat-card:nth-child(1) .stat-value')?.textContent;
            const docsWithBroadcasts = document.querySelector('.stats-grid .stat-card:nth-child(2) .stat-value')?.textContent;
            const coverage = document.querySelector('.stats-grid .stat-card:nth-child(3) .stat-value')?.textContent;
            
            return {
                totalDocsNumeric: !isNaN(parseInt(totalDocs?.replace(/,/g, ''))),
                docsWithBroadcastsNumeric: !isNaN(parseInt(docsWithBroadcasts?.replace(/,/g, ''))),
                coverageFormat: /^\d+(\.\d+)?%$/.test(coverage || '')
            };
        });
        
        console.log(`   Total Docs is numeric: ${numericChecks.totalDocsNumeric ? '✅' : '❌'}`);
        console.log(`   Docs with Broadcasts is numeric: ${numericChecks.docsWithBroadcastsNumeric ? '✅' : '❌'}`);
        console.log(`   Coverage has % format: ${numericChecks.coverageFormat ? '✅' : '❌'}`);
        
        // Summary
        console.log('\n================================');
        console.log('✅ Dashboard Test Complete');
        console.log('================================\n');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await browser.close();
    }
}

// Run the test
testDashboard().catch(console.error);