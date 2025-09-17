const { chromium } = require('@playwright/test');

async function testDashboard() {
  console.log('🎭 Starting Playwright Dashboard Verification\n');

  const browser = await chromium.launch({
    headless: true // Run in background
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  const results = {
    passed: [],
    failed: []
  };

  try {
    // Navigate to dashboard
    await page.goto('http://localhost:3001/broadcast-dashboard.html', {
      waitUntil: 'networkidle'
    });
    console.log('✓ Dashboard loaded\n');

    // Wait for initial data load
    await page.waitForTimeout(2000);

    // Test 1: Check for Source Quality Metrics section
    const sourceMetricsVisible = await page.isVisible('#source-metrics-section');
    if (sourceMetricsVisible) {
      results.passed.push('Source Quality Metrics section is visible');

      // Check if metrics are loaded
      const metricsGrid = await page.$('#metrics-grid');
      const metricsContent = await metricsGrid.textContent();
      if (!metricsContent.includes('Loading')) {
        results.passed.push('Source metrics data loaded');
      } else {
        results.failed.push('Source metrics still showing loading state');
      }
    } else {
      results.failed.push('Source Quality Metrics section NOT visible');
    }

    // Test 2: Check for Recently Imported Knowledge section
    const knowledgeSection = await page.$('.recent-knowledge');
    if (knowledgeSection) {
      results.passed.push('Recently Imported Knowledge section exists');

      // Check knowledge count badge
      const knowledgeCount = await page.$('#knowledge-count');
      if (knowledgeCount) {
        const count = await knowledgeCount.textContent();
        results.passed.push(`Knowledge count badge shows: ${count}`);
      } else {
        results.failed.push('Knowledge count badge missing');
      }

      // Check for knowledge items
      const knowledgeItems = await page.$$('.knowledge-item');
      results.passed.push(`Found ${knowledgeItems.length} knowledge items`);
    } else {
      results.failed.push('Recently Imported Knowledge section NOT found');
    }

    // Test 3: Check Platform Status
    const platformStats = await page.$('#platform-stats');
    if (platformStats) {
      const statsText = await platformStats.textContent();
      if (statsText && statsText !== '-') {
        results.passed.push(`Platform stats showing: ${statsText}`);
      } else {
        results.failed.push('Platform stats not populated');
      }

      // Check platform details
      const platformDetail = await page.$('#platform-detail');
      const detailText = await platformDetail.textContent();
      if (detailText && !detailText.includes('Loading')) {
        results.passed.push('Platform details loaded');
      } else {
        results.failed.push('Platform details still loading');
      }
    } else {
      results.failed.push('Platform Status element not found');
    }

    // Test 4: Check for Automation Schedule
    const automationSchedule = await page.locator('text=Automation Schedule').count();
    if (automationSchedule > 0) {
      results.passed.push('Automation Schedule section found');

      // Check for schedule details
      const scheduleText = await page.locator('text=Send Broadcasts').count();
      if (scheduleText > 0) {
        results.passed.push('Schedule details are visible');
      }
    } else {
      results.failed.push('Automation Schedule section NOT found');
    }

    // Test 5: Check all main stats are populated
    const statsToCheck = [
      { id: 'total-docs', name: 'Total Documents' },
      { id: 'total-broadcasts', name: 'Total Broadcasts' },
      { id: 'docs-without-broadcasts', name: 'Documents Without Broadcasts' },
      { id: 'coverage-percent', name: 'Coverage Percentage' }
    ];

    for (const stat of statsToCheck) {
      const element = await page.$(`#${stat.id}`);
      if (element) {
        const value = await element.textContent();
        if (value && value !== '-') {
          results.passed.push(`${stat.name}: ${value}`);
        } else {
          results.failed.push(`${stat.name} not populated`);
        }
      } else {
        results.failed.push(`${stat.name} element not found`);
      }
    }

    // Test 6: Check action buttons exist
    const buttons = [
      { text: 'Sync GitHub', id: 'sync-github-btn' },
      { text: 'Import Obsidian', id: 'import-obsidian-btn' },
      { text: 'Create Broadcasts', id: 'create-broadcasts-btn' },
      { text: 'Send to Telegram', id: 'send-telegram-btn' },
      { text: 'Send to X', id: 'send-twitter-btn' }
    ];

    for (const button of buttons) {
      const btn = await page.$(`#${button.id}`);
      if (btn) {
        results.passed.push(`Button '${button.text}' exists`);
      } else {
        results.failed.push(`Button '${button.text}' NOT found`);
      }
    }

    // Test 7: Check API connectivity
    const healthCheck = await page.evaluate(async () => {
      try {
        const response = await fetch('http://localhost:3001/health');
        return response.ok;
      } catch (e) {
        return false;
      }
    });

    if (healthCheck) {
      results.passed.push('API health check successful');
    } else {
      results.failed.push('API health check failed');
    }

    // Take screenshot for verification
    await page.screenshot({
      path: 'dashboard-test-result.png',
      fullPage: true
    });
    results.passed.push('Screenshot saved as dashboard-test-result.png');

  } catch (error) {
    results.failed.push(`Test error: ${error.message}`);
  } finally {
    await browser.close();

    // Print results
    console.log('📊 TEST RESULTS:\n');
    console.log(`✅ PASSED (${results.passed.length}):`);
    results.passed.forEach(test => console.log(`   ✓ ${test}`));

    if (results.failed.length > 0) {
      console.log(`\n❌ FAILED (${results.failed.length}):`);
      results.failed.forEach(test => console.log(`   ✗ ${test}`));
    }

    console.log(`\n📈 Score: ${results.passed.length}/${results.passed.length + results.failed.length} tests passed`);

    // Exit with error code if any tests failed
    if (results.failed.length > 0) {
      process.exit(1);
    }
  }
}

testDashboard().catch(console.error);