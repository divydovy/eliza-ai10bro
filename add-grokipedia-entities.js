// Add entities discovered from Grokipedia synthetic biology page
// Phase 1: High-priority companies and research labs
// Source: GROKIPEDIA_SYNTHETIC_BIOLOGY_FINDINGS_2026-01-19.md

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'agent/data/db.sqlite');
const db = new Database(dbPath);

console.log('📊 Adding Grokipedia entities to tracking database...\n');

// High-priority companies from Grokipedia analysis
const companies = [
    {
        name: 'Genentech',
        type: 'company',
        focus_area: 'pharmaceuticals',
        confidence: 'high',
        metadata: JSON.stringify({
            description: 'Pioneer: First recombinant insulin (1978)',
            founded: 1976,
            milestone: 'First recombinant DNA drug',
            significance: 'Foundational to synthetic biology field'
        })
    },
    {
        name: 'Genomatica',
        type: 'company',
        focus_area: 'industrial_biotech',
        confidence: 'high',
        metadata: JSON.stringify({
            description: 'Engineered E. coli for bio-BDO production, EPA award winner',
            product: '1,4-butanediol (BDO)',
            partners: ['Novamont', 'BASF'],
            awards: 'EPA Presidential Green Chemistry Award (2011)'
        })
    },
    {
        name: 'Sanofi',
        type: 'company',
        focus_area: 'pharmaceuticals',
        confidence: 'high',
        metadata: JSON.stringify({
            description: 'Artemisinin semi-synthetic production (2013)',
            product: 'Artemisinin (malaria treatment)',
            method: 'Engineered yeast fermentation',
            launch_year: 2013
        })
    },
    {
        name: 'Illumina',
        type: 'company',
        focus_area: 'sequencing',
        confidence: 'high',
        metadata: JSON.stringify({
            description: 'DNA sequencing platforms - critical infrastructure provider',
            category: 'Enabler technology',
            products: 'Next-generation sequencing platforms',
            market_position: 'Industry leader'
        })
    },
    {
        name: 'Pacific Biosciences',
        type: 'company',
        focus_area: 'sequencing',
        confidence: 'medium',
        metadata: JSON.stringify({
            description: 'Single-molecule sequencing technology',
            technology: 'SMRT sequencing',
            differentiator: 'Long-read sequencing'
        })
    },
    {
        name: 'Oxford Nanopore',
        type: 'company',
        focus_area: 'sequencing',
        confidence: 'high',
        metadata: JSON.stringify({
            description: 'Nanopore sequencing technology',
            technology: 'Nanopore-based sequencing',
            advantages: 'Portable, real-time, long reads'
        })
    },
    {
        name: 'Novamont',
        type: 'company',
        focus_area: 'materials',
        confidence: 'medium',
        metadata: JSON.stringify({
            description: 'Bio-BDO production partner with Genomatica',
            focus: 'Bioplastics and bio-based chemicals',
            partnership: 'Genomatica bio-BDO'
        })
    },
    {
        name: 'BASF',
        type: 'company',
        focus_area: 'chemicals',
        confidence: 'medium',
        metadata: JSON.stringify({
            description: 'Bio-BDO production partner, chemical industry adoption',
            sector: 'Chemical manufacturing',
            synbio_focus: 'Bio-based chemical production'
        })
    }
];

// High-priority research labs from Grokipedia analysis
const labs = [
    {
        name: 'MIT BioBricks',
        type: 'lab',
        focus_area: 'standards',
        confidence: 'high',
        affiliation: 'MIT',
        principal_investigator: 'Tom Knight',
        metadata: JSON.stringify({
            description: 'BioBrick assembly standard (2003) - foundational to standardized parts',
            innovation: 'BioBrick standard',
            year: 2003,
            impact: 'Enabled modular synthetic biology'
        })
    },
    {
        name: 'NIST',
        type: 'lab',
        focus_area: 'standards',
        confidence: 'high',
        affiliation: 'US Department of Commerce',
        principal_investigator: null,
        metadata: JSON.stringify({
            description: 'Biological computing standards (2022)',
            full_name: 'National Institute of Standards and Technology',
            role: 'Standards body for synthetic biology',
            recent_work: 'Biological computing (2022)'
        })
    },
    {
        name: 'Macquarie University',
        type: 'lab',
        focus_area: 'computing',
        confidence: 'medium',
        affiliation: 'Macquarie University',
        principal_investigator: null,
        metadata: JSON.stringify({
            description: 'Biological computing systems (2025)',
            location: 'Australia',
            recent_work: 'Biological computing systems',
            year: 2025
        })
    }
];

// Insert companies
console.log('Adding 8 high-priority companies:\n');
const insertCompany = db.prepare(`
    INSERT OR IGNORE INTO tracked_entities
    (type, name, focus_area, confidence, metadata)
    VALUES (?, ?, ?, ?, ?)
`);

let companiesAdded = 0;
for (const company of companies) {
    const result = insertCompany.run(
        company.type,
        company.name,
        company.focus_area,
        company.confidence,
        company.metadata
    );
    if (result.changes > 0) {
        console.log(`✅ Added: ${company.name} (${company.focus_area})`);
        companiesAdded++;
    } else {
        console.log(`⏭️  Skipped: ${company.name} (already exists)`);
    }
}

// Insert labs
console.log('\nAdding 3 high-priority research labs:\n');
const insertLab = db.prepare(`
    INSERT OR IGNORE INTO tracked_entities
    (type, name, focus_area, confidence, affiliation, principal_investigator, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
`);

let labsAdded = 0;
for (const lab of labs) {
    const result = insertLab.run(
        lab.type,
        lab.name,
        lab.focus_area,
        lab.confidence,
        lab.affiliation,
        lab.principal_investigator,
        lab.metadata
    );
    if (result.changes > 0) {
        console.log(`✅ Added: ${lab.name} (${lab.focus_area})`);
        labsAdded++;
    } else {
        console.log(`⏭️  Skipped: ${lab.name} (already exists)`);
    }
}

// Show updated totals
console.log('\n📊 Updated Entity Tracking Database:\n');
const stats = db.prepare(`
    SELECT type, COUNT(*) as count
    FROM tracked_entities
    GROUP BY type
    ORDER BY type
`).all();

stats.forEach(stat => {
    console.log(`${stat.type}: ${stat.count} entities`);
});

const total = stats.reduce((sum, stat) => sum + stat.count, 0);
console.log(`\nTotal entities: ${total}`);

console.log(`\n✅ Phase 1 complete: Added ${companiesAdded} companies + ${labsAdded} labs`);
console.log('📈 Expected impact: +10% entity coverage, better sequencing/pharma/standards detection\n');

db.close();
