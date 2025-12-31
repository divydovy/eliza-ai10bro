#!/usr/bin/env node

const Database = require('better-sqlite3');
const crypto = require('crypto');

const db = new Database('./agent/data/db.sqlite');

console.log('🔧 Adding New Entities from Research...\n');

function generateId() {
    return crypto.randomBytes(16).toString('hex');
}

const insertEntity = db.prepare(`
    INSERT INTO tracked_entities (id, type, name, website, twitter, focus_area, funding_stage, affiliation, principal_investigator, confidence, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// New companies discovered from Future Today Institute, Stanford SETR, StartUs Insights, and agent corpus
const newCompanies = [
    // From existing high-scoring documents
    { name: 'Cemvita', website: 'https://www.cemvita.com/', twitter: null, focus: 'Circular bioeconomy', stage: 'Series B', confidence: 'High', note: 'FermOil™, FermNPK™, waste-to-value biomanufacturing' },
    { name: 'Newlight Technologies', website: 'https://www.newlight.com/', twitter: null, focus: 'Greenhouse gas conversion', stage: 'Growth', confidence: 'High', note: 'AirCarbon biomaterial, $125M funding round' },
    { name: 'eXoZymes', website: 'https://www.exozymes.com/', twitter: null, focus: 'Enzyme-based biomanufacturing', stage: 'Public (NASDAQ: EXOZ)', confidence: 'High', note: 'AI-enhanced exozymes, 100x scale-up achievement' },

    // From StartUs Insights synthetic biology trends
    { name: 'New Biologix', website: 'https://www.newbiologix.com/', twitter: null, focus: 'Gene and cell therapy', stage: 'Series A', confidence: 'Medium', note: 'rAAV gene therapy, Switzerland-based' },
    { name: 'Bloomsbury Genetic Therapies', website: null, twitter: null, focus: 'Gene therapy', stage: 'Seed', confidence: 'Medium', note: 'Rare neurological diseases, UK-based' },
    { name: 'Graphite Bio', website: 'https://graphitebio.com/', twitter: '@GraphiteBio', focus: 'Gene editing', stage: 'Public', confidence: 'High', note: 'CRISPR + HDR platform for precise DNA repair' },
    { name: 'SeQure Dx', website: 'https://sequredx.com/', twitter: null, focus: 'Gene editing safety', stage: 'Seed', confidence: 'Medium', note: 'Predictive off-target assessment for CRISPR' },
    { name: 'Deep Biotech Solutions', website: null, twitter: null, focus: 'NGS services', stage: 'Series A', confidence: 'Low', note: 'Next-gen sequencing, RNA-seq, Hungary' },
    { name: 'Lost Arrow Bio', website: null, twitter: null, focus: 'NGS automation', stage: 'Seed', confidence: 'Low', note: 'Automated library preparation workflows' },
    { name: 'Basecamp Research', website: 'https://basecampresearch.com/', twitter: '@BasecampRes', focus: 'Protein data', stage: 'Series B', confidence: 'Medium', note: 'Microbial biodiversity mapping, UK' },
    { name: 'MarraBio', website: null, twitter: null, focus: 'Bacterial polymers', stage: 'Seed', confidence: 'Low', note: 'Protein polymers for cellular applications, UK' },
    { name: 'Hexamer Therapeutics', website: null, twitter: null, focus: 'Synthetic vaccines', stage: 'Seed', confidence: 'Low', note: 'Synthetic vaccine scaffold technology' },
    { name: 'AiBIOLOGICS', website: 'https://www.aibiologics.com/', twitter: null, focus: 'Bio-AI', stage: 'Series A', confidence: 'Medium', note: 'AI-powered antibody discovery, Ireland' },
    { name: 'Myriameat', website: null, twitter: null, focus: 'Cellular agriculture', stage: 'Seed', confidence: 'Low', note: 'Cell-cultured whole meat, Germany' },
    { name: 'Real Deal Milk', website: null, twitter: null, focus: 'Precision fermentation', stage: 'Seed', confidence: 'Low', note: 'Dairy protein production, Spain' },

    // From Yahoo Finance synthetic biology stocks
    { name: 'GeneDx Holdings', website: 'https://www.genedx.com/', twitter: '@GeneDx', focus: 'Genomics', stage: 'Public (NASDAQ: WGS)', confidence: 'High', note: 'Exome testing, genetic diagnostics' },

    // Additional from web research
    { name: 'Novozymes', website: 'https://www.novozymes.com/', twitter: '@Novozymes', focus: 'Enzyme engineering', stage: 'Public', confidence: 'High', note: 'Copenhagen, €2.1B sales, enzyme development leader' }
];

console.log(`🏢 Adding ${newCompanies.length} new companies...\n`);

let addedCount = 0;
const checkExisting = db.prepare('SELECT id FROM tracked_entities WHERE name = ?');

for (const company of newCompanies) {
    // Check if already exists
    const existing = checkExisting.get(company.name);
    if (existing) {
        console.log(`  ⏭️  Skipping ${company.name} (already exists)`);
        continue;
    }

    insertEntity.run(
        generateId(),
        'company',
        company.name,
        company.website,
        company.twitter,
        company.focus,
        company.stage,
        null, // affiliation
        null, // PI
        company.confidence,
        JSON.stringify({
            source: 'Research 2025-12-31 (FTI, Stanford SETR, StartUs Insights)',
            note: company.note
        })
    );
    console.log(`  ✅ Added: ${company.name} (${company.focus})`);
    addedCount++;
}

// New research institutions discovered
const newInstitutions = [
    { name: 'Biobricks Foundation', affiliation: 'Independent', pi: null, focus: 'Synthetic biology standards', confidence: 'Medium' },
    { name: 'iGEM Foundation', affiliation: 'Independent', pi: null, focus: 'Synthetic biology education', confidence: 'High' },
    { name: 'Biobuilder Educational Foundation', affiliation: 'Independent', pi: null, focus: 'Synbio education', confidence: 'Medium' },
    { name: 'Wilson Center', affiliation: 'Policy think tank', pi: null, focus: 'Biotech policy', confidence: 'Medium' },
    { name: 'National Security Commission on Emerging Biotechnology', affiliation: 'U.S. Government', pi: null, focus: 'Biotech security', confidence: 'High' },
    { name: 'Dartmouth College', affiliation: 'Dartmouth', pi: 'Multiple', focus: 'Bioengineering', confidence: 'Medium' },
    { name: 'Hasso Plattner Institute of Design (d.school)', affiliation: 'Stanford', pi: null, focus: 'Bio design thinking', confidence: 'Low' }
];

console.log(`\n🔬 Adding ${newInstitutions.length} new research institutions...\n`);

for (const inst of newInstitutions) {
    const existing = checkExisting.get(inst.name);
    if (existing) {
        console.log(`  ⏭️  Skipping ${inst.name} (already exists)`);
        continue;
    }

    insertEntity.run(
        generateId(),
        'lab',
        inst.name,
        null,
        null,
        inst.focus,
        null, // funding_stage
        inst.affiliation,
        inst.pi,
        inst.confidence,
        JSON.stringify({ source: 'Stanford SETR + Future Today Institute 2025' })
    );
    console.log(`  ✅ Added: ${inst.name} (${inst.focus})`);
    addedCount++;
}

// Show updated summary
const totalEntities = db.prepare('SELECT COUNT(*) as count FROM tracked_entities').get();
const byType = db.prepare(`
    SELECT type, COUNT(*) as count,
           SUM(CASE WHEN confidence = 'High' THEN 1 ELSE 0 END) as high_confidence
    FROM tracked_entities
    GROUP BY type
`).all();

console.log('\n📊 Updated Entity Database Summary:');
console.log(`   Total entities: ${totalEntities.count} (+${addedCount})`);
console.log('   Breakdown:');
for (const row of byType) {
    console.log(`     ${row.type}: ${row.count} (${row.high_confidence} high-confidence)`);
}

console.log('\n✅ Entity database updated!');

db.close();
