#!/usr/bin/env node

/**
 * Add website URLs to tracked entities (labs and VCs)
 *
 * Usage: node add-entity-websites.js
 */

import Database from 'better-sqlite3';

const db = new Database('agent/data/db.sqlite');

// Research labs with websites
const LAB_WEBSITES = {
    'Broad Institute': 'https://www.broadinstitute.org',
    'Wyss Institute': 'https://wyss.harvard.edu',
    'Salk Institute': 'https://www.salk.edu',
    'Gladstone Institutes': 'https://gladstone.org',
    'J. Craig Venter Institute': 'https://www.jcvi.org',
    'MIT Media Lab': 'https://www.media.mit.edu',
    'Stanford Bio-X': 'https://biox.stanford.edu',
    'Berkeley Synthetic Biology Institute': 'https://synbio.berkeley.edu',
    'Imperial College Centre for Synthetic Biology': 'https://www.imperial.ac.uk/synthetic-biology',
    'ETH Zurich D-BSSE': 'https://bsse.ethz.ch',
    'University of Edinburgh SynthSys': 'https://www.ed.ac.uk/biology/synthsys',
    'JBEI': 'https://www.jbei.org',
    'Lawrence Berkeley National Lab': 'https://www.lbl.gov',
    'Caltech (Frances Arnold)': 'https://www.che.caltech.edu/groups/frances-arnold-lab',
    'MIT BioBricks': 'https://parts.igem.org',
    'NIST': 'https://www.nist.gov',
    'Macquarie University': 'https://www.mq.edu.au',
    'iGEM Foundation': 'https://igem.org',
    'BioBricks Foundation': 'https://biobricks.org',
    'OpenPlant': 'https://www.openplant.org',
    'Stanford CRISPR Lab (Jennifer Doudna)': 'https://doudnalab.org',
    'Harvard Wyss Institute': 'https://wyss.harvard.edu',
    'MIT Synthetic Biology Center': 'https://synbio.mit.edu',
    'UCSF Center for Systems Biology': 'https://csbi.ucsf.edu',
    'Innovative Genomics Institute': 'https://innovativegenomics.org',
    'Genome Project-write': 'https://engineeringbiologycenter.org',
    'Living Computing Project': 'https://www.programmingbiology.org',
    'SynBioBeta': 'https://synbiobeta.com',
    'BioBuilder': 'https://biobuilder.org',
    'SynBERC': 'https://synberc.org',
};

// Venture Capital firms with websites
const VC_WEBSITES = {
    'ARCH Venture Partners': 'https://www.archventure.com',
    'Flagship Pioneering': 'https://www.flagshippioneering.com',
    'a16z bio fund': 'https://a16z.com/bio',
    'Khosla Ventures': 'https://www.khoslaventures.com',
    'OrbiMed': 'https://www.orbimed.com',
    'Sofinnova Ventures': 'https://www.sofinnovapartners.com',
    'Frazier Life Sciences': 'https://frazierlifesciences.com',
    'Third Rock Ventures': 'https://www.thirdrockventures.com',
    'Pear Ventures': 'https://pear.vc',
    'Y Combinator': 'https://www.ycombinator.com',
    'SOSV IndieBio': 'https://indiebio.co',
    'Fifty Years': 'https://fifty.vc',
    'Lux Capital': 'https://luxcapital.com',
    'Two Sigma Ventures': 'https://www.twosigmaventures.com',
    'Felicis Ventures': 'https://www.felicis.com',
    'Data Collective (DCVC)': 'https://dcvc.com',
    'OS Fund': 'https://osfund.co',
    'Breakout Labs (Thiel Foundation)': 'https://www.breakoutlabs.org',
    'Boom Capital': 'https://boom.capital',
    'Agent Capital': 'https://www.agentcapital.vc',
};

console.log('🔗 Adding website URLs to tracked entities\n');

let labsUpdated = 0;
let vcsUpdated = 0;

// Update labs
console.log('📚 Updating research labs...');
for (const [name, website] of Object.entries(LAB_WEBSITES)) {
    const result = db.prepare(`
        UPDATE tracked_entities
        SET website = ?
        WHERE name = ? AND type = 'lab'
    `).run(website, name);

    if (result.changes > 0) {
        console.log(`  ✅ ${name} → ${website}`);
        labsUpdated++;
    } else {
        console.log(`  ⚠️  ${name} not found in database`);
    }
}

console.log('');

// Update VCs
console.log('💰 Updating venture capital firms...');
for (const [name, website] of Object.entries(VC_WEBSITES)) {
    const result = db.prepare(`
        UPDATE tracked_entities
        SET website = ?
        WHERE name = ? AND type = 'vc'
    `).run(website, name);

    if (result.changes > 0) {
        console.log(`  ✅ ${name} → ${website}`);
        vcsUpdated++;
    } else {
        console.log(`  ⚠️  ${name} not found in database`);
    }
}

console.log('\n📊 Summary:');
console.log(`  Labs updated: ${labsUpdated}/${Object.keys(LAB_WEBSITES).length}`);
console.log(`  VCs updated: ${vcsUpdated}/${Object.keys(VC_WEBSITES).length}`);
console.log(`  Total: ${labsUpdated + vcsUpdated} entities with websites`);

// Show final stats
const stats = db.prepare(`
    SELECT type,
           COUNT(*) as total,
           SUM(CASE WHEN website IS NOT NULL AND website != '' THEN 1 ELSE 0 END) as with_website
    FROM tracked_entities
    GROUP BY type
`).all();

console.log('\n📈 Entity website coverage:');
for (const stat of stats) {
    const percentage = Math.round((stat.with_website / stat.total) * 100);
    console.log(`  ${stat.type}: ${stat.with_website}/${stat.total} (${percentage}%)`);
}

console.log('\n✅ Website URLs added! Ready for RSS discovery.');
