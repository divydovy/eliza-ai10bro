#!/usr/bin/env node

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

async function generateInvestorBroadcasts(limit = 5) {
    console.log('🎯 Generating BiologyInvestor Broadcasts\n');

    // Find bycatch documents with investor signals ≥30%
    const bycatch = db.prepare(`
        SELECT m.id, m.alignment_score, m.content
        FROM memories m
        WHERE m.type = 'documents'
        AND m.alignment_score >= 0.08
        AND m.alignment_score < 0.12
        AND json_extract(m.content, '$.text') IS NOT NULL
        ORDER BY m.alignment_score DESC
        LIMIT 100
    `).all();

    console.log(`Analyzing ${bycatch.length} bycatch documents for investor signals...\n`);

    const candidates = [];
    for (const doc of bycatch) {
        const signals = await checkInvestorSignals(doc);
        if (signals.score >= 0.30) { // 30% threshold for BiologyInvestor
            candidates.push({ doc, signals });
        }
    }

    console.log(`Found ${candidates.length} candidates with ≥30% investor signals`);
    console.log(`Generating broadcasts for top ${Math.min(limit, candidates.length)}...\n`);

    // Sort by signal score descending
    candidates.sort((a, b) => b.signals.score - a.signals.score);

    let generated = 0;
    for (const {doc, signals} of candidates.slice(0, limit)) {
        const content = JSON.parse(doc.content);
        const title = content.title || content.text?.substring(0, 80) + '...' || 'Untitled';

        console.log(`\n📝 Generating broadcast for: ${title}`);
        console.log(`   Alignment: ${(doc.alignment_score * 100).toFixed(1)}%`);
        console.log(`   Investor Signal: ${(signals.score * 100).toFixed(1)}%`);
        console.log(`   Signals: ${signals.reason}`);

        try {
            // Prepare document text
            const docText = content.text || JSON.stringify(content);

            // Generate BiologyInvestor daily insight
            console.log(`   🤖 Generating investor analysis...`);
            const userPrompt = investorPrompts.daily_insight.user_prompt.replace('{document_text}', docText);

            const article = await generateBroadcastWithOllama(
                investorPrompts.daily_insight.system,
                userPrompt,
                'qwen2.5:32b'
            );

            console.log(`   ✅ Generated: "${article.title}"`);
            console.log(`   📏 Content: ${article.content.length} chars`);

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

    console.log(`\n✅ Generated ${generated} BiologyInvestor broadcasts`);

    // Show stats
    const stats = db.prepare(`
        SELECT status, COUNT(*) as count
        FROM broadcasts
        WHERE client = 'biologyinvestor_insight'
        GROUP BY status
    `).all();

    console.log(`\n📊 BiologyInvestor Broadcast Stats:`);
    stats.forEach(s => {
        console.log(`   ${s.status}: ${s.count}`);
    });

    db.close();
}

const limit = parseInt(process.argv[2]) || 5;
generateInvestorBroadcasts(limit).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
