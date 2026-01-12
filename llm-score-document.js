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

AI10BRO Mission: Highlight COMMERCIAL innovations that involve LIVING ORGANISMS, BIOLOGICAL PROCESSES, or BIO-ENGINEERING.

INCLUDE these domains (MUST involve biology):
✓ Synthetic biology (engineered organisms, genetic circuits, programmable cells, metabolic engineering)
✓ Biotechnology (CRISPR, gene editing, protein engineering, bioinformatics, computational biology)
✓ Living biomaterials (mycelium composites, bacterial concrete, algae-based materials, self-healing bio-materials)
✓ Bioprocessing & biomanufacturing (fermentation, cell factories, precision fermentation, enzyme production)
✓ Agricultural biotech (gene-edited crops, cellular agriculture, precision farming with biotech sensors)
✓ Bio-based production (microbial synthesis, lab-grown materials, enzymatic production, bio-based chemicals)
✓ Biomedical engineering (tissue engineering, organoids, bio-robotics, living therapeutics, gene therapy)

CRITICAL: Biomaterials MUST involve living organisms, enzymes, or bio-based production processes. Traditional materials science does NOT qualify.

EXCLUDE these domains (even if sustainable/commercial):
✗ Traditional materials science (concrete, ceramics, composites WITHOUT biological component)
✗ Carbon accounting, emissions tracking, ESG metrics, climate reporting (no biology involved)
✗ Pure AI/ML, computer vision, NLP, software (unless directly analyzing biological data)
✗ Traditional medicine, supplements, herbal remedies, wellness products (no genetic engineering)
✗ Epidemiology, disease tracking, public health (unless involving genetic analysis or bioengineering)
✗ Clean energy WITHOUT bio component (solar panels, batteries, wind turbines, nuclear)
✗ Traditional agriculture, organic farming (no genetic modification or biotech)
✗ General sustainability, recycling, green building (no biological innovation)
✗ Traditional manufacturing, even if sustainable (must involve biological processes)

EXAMPLES TO SCORE LOW (under 20):
- Roman concrete, traditional concrete (no living organisms)
- Scope 3 emissions, carbon footprinting (accounting, not biology)
- Disease spread modeling without genetic component
- AI for business optimization (no biology)
- Solar-powered buildings (clean energy but no bio)

EXAMPLES TO SCORE HIGH (60-100):
- Bacteria producing limestone to heal concrete cracks
- CRISPR gene therapy entering clinical trials
- Precision fermentation producing dairy proteins
- Mycelium grown into leather alternatives
- Engineered algae capturing CO2 for biofuel production

Score HIGH (60-100) ONLY if ALL THREE conditions met:
1. Involves living organisms, enzymes, or biological processes
2. In biotech/synthetic biology/bio-engineering domain
3. Commercial (products, companies, funding, FDA approvals, market entry)

Score MEDIUM (20-59) if biological but early research or non-commercial.
Score LOW (0-19) if no biological component, even if sustainable/commercial.

Respond with ONLY a number 0-100. Be EXTREMELY strict - if there's no biology, score 0-10.

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

        // Call ollama with 5 minute timeout
        const { stdout } = await execPromise(`ollama run ${MODEL} < ${tempFile}`, {
            timeout: 300000 // 5 minute timeout (never use default scores)
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

        // NEVER return default score - throw error if parse fails
        throw new Error(`Could not parse score from LLM output: ${stdout.trim().substring(0, 200)}`);
    } catch (error) {
        // NEVER return default score - propagate error
        throw error;
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
