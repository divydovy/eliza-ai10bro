#!/usr/bin/env node

const Database = require('better-sqlite3');
const crypto = require('crypto');

const db = new Database('./agent/data/db.sqlite');

console.log('💰 Entity Deal Detection System\n');

function generateId() {
    return crypto.randomBytes(16).toString('hex');
}

// Pattern libraries for different deal types
const patterns = {
    funding: {
        amount: [
            /\$\s*([\d,.]+)\s*(million|billion|M|B)\s*(Series\s+[A-Z]|seed|pre-seed|funding|round|investment)/gi,
            /(raised|secured|closed|announced)\s*\$\s*([\d,.]+)\s*(million|billion|M|B)/gi,
            /\$\s*([\d,.]+)\s*([MB])\s*(Series\s+[A-Z]|round)/gi
        ],
        stage: [
            /Series\s+([A-Z])/gi,
            /(pre-seed|seed|Series\s+[A-Z]|growth|late-stage)\s+(funding|round|investment)/gi
        ],
        investor: [
            /led\s+by\s+([A-Z][a-zA-Z\s&]+?)(?:\s+and|\s*,|\s*\.|\s+with)/gi,
            /from\s+([A-Z][a-zA-Z\s&]+?)(?:\s+and|\s*,|\s*\.)/gi,
            /investors?\s+including\s+([A-Z][a-zA-Z\s&,]+)/gi,
            /participation\s+from\s+([A-Z][a-zA-Z\s&,]+)/gi
        ]
    },

    product: {
        launch: [
            /(launches|launched|announces|announced|unveils|unveiled|introduces|introduced)\s+([A-Z][a-zA-Z0-9™®]+)/gi,
            /(product|platform|technology|system|material)\s+(called|named)\s+([A-Z][a-zA-Z0-9™®]+)/gi
        ],
        regulatory: [
            /(FDA|GRAS|EMA|EPA)\s+(approval|clearance|status|granted|approved)/gi,
            /(Phase\s+[I-III]|clinical\s+trial)\s+(results|approval|completion)/gi
        ]
    },

    milestone: {
        scale: [
            /achieves?\s+(\d+x|\d+-fold|\d+%)\s+(scale-up|increase|improvement|growth)/gi,
            /(\d+x|\d+-fold)\s+(production|capacity|output|yield)/gi,
            /(commercial\s+scale|pilot\s+scale|full\s+scale)\s+(production|manufacturing|deployment)/gi
        ],
        performance: [
            /conversion\s+rate\s+of\s+(\d+%|over\s+\d+%)/gi,
            /efficiency\s+of\s+(\d+%)/gi,
            /reduces?\s+costs?\s+by\s+(\d+%)/gi
        ]
    },

    partnership: {
        collaboration: [
            /(partners|partnered|partnership)\s+with\s+([A-Z][a-zA-Z\s&]+)/gi,
            /(collaboration|collaborates|collaborated)\s+with\s+([A-Z][a-zA-Z\s&]+)/gi,
            /(signs|signed)\s+(agreement|contract|deal)\s+with\s+([A-Z][a-zA-Z\s&]+)/gi
        ]
    },

    ma: {
        acquisition: [
            /(acquires|acquired|acquisition\s+of)\s+([A-Z][a-zA-Z\s]+)/gi,
            /([A-Z][a-zA-Z\s&]+)\s+(acquires|acquired)\s+([A-Z][a-zA-Z\s]+)/gi
        ],
        merger: [
            /(merges|merged|merger)\s+with\s+([A-Z][a-zA-Z\s&]+)/gi
        ]
    }
};

// Get entities for context
const entities = db.prepare('SELECT id, name, type FROM tracked_entities').all();
const entityMap = new Map(entities.map(e => [e.name.toLowerCase(), e]));

function parseAmount(amountStr) {
    // Convert "$125M" or "$1.5B" to numeric USD
    const match = amountStr.match(/([\d,.]+)\s*([MBK]|million|billion)/i);
    if (!match) return null;

    let value = parseFloat(match[1].replace(/,/g, ''));
    const unit = match[2].toUpperCase()[0];

    if (unit === 'K') value *= 1_000;
    else if (unit === 'M') value *= 1_000_000;
    else if (unit === 'B') value *= 1_000_000_000;

    return Math.round(value);
}

function normalizeRoundStage(stage) {
    stage = stage.toLowerCase().replace(/[^a-z0-9]/g, '');

    const mapping = {
        'preseed': 'pre-seed',
        'seed': 'seed',
        'seriesa': 'series_a',
        'seriesb': 'series_b',
        'seriesc': 'series_c',
        'seriesd': 'series_d',
        'seriese': 'series_e',
        'growth': 'growth',
        'latestage': 'late-stage'
    };

    return mapping[stage] || stage;
}

function findEntityInText(text, position, window = 200) {
    // Look for entity mentions near the match position
    const start = Math.max(0, position - window);
    const end = Math.min(text.length, position + window);
    const contextText = text.substring(start, end).toLowerCase();

    for (const [name, entity] of entityMap) {
        if (contextText.includes(name)) {
            return entity;
        }
    }

    return null;
}

function extractDeals(document) {
    const text = document.content.text || '';
    const deals = [];

    // Extract funding rounds
    for (const pattern of patterns.funding.amount) {
        const matches = [...text.matchAll(pattern)];

        for (const match of matches) {
            const amount = parseAmount(match[0]);
            if (!amount) continue;

            // Find associated company
            const company = findEntityInText(text, match.index);
            if (!company || company.type !== 'company') continue;

            // Find round stage
            let stage = null;
            for (const stagePattern of patterns.funding.stage) {
                const stageMatch = match[0].match(stagePattern);
                if (stageMatch) {
                    stage = normalizeRoundStage(stageMatch[0]);
                    break;
                }
            }

            // Find lead investor
            let leadInvestor = null;
            for (const investorPattern of patterns.funding.investor) {
                const investorMatches = [...text.substring(match.index, match.index + 300).matchAll(investorPattern)];
                if (investorMatches.length > 0) {
                    const investorName = investorMatches[0][1].trim();
                    const investor = entityMap.get(investorName.toLowerCase());
                    if (investor && investor.type === 'vc') {
                        leadInvestor = investor;
                        break;
                    }
                }
            }

            deals.push({
                type: 'funding',
                company_id: company.id,
                company_name: company.name,
                amount_usd: amount,
                round_stage: stage,
                lead_investor_id: leadInvestor?.id,
                lead_investor_name: leadInvestor?.name,
                context: match[0],
                position: match.index
            });
        }
    }

    // Extract product launches
    for (const pattern of patterns.product.launch) {
        const matches = [...text.matchAll(pattern)];

        for (const match of matches) {
            const productName = match[2] || match[3];
            if (!productName || productName.length < 3) continue;

            const company = findEntityInText(text, match.index);
            if (!company || company.type !== 'company') continue;

            // Check if it's a regulatory approval
            let regulatory = null;
            for (const regPattern of patterns.product.regulatory) {
                const regMatch = text.substring(Math.max(0, match.index - 100), match.index + 300).match(regPattern);
                if (regMatch) {
                    regulatory = regMatch[0];
                    break;
                }
            }

            deals.push({
                type: 'product',
                company_id: company.id,
                company_name: company.name,
                product_name: productName,
                regulatory_mention: regulatory,
                context: match[0],
                position: match.index
            });
        }
    }

    // Extract milestones
    for (const pattern of patterns.milestone.scale) {
        const matches = [...text.matchAll(pattern)];

        for (const match of matches) {
            const company = findEntityInText(text, match.index);
            if (!company || company.type !== 'company') continue;

            const metric = match[1];
            const type = match[2];

            deals.push({
                type: 'milestone',
                milestone_category: 'production_scale',
                company_id: company.id,
                company_name: company.name,
                metric_description: `${metric} ${type}`,
                context: match[0],
                position: match.index
            });
        }
    }

    // Extract partnerships
    for (const pattern of patterns.partnership.collaboration) {
        const matches = [...text.matchAll(pattern)];

        for (const match of matches) {
            const company = findEntityInText(text, match.index);
            if (!company || company.type !== 'company') continue;

            const partnerName = match[2];
            const partner = entityMap.get(partnerName.toLowerCase());

            deals.push({
                type: 'partnership',
                company_id: company.id,
                company_name: company.name,
                partner_name: partnerName,
                partner_id: partner?.id,
                context: match[0],
                position: match.index
            });
        }
    }

    return deals;
}

function scoreDocument(document) {
    // Score document based on deal content
    const text = document.content.text || '';
    let score = 0;

    // High-value keywords
    const highValue = ['funding', 'raised', 'series', 'million', 'billion', 'acquisition', 'partnership', 'approval', 'launches'];
    for (const keyword of highValue) {
        if (text.toLowerCase().includes(keyword)) score += 10;
    }

    // Entity mentions
    for (const [name] of entityMap) {
        if (text.toLowerCase().includes(name)) score += 15;
    }

    return Math.min(score, 100);
}

// Main execution
const args = process.argv.slice(2);
const mode = args[0] || 'sample';

let docs;
if (mode === 'sample') {
    console.log('🎯 Running in SAMPLE mode (1000 high-scoring documents)...\n');
    docs = db.prepare(`
        SELECT id, content
        FROM memories
        WHERE type = 'documents'
        AND alignment_score >= 0.30
        ORDER BY alignment_score DESC
        LIMIT 1000
    `).all();
} else if (mode === 'high') {
    console.log('🎯 Running in HIGH-SCORING mode (documents >= 50% alignment)...\n');
    docs = db.prepare(`
        SELECT id, content
        FROM memories
        WHERE type = 'documents'
        AND alignment_score >= 0.50
        ORDER BY alignment_score DESC
    `).all();
} else {
    console.error('❌ Invalid mode. Use: sample or high');
    process.exit(1);
}

console.log(`📚 Processing ${docs.length} documents...\n`);

const allDeals = [];
let processedCount = 0;

for (const doc of docs) {
    try {
        const content = JSON.parse(doc.content);
        doc.content = content;

        const deals = extractDeals(doc);

        if (deals.length > 0) {
            for (const deal of deals) {
                deal.source_document_id = doc.id;
                allDeals.push(deal);
            }

            console.log(`  ✅ Doc ${doc.id.substring(0, 8)}... : ${deals.length} deals found`);
            deals.forEach(d => {
                if (d.type === 'funding') {
                    console.log(`     💰 ${d.company_name}: $${(d.amount_usd / 1_000_000).toFixed(1)}M ${d.round_stage || ''} ${d.lead_investor_name ? `(${d.lead_investor_name})` : ''}`);
                } else if (d.type === 'product') {
                    console.log(`     🚀 ${d.company_name}: ${d.product_name} ${d.regulatory_mention ? `(${d.regulatory_mention})` : ''}`);
                } else if (d.type === 'milestone') {
                    console.log(`     📊 ${d.company_name}: ${d.metric_description}`);
                } else if (d.type === 'partnership') {
                    console.log(`     🤝 ${d.company_name} + ${d.partner_name}`);
                }
            });
        }

        processedCount++;
        if (processedCount % 100 === 0) {
            console.log(`  📊 Progress: ${processedCount}/${docs.length} documents...`);
        }

    } catch (error) {
        console.error(`  ❌ Error processing doc ${doc.id}:`, error.message);
    }
}

// Summary statistics
console.log(`\n📊 Deal Extraction Summary:`);
console.log(`   Processed: ${processedCount} documents`);
console.log(`   Total deals found: ${allDeals.length}`);

const byType = {};
for (const deal of allDeals) {
    byType[deal.type] = (byType[deal.type] || 0) + 1;
}

console.log(`\n   By Type:`);
for (const [type, count] of Object.entries(byType)) {
    console.log(`     ${type}: ${count}`);
}

// Show top deals
console.log(`\n   🏆 Top 10 Funding Deals:`);
const topFunding = allDeals
    .filter(d => d.type === 'funding' && d.amount_usd)
    .sort((a, b) => b.amount_usd - a.amount_usd)
    .slice(0, 10);

for (const deal of topFunding) {
    console.log(`     $${(deal.amount_usd / 1_000_000).toFixed(1)}M - ${deal.company_name} ${deal.round_stage || ''} ${deal.lead_investor_name ? `(led by ${deal.lead_investor_name})` : ''}`);
}

// Save deals to a JSON file for review
const fs = require('fs');
fs.writeFileSync('detected-deals.json', JSON.stringify(allDeals, null, 2));
console.log(`\n💾 Saved all deals to detected-deals.json`);

console.log('\n✅ Deal detection complete!');
console.log('\n💡 Next steps:');
console.log('   1. Review detected-deals.json for accuracy');
console.log('   2. node import-deals-to-database.js  # Import validated deals');
console.log('   3. node generate-entity-focused-broadcasts.js  # Create entity-aware content');

db.close();
