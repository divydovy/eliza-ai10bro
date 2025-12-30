#!/usr/bin/env node

/**
 * Score a single document with LLM
 * Used by import scripts to score documents immediately upon import
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const fs = require('fs');

const MODEL = 'qwen2.5:32b';

const SCORING_PROMPT = `Rate this content's alignment with AI10BRO's mission on a 0-100 scale.

AI10BRO Mission: Highlight COMMERCIAL innovations in these SPECIFIC domains:

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

Score HIGH (60-100) ONLY if BOTH conditions met:
1. In the CORRECT domain (biotech/synthetic biology/biomaterials)
2. AND commercial (products launching, companies, funding, FDA approvals, market entry)

Respond with ONLY a number 0-100. Be VERY strict on domain - if it's not biotech/synthetic biology/biomaterials, score under 20 even if commercial.

Content:
{CONTENT}`;

async function scoreDocument(text) {
    // Truncate to first 2000 chars
    const truncated = text.substring(0, 2000);
    const prompt = SCORING_PROMPT.replace('{CONTENT}', truncated);

    try {
        // Write prompt to temp file
        const tempFile = `/tmp/llm-score-${Date.now()}.txt`;
        fs.writeFileSync(tempFile, prompt);

        // Call ollama
        const { stdout } = await execPromise(`ollama run ${MODEL} < ${tempFile}`, {
            timeout: 30000 // 30 second timeout
        });

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
        return 0.05; // Default low score if parse fails
    } catch (error) {
        console.error(`❌ Error scoring document:`, error.message);
        return 0.05; // Default low score on error
    }
}

// If called directly from command line with text
if (require.main === module) {
    const text = process.argv[2];
    if (!text) {
        console.error('Usage: node llm-score-document.js "text to score"');
        process.exit(1);
    }

    scoreDocument(text).then(score => {
        console.log(score);
    });
}

module.exports = { scoreDocument };
