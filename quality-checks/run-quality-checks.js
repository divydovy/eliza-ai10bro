#!/usr/bin/env node

/**
 * Automated Quality Checks for AI10BRO Broadcast System
 *
 * Runs daily to verify:
 * - Alignment scoring accuracy
 * - Broadcast quality (URLs, images, content)
 * - System health
 * - Data quality
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database('./agent/data/db.sqlite');

// ============================================================================
// 1. ALIGNMENT SCORING CHECKS
// ============================================================================

function checkAlignmentScoring() {
    console.log('\n📊 Checking Alignment Scoring...\n');

    const issues = [];

    // Get score distribution
    const distribution = db.prepare(`
        SELECT
            COUNT(*) as total,
            COUNT(CASE WHEN alignment_score < 0.20 THEN 1 END) as low_score,
            COUNT(CASE WHEN alignment_score >= 0.20 AND alignment_score < 0.50 THEN 1 END) as medium_score,
            COUNT(CASE WHEN alignment_score >= 0.50 THEN 1 END) as high_score,
            AVG(alignment_score) as avg_score
        FROM memories
        WHERE type = 'documents' AND alignment_score IS NOT NULL
    `).get();

    console.log(`Total scored documents: ${distribution.total}`);
    console.log(`Low scores (0-20%): ${distribution.low_score} (${(distribution.low_score / distribution.total * 100).toFixed(1)}%)`);
    console.log(`Medium scores (20-50%): ${distribution.medium_score} (${(distribution.medium_score / distribution.total * 100).toFixed(1)}%)`);
    console.log(`High scores (50-100%): ${distribution.high_score} (${(distribution.high_score / distribution.total * 100).toFixed(1)}%)`);
    console.log(`Average score: ${(distribution.avg_score * 100).toFixed(1)}%`);

    // Alert if distribution is unusual
    const lowPct = distribution.low_score / distribution.total;
    const highPct = distribution.high_score / distribution.total;

    if (lowPct < 0.50) {
        issues.push({
            type: 'scoring_drift',
            severity: 'high',
            message: `Only ${(lowPct * 100).toFixed(0)}% of documents scored low (expected 70-80%). LLM may be scoring too generously.`,
            recommendation: 'Review LLM prompt and sample high-scoring documents'
        });
    }

    if (highPct > 0.20) {
        issues.push({
            type: 'scoring_drift',
            severity: 'medium',
            message: `${(highPct * 100).toFixed(0)}% of documents scored high (expected 5-10%). Check if off-topic content is scoring high.`,
            recommendation: 'Sample high-scoring documents to verify they are commercial biotech'
        });
    }

    // Sample highest scoring documents
    console.log('\n🔝 Highest Scoring Documents (for manual review):');
    const topDocs = db.prepare(`
        SELECT
            id,
            ROUND(alignment_score * 100, 0) as score,
            substr(json_extract(content, '$.title'), 1, 80) as title
        FROM memories
        WHERE type = 'documents' AND alignment_score IS NOT NULL
        ORDER BY alignment_score DESC
        LIMIT 5
    `).all();

    topDocs.forEach((doc, i) => {
        console.log(`  ${i + 1}. [${doc.score}%] ${doc.title || 'No title'}`);
    });

    // Sample lowest scoring documents
    console.log('\n🔽 Lowest Scoring Documents (for manual review):');
    const bottomDocs = db.prepare(`
        SELECT
            id,
            ROUND(alignment_score * 100, 0) as score,
            substr(json_extract(content, '$.title'), 1, 80) as title
        FROM memories
        WHERE type = 'documents' AND alignment_score IS NOT NULL
        ORDER BY alignment_score ASC
        LIMIT 5
    `).all();

    bottomDocs.forEach((doc, i) => {
        console.log(`  ${i + 1}. [${doc.score}%] ${doc.title || 'No title'}`);
    });

    return {
        name: 'Alignment Scoring',
        status: issues.length === 0 ? 'pass' : 'warning',
        issues,
        metrics: distribution,
        samples: { top: topDocs, bottom: bottomDocs }
    };
}

// ============================================================================
// 2. BROADCAST URL CHECKS
// ============================================================================

function checkBroadcastURLs() {
    console.log('\n🔗 Checking Broadcast URLs...\n');

    const issues = [];
    let checkedCount = 0;
    let issueCount = 0;

    // Check recent broadcasts (last 7 days)
    const broadcasts = db.prepare(`
        SELECT id, documentId, client, content
        FROM broadcasts
        WHERE status IN ('pending', 'sent')
        AND createdAt > ?
        LIMIT 500
    `).all(Date.now() - 7 * 24 * 60 * 60 * 1000);

    console.log(`Checking ${broadcasts.length} recent broadcasts...`);

    const urlIssues = {
        incomplete_youtube: [],
        generic_domain: [],
        localhost: [],
        missing_source: []
    };

    broadcasts.forEach(broadcast => {
        checkedCount++;

        try {
            const content = JSON.parse(broadcast.content);
            const text = content.text || content.content || '';

            // Check for incomplete YouTube URLs
            if (text.includes('youtube.com/watch') && !text.includes('youtube.com/watch?v=')) {
                issueCount++;
                if (urlIssues.incomplete_youtube.length < 5) {
                    urlIssues.incomplete_youtube.push({
                        broadcast_id: broadcast.id,
                        document_id: broadcast.documentId,
                        client: broadcast.client
                    });
                }
            }

            // Check for generic domains
            const genericDomains = ['youtube.com\n', 'github.com\n', 'twitter.com\n'];
            genericDomains.forEach(domain => {
                if (text.includes(domain)) {
                    issueCount++;
                    if (urlIssues.generic_domain.length < 5) {
                        urlIssues.generic_domain.push({
                            broadcast_id: broadcast.id,
                            domain: domain.trim()
                        });
                    }
                }
            });

            // Check for localhost URLs
            if (text.includes('localhost')) {
                issueCount++;
                if (urlIssues.localhost.length < 5) {
                    urlIssues.localhost.push({
                        broadcast_id: broadcast.id
                    });
                }
            }

            // Check for missing source link
            if (!text.includes('🔗 Source:') && !text.includes('http')) {
                issueCount++;
                if (urlIssues.missing_source.length < 5) {
                    urlIssues.missing_source.push({
                        broadcast_id: broadcast.id,
                        client: broadcast.client
                    });
                }
            }

        } catch (e) {
            // Malformed JSON
            issueCount++;
            issues.push({
                type: 'malformed_json',
                severity: 'high',
                broadcast_id: broadcast.id,
                message: `Broadcast has malformed JSON content: ${e.message}`
            });
        }
    });

    // Generate issue reports
    Object.entries(urlIssues).forEach(([type, samples]) => {
        if (samples.length > 0) {
            issues.push({
                type: `url_${type}`,
                severity: type === 'localhost' ? 'high' : 'medium',
                count: samples.length,
                message: `Found ${samples.length}+ broadcasts with ${type.replace('_', ' ')}`,
                samples: samples.slice(0, 3),
                recommendation: getURLFixRecommendation(type)
            });
        }
    });

    const passRate = ((checkedCount - issueCount) / checkedCount * 100).toFixed(1);
    console.log(`✅ URL quality: ${passRate}% (${checkedCount - issueCount}/${checkedCount} broadcasts OK)`);

    if (issues.length > 0) {
        console.log(`⚠️  Found ${issues.length} types of URL issues`);
    }

    return {
        name: 'Broadcast URLs',
        status: issues.length === 0 ? 'pass' : 'fail',
        issues,
        metrics: {
            checked: checkedCount,
            issues: issueCount,
            pass_rate: parseFloat(passRate)
        }
    };
}

function getURLFixRecommendation(type) {
    const recommendations = {
        incomplete_youtube: 'Fix URL extraction in import-github-scrapers.js - ensure video ID is captured',
        generic_domain: 'Fix import script to extract full URL path, not just domain',
        localhost: 'Critical: Localhost URLs should never appear in production broadcasts',
        missing_source: 'Ensure broadcast generation includes source URL in all platforms'
    };
    return recommendations[type] || 'Review import and broadcast generation scripts';
}

// ============================================================================
// 3. IMAGE CHECKS
// ============================================================================

function checkBroadcastImages() {
    console.log('\n🎨 Checking Broadcast Images...\n');

    const issues = [];

    // Check recent broadcasts for image presence
    const imageStats = db.prepare(`
        SELECT
            client,
            COUNT(*) as total,
            COUNT(image_url) as with_image,
            COUNT(*) - COUNT(image_url) as without_image
        FROM broadcasts
        WHERE status IN ('pending', 'sent')
        AND createdAt > ?
        GROUP BY client
    `).all(Date.now() - 7 * 24 * 60 * 60 * 1000);

    console.log('Image coverage by platform:');
    imageStats.forEach(stat => {
        const coverage = (stat.with_image / stat.total * 100).toFixed(1);
        console.log(`  ${stat.client}: ${coverage}% (${stat.with_image}/${stat.total})`);

        if (stat.without_image > stat.total * 0.5) {
            issues.push({
                type: 'low_image_coverage',
                severity: 'medium',
                platform: stat.client,
                message: `Only ${coverage}% of ${stat.client} broadcasts have images`,
                recommendation: 'Ensure ENABLE_IMAGE_GENERATION=true and Gemini API key is set'
            });
        }
    });

    // Check for invalid image paths (file doesn't exist)
    const localImages = db.prepare(`
        SELECT id, image_url
        FROM broadcasts
        WHERE image_url IS NOT NULL
        AND image_url LIKE '/Users/%'
        AND createdAt > ?
        LIMIT 100
    `).all(Date.now() - 7 * 24 * 60 * 60 * 1000);

    let missingFiles = 0;
    localImages.forEach(broadcast => {
        if (!fs.existsSync(broadcast.image_url)) {
            missingFiles++;
        }
    });

    if (missingFiles > 0) {
        issues.push({
            type: 'missing_image_files',
            severity: 'medium',
            count: missingFiles,
            message: `${missingFiles} broadcasts reference image files that don't exist`,
            recommendation: 'Check image generation process and file cleanup scripts'
        });
    }

    return {
        name: 'Broadcast Images',
        status: issues.length === 0 ? 'pass' : 'warning',
        issues,
        metrics: imageStats
    };
}

// ============================================================================
// 4. CONTENT QUALITY CHECKS
// ============================================================================

function checkContentQuality() {
    console.log('\n📝 Checking Content Quality...\n');

    const issues = [];

    // Get recent broadcasts
    const broadcasts = db.prepare(`
        SELECT id, documentId, client, content
        FROM broadcasts
        WHERE status IN ('pending', 'sent')
        AND createdAt > ?
        LIMIT 200
    `).all(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const contentIssues = {
        too_short: [],
        too_long: [],
        no_source: [],
        html_entities: []
    };

    const limits = {
        telegram: { min: 100, max: 4096 },
        bluesky: { min: 50, max: 300 },
        farcaster: { min: 50, max: 320 }
    };

    broadcasts.forEach(broadcast => {
        try {
            const content = JSON.parse(broadcast.content);
            const text = content.text || content.content || '';
            const limit = limits[broadcast.client];

            if (limit) {
                if (text.length < limit.min && contentIssues.too_short.length < 3) {
                    contentIssues.too_short.push({
                        broadcast_id: broadcast.id,
                        length: text.length,
                        platform: broadcast.client
                    });
                }

                if (text.length > limit.max && contentIssues.too_long.length < 3) {
                    contentIssues.too_long.push({
                        broadcast_id: broadcast.id,
                        length: text.length,
                        platform: broadcast.client
                    });
                }
            }

            // Check for HTML entities
            if ((text.includes('&amp;') || text.includes('&lt;')) && contentIssues.html_entities.length < 3) {
                contentIssues.html_entities.push({
                    broadcast_id: broadcast.id
                });
            }

        } catch (e) {
            // Already caught in URL check
        }
    });

    // Generate issues
    Object.entries(contentIssues).forEach(([type, samples]) => {
        if (samples.length > 0) {
            issues.push({
                type: `content_${type}`,
                severity: 'low',
                count: samples.length,
                samples: samples.slice(0, 2),
                recommendation: getContentFixRecommendation(type)
            });
        }
    });

    console.log(`Checked ${broadcasts.length} recent broadcasts`);
    if (issues.length === 0) {
        console.log('✅ No content quality issues found');
    } else {
        console.log(`⚠️  Found ${issues.length} types of content issues`);
    }

    return {
        name: 'Content Quality',
        status: issues.length === 0 ? 'pass' : 'warning',
        issues
    };
}

function getContentFixRecommendation(type) {
    const recommendations = {
        too_short: 'Review broadcast generation - content may be truncated',
        too_long: 'Add platform-specific length limits to broadcast generation',
        html_entities: 'Decode HTML entities in content before generating broadcasts',
        no_source: 'Ensure source URL is included in all broadcast generation'
    };
    return recommendations[type] || 'Review broadcast generation logic';
}

// ============================================================================
// 5. SYSTEM HEALTH CHECKS
// ============================================================================

function checkSystemHealth() {
    console.log('\n💚 Checking System Health...\n');

    const issues = [];

    // Check: Documents scored in last 24 hours
    const recentScores = db.prepare(`
        SELECT COUNT(*) as count
        FROM memories
        WHERE type = 'documents'
        AND alignment_score IS NOT NULL
        AND createdAt > ?
    `).get(Date.now() - 24 * 60 * 60 * 1000);

    console.log(`Documents scored (last 24h): ${recentScores.count}`);

    // Check: Broadcasts created in last 24 hours
    const recentBroadcasts = db.prepare(`
        SELECT COUNT(*) as count
        FROM broadcasts
        WHERE createdAt > ?
    `).get(Date.now() - 24 * 60 * 60 * 1000);

    console.log(`Broadcasts created (last 24h): ${recentBroadcasts.count}`);

    if (recentBroadcasts.count === 0) {
        issues.push({
            type: 'no_broadcast_creation',
            severity: 'high',
            message: 'No broadcasts created in last 24 hours',
            recommendation: 'Check broadcast creation cron job and logs'
        });
    }

    // Check: Broadcasts sent in last 24 hours
    const sentBroadcasts = db.prepare(`
        SELECT COUNT(*) as count
        FROM broadcasts
        WHERE status = 'sent'
        AND createdAt > ?
    `).get(Date.now() - 24 * 60 * 60 * 1000);

    console.log(`Broadcasts sent (last 24h): ${sentBroadcasts.count}`);

    if (sentBroadcasts.count === 0 && recentBroadcasts.count > 0) {
        issues.push({
            type: 'no_broadcasts_sent',
            severity: 'high',
            message: 'Broadcasts created but none sent in last 24 hours',
            recommendation: 'Check send scripts (Telegram/Bluesky) and cron jobs'
        });
    }

    // Check: Documents stuck without scores
    const unscored = db.prepare(`
        SELECT COUNT(*) as count
        FROM memories
        WHERE type = 'documents'
        AND alignment_score IS NULL
        AND createdAt < ?
    `).get(Date.now() - 48 * 60 * 60 * 1000);

    console.log(`Documents unscored >48h: ${unscored.count}`);

    if (unscored.count > 100) {
        issues.push({
            type: 'scoring_backlog',
            severity: 'medium',
            count: unscored.count,
            message: `${unscored.count} documents older than 48h still unscored`,
            recommendation: 'Check LLM scoring process and consider increasing workers'
        });
    }

    return {
        name: 'System Health',
        status: issues.length === 0 ? 'pass' : issues.some(i => i.severity === 'high') ? 'fail' : 'warning',
        issues,
        metrics: {
            recent_scores: recentScores.count,
            recent_broadcasts: recentBroadcasts.count,
            sent_broadcasts: sentBroadcasts.count,
            unscored_old: unscored.count
        }
    };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log('🔍 AI10BRO Quality Checks');
    console.log('========================\n');
    console.log(`Started: ${new Date().toISOString()}\n`);

    const results = {
        timestamp: new Date().toISOString(),
        checks: []
    };

    // Run all checks
    results.checks.push(checkAlignmentScoring());
    results.checks.push(checkBroadcastURLs());
    results.checks.push(checkBroadcastImages());
    results.checks.push(checkContentQuality());
    results.checks.push(checkSystemHealth());

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    results.checks.forEach(check => {
        const icon = check.status === 'pass' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
        console.log(`${icon} ${check.name}: ${check.status.toUpperCase()} (${check.issues.length} issues)`);
    });

    const totalIssues = results.checks.reduce((sum, check) => sum + check.issues.length, 0);
    const criticalIssues = results.checks.reduce((sum, check) =>
        sum + check.issues.filter(i => i.severity === 'high').length, 0
    );

    console.log(`\n📋 Total Issues: ${totalIssues}`);
    console.log(`🚨 Critical Issues: ${criticalIssues}`);

    // Save detailed report
    const date = new Date().toISOString().split('T')[0];
    const reportPath = path.join('logs/quality', `quality-report-${date}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Full report saved: ${reportPath}`);

    // Exit with error code if critical issues
    if (criticalIssues > 0) {
        console.log('\n❌ CRITICAL ISSUES DETECTED - Manual review required');
        process.exit(1);
    }

    console.log('\n✅ Quality check complete\n');
    db.close();
}

main().catch(error => {
    console.error('❌ Error running quality checks:', error);
    db.close();
    process.exit(1);
});
