#!/usr/bin/env node

const Database = require('better-sqlite3');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const fs = require('fs');

const WORKERS = 5; // Parallel ollama instances (reduced from 20 - ollama can't truly parallelize that many)
const MODEL = 'qwen2.5:32b';
const CHECKPOINT_FILE = 'llm-scoring-checkpoint.json';

const db = new Database('./agent/data/db.sqlite');

// Scoring prompt optimized for your mission - DOMAIN SPECIFIC (Enhanced 2025-12-31)
const SCORING_PROMPT = `Rate this content's alignment with AI10BRO's mission on a 0-100 scale.

AI10BRO Mission: Highlight COMMERCIAL innovations in biotech/synthetic biology/biomaterials

INCLUDE these domains:
✓ Synthetic biology (engineered organisms, genetic circuits, programmable cells)
✓ Biotechnology (CRISPR, gene editing, protein engineering, bioinformatics)
✓ Advanced biomaterials (bio-concrete, mycelium materials, bioplastics, living materials)
✓ Bioprocessing & biomanufacturing (fermentation, cell factories, precision fermentation)
✓ Agricultural biotech (engineered crops, vertical farming with biotech, cellular agriculture)
✓ Bio-based production (proteins from fermentation, lab-grown materials, bio-based chemicals)
✓ Biomedical products IF they involve novel bioengineering (not just traditional medicine)

EXCLUDE these domains (even if commercial):
✗ Traditional tech (data centers, cloud, AI/ML without bio component, software)
✗ Traditional medicine, herbal remedies, dietary supplements, wellness products
✗ Pure medical research without bioengineering innovation
✗ Computer science, NLP, computer vision (unless bio-focused)
✗ Clean energy/climate WITHOUT bio component (solar, batteries, etc.)
✗ Traditional agriculture without genetic engineering

BONUS POINTS - Add +10 points EACH if content mentions these tracked entities (max +30):

Companies: Ginkgo Bioworks, Upside Foods, Perfect Day, Twist Bioscience, Synthego,
           Bolt Threads, Mammoth Biosciences, Solugen, Crispr Therapeutics, Recursion Pharmaceuticals,
           Insitro, Zymergen, Spiber, New Culture, Geltor

Research Labs: Broad Institute, Wyss Institute, J. Craig Venter Institute, Salk Institute,
               Lawrence Berkeley National Lab, Caltech (Frances Arnold), Stanford Bio-X

VCs: ARCH Venture Partners, Flagship Pioneering, a16z bio fund, Khosla Ventures (bio deals),
     OrbiMed, Sofinnova Ventures, Frazier Life Sciences

COMMERCIAL SIGNAL KEYWORDS (boost score if present):
Food Biotech: "precision fermentation", "cell-based meat", "fungal protein", "lab-grown dairy",
              "alternative protein", "mycoprotein", "cultivated meat"

Materials: "mycelium", "bio-concrete", "spider silk", "bio-plastics", "brewed protein",
           "bio-leather", "self-healing materials", "fungal leather", "chitin-based"

Energy/Environment: "enzymatic carbon capture", "bio-solar", "algal biofuels",
                    "microbial fuel cells", "bio-batteries", "biomass conversion"

Medicine: "CAR-T", "phage therapy", "RNA vaccines", "bispecifics", "antibody engineering",
          "oncolytic viruses", "precision oncology", "neoantigen vaccines"

Agriculture: "bio-pesticide", "nitrogen-fixing", "CRISPR crops", "RNA interference",
             "gene-edited seeds", "drought-resistant", "yield-enhancing genes"

Regulatory/Commercial: "FDA approved", "GRAS status", "Phase II results", "100-fold scale-up",
                       "commercial scale", "first customer", "market entry", "Series B funding",
                       "IPO", "bioreactor", "GMP compliant", "pilot scale"

Score HIGH (60-100) ONLY if:
1. In CORRECT domain (biotech/synbio/biomaterials)
2. AND commercial (products, companies, funding, FDA approvals, market entry)
3. BONUS: Mentions tracked entities or commercial keywords above

Examples of HIGH scores:
- "Ginkgo Bioworks announces $100M Series C for engineered organisms" (80 + 10 = 90)
- "Upside Foods gets FDA approval for cultivated meat" (85 + 10 = 95)
- "Perfect Day's precision fermentation proteins now in stores" (70 + 10 = 80)
- "Bio-concrete startup achieves commercial scale with 100-fold scale-up" (75)

Examples of MEDIUM scores (20-50):
- Applied synthetic biology research with commercial potential (30-40)
- Biotech startups in early stages, no products yet (25-35)
- Academic research on CRISPR with clear applications (20-30)

Examples of LOW scores (0-20):
- Pure academic biology research without commercial angle (5-15)
- Traditional herbal medicine or supplements (0-5)
- Data centers, AI infrastructure, traditional tech (0-5)
- Medical studies without bioengineering component (5-10)
- Computer science research (0-5)

Content to rate:
{CONTENT}

Respond with ONLY a number 0-100. Be VERY strict on domain - if it's not biotech/synthetic biology/biomaterials, score under 20 even if commercial.`;

// Load or create checkpoint
function loadCheckpoint() {
    if (fs.existsSync(CHECKPOINT_FILE)) {
        return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    }
    return { completed: new Set(), scores: {} };
}

function saveCheckpoint(checkpoint) {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({
        completed: Array.from(checkpoint.completed),
        scores: checkpoint.scores
    }, null, 2));
}

async function scoreWithLLM(text, docId) {
    // Truncate to first 2000 chars for speed (most context is in beginning)
    const truncated = text.substring(0, 2000);
    const prompt = SCORING_PROMPT.replace('{CONTENT}', truncated);

    try {
        // Write prompt to temp file
        const tempFile = `/tmp/llm-score-${docId}.txt`;
        fs.writeFileSync(tempFile, prompt);

        // Call ollama
        const { stdout } = await execPromise(`ollama run ${MODEL} < ${tempFile}`);

        // Clean up
        fs.unlinkSync(tempFile);

        // Extract number from response
        const match = stdout.trim().match(/(\d+)/);
        if (match) {
            const score = parseInt(match[1]);
            // Convert 0-100 to 0-1 scale
            return Math.min(Math.max(score / 100, 0), 1);
        }

        console.error(`⚠️  Could not parse score from: ${stdout.trim()}`);
        return null;
    } catch (error) {
        console.error(`❌ Error scoring doc ${docId}:`, error.message);
        return null;
    }
}

async function worker(workQueue, checkpoint, workerId) {
    while (workQueue.length > 0) {
        const doc = workQueue.shift();
        if (!doc) break;

        try {
            const content = JSON.parse(doc.content);
            const text = content.text || '';

            console.log(`[Worker ${workerId}] Scoring doc ${doc.id.substring(0, 8)}... (${workQueue.length} remaining)`);

            const score = await scoreWithLLM(text, doc.id);

            if (score !== null) {
                // Update database
                db.prepare('UPDATE memories SET alignment_score = ? WHERE id = ?').run(score, doc.id);

                // Update checkpoint
                checkpoint.completed.add(doc.id);
                checkpoint.scores[doc.id] = score;

                console.log(`[Worker ${workerId}] ✅ Scored: ${(score * 100).toFixed(0)}%`);
            }
        } catch (error) {
            console.error(`[Worker ${workerId}] ❌ Error processing ${doc.id}:`, error.message);
        }
    }
}

async function main() {
    console.log('🤖 LLM-Based Document Scoring');
    console.log(`📊 Model: ${MODEL}`);
    console.log(`👷 Workers: ${WORKERS}\n`);

    // Load checkpoint
    const checkpoint = loadCheckpoint();
    console.log(`✅ Loaded checkpoint: ${checkpoint.completed.size} documents already scored\n`);

    // Get all documents that don't have scores yet
    const allDocs = db.prepare(`
        SELECT id, content
        FROM memories
        WHERE type = 'documents'
        AND alignment_score IS NULL
    `).all();

    // Filter out already scored
    const docsToScore = allDocs.filter(doc => !checkpoint.completed.has(doc.id));

    console.log(`📚 Total documents: ${allDocs.length}`);
    console.log(`⏭️  Already scored: ${checkpoint.completed.size}`);
    console.log(`📝 To score: ${docsToScore.length}\n`);

    if (docsToScore.length === 0) {
        console.log('🎉 All documents already scored!');
        db.close();
        return;
    }

    // Estimate time
    const estimatedMinutes = Math.ceil((docsToScore.length / WORKERS) * 2 / 60);
    console.log(`⏱️  Estimated time: ~${estimatedMinutes} minutes\n`);

    const startTime = Date.now();

    // Create work queue (shallow copy so we can modify it)
    const workQueue = [...docsToScore];

    // Start workers
    const workers = [];
    for (let i = 0; i < WORKERS; i++) {
        workers.push(worker(workQueue, checkpoint, i + 1));
    }

    // Wait for all workers
    await Promise.all(workers);

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log(`\n✅ Scoring complete!`);
    console.log(`📊 Scored: ${docsToScore.length} documents`);
    console.log(`⏱️  Time: ${elapsed} minutes`);
    console.log(`📈 Rate: ${(docsToScore.length / parseFloat(elapsed)).toFixed(1)} docs/minute`);

    // Show score distribution
    const scores = db.prepare(`
        SELECT
            COUNT(*) as count,
            AVG(alignment_score) as avg_score,
            MIN(alignment_score) as min_score,
            MAX(alignment_score) as max_score
        FROM memories
        WHERE type = 'documents'
        AND alignment_score IS NOT NULL
    `).get();

    console.log(`\n📊 Score Distribution:`);
    console.log(`   Average: ${(scores.avg_score * 100).toFixed(1)}%`);
    console.log(`   Min: ${(scores.min_score * 100).toFixed(1)}%`);
    console.log(`   Max: ${(scores.max_score * 100).toFixed(1)}%`);

    const highScoring = db.prepare(`
        SELECT COUNT(*) as count
        FROM memories
        WHERE type = 'documents'
        AND alignment_score >= 0.12
    `).get();

    console.log(`\n🎯 Broadcast-ready (>=12%): ${highScoring.count} documents`);

    // Clean up checkpoint file
    if (fs.existsSync(CHECKPOINT_FILE)) {
        fs.unlinkSync(CHECKPOINT_FILE);
        console.log(`\n🧹 Cleaned up checkpoint file`);
    }

    db.close();
    console.log('\n🎉 Done!');
}

// Handle interruption gracefully
process.on('SIGINT', () => {
    console.log('\n\n⚠️  Interrupted! Checkpoint saved. Run again to resume.');
    const checkpoint = loadCheckpoint();
    saveCheckpoint(checkpoint);
    db.close();
    process.exit(0);
});

main().catch(error => {
    console.error('Fatal error:', error);
    db.close();
    process.exit(1);
});
