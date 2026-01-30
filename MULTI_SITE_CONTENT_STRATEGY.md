# Multiple Sites Content Strategy & Implementation

**Date**: 2026-01-22
**Purpose**: Content generation, routing, and quality strategy for monetizing bycatch across specialized sites

## Executive Summary

AI10BRO discards 4,500 documents (8-12% alignment) with valuable signals for specialized audiences. This document focuses on the **content generation and routing strategy** for multiple independent sites pulling from the same Eliza database.

**Key Principle**: Same documents, different filters, different editorial angles.

---

## 1. Content Routing Strategy

### 1.1 Current State (AI10BRO Only)

```javascript
// process-unprocessed-docs.js (current)
async function shouldGenerateBroadcast(document) {
    return document.alignment_score >= 0.12; // 12% threshold
}

// Result: 239 broadcast-ready documents from 38K+ total
// Discard: 4,500 documents (8-12% alignment)
```

### 1.2 Proposed Multi-Site Routing

**Exclusive Routing** (each document goes to ONE site only):

```javascript
// process-unprocessed-docs.js (proposed)
async function routeDocumentToSite(document) {
    const { alignment_score, entity_mentions, keywords } = await analyzeDocument(document);

    // Priority 1: AI10BRO (highest quality, mass market)
    if (alignment_score >= 0.12) {
        return {
            site: 'ai10bro',
            clients: ['telegram', 'bluesky', 'wordpress_insight'],
            reason: 'High alignment score'
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
                confidence: investorSignals.score
            };
        }
    }

    // Priority 3: SyntheticBioResearch (academic/R&D focus)
    if (alignment_score >= 0.08 && alignment_score < 0.12) {
        const researchSignals = await checkResearchSignals(document);
        if (researchSignals.score >= 0.6) {
            return {
                site: 'syntheticbioresearch',
                clients: ['syntheticbioresearch_insight'],
                reason: researchSignals.reason,
                confidence: researchSignals.score
            };
        }
    }

    // Priority 4: BioTechProtocols (methodology focus)
    if (alignment_score >= 0.08 && alignment_score < 0.12) {
        const methodologySignals = await checkMethodologySignals(document);
        if (methodologySignals.score >= 0.6) {
            return {
                site: 'biotechprotocols',
                clients: ['biotechprotocols'],
                reason: methodologySignals.reason,
                confidence: methodologySignals.score
            };
        }
    }

    // Priority 5: Regional Hubs (geographic focus)
    if (alignment_score >= 0.08 && alignment_score < 0.12) {
        const regionalSignals = await checkRegionalSignals(document);
        if (regionalSignals.region && regionalSignals.score >= 0.6) {
            return {
                site: `biohub_${regionalSignals.region}`,
                clients: [`biohub_${regionalSignals.region}`],
                reason: regionalSignals.reason,
                region: regionalSignals.region,
                confidence: regionalSignals.score
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
```

### 1.3 Signal Detection Functions

#### Investor Signals

```javascript
async function checkInvestorSignals(document) {
    const content = JSON.parse(document.content).text || '';
    let score = 0;
    let reasons = [];

    // Entity mentions (40% of score)
    const mentions = await db.prepare(`
        SELECT e.type, e.name
        FROM entity_mentions em
        JOIN tracked_entities e ON e.id = em.entity_id
        WHERE em.document_id = ?
    `).all(document.id);

    const hasVC = mentions.filter(m => m.type === 'vc').length;
    const hasCompany = mentions.filter(m => m.type === 'company').length;

    if (hasVC > 0) {
        score += 0.30;
        reasons.push(`Mentions ${hasVC} VC(s): ${mentions.filter(m => m.type === 'vc').map(m => m.name).join(', ')}`);
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
```

#### Research Signals

```javascript
async function checkResearchSignals(document) {
    const content = JSON.parse(document.content).text || '';
    let score = 0;
    let reasons = [];

    // Entity mentions (50% of score)
    const mentions = await db.prepare(`
        SELECT e.type, e.name
        FROM entity_mentions em
        JOIN tracked_entities e ON e.id = em.entity_id
        WHERE em.document_id = ?
    `).all(document.id);

    const hasLab = mentions.filter(m => m.type === 'lab').length;

    if (hasLab > 0) {
        score += 0.40;
        reasons.push(`Mentions ${hasLab} research lab(s): ${mentions.filter(m => m.type === 'lab').map(m => m.name).join(', ')}`);
    }

    // Academic indicators (30% of score)
    const academicKeywords = [
        { pattern: /\b(published in|journal|peer-reviewed|preprint)\b/gi, weight: 0.15, name: 'Academic publication' },
        { pattern: /\b(PhD|postdoc|principal investigator|PI)\b/gi, weight: 0.10, name: 'Academic credentials' },
        { pattern: /\b(Nature|Science|Cell|PNAS|bioRxiv)\b/gi, weight: 0.10, name: 'High-impact journal' }
    ];

    for (const kw of academicKeywords) {
        if (kw.pattern.test(content)) {
            score += kw.weight;
            reasons.push(kw.name);
        }
    }

    // Technical depth (20% of score)
    const technicalTerms = [
        'CRISPR', 'fermentation', 'genome editing', 'protein engineering',
        'synthetic pathway', 'metabolic engineering', 'cell-free', 'directed evolution',
        'transcription factor', 'promoter', 'ribosome', 'plasmid'
    ];

    const technicalCount = technicalTerms.filter(term =>
        new RegExp(`\\b${term}\\b`, 'gi').test(content)
    ).length;

    if (technicalCount >= 3) {
        score += 0.20;
        reasons.push(`High technical depth (${technicalCount} technical terms)`);
    } else if (technicalCount >= 2) {
        score += 0.10;
        reasons.push(`Moderate technical depth (${technicalCount} technical terms)`);
    }

    return {
        score: Math.min(score, 1.0),
        reason: reasons.join(', '),
        details: { hasLab, technicalCount, keywords: reasons.length }
    };
}
```

#### Methodology Signals

```javascript
async function checkMethodologySignals(document) {
    const content = JSON.parse(document.content).text || '';
    let score = 0;
    let reasons = [];

    // Protocol/method keywords (60% of score)
    const methodologyKeywords = [
        { pattern: /\b(protocol|methodology|procedure|workflow)\b/gi, weight: 0.20, name: 'Protocol/methodology' },
        { pattern: /\b(step-by-step|instructions|how to)\b/gi, weight: 0.15, name: 'Instructional content' },
        { pattern: /\b(troubleshooting|optimization|improvement)\b/gi, weight: 0.10, name: 'Practical guidance' },
        { pattern: /\b(equipment|reagent|material|supply)\b/gi, weight: 0.10, name: 'Materials/equipment' },
        { pattern: /\b(yield|efficiency|purity|concentration)\b/gi, weight: 0.05, name: 'Quantitative metrics' }
    ];

    for (const kw of methodologyKeywords) {
        if (kw.pattern.test(content)) {
            score += kw.weight;
            reasons.push(kw.name);
        }
    }

    // Structured content indicators (30% of score)
    const structuredPatterns = [
        { pattern: /(Step \d+:|Materials:|Procedure:|Results:)/gi, weight: 0.15, name: 'Structured sections' },
        { pattern: /(\d+\.\s+[A-Z]|\d+\)\s+[A-Z])/g, weight: 0.10, name: 'Numbered steps' },
        { pattern: /(Figure \d+|Table \d+|Supplementary)/gi, weight: 0.05, name: 'Figures/tables' }
    ];

    for (const kw of structuredPatterns) {
        if (kw.pattern.test(content)) {
            score += kw.weight;
            reasons.push(kw.name);
        }
    }

    // Practical application (10% of score)
    if (/\b(applied|practical|implementation|tested)\b/gi.test(content)) {
        score += 0.10;
        reasons.push('Practical application');
    }

    return {
        score: Math.min(score, 1.0),
        reason: reasons.join(', '),
        details: { keywords: reasons.length }
    };
}
```

#### Regional Signals

```javascript
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
```

---

## 2. Content Generation Prompts

### 2.1 AI10BRO (Existing - Mass Market)

**Current Prompt** (already working):
- Tone: Accessible, educational, inspiring
- Audience: General biotech enthusiasts, students, entrepreneurs
- Focus: "What's possible", breakthroughs, trends
- Length: 800-1200 words (Daily Insights)

**No changes needed** - keep existing wordpress-prompts.json

### 2.2 BiologyInvestor (New - Investor Intelligence)

**File**: `biologyinvestor-prompts.json`

```json
{
  "daily_insight": {
    "system": "You are an investment analyst writing for BiologyInvestor, a biotech deal flow intelligence platform. Your readers are venture capitalists, corporate development teams, and biotech investors conducting due diligence.",
    "user_prompt": "Analyze this biotech development from an investment perspective. Write an 800-1200 word Daily Insight.\n\n**INVESTMENT LENS**: Focus on commercial viability, market size, competitive position, exit potential, and risk factors. Avoid scientific jargon unless essential to the investment thesis.\n\n**STRUCTURE**:\n\n1. **INVESTMENT THESIS** (150-200 words)\n   - Why this matters to investors (one clear sentence)\n   - Market opportunity size and timing\n   - Key value drivers\n   - Quick take: Buy signal, watch, or pass\n\n2. **THE OPPORTUNITY** (300-400 words)\n   - TAM/SAM/SOM analysis (total addressable market)\n   - Technology readiness level (TRL)\n   - Regulatory pathway and timeline\n   - Revenue model and unit economics\n   - Comparable valuations (if available)\n\n3. **COMPETITIVE POSITION** (200-300 words)\n   - Key competitors and their approaches\n   - Differentiation and moats (IP, data, relationships)\n   - First-mover advantage or fast-follower?\n   - Strategic acquirers likely interested\n\n4. **RISKS & CONSIDERATIONS** (150-200 words)\n   - Technical risk (can it work at scale?)\n   - Regulatory risk (FDA/EPA approval pathway)\n   - Market risk (will customers pay?)\n   - Team risk (who's running this?)\n   - Funding risk (burn rate, runway)\n\n5. **WHAT TO WATCH** (100-150 words)\n   - Next 6-12 month milestones\n   - Catalysts (trial results, partnerships, fundraises)\n   - Red flags that would change the thesis\n\n**TONE**: Professional, analytical, data-driven. Avoid hype. Be skeptical but fair. Like reading a Pitchbook tearsheet.\n\n**SOURCES**: Cite deal sizes, valuations, and market data where available.\n\n**OUTPUT FORMAT**: Return JSON:\n{\n  \"title\": \"Investment-focused headline (e.g., 'Company X Raises $50M Series B to Scale Bio-Concrete Technology')\",\n  \"excerpt\": \"150-160 char investment angle summary\",\n  \"content\": \"<p>Full article in HTML with <h2> for main sections</p>\",\n  \"type\": \"daily_insight\"\n}\n\n**DOCUMENT**:\n{document_text}"
  },
  "weekly_deepdive": {
    "system": "You are a senior biotech investment analyst writing in-depth due diligence reports for BiologyInvestor.",
    "user_prompt": "Write a comprehensive 2000-3000 word investment analysis (Deep Dive format) on this biotech development.\n\n**DEEP DIVE STRUCTURE**:\n\n1. **EXECUTIVE SUMMARY** (300 words)\n   - Investment recommendation (Buy/Hold/Pass)\n   - Key thesis points\n   - Valuation estimate and exit scenarios\n\n2. **MARKET ANALYSIS** (500-700 words)\n   - Market size and growth trajectory\n   - Customer segments and adoption curve\n   - Pricing power and margin potential\n   - Competitive dynamics and market share analysis\n\n3. **TECHNOLOGY ASSESSMENT** (400-500 words)\n   - How it works (in investor-friendly terms)\n   - Technology risks and validation status\n   - Scalability and manufacturing considerations\n   - IP landscape and freedom to operate\n\n4. **BUSINESS MODEL & ECONOMICS** (400-500 words)\n   - Revenue streams and monetization strategy\n   - Unit economics and path to profitability\n   - Capital intensity and working capital needs\n   - Comparable company analysis\n\n5. **REGULATORY & COMMERCIAL PATH** (300-400 words)\n   - Regulatory pathway and timeline\n   - Clinical/field trial requirements\n   - Go-to-market strategy\n   - Partnership and distribution strategy\n\n6. **MANAGEMENT & TEAM** (200-300 words)\n   - Founder backgrounds and track record\n   - Key hires and advisory board\n   - Board composition and governance\n\n7. **FINANCIAL ANALYSIS** (300-400 words)\n   - Funding history and current valuation\n   - Burn rate and runway\n   - Next funding round timing and size\n   - Exit comparables (M&A multiples, IPO benchmarks)\n\n8. **INVESTMENT RECOMMENDATION** (200 words)\n   - Rating and rationale\n   - Price target or valuation range\n   - Key risks and upside scenarios\n   - Position sizing recommendation\n\n**TONE**: Institutional-grade analysis. Like reading a Morgan Stanley research report.\n\n**OUTPUT FORMAT**: Same JSON structure as daily_insight.\n\n**DOCUMENT**:\n{document_text}"
  }
}
```

### 2.3 SyntheticBioResearch (New - Academic/R&D Focus)

**File**: `syntheticbioresearch-prompts.json`

```json
{
  "daily_insight": {
    "system": "You are a scientific editor writing for SyntheticBioResearch, an R&D intelligence platform for academic researchers, corporate R&D teams, and technical consultants.",
    "user_prompt": "Write an 800-1200 word Research Insight analyzing this development from a technical and scientific perspective.\n\n**RESEARCH LENS**: Focus on methodology, technical novelty, reproducibility, and implications for the field. Assume PhD-level audience.\n\n**STRUCTURE**:\n\n1. **RESEARCH SIGNIFICANCE** (150-200 words)\n   - Key finding or breakthrough\n   - Why this matters to the field\n   - How it advances the state-of-the-art\n   - Research group and institution\n\n2. **TECHNICAL APPROACH** (300-400 words)\n   - Methodology and experimental design\n   - Novel techniques or tools used\n   - Key innovations in the approach\n   - Advantages over previous methods\n   - Technical details (strains, conditions, equipment)\n\n3. **RESULTS & IMPLICATIONS** (250-300 words)\n   - Key findings and data\n   - Performance metrics (yield, efficiency, etc.)\n   - Comparison to previous benchmarks\n   - Statistical significance and reproducibility\n   - Potential applications\n\n4. **RESEARCH CONTEXT** (150-200 words)\n   - How this builds on prior work\n   - Related research from other groups\n   - Convergence with other trends\n   - Gaps this fills in the literature\n\n5. **WHAT'S NEXT** (100-150 words)\n   - Next research steps\n   - Technical challenges to overcome\n   - Timeline to application\n   - Labs/companies likely to build on this\n\n**TONE**: Technical, rigorous, peer-review quality. Use scientific terminology. Cite methods, metrics, and comparisons.\n\n**OUTPUT FORMAT**: Return JSON:\n{\n  \"title\": \"Technical headline (e.g., 'Novel CRISPR Base Editor Achieves 99.9% On-Target Efficiency in Mammalian Cells')\",\n  \"excerpt\": \"150-160 char technical summary\",\n  \"content\": \"<p>Full article in HTML with <h2> for main sections</p>\",\n  \"type\": \"daily_insight\"\n}\n\n**DOCUMENT**:\n{document_text}"
  }
}
```

### 2.4 BioTechProtocols (New - Methodology Focus)

**File**: `biotechprotocols-prompts.json`

```json
{
  "protocol": {
    "system": "You are writing practical methodology guides for BioTechProtocols, a hands-on resource for lab technicians, startup scientists, and CRO professionals.",
    "user_prompt": "Extract and present the practical methodology from this document as a clear, actionable protocol. Target audience: Working scientists who need to implement this.\n\n**STRUCTURE**:\n\n1. **PROTOCOL OVERVIEW** (150 words)\n   - What this protocol does\n   - Key applications\n   - Difficulty level and time required\n   - Special equipment or skills needed\n\n2. **MATERIALS & EQUIPMENT** (200-300 words)\n   - Reagents and their specifications\n   - Equipment and models\n   - Software or computational tools\n   - Safety considerations\n\n3. **STEP-BY-STEP PROCEDURE** (400-600 words)\n   - Numbered steps with substeps\n   - Timing for each step\n   - Critical parameters (temperature, pH, concentration)\n   - Quality control checkpoints\n   - Common pitfalls to avoid\n\n4. **TROUBLESHOOTING** (200-250 words)\n   - Common problems and solutions\n   - Optimization tips\n   - Alternative approaches if it fails\n   - Expected results vs failure modes\n\n5. **APPLICATIONS & VARIATIONS** (100-150 words)\n   - Use cases where this protocol applies\n   - Modifications for different organisms/systems\n   - Related protocols\n\n**TONE**: Practical, how-to, cookbook-style. Like reading a Nature Protocols article but more accessible.\n\n**OUTPUT FORMAT**: Return JSON:\n{\n  \"title\": \"Protocol-focused title (e.g., 'High-Efficiency CRISPR Base Editing Protocol for Mammalian Cells')\",\n  \"excerpt\": \"150-160 char practical summary\",\n  \"content\": \"<p>Full protocol in HTML with <h2> for main sections, use <ol> for numbered steps</p>\",\n  \"type\": \"protocol\"\n}\n\n**DOCUMENT**:\n{document_text}"
  }
}
```

### 2.5 Regional Hubs (New - Geographic Focus)

**File**: `biohub-prompts.json`

```json
{
  "boston": {
    "system": "You are a local biotech journalist writing for BostonBio, covering the Boston/Cambridge biotech ecosystem.",
    "user_prompt": "Write an 800-1200 word article about this Boston-area biotech development.\n\n**LOCAL LENS**: Focus on Boston/Cambridge companies, institutions, funding, and talent. Highlight local connections.\n\n**STRUCTURE**:\n\n1. **LOCAL ANGLE** (150-200 words)\n   - What happened and where\n   - Boston/Cambridge company or institution involved\n   - Local significance\n\n2. **THE DEVELOPMENT** (300-400 words)\n   - Details of the breakthrough/funding/partnership\n   - Technology or science involved\n   - Commercial or research implications\n\n3. **ECOSYSTEM CONTEXT** (250-300 words)\n   - How this fits into Boston biotech scene\n   - Related activity in the area\n   - Connections to local institutions (MIT, Harvard, etc.)\n   - Local funding sources or partnerships\n\n4. **TALENT & JOBS** (100-150 words)\n   - Hiring plans or team growth\n   - Key people (if local)\n   - Career opportunities\n\n5. **WHAT'S NEXT** (100-150 words)\n   - Next milestones for this company/lab\n   - Impact on Boston biotech cluster\n\n**TONE**: Local, insider perspective. Like reading Boston Business Journal biotech coverage.\n\n**OUTPUT FORMAT**: Return JSON with standard structure.\n\n**DOCUMENT**:\n{document_text}"
  }
}
```

---

## 3. Quality Validation Gates

### 3.1 Pre-Generation Quality Check

Before generating broadcast content, validate document quality:

```javascript
async function validateDocumentQuality(document, targetSite) {
    // Base alignment score check
    if (document.alignment_score < 0.08) {
        return { valid: false, reason: 'Below minimum alignment threshold' };
    }

    // Site-specific signal strength check
    const signals = await getSignalsForSite(document, targetSite);
    if (signals.score < 0.6) {
        return { valid: false, reason: `Weak ${targetSite} signals (${signals.score})` };
    }

    // Content length check (need enough text for LLM)
    const content = JSON.parse(document.content).text || '';
    if (content.length < 500) {
        return { valid: false, reason: 'Document too short for quality analysis' };
    }

    // Source quality check
    const source = JSON.parse(document.content).source || '';
    const lowQualitySources = ['reddit', 'twitter', 'hackernews'];
    if (lowQualitySources.includes(source.toLowerCase())) {
        return { valid: false, reason: 'Low-quality source for paid content' };
    }

    return { valid: true, signals };
}
```

### 3.2 Post-Generation Quality Check

After LLM generates content, validate output quality:

```javascript
async function validateGeneratedContent(broadcast, targetSite) {
    const content = JSON.parse(broadcast.content);

    // Length check
    const wordCount = content.content.split(/\s+/).length;
    const minWords = {
        'biologyinvestor': 800,
        'syntheticbioresearch': 800,
        'biotechprotocols': 600,
        'biohub_boston': 600
    };

    if (wordCount < minWords[targetSite]) {
        return {
            valid: false,
            reason: `Content too short (${wordCount} words, need ${minWords[targetSite]})`
        };
    }

    // Structure check (has required sections?)
    const requiredHeadings = {
        'biologyinvestor': ['INVESTMENT THESIS', 'OPPORTUNITY', 'RISKS'],
        'syntheticbioresearch': ['SIGNIFICANCE', 'APPROACH', 'RESULTS'],
        'biotechprotocols': ['OVERVIEW', 'MATERIALS', 'PROCEDURE']
    };

    if (requiredHeadings[targetSite]) {
        const hasAllSections = requiredHeadings[targetSite].every(heading =>
            content.content.toLowerCase().includes(heading.toLowerCase())
        );

        if (!hasAllSections) {
            return {
                valid: false,
                reason: 'Missing required sections'
            };
        }
    }

    // LLM quality rating
    const qualityRating = await rateBroadcastQuality(broadcast, targetSite);
    if (qualityRating.score < 6.0) {
        return {
            valid: false,
            reason: `Quality score too low (${qualityRating.score}/10)`,
            details: qualityRating
        };
    }

    return { valid: true, quality: qualityRating };
}

async function rateBroadcastQuality(broadcast, targetSite) {
    const content = JSON.parse(broadcast.content);

    const qualityPrompt = `Rate this ${targetSite} article on a scale of 1-10 for:
- Content relevance (does it match the ${targetSite} audience?)
- Information density (actionable insights vs fluff)
- Professional quality (would readers pay for this?)
- Editorial standards (grammar, clarity, structure)

Return JSON: {
  "relevance": N,
  "density": N,
  "quality": N,
  "editorial": N,
  "overall": N,
  "reasoning": "brief explanation"
}

Article title: ${content.title}
Article length: ${content.content.split(/\s+/).length} words
Article content: ${content.content.substring(0, 2000)}...`;

    const result = await generateWithOllama('qwen2.5:14b', qualityPrompt);
    return JSON.parse(result);
}
```

---

## 4. Implementation Modifications

### 4.1 Update process-unprocessed-docs.js

```javascript
// Add new clients
const CLIENTS = [
    'telegram',
    'bluesky',
    'wordpress_insight',
    'wordpress_deepdive',
    'biologyinvestor_insight',      // NEW
    'syntheticbioresearch_insight', // NEW
    'biotechprotocols',             // NEW
    'biohub_boston',                // NEW
    'biohub_bayarea',               // NEW
    'biohub_sandiego'               // NEW
];

// Load all prompt files
const PROMPTS = {
    'ai10bro': JSON.parse(fs.readFileSync('wordpress-prompts.json', 'utf-8')),
    'biologyinvestor': JSON.parse(fs.readFileSync('biologyinvestor-prompts.json', 'utf-8')),
    'syntheticbioresearch': JSON.parse(fs.readFileSync('syntheticbioresearch-prompts.json', 'utf-8')),
    'biotechprotocols': JSON.parse(fs.readFileSync('biotechprotocols-prompts.json', 'utf-8')),
    'biohub': JSON.parse(fs.readFileSync('biohub-prompts.json', 'utf-8'))
};

// Main processing loop
async function processUnprocessedDocuments(limit = 20) {
    const docs = await getUnprocessedDocuments(limit);

    for (const doc of docs) {
        try {
            // Route to appropriate site(s)
            const routing = await routeDocumentToSite(doc);

            if (!routing.site) {
                console.log(`Skip: ${doc.id} - ${routing.reason}`);
                continue;
            }

            // Validate quality
            const qualityCheck = await validateDocumentQuality(doc, routing.site);
            if (!qualityCheck.valid) {
                console.log(`Skip: ${doc.id} - ${qualityCheck.reason}`);
                continue;
            }

            // Generate broadcasts for assigned clients
            for (const client of routing.clients) {
                const broadcast = await generateBroadcast(doc, client, routing.site);

                // Validate generated content
                const contentCheck = await validateGeneratedContent(broadcast, routing.site);
                if (!contentCheck.valid) {
                    console.log(`Skip: ${doc.id} ${client} - ${contentCheck.reason}`);
                    continue;
                }

                // Save broadcast
                await saveBroadcast(broadcast);
                console.log(`✅ Created: ${client} for ${doc.id} (${routing.reason})`);
            }

        } catch (error) {
            console.error(`Error processing ${doc.id}:`, error.message);
        }
    }
}

async function generateBroadcast(doc, client, site) {
    // Select appropriate prompt based on site and client type
    const promptType = client.includes('deepdive') ? 'weekly_deepdive' : 'daily_insight';
    const prompt = PROMPTS[site][promptType] || PROMPTS[site]['protocol'] || PROMPTS['ai10bro'][promptType];

    // Generate with Ollama
    const content = JSON.parse(doc.content).text || '';
    const result = await generateWithOllama('qwen2.5:14b', prompt.user_prompt.replace('{document_text}', content));

    return {
        id: generateId(),
        documentId: doc.id,
        client: client,
        content: result,
        image_url: null,
        alignment_score: doc.alignment_score,
        status: 'pending',
        createdAt: Date.now()
    };
}
```

### 4.2 Create Publishing Scripts

Each site gets its own publishing script:

```javascript
// send-pending-to-biologyinvestor.js
const CLIENT = process.env.CLIENT || 'biologyinvestor_insight';
const WP_SITE_URL = process.env.WP_BIOINVESTOR_URL || 'https://biologyinvestor.com';
const WP_USERNAME = process.env.WP_BIOINVESTOR_USER;
const WP_PASSWORD = process.env.WP_BIOINVESTOR_PASS;

// Same structure as send-pending-to-wordpress.js
// Just different env vars and site URL
```

Similar scripts for:
- `send-pending-to-synbioresearch.js`
- `send-pending-to-biotechprotocols.js`
- `send-pending-to-biohub-boston.js`

---

## 5. Expected Content Volume

### 5.1 Current Distribution (8-12% alignment docs)

Based on 4,500 documents in bycatch range:

**Estimated Routing**:
- **BiologyInvestor**: 10-20 docs/day with VC/funding signals
- **SyntheticBioResearch**: 15-25 docs/day with lab/academic signals
- **BioTechProtocols**: 5-10 docs/day with methodology signals
- **Regional Hubs**: 10-15 docs/day total across 3 regions
- **Unmatched**: 30-40% still discarded (no strong signals)

### 5.2 Publishing Frequency Recommendations

**BiologyInvestor**:
- 3× per week (Mon/Wed/Fri) - Investment insights are time-sensitive
- Focus on quality over volume
- Manual review first 50 articles

**SyntheticBioResearch**:
- 2× per week (Tue/Thu) - Research insights need depth
- Longer articles acceptable
- Emphasize technical accuracy

**BioTechProtocols**:
- 1× per week - Protocols require careful validation
- Manual testing of procedures recommended
- Community feedback integration

**Regional Hubs**:
- 2-3× per week - Local news cadence
- Can publish more frequently if high local activity
- Cross-reference with local events

---

## 6. Next Steps

### Phase 1: BiologyInvestor Pilot (Week 1-2)

1. **Create Prompts**
   - Write biologyinvestor-prompts.json (done above)
   - Test with 5 sample documents
   - Refine based on output quality

2. **Implement Routing**
   - Add checkInvestorSignals() function
   - Test on 100 bycatch documents
   - Validate signal detection accuracy

3. **Generate Sample Articles**
   - Generate 10 investor-focused articles
   - Manual quality review
   - LLM quality rating (target: >7/10)

4. **Beta Test**
   - Send samples to 10 VCs
   - Collect feedback: "Would you pay $99/mo for this?"
   - Iterate on prompts based on feedback

### Phase 2: Expand to Additional Sites (Month 2)

Once BiologyInvestor validates:
- Add SyntheticBioResearch routing and prompts
- Add BioTechProtocols routing and prompts
- Add Regional hub (Boston OR Bay Area)

### Phase 3: Automation & Scale (Month 3+)

- Automated quality checks
- A/B testing different prompts
- Subscriber feedback loops
- Content performance analytics

---

**Document Complete**: Ready for content-side implementation
**Full Path**: `/Users/davidlockie/Documents/Projects/Eliza/MULTI_SITE_CONTENT_STRATEGY.md`
