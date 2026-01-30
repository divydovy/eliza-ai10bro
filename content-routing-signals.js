/**
 * Content Routing Signal Detection for Multi-Site Strategy
 * Analyzes bycatch documents (8-12% alignment) for specialized site routing
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');

// Open database connection
const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
const db = sqlite3(dbPath);

/**
 * Check for investor signals (VCs, funding, deals)
 * Returns score 0-1.0, target ≥0.6 for BiologyInvestor
 */
async function checkInvestorSignals(document) {
    const content = JSON.parse(document.content).text || '';
    let score = 0;
    let reasons = [];

    // Entity mentions (40% of score)
    const mentions = db.prepare(`
        SELECT e.type, e.name
        FROM entity_mentions em
        JOIN tracked_entities e ON e.id = em.entity_id
        WHERE em.document_id = ?
    `).all(document.id);

    const hasVC = mentions.filter(m => m.type === 'vc').length;
    const hasCompany = mentions.filter(m => m.type === 'company').length;

    if (hasVC > 0) {
        score += 0.30;
        const vcNames = mentions.filter(m => m.type === 'vc').map(m => m.name).join(', ');
        reasons.push(`Mentions ${hasVC} VC(s): ${vcNames}`);
    }

    if (hasCompany > 0) {
        score += 0.10;
        reasons.push(`Mentions ${hasCompany} tracked company(ies)`);
    }

    // Funding keywords (40% of score)
    const fundingKeywords = [
        { pattern: /Series [A-D] (round|funding)/gi, weight: 0.15, name: 'Series funding round' },
        { pattern: /raised \$[\d.]+[MBK]/gi, weight: 0.15, name: 'Funding amount' },
        { pattern: /\b(IPO|acquisition|M&A|exit)\b/gi, weight: 0.10, name: 'Exit event' },
        { pattern: /valuation of \$[\d.]+[MBK]/gi, weight: 0.10, name: 'Valuation disclosed' },
        { pattern: /\b(unicorn|decacorn)\b/gi, weight: 0.05, name: 'Unicorn status' }
    ];

    for (const kw of fundingKeywords) {
        if (kw.pattern.test(content)) {
            score += kw.weight;
            reasons.push(kw.name);
        }
    }

    // Commercial milestones (20% of score)
    const milestoneKeywords = [
        { pattern: /FDA approved/gi, weight: 0.10, name: 'FDA approval' },
        { pattern: /clinical trial (Phase [I-III]|results)/gi, weight: 0.08, name: 'Clinical trial' },
        { pattern: /(commercial scale|market entry|first customer)/gi, weight: 0.08, name: 'Commercial milestone' },
        { pattern: /partnership with [A-Z]/gi, weight: 0.05, name: 'Partnership announced' }
    ];

    for (const kw of milestoneKeywords) {
        if (kw.pattern.test(content)) {
            score += kw.weight;
            reasons.push(kw.name);
        }
    }

    return {
        score: Math.min(score, 1.0), // Cap at 1.0
        reason: reasons.join(', '),
        details: { hasVC, hasCompany, keywords: reasons.length }
    };
}

/**
 * Check for research signals (labs, academic focus)
 * Returns score 0-1.0, target ≥0.6 for SyntheticBioResearch
 */
async function checkResearchSignals(document) {
    const content = JSON.parse(document.content).text || '';
    let score = 0;
    let reasons = [];

    // Entity mentions (50% of score)
    const mentions = db.prepare(`
        SELECT e.type, e.name
        FROM entity_mentions em
        JOIN tracked_entities e ON e.id = em.entity_id
        WHERE em.document_id = ?
    `).all(document.id);

    const hasLab = mentions.filter(m => m.type === 'lab').length;

    if (hasLab > 0) {
        score += 0.40;
        const labNames = mentions.filter(m => m.type === 'lab').map(m => m.name).join(', ');
        reasons.push(`Mentions ${hasLab} research lab(s): ${labNames}`);
    }

    // Academic keywords (30% of score)
    const academicKeywords = [
        { pattern: /\b(published|journal|paper|study|research)\b/gi, weight: 0.10, name: 'Academic publication' },
        { pattern: /\b(Nature|Science|Cell|PNAS)\b/gi, weight: 0.10, name: 'Top-tier journal' },
        { pattern: /\b(methodology|protocol|experimental)\b/gi, weight: 0.05, name: 'Technical focus' },
        { pattern: /\b(PhD|postdoc|professor|researcher)\b/gi, weight: 0.05, name: 'Academic credentials' }
    ];

    for (const kw of academicKeywords) {
        if (kw.pattern.test(content)) {
            score += kw.weight;
            reasons.push(kw.name);
        }
    }

    // Technical depth (20% of score)
    const technicalKeywords = [
        { pattern: /\b(strain|plasmid|vector|knockout)\b/gi, weight: 0.08, name: 'Genetic engineering terms' },
        { pattern: /\b(fermentation|bioreactor|yield|titer)\b/gi, weight: 0.08, name: 'Bioprocess terms' },
        { pattern: /\b(assay|screening|library|optimization)\b/gi, weight: 0.04, name: 'Research methods' }
    ];

    for (const kw of technicalKeywords) {
        if (kw.pattern.test(content)) {
            score += kw.weight;
            reasons.push(kw.name);
        }
    }

    return {
        score: Math.min(score, 1.0),
        reason: reasons.join(', '),
        details: { hasLab, keywords: reasons.length }
    };
}

/**
 * Check for methodology signals (protocols, procedures)
 * Returns score 0-1.0, target ≥0.6 for BioTechProtocols
 */
async function checkMethodologySignals(document) {
    const content = JSON.parse(document.content).text || '';
    let score = 0;
    let reasons = [];

    // Protocol structure (40% of score)
    const protocolKeywords = [
        { pattern: /\b(protocol|procedure|method|steps)\b/gi, weight: 0.15, name: 'Protocol language' },
        { pattern: /\b(materials|reagents|equipment)\b/gi, weight: 0.15, name: 'Materials section' },
        { pattern: /\b(step \d+|first|then|finally)\b/gi, weight: 0.10, name: 'Step-by-step structure' }
    ];

    for (const kw of protocolKeywords) {
        if (kw.pattern.test(content)) {
            score += kw.weight;
            reasons.push(kw.name);
        }
    }

    // Technical parameters (40% of score)
    const parameterKeywords = [
        { pattern: /\b\d+°C|\d+\s*degrees/gi, weight: 0.10, name: 'Temperature specs' },
        { pattern: /\bpH \d+|\d+\s*mM|\d+\s*μM/gi, weight: 0.10, name: 'Concentration specs' },
        { pattern: /\b\d+\s*min|\d+\s*hours|\d+\s*rpm/gi, weight: 0.10, name: 'Time/speed specs' },
        { pattern: /\b(incubate|centrifuge|wash|dilute)\b/gi, weight: 0.10, name: 'Lab verbs' }
    ];

    for (const kw of parameterKeywords) {
        if (kw.pattern.test(content)) {
            score += kw.weight;
            reasons.push(kw.name);
        }
    }

    // Practical focus (20% of score)
    const practicalKeywords = [
        { pattern: /\b(troubleshoot|optimization|tip|avoid|common mistake)\b/gi, weight: 0.10, name: 'Troubleshooting guidance' },
        { pattern: /\b(yield|efficiency|success rate|purity)\b/gi, weight: 0.10, name: 'Performance metrics' }
    ];

    for (const kw of practicalKeywords) {
        if (kw.pattern.test(content)) {
            score += kw.weight;
            reasons.push(kw.name);
        }
    }

    return {
        score: Math.min(score, 1.0),
        reason: reasons.join(', '),
        details: { keywords: reasons.length }
    };
}

/**
 * Check for regional signals (Boston, Bay Area, San Diego)
 * Returns score 0-1.0 + region name, target ≥0.6 for BioHub sites
 */
async function checkRegionalSignals(document) {
    const content = JSON.parse(document.content).text || '';
    let region = null;
    let score = 0;
    let reasons = [];

    const regionalPatterns = {
        boston: {
            patterns: [
                { regex: /\b(Boston|Cambridge|Massachusetts)\b/gi, weight: 0.20 },
                { regex: /\b(MIT|Harvard|Broad Institute|Wyss Institute)\b/gi, weight: 0.30 },
                { regex: /\b(Kendall Square|Seaport|Innovation District)\b/gi, weight: 0.10 }
            ]
        },
        bayarea: {
            patterns: [
                { regex: /\b(Bay Area|Silicon Valley|San Francisco|Palo Alto)\b/gi, weight: 0.20 },
                { regex: /\b(Stanford|Berkeley|UCSF|Gladstone)\b/gi, weight: 0.30 },
                { regex: /\b(Mission Bay|South San Francisco)\b/gi, weight: 0.10 }
            ]
        },
        sandiego: {
            patterns: [
                { regex: /\b(San Diego|La Jolla|Torrey Pines)\b/gi, weight: 0.20 },
                { regex: /\b(Scripps|Salk Institute|UCSD)\b/gi, weight: 0.30 },
                { regex: /\b(Biocom|San Diego Biotech)\b/gi, weight: 0.10 }
            ]
        }
    };

    for (const [regionName, config] of Object.entries(regionalPatterns)) {
        let regionScore = 0;
        let regionReasons = [];

        for (const pattern of config.patterns) {
            if (pattern.regex.test(content)) {
                regionScore += pattern.weight;
                regionReasons.push(pattern.regex.source);
            }
        }

        if (regionScore > score) {
            region = regionName;
            score = regionScore;
            reasons = regionReasons;
        }
    }

    return {
        region,
        score: Math.min(score, 1.0),
        reason: reasons.length > 0 ? `Regional mentions: ${reasons.length}` : null,
        details: { patterns_matched: reasons.length }
    };
}

/**
 * Main routing function - determines best site for document
 */
async function routeDocumentToSite(document) {
    const { alignment_score } = document;

    // Priority 1: AI10BRO (highest quality, mass market)
    if (alignment_score >= 0.12) {
        return {
            site: 'ai10bro',
            clients: ['telegram', 'bluesky', 'wordpress_insight'],
            reason: 'High alignment score',
            confidence: alignment_score
        };
    }

    // Priority 2: BiologyInvestor (investor intelligence)
    if (alignment_score >= 0.08 && alignment_score < 0.12) {
        const investorSignals = await checkInvestorSignals(document);
        if (investorSignals.score >= 0.6) {
            return {
                site: 'biologyinvestor',
                clients: ['biologyinvestor_insight'],
                reason: investorSignals.reason,
                confidence: investorSignals.score,
                details: investorSignals.details
            };
        }

        // Priority 3: SyntheticBioResearch (academic/R&D focus)
        const researchSignals = await checkResearchSignals(document);
        if (researchSignals.score >= 0.6) {
            return {
                site: 'syntheticbioresearch',
                clients: ['syntheticbioresearch_insight'],
                reason: researchSignals.reason,
                confidence: researchSignals.score,
                details: researchSignals.details
            };
        }

        // Priority 4: BioTechProtocols (methodology focus)
        const methodologySignals = await checkMethodologySignals(document);
        if (methodologySignals.score >= 0.6) {
            return {
                site: 'biotechprotocols',
                clients: ['biotechprotocols'],
                reason: methodologySignals.reason,
                confidence: methodologySignals.score,
                details: methodologySignals.details
            };
        }

        // Priority 5: Regional Hubs (geographic focus)
        const regionalSignals = await checkRegionalSignals(document);
        if (regionalSignals.region && regionalSignals.score >= 0.6) {
            return {
                site: `biohub_${regionalSignals.region}`,
                clients: [`biohub_${regionalSignals.region}`],
                reason: regionalSignals.reason,
                region: regionalSignals.region,
                confidence: regionalSignals.score,
                details: regionalSignals.details
            };
        }
    }

    // Below threshold or no matching signals
    return {
        site: null,
        clients: [],
        reason: 'Below quality threshold or no matching signals'
    };
}

module.exports = {
    checkInvestorSignals,
    checkResearchSignals,
    checkMethodologySignals,
    checkRegionalSignals,
    routeDocumentToSite
};
