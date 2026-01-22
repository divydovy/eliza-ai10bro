#!/usr/bin/env node

/**
 * Entity Trending Detection for AI10BRO
 * Finds entities mentioned frequently in recent high-quality documents
 *
 * Usage: node detect-entity-trends.js [days_back] [min_mentions] [min_alignment]
 * Example: node detect-entity-trends.js 30 3 0.10
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');

const db = sqlite3(path.join(__dirname, 'agent/data/db.sqlite'));

// Parse command line arguments
const DAYS_BACK = parseInt(process.argv[2]) || 30;
const MIN_MENTIONS = parseInt(process.argv[3]) || 3;
const MIN_ALIGNMENT = parseFloat(process.argv[4]) || 0.10;

console.log('🔍 AI10BRO Entity Trend Detection\n');
console.log(`📅 Time Window: Last ${DAYS_BACK} days`);
console.log(`📊 Minimum Mentions: ${MIN_MENTIONS} documents`);
console.log(`⭐ Minimum Alignment: ${(MIN_ALIGNMENT * 100).toFixed(0)}%\n`);

/**
 * Detect trending entities based on mention frequency
 */
function detectEntityTrends() {
    const trends = db.prepare(`
        SELECT
            e.id as entity_id,
            e.name as entity_name,
            e.type as entity_type,
            e.focus_area,
            e.website,
            COUNT(DISTINCT em.document_id) as mention_count,
            AVG(m.alignment_score) as avg_score,
            MIN(m.createdAt) as first_mention,
            MAX(m.createdAt) as latest_mention,
            GROUP_CONCAT(DISTINCT m.id) as document_ids
        FROM entity_mentions em
        JOIN tracked_entities e ON em.entity_id = e.id
        JOIN memories m ON em.document_id = m.id
        WHERE m.createdAt >= strftime('%s', 'now', '-' || ? || ' days') * 1000
          AND m.alignment_score >= ?
          AND m.type = 'documents'
        GROUP BY e.id
        HAVING COUNT(DISTINCT em.document_id) >= ?
        ORDER BY mention_count DESC, avg_score DESC
    `).all(DAYS_BACK, MIN_ALIGNMENT, MIN_MENTIONS);

    return trends;
}

/**
 * Get full document details for a trend
 */
function getTrendDocuments(documentIds) {
    const ids = documentIds.split(',');
    const placeholders = ids.map(() => '?').join(',');

    return db.prepare(`
        SELECT
            id,
            content,
            alignment_score,
            createdAt,
            embedding
        FROM memories
        WHERE id IN (${placeholders})
        ORDER BY alignment_score DESC, createdAt DESC
    `).all(...ids);
}

/**
 * Extract title from document content
 */
function extractTitle(content) {
    try {
        const parsed = JSON.parse(content);

        // Try YAML frontmatter title
        const yamlMatch = parsed.text?.match(/^---\n([\s\S]*?)\n---/);
        if (yamlMatch) {
            const frontmatter = yamlMatch[1];
            const titleMatch = frontmatter.match(/title:\s*["']?(.+?)["']?\n/);
            if (titleMatch) {
                return titleMatch[1].trim();
            }
        }

        // Try direct title field
        if (parsed.title) return parsed.title;

        // Try first line of text
        if (parsed.text) {
            const firstLine = parsed.text.split('\n')[0].replace(/^#+\s*/, '');
            return firstLine.substring(0, 100);
        }

        return 'Untitled';
    } catch (e) {
        return 'Untitled';
    }
}

/**
 * Extract summary from document content
 */
function extractSummary(content, maxLength = 300) {
    try {
        const parsed = JSON.parse(content);
        const text = parsed.text || JSON.stringify(parsed);

        // Remove YAML frontmatter
        const cleaned = text.replace(/^---\n[\s\S]*?\n---\n/, '');

        // Get first paragraph or maxLength chars
        const firstParagraph = cleaned.split('\n\n')[0];
        return firstParagraph.substring(0, maxLength) + (firstParagraph.length > maxLength ? '...' : '');
    } catch (e) {
        return '';
    }
}

/**
 * Analyze trend significance
 */
function analyzeTrendSignificance(trend, documents) {
    const daysSinceFirst = Math.floor(
        (new Date() - new Date(trend.first_mention)) / (1000 * 60 * 60 * 24)
    );
    const daysSinceLatest = Math.floor(
        (new Date() - new Date(trend.latest_mention)) / (1000 * 60 * 60 * 24)
    );

    // Calculate velocity (mentions per week)
    const velocity = (trend.mention_count / daysSinceFirst) * 7;

    // Recency score (higher if mentions are recent)
    const recencyScore = daysSinceLatest === 0 ? 1.0 : Math.max(0, 1 - (daysSinceLatest / 30));

    // Momentum (are mentions accelerating?)
    const halfwayPoint = new Date(new Date(trend.first_mention).getTime() +
        (new Date(trend.latest_mention) - new Date(trend.first_mention)) / 2);
    const recentDocs = documents.filter(d => new Date(d.createdAt) > halfwayPoint).length;
    const momentum = recentDocs / (documents.length / 2);

    return {
        velocity: velocity.toFixed(2),
        recencyScore: recencyScore.toFixed(2),
        momentum: momentum.toFixed(2),
        isAccelerating: momentum > 1.2,
        isRecent: daysSinceLatest <= 7
    };
}

/**
 * Generate trend report
 */
function generateTrendReport(trend, documents, analysis) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n🎯 TREND: ${trend.entity_name}`);
    console.log(`   Type: ${trend.entity_type}`);
    console.log(`   Focus: ${trend.focus_area || 'General'}`);
    if (trend.website) console.log(`   Website: ${trend.website}`);

    console.log(`\n📈 METRICS:`);
    console.log(`   Total Mentions: ${trend.mention_count} documents`);
    console.log(`   Avg Quality: ${(trend.avg_score * 100).toFixed(1)}%`);
    console.log(`   Velocity: ${analysis.velocity} mentions/week`);
    console.log(`   Recency: ${(analysis.recencyScore * 100).toFixed(0)}%`);
    console.log(`   Momentum: ${analysis.momentum}x ${analysis.isAccelerating ? '📈 ACCELERATING' : ''}`);

    console.log(`\n📅 TIMELINE:`);
    console.log(`   First Mention: ${new Date(trend.first_mention).toLocaleDateString()}`);
    console.log(`   Latest Mention: ${new Date(trend.latest_mention).toLocaleDateString()}`);

    console.log(`\n📄 SUPPORTING DOCUMENTS (${documents.length}):\n`);
    documents.forEach((doc, i) => {
        const title = extractTitle(doc.content);
        const score = (doc.alignment_score * 100).toFixed(1);
        const date = new Date(doc.createdAt).toLocaleDateString();
        console.log(`   ${i + 1}. [${score}%] ${title}`);
        console.log(`      Date: ${date} | ID: ${doc.id.substring(0, 8)}`);
    });

    console.log(`\n💡 SYNTHESIS READINESS:`);
    if (documents.length >= 5) {
        console.log(`   ✅ READY - Strong trend with ${documents.length} supporting documents`);
    } else if (documents.length >= 3 && analysis.isAccelerating) {
        console.log(`   ⚠️  EMERGING - Accelerating trend with ${documents.length} documents`);
    } else {
        console.log(`   ⏳ MONITOR - Need more data points (${documents.length} docs)`);
    }

    if (analysis.isRecent) {
        console.log(`   🔥 HOT - Mentioned within last 7 days`);
    }

    console.log();
}

/**
 * Save trend for synthesis queue
 */
function saveTrendForSynthesis(trend, documents, analysis) {
    const trendData = {
        entity_id: trend.entity_id,
        entity_name: trend.entity_name,
        entity_type: trend.entity_type,
        focus_area: trend.focus_area,
        mention_count: trend.mention_count,
        avg_score: trend.avg_score,
        velocity: parseFloat(analysis.velocity),
        momentum: parseFloat(analysis.momentum),
        is_accelerating: analysis.isAccelerating,
        document_ids: trend.document_ids,
        document_count: documents.length,
        detected_at: new Date().toISOString()
    };

    // Save to JSON file for manual review
    const fs = require('fs');
    const trendsDir = path.join(__dirname, 'trends');
    if (!fs.existsSync(trendsDir)) {
        fs.mkdirSync(trendsDir);
    }

    const filename = `trend-${trend.entity_name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`;
    fs.writeFileSync(
        path.join(trendsDir, filename),
        JSON.stringify(trendData, null, 2)
    );

    console.log(`   💾 Saved: trends/${filename}`);

    return trendData;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

console.log('🔄 Scanning database for trends...\n');

const trends = detectEntityTrends();

if (trends.length === 0) {
    console.log('❌ No trends found with current criteria.');
    console.log('\nTry adjusting parameters:');
    console.log('  - Increase time window: node detect-entity-trends.js 60 3');
    console.log('  - Lower mention threshold: node detect-entity-trends.js 30 2');
    console.log('  - Check entity mentions: sqlite3 agent/data/db.sqlite "SELECT COUNT(*) FROM entity_mentions"\n');
    db.close();
    process.exit(0);
}

console.log(`✅ Found ${trends.length} trending entities\n`);

const synthesisReady = [];
const emerging = [];
const monitoring = [];

// Analyze each trend
trends.forEach((trend, index) => {
    const documents = getTrendDocuments(trend.document_ids);
    const analysis = analyzeTrendSignificance(trend, documents);

    generateTrendReport(trend, documents, analysis);

    // Categorize by readiness
    if (documents.length >= 5 || (documents.length >= 3 && analysis.isAccelerating)) {
        const savedTrend = saveTrendForSynthesis(trend, documents, analysis);
        if (documents.length >= 5) {
            synthesisReady.push(savedTrend);
        } else {
            emerging.push(savedTrend);
        }
    } else {
        monitoring.push(trend.entity_name);
    }
});

// Summary
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n📊 TREND DETECTION SUMMARY\n');
console.log(`✅ Ready for Synthesis: ${synthesisReady.length} trends`);
if (synthesisReady.length > 0) {
    synthesisReady.forEach(t => console.log(`   - ${t.entity_name} (${t.document_count} docs)`));
}

console.log(`\n⚠️  Emerging Trends: ${emerging.length}`);
if (emerging.length > 0) {
    emerging.forEach(t => console.log(`   - ${t.entity_name} (${t.document_count} docs, accelerating)`));
}

console.log(`\n⏳ Monitoring: ${monitoring.length}`);
if (monitoring.length > 0 && monitoring.length <= 5) {
    monitoring.forEach(name => console.log(`   - ${name}`));
}

console.log('\n🎯 NEXT STEPS:');
if (synthesisReady.length > 0) {
    console.log(`   1. Review saved trends in ./trends/ directory`);
    console.log(`   2. Run synthesis: node generate-trend-analysis.js trends/[filename].json`);
    console.log(`   3. Generate ${Math.min(synthesisReady.length, 3)} Analysis pieces this week`);
} else {
    console.log(`   1. Continue monitoring (run again in 7 days)`);
    console.log(`   2. Consider lowering thresholds if no trends by week 2`);
}

console.log();

db.close();
