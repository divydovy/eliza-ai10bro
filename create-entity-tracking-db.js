#!/usr/bin/env node

const Database = require('better-sqlite3');
const crypto = require('crypto');

const db = new Database('./agent/data/db.sqlite');

console.log('🔧 Creating Entity Tracking Database...\n');

// Create tables
console.log('📊 Creating tables...');

db.exec(`
    CREATE TABLE IF NOT EXISTS tracked_entities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL, -- 'company', 'lab', 'vc'
        name TEXT NOT NULL,
        website TEXT,
        twitter TEXT,
        focus_area TEXT,
        funding_stage TEXT, -- For companies
        affiliation TEXT,   -- For labs
        principal_investigator TEXT, -- For labs
        confidence TEXT,    -- High/Medium/Low
        metadata TEXT,      -- JSON string for extra data
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS entity_mentions (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        mention_count INTEGER DEFAULT 1,
        context TEXT, -- Surrounding text
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES memories(id),
        FOREIGN KEY (entity_id) REFERENCES tracked_entities(id)
    );

    CREATE INDEX IF NOT EXISTS idx_entity_type ON tracked_entities(type);
    CREATE INDEX IF NOT EXISTS idx_entity_name ON tracked_entities(name);
    CREATE INDEX IF NOT EXISTS idx_entity_confidence ON tracked_entities(confidence);
    CREATE INDEX IF NOT EXISTS idx_mentions_document ON entity_mentions(document_id);
    CREATE INDEX IF NOT EXISTS idx_mentions_entity ON entity_mentions(entity_id);
`);

console.log('✅ Tables created\n');

// Helper function to generate ID
function generateId() {
    return crypto.randomBytes(16).toString('hex');
}

// Prepare insert statement
const insertEntity = db.prepare(`
    INSERT INTO tracked_entities (id, type, name, website, twitter, focus_area, funding_stage, affiliation, principal_investigator, confidence, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

console.log('📝 Populating entities from Grok research...\n');

// 1. COMPANIES (50 total)
console.log('🏢 Adding 50 companies...');
const companies = [
    { name: 'Ginkgo Bioworks', website: 'https://www.ginkgobioworks.com/', twitter: '@Ginkgo', focus: 'Synthetic biology', stage: 'Public', confidence: 'High' },
    { name: 'Zymergen', website: 'https://www.zymergen.com/', twitter: '@zymergen', focus: 'Bio-materials', stage: 'Acquired (2022)', confidence: 'Medium' },
    { name: 'Synthego', website: 'https://www.synthego.com/', twitter: '@Synthego', focus: 'Enzyme engineering', stage: 'Series E', confidence: 'High' },
    { name: 'Upside Foods', website: 'https://upsidefoods.com/', twitter: '@upsidefoods', focus: 'Cellular agriculture', stage: 'Series C', confidence: 'High' },
    { name: 'Insitro', website: 'https://insitro.com/', twitter: '@insitro', focus: 'Bio-AI', stage: 'Series C', confidence: 'High' },
    { name: 'Perfect Day', website: 'https://perfectday.com/', twitter: '@PerfectDayFoods', focus: 'Precision fermentation', stage: 'Series D', confidence: 'High' },
    { name: 'Bolt Threads', website: 'https://boltthreads.com/', twitter: '@BoltThreads', focus: 'Bio-materials', stage: 'Series E', confidence: 'Medium' },
    { name: 'Twist Bioscience', website: 'https://www.twistbioscience.com/', twitter: '@TwistBiosci', focus: 'Synthetic biology', stage: 'Public', confidence: 'High' },
    { name: 'Recursion Pharmaceuticals', website: 'https://www.recursion.com/', twitter: '@RecursionPharma', focus: 'Bio-AI', stage: 'Public', confidence: 'High' },
    { name: 'Mammoth Biosciences', website: 'https://mammoth.bio/', twitter: '@mammothbiosci', focus: 'Enzyme engineering', stage: 'Series D', confidence: 'High' },
    { name: 'Solugen', website: 'https://solugen.com/', twitter: '@solugen', focus: 'Precision fermentation', stage: 'Series C', confidence: 'High' },
    { name: 'Spiber', website: 'https://spiber.jp/', twitter: '@spiber_inc', focus: 'Bio-materials', stage: 'Series E', confidence: 'High' },
    { name: 'Crispr Therapeutics', website: 'https://crisprtx.com/', twitter: '@CRISPRTX', focus: 'Synthetic biology', stage: 'Public', confidence: 'High' },
    { name: 'New Culture', website: 'https://www.newculture.com/', twitter: '@NewCultureFood', focus: 'Cellular agriculture', stage: 'Series B', confidence: 'Medium' },
    { name: 'Nurix Therapeutics', website: 'https://www.nurix.com/', twitter: '@NurixInc', focus: 'Enzyme engineering', stage: 'Public', confidence: 'High' },
    { name: 'Ionis Pharmaceuticals', website: 'https://www.ionispharma.com/', twitter: '@ionispharma', focus: 'Bio-AI', stage: 'Public', confidence: 'High' },
    { name: 'BillionToOne', website: 'https://www.billiontoone.com/', twitter: '@BillionToOne', focus: 'Precision fermentation', stage: 'Series C', confidence: 'Medium' },
    { name: 'Crinetics Pharmaceuticals', website: 'https://crinetics.com/', twitter: '@Crinetics', focus: 'Synthetic biology', stage: 'Public', confidence: 'High' },
    { name: 'Sherlock Biosciences', website: 'https://sherlock.bio/', twitter: '@SherlockBio', focus: 'Enzyme engineering', stage: 'Series B', confidence: 'Medium' },
    { name: 'Senti Biosciences', website: 'https://sentibio.com/', twitter: '@SentiBio', focus: 'Bio-AI', stage: 'Public', confidence: 'High' },
    { name: 'Merck KGaA', website: 'https://www.merckgroup.com/', twitter: '@MerckGroup', focus: 'Synthetic biology', stage: 'Public', confidence: 'High' },
    { name: 'Agilent Technologies', website: 'https://www.agilent.com/', twitter: '@Agilent', focus: 'Bio-materials', stage: 'Public', confidence: 'High' },
    { name: 'Rejuve Biotech', website: 'https://rejuve.bio/', twitter: null, focus: 'Bio-AI', stage: 'Seed', confidence: 'Medium' },
    { name: 'Genegoggle', website: 'https://genegoggle.com/', twitter: null, focus: 'Enzyme engineering', stage: 'Seed', confidence: 'Medium' },
    { name: 'RedFox AI', website: 'https://redfox.ai/', twitter: null, focus: 'Bio-AI', stage: 'Seed', confidence: 'Medium' },
    { name: 'Granatum Bioworks', website: 'https://granatum.bio/', twitter: null, focus: 'Precision fermentation', stage: 'Seed', confidence: 'Medium' },
    { name: 'Extracellular', website: 'https://extracellular.com/', twitter: null, focus: 'Cellular agriculture', stage: 'Seed', confidence: 'Medium' },
    { name: 'NeoX Biotech', website: 'https://neoxbio.com/', twitter: null, focus: 'Bio-AI', stage: 'Seed', confidence: 'Medium' },
    { name: 'Anima Biotech', website: 'https://www.animabiotech.com/', twitter: '@AnimaBiotech', focus: 'Bio-AI', stage: 'Series B', confidence: 'High' },
    { name: 'Atomwise', website: 'https://www.atomwise.com/', twitter: '@AtomwiseInc', focus: 'Bio-AI', stage: 'Series B', confidence: 'High' },
    { name: 'BPGbio', website: 'https://bpgbio.com/', twitter: null, focus: 'Synthetic biology', stage: 'Series A', confidence: 'Medium' },
    { name: 'Cradle Bio', website: 'https://cradle.bio/', twitter: null, focus: 'Precision fermentation', stage: 'Seed', confidence: 'Medium' },
    { name: 'Iktos', website: 'https://iktos.ai/', twitter: '@Iktos_AI', focus: 'Bio-AI', stage: 'Series A', confidence: 'Medium' },
    { name: 'Insilico Medicine', website: 'https://insilico.com/', twitter: '@Insilico', focus: 'Bio-AI', stage: 'Series D', confidence: 'High' },
    { name: 'Isomorphic Labs', website: 'https://www.isomorphiclabs.com/', twitter: '@IsomorphicLabs', focus: 'Bio-AI', stage: 'Series A', confidence: 'High' },
    { name: 'AbbVie', website: 'https://www.abbvie.com/', twitter: '@abbvie', focus: 'Synthetic biology', stage: 'Public', confidence: 'High' },
    { name: 'PHC Corporation', website: 'https://www.phchd.com/', twitter: null, focus: 'Bio-materials', stage: 'Public', confidence: 'Medium' },
    { name: 'Biodesix', website: 'https://www.biodesix.com/', twitter: '@Biodesix', focus: 'Diagnostics', stage: 'Public', confidence: 'High' },
    { name: 'Rocket Pharmaceuticals', website: 'https://www.rocketpharma.com/', twitter: '@RocketPharma', focus: 'Gene therapy', stage: 'Public', confidence: 'High' },
    { name: 'Wave Life Sciences', website: 'https://www.wavelifesciences.com/', twitter: '@WaveLifeSci', focus: 'RNA editing', stage: 'Public', confidence: 'High' },
    { name: 'Ardelyx', website: 'https://ardelyx.com/', twitter: '@Ardelyx', focus: 'Renal', stage: 'Public', confidence: 'High' },
    { name: 'Geltor', website: 'https://geltor.com/', twitter: '@Geltor', focus: 'Precision fermentation', stage: 'Series B', confidence: 'Medium' }
];

let companyCount = 0;
for (const company of companies) {
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
        JSON.stringify({ source: 'Grok Research 2025-12-31' })
    );
    companyCount++;
}
console.log(`✅ Added ${companyCount} companies\n`);

// 2. RESEARCH LABS (20 total)
console.log('🔬 Adding 20 research labs...');
const labs = [
    { name: 'Broad Institute', affiliation: 'MIT/Harvard', pi: 'Feng Zhang (multiple PIs)', focus: 'Synthetic biology', confidence: 'High' },
    { name: 'Wyss Institute', affiliation: 'Harvard', pi: 'George Church', focus: 'Bio-materials', confidence: 'High' },
    { name: 'Salk Institute', affiliation: 'Salk', pi: 'Juan Carlos Izpisua Belmonte', focus: 'Cellular agriculture', confidence: 'Medium' },
    { name: 'Gladstone Institutes', affiliation: 'UCSF', pi: 'Shinya Yamanaka', focus: 'Bio-AI', confidence: 'High' },
    { name: 'J. Craig Venter Institute', affiliation: 'JCVI', pi: 'J. Craig Venter', focus: 'Synthetic biology', confidence: 'High' },
    { name: 'Lawrence Berkeley National Lab', affiliation: 'DOE', pi: 'Jay Keasling', focus: 'Precision fermentation', confidence: 'High' },
    { name: 'EMBL', affiliation: 'EMBL', pi: 'Multiple', focus: 'Bio-innovation', confidence: 'High' },
    { name: 'Max Planck Institute for Molecular Genetics', affiliation: 'Max Planck', pi: 'Multiple', focus: 'Enzyme engineering', confidence: 'Medium' },
    { name: 'Whitehead Institute', affiliation: 'MIT', pi: 'Rudolf Jaenisch', focus: 'Stem cells', confidence: 'High' },
    { name: 'Caltech Beckman Institute', affiliation: 'Caltech', pi: 'Frances Arnold', focus: 'Enzyme engineering', confidence: 'High' },
    { name: 'Stanford Bio-X', affiliation: 'Stanford', pi: 'Multiple', focus: 'Bio-AI', confidence: 'High' },
    { name: 'UC Berkeley Innovative Genomics Institute', affiliation: 'UC Berkeley', pi: 'Jennifer Doudna', focus: 'CRISPR', confidence: 'High' },
    { name: 'NYU Langone Medical Center', affiliation: 'NYU', pi: 'Multiple', focus: 'Organoids', confidence: 'Medium' },
    { name: 'Johns Hopkins Institute for Cell Engineering', affiliation: 'Johns Hopkins', pi: 'Multiple', focus: 'Regenerative medicine', confidence: 'High' },
    { name: 'RIKEN Center for Biosystems Dynamics', affiliation: 'RIKEN', pi: 'Multiple', focus: 'Synthetic biology', confidence: 'Medium' },
    { name: 'Francis Crick Institute', affiliation: 'Crick', pi: 'Multiple', focus: 'Cancer biology', confidence: 'High' },
    { name: 'Weizmann Institute of Science', affiliation: 'Weizmann', pi: 'Multiple', focus: 'Bio-materials', confidence: 'Medium' },
    { name: 'Karolinska Institute', affiliation: 'Karolinska', pi: 'Multiple', focus: 'Stem cells', confidence: 'High' },
    { name: 'Helmholtz Centre for Infection Research', affiliation: 'Helmholtz', pi: 'Multiple', focus: 'Phage therapy', confidence: 'Medium' },
    { name: 'CNRS Institute of Genetics and Molecular Biology', affiliation: 'CNRS', pi: 'Multiple', focus: 'Metabolic engineering', confidence: 'Medium' }
];

let labCount = 0;
for (const lab of labs) {
    insertEntity.run(
        generateId(),
        'lab',
        lab.name,
        null, // website
        null, // twitter
        lab.focus,
        null, // funding_stage
        lab.affiliation,
        lab.pi,
        lab.confidence,
        JSON.stringify({ source: 'Grok Research 2025-12-31' })
    );
    labCount++;
}
console.log(`✅ Added ${labCount} research labs\n`);

// 3. VCs (20 total)
console.log('💰 Adding 20 VCs/investors...');
const vcs = [
    { name: 'ARCH Venture Partners', twitter: '@ARCHVenture', focus: 'Bio-focused', confidence: 'High' },
    { name: 'OrbiMed', twitter: '@OrbiMed', focus: 'Health/biotech', confidence: 'High' },
    { name: 'Sofinnova Ventures', twitter: '@SofinnovaVC', focus: 'Life sciences', confidence: 'Medium' },
    { name: 'Flagship Pioneering', twitter: '@FlagshipPioneer', focus: 'Bio-innovation', confidence: 'High' },
    { name: 'Frazier Life Sciences', twitter: '@FrazierLS', focus: 'Biotech', confidence: 'High' },
    { name: 'Andreessen Horowitz (a16z)', twitter: '@a16z', focus: 'Bio fund', confidence: 'High' },
    { name: 'Khosla Ventures', twitter: '@KhoslaVentures', focus: 'Clean bio', confidence: 'High' },
    { name: 'New Enterprise Associates (NEA)', twitter: '@NEA', focus: 'Biotech', confidence: 'High' },
    { name: 'Sequoia Capital', twitter: '@Sequoia', focus: 'Life sciences', confidence: 'Medium' },
    { name: 'Accel', twitter: '@Accel', focus: 'Early-stage bio', confidence: 'Medium' },
    { name: 'Y Combinator Bio', twitter: '@ycombinator', focus: 'Startups', confidence: 'High' },
    { name: 'SOSV', twitter: '@SOSV', focus: 'Deep tech bio', confidence: 'Medium' },
    { name: '500 Global', twitter: '@500Global', focus: 'Biotech', confidence: 'Medium' },
    { name: 'Techstars Bio', twitter: '@Techstars', focus: 'Accelerators', confidence: 'Medium' },
    { name: 'HighCape Capital', twitter: '@HighCapeCap', focus: 'Life sciences', confidence: 'Medium' },
    { name: 'Bessemer Venture Partners', twitter: '@BessemerVP', focus: 'Health', confidence: 'High' },
    { name: 'GV (Google Ventures)', twitter: '@GVteam', focus: 'AI/bio', confidence: 'High' },
    { name: 'Temasek', twitter: '@Temasek', focus: 'Global bio', confidence: 'Medium' },
    { name: 'Lux Capital', twitter: '@Lux_Capital', focus: 'Frontier bio', confidence: 'High' },
    { name: 'Polaris Partners', twitter: '@PolarisVC', focus: 'Biotech', confidence: 'High' }
];

let vcCount = 0;
for (const vc of vcs) {
    insertEntity.run(
        generateId(),
        'vc',
        vc.name,
        null, // website
        vc.twitter,
        vc.focus,
        null, // funding_stage
        null, // affiliation
        null, // PI
        vc.confidence,
        JSON.stringify({ source: 'Grok Research 2025-12-31' })
    );
    vcCount++;
}
console.log(`✅ Added ${vcCount} VCs/investors\n`);

// Show summary
const totalEntities = db.prepare('SELECT COUNT(*) as count FROM tracked_entities').get();
const byType = db.prepare(`
    SELECT type, COUNT(*) as count,
           SUM(CASE WHEN confidence = 'High' THEN 1 ELSE 0 END) as high_confidence
    FROM tracked_entities
    GROUP BY type
`).all();

console.log('📊 Entity Tracking Database Summary:');
console.log(`   Total entities: ${totalEntities.count}`);
console.log('   Breakdown:');
for (const row of byType) {
    console.log(`     ${row.type}: ${row.count} (${row.high_confidence} high-confidence)`);
}

console.log('\n✅ Entity tracking database created successfully!');
console.log('\n💡 Next steps:');
console.log('   1. Implement entity mention detection in documents');
console.log('   2. Test on sample documents with known entity mentions');
console.log('   3. Add entity mention bonus to LLM scoring (already in prompt!)');

db.close();
