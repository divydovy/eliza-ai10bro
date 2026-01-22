#!/usr/bin/env node

/**
 * Trend Analysis Generator for AI10BRO
 * Generates synthetic Analysis pieces from multi-document trends
 *
 * Usage: node generate-trend-analysis.js trends/trend-extracellular-*.json
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');

const execAsync = promisify(exec);
const db = sqlite3(path.join(__dirname, 'agent/data/db.sqlite'));

const OLLAMA_MODEL = 'qwen2.5:14b';
const OLLAMA_TIMEOUT = 600000; // 10 minutes for long synthesis

console.log('📊 AI10BRO Trend Analysis Generator\n');

// Parse command line arguments
const trendFile = process.argv[2];

if (!trendFile) {
    console.error('❌ Usage: node generate-trend-analysis.js trends/trend-[name]-[timestamp].json');
    process.exit(1);
}

if (!fs.existsSync(trendFile)) {
    console.error(`❌ Trend file not found: ${trendFile}`);
    process.exit(1);
}

function generateId() {
    return crypto.randomBytes(16).toString('hex');
}

function extractTitle(content) {
    try {
        const parsed = JSON.parse(content);
        if (parsed.title) return parsed.title;
        if (parsed.text) {
            const firstLine = parsed.text.split('\n')[0].replace(/^#+\s*/, '');
            return firstLine.substring(0, 150);
        }
        return 'Untitled';
    } catch (e) {
        return 'Untitled';
    }
}

function extractText(content) {
    try {
        const parsed = JSON.parse(content);
        return parsed.text || JSON.stringify(parsed);
    } catch (e) {
        return content;
    }
}

async function generateAnalysisWithOllama(entity, documents) {
    console.log(`🤖 Generating analysis with ${OLLAMA_MODEL}...`);
    console.log(`   Entity: ${entity.entity_name} (${entity.entity_type})`);
    console.log(`   Documents: ${documents.length}`);
    console.log(`   Avg alignment: ${(entity.avg_score * 100).toFixed(1)}%\n`);

    // Build document summaries for context
    const docSummaries = documents.map((doc, i) => {
        const title = extractTitle(doc.content);
        const text = extractText(doc.content);
        const preview = text.substring(0, 1000); // First 1000 chars per doc
        return `DOCUMENT ${i + 1}:
Title: ${title}
Alignment Score: ${(doc.alignment_score * 100).toFixed(1)}%
Preview: ${preview}...
`;
    }).join('\n---\n\n');

    const prompt = `You are writing a Deep Dive Analysis for AI10BRO, a bio-innovation news platform. This Analysis synthesizes insights from ${documents.length} related research documents about ${entity.entity_name}.

ENTITY CONTEXT:
Name: ${entity.entity_name}
Type: ${entity.entity_type}
Focus Area: ${entity.focus_area || 'Bio-innovation'}
${entity.website ? `Website: ${entity.website}` : ''}

TREND METRICS:
- Documents mentioning entity: ${entity.mention_count}
- Average quality score: ${(entity.avg_score * 100).toFixed(1)}%
- Velocity: ${entity.velocity} mentions/week
- Momentum: ${entity.momentum}x ${entity.is_accelerating ? '(ACCELERATING)' : ''}

SUPPORTING DOCUMENTS (${documents.length} sources):

${docSummaries}

TASK: Create a comprehensive 2000-3000 word Analysis that synthesizes insights ACROSS these documents to reveal the emerging trend around ${entity.entity_name}.

CRITICAL: This is NOT a deep dive on a single paper. Identify the PATTERN connecting these documents. What larger trend do they reveal? How do the pieces fit together?

ANALYSIS STRUCTURE:

1. EXECUTIVE SUMMARY (200-300 words)
   - The emerging trend you've identified across all documents
   - Key pattern or insight that connects them
   - Why this trend matters (commercial, scientific, societal)
   - What makes this accelerating now

2. THE TREND EMERGES (400-500 words)
   - Synthesize what these ${documents.length} documents collectively show
   - Identify the common thread or pattern
   - Map the progression (early research → applications → commercial traction)
   - Key players and institutions driving this trend
   - Timeline and momentum indicators

3. CONVERGING INNOVATIONS (500-700 words)
   - Break down the 2-3 major themes across documents
   - For each theme:
     * What technical breakthroughs enable it
     * Which documents exemplify it
     * How innovations build on each other
   - Unexpected connections between approaches
   - Complementary technologies working together

4. COMMERCIAL IMPLICATIONS (400-500 words)
   - Market opportunities this trend unlocks
   - Industries positioned to benefit/disrupt
   - Business models enabled
   - Investment and funding signals
   - Key companies to watch (beyond the entity itself)
   - Timeline to commercial impact

5. WHAT'S DRIVING ACCELERATION (300-400 words)
   - Why is activity clustering NOW?
   - Technology convergence factors
   - Economic drivers (cost curves, market pull)
   - Regulatory or policy tailwinds
   - Funding environment
   - What recent breakthroughs made this possible

6. FUTURE TRAJECTORY (300-400 words)
   - Near-term (6-12 months): What to watch for
   - Medium-term (1-3 years): Key milestones
   - Long-term (3-5 years): Transformative potential
   - Risks and obstacles
   - Adjacent trends that could amplify impact

7. CONCLUSION (150-200 words)
   - Synthesis of the meta-insight
   - Why this trend is significant in the bigger picture
   - What investors, researchers, and companies should track

WRITING GUIDELINES:
- Synthesize ACROSS documents, not summarize each one
- Identify patterns, not just list findings
- Be specific: cite which documents show what patterns
- Use data from documents to support trend narrative
- Acknowledge when documents show different approaches to same problem
- Build logical argument for why this trend is real and significant

AVOID:
- Treating this as a literature review
- Summarizing each paper sequentially
- Generic statements that could apply to any trend
- Overhyping early-stage research
- Ignoring contradictions or limitations in the evidence

OUTPUT FORMAT:
Return a JSON object with this structure:
{
  "title": "Clear trend-focused title (e.g., 'Extracellular Matrix Bioengineering Accelerates Toward Clinical Applications')",
  "excerpt": "200 char summary of the trend and its significance",
  "content": "<p>Full article in HTML with <h2> for main sections, <h3> for subsections. No title in content.</p>",
  "type": "trend_analysis"
}`;

    const ollamaPayload = JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        options: {
            temperature: 0.7,
            num_predict: 4000
        }
    });

    // Write payload to temp file to avoid shell escaping issues
    const tempFile = `/tmp/ollama-payload-${Date.now()}.json`;
    fs.writeFileSync(tempFile, ollamaPayload);

    try {
        const { stdout } = await execAsync(
            `curl -s http://localhost:11434/api/generate -d @${tempFile}`,
            { timeout: OLLAMA_TIMEOUT, maxBuffer: 10 * 1024 * 1024 }
        );

        // Clean up temp file
        fs.unlinkSync(tempFile);

        // Debug: save response for inspection if it fails
        if (!stdout || !stdout.trim().startsWith('{')) {
            const debugFile = `/tmp/ollama-response-debug-${Date.now()}.txt`;
            fs.writeFileSync(debugFile, stdout);
            throw new Error(`Invalid ollama response (saved to ${debugFile}). First 200 chars: ${stdout.substring(0, 200)}`);
        }

        let result;
        try {
            result = JSON.parse(stdout);
        } catch (e) {
            console.error('Failed to parse ollama response:', e.message);
            console.error('First 500 chars of response:', stdout.substring(0, 500));
            throw new Error('Ollama returned invalid JSON response');
        }

        let analysisText = result.response;

        // Strip common preambles
        analysisText = analysisText.replace(/^Here is the analysis in the requested JSON format:\s*/i, '');
        analysisText = analysisText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        analysisText = analysisText.trim();

        // Try to extract JSON from response if wrapped in explanation text
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            analysisText = jsonMatch[0];
        }

        let analysis;
        try {
            analysis = JSON.parse(analysisText);
        } catch (e) {
            console.error('Failed to parse analysis JSON:', e.message);
            const debugFile = `/tmp/analysis-response-debug-${Date.now()}.txt`;
            fs.writeFileSync(debugFile, analysisText);
            throw new Error(`Generated analysis is not valid JSON (saved to ${debugFile})`);
        }

        if (!analysis.title || !analysis.content) {
            throw new Error('Generated analysis missing required fields');
        }

        console.log('✅ Analysis generated successfully');
        console.log(`   Title: ${analysis.title}`);
        console.log(`   Length: ${analysis.content.length} characters\n`);

        return analysis;

    } catch (error) {
        // Clean up temp file on error
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
        console.error('❌ LLM generation failed:', error.message);
        throw error;
    }
}

function saveBroadcast(entity, documents, analysis) {
    console.log('💾 Saving broadcast to database...');

    // Use the first (highest scoring) document as the primary source
    const primaryDoc = documents[0];

    const broadcastId = generateId();
    const broadcastContent = JSON.stringify({
        title: analysis.title,
        excerpt: analysis.excerpt || analysis.title.substring(0, 200),
        content: analysis.content,
        type: 'trend_analysis',
        entity_id: entity.entity_id,
        entity_name: entity.entity_name,
        source_documents: documents.length,
        trend_metrics: {
            mention_count: entity.mention_count,
            avg_score: entity.avg_score,
            velocity: entity.velocity,
            momentum: entity.momentum,
            is_accelerating: entity.is_accelerating
        }
    });

    const stmt = db.prepare(`
        INSERT INTO broadcasts (
            id,
            documentId,
            client,
            content,
            image_url,
            alignment_score,
            status,
            createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        broadcastId,
        primaryDoc.id,
        'wordpress_deepdive',
        broadcastContent,
        null, // Will generate image during send
        entity.avg_score,
        'pending',
        Date.now()
    );

    console.log(`✅ Broadcast saved: ${broadcastId}`);
    console.log(`   Client: wordpress_deepdive`);
    console.log(`   Status: pending`);
    console.log(`   Primary doc: ${primaryDoc.id.substring(0, 8)}`);
    console.log(`   Source docs: ${documents.length}\n`);

    return broadcastId;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

(async () => {
    try {
        // Load trend data
        console.log(`📂 Loading trend file: ${trendFile}\n`);
        const trend = JSON.parse(fs.readFileSync(trendFile, 'utf-8'));

        // Extract document IDs
        const docIds = trend.document_ids.split(',');
        console.log(`📄 Fetching ${docIds.length} documents...\n`);

        // Fetch all documents
        const placeholders = docIds.map(() => '?').join(',');
        const documents = db.prepare(`
            SELECT id, content, alignment_score, createdAt
            FROM memories
            WHERE id IN (${placeholders})
            ORDER BY alignment_score DESC, createdAt DESC
        `).all(...docIds);

        if (documents.length === 0) {
            console.error('❌ No documents found for this trend');
            process.exit(1);
        }

        console.log(`✅ Retrieved ${documents.length} documents\n`);

        // Generate analysis
        const analysis = await generateAnalysisWithOllama(trend, documents);

        // Save as broadcast
        const broadcastId = saveBroadcast(trend, documents, analysis);

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('✅ TREND ANALYSIS COMPLETE\n');
        console.log(`📊 Trend: ${trend.entity_name}`);
        console.log(`📝 Title: ${analysis.title}`);
        console.log(`🆔 Broadcast ID: ${broadcastId}`);
        console.log(`📄 Source Documents: ${documents.length}`);
        console.log(`⏱️  Status: Pending (ready for manual review)`);
        console.log('\n🎯 NEXT STEPS:');
        console.log(`   1. Review broadcast: sqlite3 agent/data/db.sqlite "SELECT * FROM broadcasts WHERE id='${broadcastId}'"`);
        console.log('   2. If approved, publish: CLIENT=wordpress_deepdive BROADCAST_ID=' + broadcastId + ' node send-pending-to-wordpress.js');
        console.log('   3. Or delete if not suitable: sqlite3 agent/data/db.sqlite "DELETE FROM broadcasts WHERE id=\'' + broadcastId + '\'"');
        console.log();

        db.close();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        db.close();
        process.exit(1);
    }
})();
