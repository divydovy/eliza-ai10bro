#!/usr/bin/env node

/**
 * Backfill BiologyInvestor broadcasts from existing bycatch documents
 *
 * This script finds documents that:
 * - Are bycatch (8-12% alignment)
 * - Already have broadcasts for other platforms (telegram, bluesky, etc.)
 * - DON'T have biologyinvestor_insight broadcasts yet
 * - Have investor signals ≥30%
 *
 * Then generates biologyinvestor_insight broadcasts for them.
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');

const execPromise = promisify(exec);

const { checkInvestorSignals } = require('./content-routing-signals');

const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
const db = sqlite3(dbPath);

// Load BiologyInvestor prompts
const investorPrompts = JSON.parse(fs.readFileSync('biologyinvestor-prompts.json', 'utf8'));

function stringToUuid(str) {
    const hash = crypto.createHash('md5').update(str).digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function stringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) {
        return 1.0;
    }

    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[str2.length][str1.length];
}

async function generateBroadcastWithOllama(systemPrompt, userPrompt, model = 'qwen2.5:32b') {
    // Use echo with pipe to avoid command-line length limits
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const escapedPrompt = fullPrompt.replace(/'/g, "'\\''"); // Escape single quotes for bash
    const ollamaCmd = `echo '${escapedPrompt}' | ollama run ${model}`;

    const { stdout, stderr } = await execPromise(ollamaCmd, {
        timeout: 300000, // 5 minutes
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        shell: '/bin/bash'
    });

    if (stderr && !stderr.includes('pulling')) {
        console.log(`   ⚠️  Ollama stderr: ${stderr.substring(0, 200)}`);
    }

    // Strip markdown wrapper and preambles
    let cleaned = stdout.trim();
    cleaned = cleaned.replace(/^Here is the .*?:\s*/i, '');
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');

    return JSON.parse(cleaned);
}

async function backfillBiologyInvestor(limit = 50) {
    console.log('💰 Backfilling BiologyInvestor Broadcasts from Existing Bycatch\n');

    // Find bycatch documents that have broadcasts but NOT biologyinvestor_insight
    const bycatch = db.prepare(`
        SELECT DISTINCT m.id, m.alignment_score, m.content
        FROM memories m
        WHERE m.type = 'documents'
        AND m.alignment_score >= 0.08
        AND m.alignment_score < 0.12
        AND json_extract(m.content, '$.text') IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM broadcasts b
            WHERE b.documentId = m.id
            AND b.client IN ('telegram', 'bluesky', 'farcaster', 'wordpress_insight')
        )
        AND NOT EXISTS (
            SELECT 1 FROM broadcasts b
            WHERE b.documentId = m.id
            AND b.client = 'biologyinvestor_insight'
        )
        ORDER BY m.alignment_score DESC
        LIMIT ?
    `).all(limit);

    console.log(`Found ${bycatch.length} bycatch documents with existing broadcasts`);
    console.log(`Checking for investor signals (≥30%)...\n`);

    const candidates = [];
    for (const doc of bycatch) {
        const signals = await checkInvestorSignals(doc);
        if (signals.score >= 0.30) {
            candidates.push({ doc, signals });
        }
    }

    console.log(`Found ${candidates.length} documents with ≥30% investor signals`);
    console.log(`Generating BiologyInvestor broadcasts...\n`);

    // Sort by signal score descending
    candidates.sort((a, b) => b.signals.score - a.signals.score);

    let generated = 0;
    let skipped = 0;
    const generatedInThisRun = []; // Track content generated in this run

    for (const {doc, signals} of candidates) {
        const content = JSON.parse(doc.content);
        const title = content.title || content.text?.substring(0, 80) + '...' || 'Untitled';

        console.log(`\n📝 Checking: ${title}`);
        console.log(`   Alignment: ${(doc.alignment_score * 100).toFixed(1)}%`);
        console.log(`   Investor Signal: ${(signals.score * 100).toFixed(1)}%`);
        console.log(`   Signals: ${signals.reason}`);

        try {
            // Prepare document text for duplicate checking
            const docText = content.text || JSON.stringify(content);
            const contentPreview = docText.substring(0, 300).trim().toLowerCase()
                .replace(/\s+/g, ' ')
                .replace(/[^\w\s]/g, '');

            // Check for duplicates against ALL existing broadcasts (cross-document detection)
            const existingBroadcasts = db.prepare(`
                SELECT id, documentId, client, content
                FROM broadcasts
                WHERE (status = 'pending' OR status = 'sent')
                AND createdAt > ?
                ORDER BY createdAt DESC
                LIMIT 100
            `).all(Date.now() - (7 * 24 * 60 * 60 * 1000)); // Last 7 days

            let isDuplicate = false;

            // Check against existing broadcasts (cross-document detection)
            for (const existing of existingBroadcasts) {
                // Skip if same document (not a cross-document duplicate)
                if (existing.documentId === doc.id) {
                    continue;
                }

                try {
                    const existingParsed = JSON.parse(existing.content);
                    const existingText = existingParsed.text || existingParsed.content || (existingParsed.title + ' ' + existingParsed.excerpt) || '';
                    const existingPreview = existingText.substring(0, 300).trim().toLowerCase()
                        .replace(/\s+/g, ' ')
                        .replace(/[^\w\s]/g, '');

                    const similarity = stringSimilarity(contentPreview, existingPreview);

                    if (similarity > 0.75) {
                        console.log(`   ⏭️  Skipping (story already covered from different source: ${(similarity * 100).toFixed(0)}% similar to ${existing.client} broadcast ${existing.id.slice(0, 8)}... from doc ${existing.documentId.slice(0, 8)}...)`);
                        isDuplicate = true;
                        skipped++;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            // Check against broadcasts generated in this run
            for (const generated of generatedInThisRun) {
                const similarity = stringSimilarity(contentPreview, generated);
                if (similarity > 0.7) {
                    console.log(`   ⏭️  Skipping duplicate (similar to broadcast just generated)`);
                    isDuplicate = true;
                    skipped++;
                    break;
                }
            }

            if (isDuplicate) {
                continue;
            }

            console.log(`   🤖 Generating investor analysis...`);

            // Generate BiologyInvestor daily insight
            const userPrompt = investorPrompts.daily_insight.user_prompt.replace('{document_text}', docText);

            const article = await generateBroadcastWithOllama(
                investorPrompts.daily_insight.system,
                userPrompt,
                'qwen2.5:32b'
            );

            console.log(`   ✅ Generated: "${article.title}"`);
            console.log(`   📏 Content: ${article.content.length} chars`);

            // Track this content to prevent duplicates in this run
            generatedInThisRun.push(contentPreview);

            // Create broadcast entry
            const broadcastId = stringToUuid(`biologyinvestor_${doc.id}_${Date.now()}`);
            const now = Date.now();

            db.prepare(`
                INSERT INTO broadcasts (
                    id, documentId, client, status,
                    alignment_score, createdAt, content
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                broadcastId,
                doc.id,
                'biologyinvestor_insight',
                'pending',
                doc.alignment_score,
                now,
                JSON.stringify(article)
            );

            console.log(`   💾 Saved as pending broadcast: ${broadcastId.slice(0, 8)}...`);

            generated++;

        } catch (error) {
            console.log(`   ❌ Failed: ${error.message}`);
        }
    }

    console.log(`\n✅ Generated ${generated} BiologyInvestor backfill broadcasts`);
    if (skipped > 0) {
        console.log(`⏭️  Skipped ${skipped} duplicates`);
    }

    // Show stats
    const stats = db.prepare(`
        SELECT status, COUNT(*) as count
        FROM broadcasts
        WHERE client = 'biologyinvestor_insight'
        GROUP BY status
    `).all();

    console.log(`\n📊 BiologyInvestor Broadcast Stats (after backfill):`);
    stats.forEach(s => {
        console.log(`   ${s.status}: ${s.count}`);
    });

    console.log(`\n💡 Tip: Run "CLIENT=biologyinvestor_insight node send-pending-to-biologyinvestor.js" to publish`);

    db.close();
}

const limit = parseInt(process.argv[2]) || 50;
backfillBiologyInvestor(limit).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
