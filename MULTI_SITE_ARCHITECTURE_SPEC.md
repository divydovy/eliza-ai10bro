# Multiple Independent Sites Architecture Technical Specification

**Date**: 2026-01-22
**Purpose**: Detailed technical design for monetizing bycatch content across specialized audience sites

## Executive Summary

AI10BRO currently discards 4,500 documents (8-12% alignment) that contain valuable signals for specialized audiences. This specification outlines a **shared Eliza infrastructure, separate WordPress sites strategy** to monetize this bycatch with **zero marginal content cost**.

**Key Principle**: One Eliza database, multiple independent WordPress sites, different brands.

**IMPORTANT**: This is NOT WordPress multisite. Each brand gets its own completely independent WordPress installation with its own database, domain, and configuration. They all pull content from the same Eliza SQLite database.

---

## 1. System Architecture

### 1.1 Shared Eliza Infrastructure + Independent WordPress Sites

```
┌─────────────────────────────────────────────────────────────┐
│                    CONTENT COLLECTION LAYER                  │
│  (GitHub Actions, RSS Feeds, PubMed, Obsidian)              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              SINGLE ELIZA DATABASE (SQLite)                  │
│  - 38K+ documents                                            │
│  - Entity mentions (180 records, 33 entities)                │
│  - Alignment scores (LLM-based, 0-100%)                      │
│  - Bio theme tags (synbio, biotech, materials, etc.)        │
│  - Source metadata (GitHub, Obsidian, PubMed, etc.)         │
│  - Broadcasts for ALL sites                                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                    BROADCAST GENERATION                      │
│  - Runs every 6 hours (4am, 10am, 4pm, 10pm)                │
│  - Queries unprocessed docs                                 │
│  - Routes to appropriate clients based on:                  │
│    * Alignment score threshold                              │
│    * Entity mentions (VC, lab, company)                     │
│    * Keyword presence (funding, methodology, etc.)          │
│  - Generates platform-specific content (LLM)                │
│  - Stores as pending broadcasts in Eliza DB                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│           5 SEPARATE WORDPRESS INSTALLATIONS                 │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │   AI10BRO.com    │  │BiologyInvestor   │                │
│  │                  │  │      .com        │                │
│  │ WordPress DB #1  │  │ WordPress DB #2  │                │
│  │ Domain: ai10bro  │  │ Domain: investor │                │
│  │ (>=12% align)    │  │ (8-12% + VCs)    │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │SyntheticBio      │  │BioTechProtocols  │                │
│  │Research.com      │  │      .com        │                │
│  │                  │  │                  │                │
│  │ WordPress DB #3  │  │ WordPress DB #4  │                │
│  │ Domain: research │  │ Domain: protocols│                │
│  │ (8-12% + labs)   │  │ (methodology)    │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                              │
│  ┌──────────────────┐                                       │
│  │ Regional Hubs    │                                       │
│  │ BostonBio.com    │                                       │
│  │ WordPress DB #5  │                                       │
│  │ Domain: boston   │                                       │
│  │ (geo-specific)   │                                       │
│  └──────────────────┘                                       │
│                                                              │
│  Each site:                                                 │
│  - Separate WordPress installation                          │
│  - Separate MySQL database                                  │
│  - Separate domain name                                     │
│  - Separate wp-config.php                                   │
│  - Pulls content from shared Eliza SQLite DB                │
└─────────────────────────────────────────────────────────────┘
```

**Key Architecture Points**:

1. **Eliza Database**: One SQLite database (agent/data/db.sqlite) stores all documents, broadcasts, and entity mentions
2. **WordPress Installations**: 5 completely independent WordPress sites, each with:
   - Its own MySQL/MariaDB database
   - Its own domain name
   - Its own wp-config.php configuration
   - Its own WordPress admin panel
   - Its own users and settings
3. **Content Flow**: Publishing scripts read from Eliza DB, post to individual WordPress sites via REST API
4. **No Shared WordPress Data**: Each site is 100% independent at the WordPress level

### 1.2 Content Routing Logic

**Current Implementation** (AI10BRO only):
```javascript
if (alignment_score >= 0.12) {
    generateBroadcast('ai10bro', document);
} else {
    discard(document);
}
```

**Proposed Multi-Site Implementation**:
```javascript
function routeDocument(document) {
    const { alignment_score, entity_mentions, keywords, bio_theme } = document;

    // Primary site (highest quality)
    if (alignment_score >= 0.12) {
        generateBroadcast('ai10bro', document);
    }

    // Investor Intelligence (8-12% + funding/VC signals)
    if (alignment_score >= 0.08 && alignment_score < 0.12) {
        if (hasFundingKeywords(keywords) || hasVCMentions(entity_mentions)) {
            generateBroadcast('biologyinvestor', document);
        }
    }

    // Research Digest (8-12% + lab mentions or high technical depth)
    if (alignment_score >= 0.08 && alignment_score < 0.12) {
        if (hasLabMentions(entity_mentions) || hasTechnicalDepth(keywords)) {
            generateBroadcast('syntheticbioresearch', document);
        }
    }

    // Methodology Library (8-12% + protocol/methods keywords)
    if (alignment_score >= 0.08 && alignment_score < 0.12) {
        if (hasMethodologyKeywords(keywords)) {
            generateBroadcast('biotechprotocols', document);
        }
    }

    // Regional Hubs (geographic signals)
    if (alignment_score >= 0.08 && hasRegionalSignal(document)) {
        const region = detectRegion(document); // 'boston', 'bayarea', 'cambridge'
        generateBroadcast(`biohub_${region}`, document);
    }

    // Below 8%: discard (true low quality)
}

// Helper functions
function hasFundingKeywords(keywords) {
    const fundingTerms = [
        'Series A', 'Series B', 'Series C',
        'funding round', 'raised $', 'investment',
        'venture capital', 'M&A', 'acquisition',
        'IPO', 'valuation', 'deal'
    ];
    return keywords.some(kw => fundingTerms.includes(kw));
}

function hasVCMentions(entity_mentions) {
    // Check if any tracked VCs are mentioned
    return entity_mentions.some(em => em.entity_type === 'vc');
}

function hasLabMentions(entity_mentions) {
    // Check if any tracked research labs are mentioned
    return entity_mentions.some(em => em.entity_type === 'lab');
}

function hasTechnicalDepth(keywords) {
    const technicalTerms = [
        'CRISPR', 'fermentation', 'genome editing',
        'protein engineering', 'synthetic pathway',
        'metabolic engineering', 'cell-free', 'directed evolution'
    ];
    return keywords.filter(kw => technicalTerms.includes(kw)).length >= 2;
}

function hasMethodologyKeywords(keywords) {
    const methodologyTerms = [
        'protocol', 'methodology', 'procedure',
        'step-by-step', 'troubleshooting', 'optimization',
        'equipment', 'reagent', 'workflow'
    ];
    return keywords.some(kw => methodologyTerms.includes(kw));
}

function hasRegionalSignal(document) {
    const regionalPatterns = [
        /Boston/gi, /Cambridge/gi, /MIT/gi, /Harvard/gi,
        /Bay Area/gi, /Silicon Valley/gi, /Stanford/gi, /Berkeley/gi,
        /San Diego/gi, /La Jolla/gi, /Salk Institute/gi
    ];
    return regionalPatterns.some(pattern => pattern.test(document.content));
}

function detectRegion(document) {
    if (/Boston|Cambridge|MIT|Harvard/gi.test(document.content)) return 'boston';
    if (/Bay Area|Silicon Valley|Stanford|Berkeley/gi.test(document.content)) return 'bayarea';
    if (/San Diego|La Jolla/gi.test(document.content)) return 'sandiego';
    return 'other';
}
```

### 1.3 Database Schema Changes

**No schema changes required!** Existing structure supports multi-site:

**Current `broadcasts` table**:
```sql
CREATE TABLE broadcasts (
    id TEXT PRIMARY KEY,
    documentId TEXT NOT NULL,
    client TEXT NOT NULL,  -- 'telegram', 'bluesky', 'wordpress_insight', etc.
    content TEXT,
    image_url TEXT,
    alignment_score REAL,
    status TEXT,  -- 'pending', 'sent', 'failed'
    createdAt INTEGER
);
```

**New clients to add**:
- `biologyinvestor_insight`
- `biologyinvestor_deepdive`
- `syntheticbioresearch_insight`
- `syntheticbioresearch_deepdive`
- `biotechprotocols`
- `biohub_boston`
- `biohub_bayarea`
- `biohub_sandiego`

**Document metadata** (existing):
- `alignment_score` - Already calculated for all docs
- `entity_mentions` - Already tracked (via `entity_mentions` table)
- `bio_theme` - Already extracted from content

---

## 1.4 Why NOT WordPress Multisite?

**WordPress Multisite** is a feature that lets one WordPress installation manage multiple sites sharing:
- Same core WordPress files
- Same database (separate tables per site)
- Same plugins/themes
- Centralized admin panel

**Why we're NOT using it**:
1. **Brand Independence**: Each site needs its own distinct identity, not subdomain/subfolder structure
2. **Plugin Conflicts**: Investor site may need different plugins than research site
3. **Performance**: One site's traffic doesn't affect others
4. **Risk Isolation**: If one site gets hacked, others unaffected
5. **Flexibility**: Can use different hosting providers per site
6. **Easier Management**: Each site has its own admin panel, no complex network admin

**Our Approach: Completely Separate WordPress Installations**
- 5 independent WordPress sites
- Each with its own database, domain, files, and admin
- Only connection: All pull content from same Eliza SQLite database
- Publishing scripts (send-pending-to-*.js) handle distribution

**Analogy**:
- WordPress Multisite = One building with 5 apartments (shared infrastructure)
- Our Approach = 5 separate houses (completely independent)

### 1.5 File System Structure

**Server Directory Layout** (Example: Cloudways hosting):

```
/home/master/applications/
├── eliza/
│   ├── agent/
│   │   └── data/
│   │       └── db.sqlite                    ← SHARED Eliza database
│   ├── process-unprocessed-docs.js          ← Generates broadcasts
│   ├── send-pending-to-ai10bro.js
│   ├── send-pending-to-biologyinvestor.js
│   ├── send-pending-to-synbioresearch.js
│   └── ...
│
├── ai10bro.com/                             ← WordPress Site #1
│   ├── public_html/
│   │   ├── wp-config.php                    (DB: ai10bro_wp)
│   │   ├── wp-content/
│   │   │   ├── themes/astra/
│   │   │   └── plugins/
│   │   ├── wp-admin/
│   │   └── index.php
│   └── logs/
│
├── biologyinvestor.com/                     ← WordPress Site #2
│   ├── public_html/
│   │   ├── wp-config.php                    (DB: bioinvestor_wp)
│   │   ├── wp-content/
│   │   │   ├── themes/astra/
│   │   │   └── plugins/
│   │   ├── wp-admin/
│   │   └── index.php
│   └── logs/
│
├── syntheticbioresearch.com/                ← WordPress Site #3
│   ├── public_html/
│   │   ├── wp-config.php                    (DB: synbioresearch_wp)
│   │   ├── wp-content/
│   │   │   ├── themes/generatepress/
│   │   │   └── plugins/
│   │   ├── wp-admin/
│   │   └── index.php
│   └── logs/
│
├── biotechprotocols.com/                    ← WordPress Site #4
│   ├── public_html/
│   │   ├── wp-config.php                    (DB: bioprotocols_wp)
│   │   ├── wp-content/
│   │   ├── wp-admin/
│   │   └── index.php
│   └── logs/
│
└── bostonbio.com/                           ← WordPress Site #5
    ├── public_html/
    │   ├── wp-config.php                    (DB: bostonbio_wp)
    │   ├── wp-content/
    │   ├── wp-admin/
    │   └── index.php
    └── logs/
```

**MySQL/MariaDB Databases**:
```
mysql> SHOW DATABASES;
+--------------------+
| Database           |
+--------------------+
| ai10bro_wp         |   ← Site #1 database
| bioinvestor_wp     |   ← Site #2 database
| synbioresearch_wp  |   ← Site #3 database
| bioprotocols_wp    |   ← Site #4 database
| bostonbio_wp       |   ← Site #5 database
+--------------------+
```

**Key Points**:
- Each WordPress site has its own directory tree
- Each has a separate MySQL database
- Each has its own wp-config.php with unique credentials
- All Eliza scripts run from one location and read from agent/data/db.sqlite
- Publishing scripts use WordPress REST API to post to each site

---

## 2. Implementation Plan

### 2.1 Phase 1: BiologyInvestor.com Pilot (Week 1-2)

**Goal**: Validate investor audience and content-market fit

**Steps**:

1. **Domain Registration** (Day 1, 10 min)
   ```bash
   # Register via Namecheap/GoDaddy
   biologyinvestor.com - $12/yr
   ```

2. **WordPress Site Setup** (Day 1, 2 hours)

   **Option A: Self-Hosted (Recommended)**
   ```bash
   # Create new WordPress installation (via cPanel, Cloudways, or Kinsta)
   # Domain: biologyinvestor.com (or investor.ai10bro.com initially)

   # Install WordPress fresh
   # OR clone AI10BRO WordPress structure:
   cp -r /path/to/ai10bro-wordpress /path/to/biologyinvestor-wordpress

   # Create separate MySQL database
   mysql -u root -p
   CREATE DATABASE biologyinvestor_wp;
   CREATE USER 'bioinvestor_user'@'localhost' IDENTIFIED BY 'password';
   GRANT ALL PRIVILEGES ON biologyinvestor_wp.* TO 'bioinvestor_user'@'localhost';
   FLUSH PRIVILEGES;

   # Configure wp-config.php (completely independent from AI10BRO)
   define('DB_NAME', 'biologyinvestor_wp');
   define('DB_USER', 'bioinvestor_user');
   define('DB_PASSWORD', 'password');
   define('DB_HOST', 'localhost');
   define('WP_SITEURL', 'https://biologyinvestor.com');
   define('WP_HOME', 'https://biologyinvestor.com');

   # Install WordPress theme (Astra, GeneratePress, etc.)
   # Configure permalinks, settings
   # Create "Insights" category
   ```

   **Option B: WordPress.com (If API Access Granted)**
   ```bash
   # Create new site via WordPress.com admin panel
   # Site: biologyinvestor.wordpress.com (free subdomain)
   # Upgrade to Business plan ($25/mo) for custom domain + API access
   # Map custom domain: biologyinvestor.com
   # Get Site ID for API calls
   ```

   **IMPORTANT**: This is a completely separate WordPress installation from AI10BRO.
   - Different database
   - Different domain
   - Different admin panel
   - Different users/settings
   - Only connection: Both pull content from same Eliza SQLite database

3. **Create Investor-Focused Prompts** (Day 1, 1 hour)

   File: `biologyinvestor-prompts.json`
   ```json
   {
     "daily_insight": {
       "system": "You are writing for BiologyInvestor, a biotech investment intelligence platform. Your audience is venture capitalists, corporate development teams, and biotech investors.",
       "prompt": "Write a 800-1200 word Daily Insight for BiologyInvestor based on this biotech document.\n\nFOCUS ON:\n- Investment angle (funding rounds, valuations, deal structure)\n- Commercial viability and market size\n- Competitive landscape and differentiation\n- Exit potential (acquisition targets, IPO trajectory)\n- Risk factors and technical hurdles\n- Key investors and syndicates\n\nSTRUCTURE:\n1. INVESTMENT THESIS (200 words) - Why this matters to investors\n2. THE OPPORTUNITY (300-400 words) - Market size, timing, technology readiness\n3. COMPETITIVE POSITION (200-300 words) - Moats, differentiation, landscape\n4. RISKS & CONSIDERATIONS (150-200 words) - Technical, regulatory, market risks\n5. WHAT TO WATCH (100-150 words) - Next milestones, catalysts\n\nTONE: Professional, analytical, investment-focused (not hype)\nAVOID: Scientific jargon without context, overly technical details\n\nDocument:\n{document_text}"
     },
     "weekly_deepdive": {
       "system": "You are writing in-depth investment analysis for BiologyInvestor. Audience: biotech investors conducting due diligence.",
       "prompt": "Write a 2000-3000 word Deep Dive investment analysis...\n\n[Similar structure, more depth]"
     }
   }
   ```

4. **Modify Broadcast Generation** (Day 2, 3 hours)

   File: `process-unprocessed-docs.js`
   ```javascript
   // Add BiologyInvestor client
   const CLIENTS = [
       'telegram',
       'bluesky',
       'wordpress_insight',
       'wordpress_deepdive',
       'biologyinvestor_insight',  // NEW
       'biologyinvestor_deepdive'  // NEW
   ];

   // Update routing logic (lines 200-250)
   async function routeDocumentToClients(document) {
       const broadcasts = [];

       // Existing AI10BRO logic
       if (document.alignment_score >= 0.12) {
           broadcasts.push(await generateBroadcast('telegram', document));
           broadcasts.push(await generateBroadcast('wordpress_insight', document));
       }

       // NEW: BiologyInvestor logic
       if (document.alignment_score >= 0.08 && document.alignment_score < 0.12) {
           const hasInvestorSignal = await checkInvestorSignals(document);

           if (hasInvestorSignal) {
               broadcasts.push(await generateBroadcast('biologyinvestor_insight', document));

               // Deep dives for high-signal docs
               if (document.alignment_score >= 0.10) {
                   broadcasts.push(await generateBroadcast('biologyinvestor_deepdive', document));
               }
           }
       }

       return broadcasts;
   }

   async function checkInvestorSignals(document) {
       // Query entity mentions
       const mentions = db.prepare(`
           SELECT e.type, e.name
           FROM entity_mentions em
           JOIN tracked_entities e ON e.id = em.entity_id
           WHERE em.document_id = ?
       `).all(document.id);

       // Check for VC mentions
       const hasVC = mentions.some(m => m.type === 'vc');

       // Check for funding keywords
       const content = JSON.parse(document.content).text || '';
       const fundingKeywords = [
           /Series [A-D]/gi,
           /raised \$\d+/gi,
           /funding round/gi,
           /venture capital/gi,
           /M&A/gi,
           /acquisition/gi,
           /IPO/gi,
           /valuation/gi
       ];
       const hasFunding = fundingKeywords.some(kw => kw.test(content));

       return hasVC || hasFunding;
   }
   ```

5. **Create Publishing Script** (Day 2, 2 hours)

   File: `send-pending-to-biologyinvestor.js`
   ```javascript
   #!/usr/bin/env node

   // Clone send-pending-to-wordpress.js structure
   // Update for BiologyInvestor branding
   // Connect to investor.ai10bro.com WordPress instance

   const CLIENT = process.env.CLIENT || 'biologyinvestor_insight';
   const WP_SITE_URL = 'https://investor.ai10bro.com';
   const WP_USERNAME = process.env.WP_INVESTOR_USERNAME;
   const WP_PASSWORD = process.env.WP_INVESTOR_PASSWORD;

   // ... rest of send logic ...
   ```

6. **Generate 10 Sample Articles** (Day 2-3, manual)
   ```bash
   # Run broadcast generation with BiologyInvestor routing
   node process-unprocessed-docs.js 50

   # Filter for biologyinvestor broadcasts
   sqlite3 agent/data/db.sqlite "
       SELECT id, content
       FROM broadcasts
       WHERE client = 'biologyinvestor_insight'
       AND status = 'pending'
       LIMIT 10
   "

   # Manually review and approve
   # Publish to investor.ai10bro.com
   CLIENT=biologyinvestor_insight node send-pending-to-biologyinvestor.js
   ```

7. **Beta User Recruitment** (Day 3-7)
   - Email 10 VCs from network
   - Offer: "Free 30-day access to biotech investment intelligence"
   - Request: Feedback on content quality and relevance
   - Tools: Google Form, Calendly for interviews

8. **Feedback Collection** (Week 2)
   - Weekly email: "What did you find most useful?"
   - Track: Open rates, click-through rates, time on page
   - Interview: 5 users for 30 min each
   - Metrics: Would pay $99/mo? (yes/no/maybe)

### 2.2 Phase 2: Scale to 3 Sites (Month 2)

**Sites to Launch**:
1. SyntheticBioResearch.com (academic/R&D)
2. BioTechProtocols.com (methodology library)
3. Regional hub (BostonBio.com OR BayAreaBio.com)

**Implementation** (per site):
- Day 1: Domain + WordPress setup
- Day 2: Prompts + routing logic
- Day 3: Generate 10 samples
- Week 2: Beta test with target audience
- Week 3-4: Launch publicly

**Resource Requirements**:
- Dev time: 3 days per site
- Cost: $12/yr domain + $50/mo hosting
- Total: $36 domains + $150/mo hosting (3 sites)

### 2.3 Phase 3: Revenue & Marketing (Month 3+)

**Paywall Implementation** (Stripe):
```javascript
// Free tier: 3 articles/month
// Pro: $99/mo (BiologyInvestor), $49/mo (SynBioResearch), $29/mo (Regional)
// Enterprise: Custom pricing + API access
```

**Marketing Channels**:
1. LinkedIn (biotech investor groups)
2. Email outreach (warm VCs from beta)
3. Content marketing (cross-post to Medium, LinkedIn)
4. Partnerships (BioCentury, Endpoints News affiliates)
5. SEO (rank for "biotech funding news", "synbio research")

---

## 3. Technical Challenges & Solutions

### 3.1 Challenge: Duplicate Content Across Sites

**Problem**: Same document could qualify for multiple sites
- High-quality doc (>=12%): Goes to AI10BRO
- Also mentions VC: Could go to BiologyInvestor
- Result: Same content on 2 sites (SEO penalty, user confusion)

**Solution**: Strict prioritization hierarchy
```javascript
// Priority order (highest to lowest):
// 1. AI10BRO (>=12% alignment)
// 2. BiologyInvestor (8-12% + investor signals)
// 3. SyntheticBioResearch (8-12% + lab signals)
// 4. BioTechProtocols (8-12% + methodology)
// 5. Regional hubs (8-12% + geographic)

function routeDocumentExclusively(document) {
    // Only route to ONE site (highest priority match)

    if (document.alignment_score >= 0.12) {
        return ['ai10bro'];
    }

    if (document.alignment_score >= 0.08) {
        if (hasInvestorSignals(document)) return ['biologyinvestor'];
        if (hasLabSignals(document)) return ['syntheticbioresearch'];
        if (hasMethodologySignals(document)) return ['biotechprotocols'];
        if (hasRegionalSignals(document)) return [`biohub_${region}`];
    }

    return []; // Discard
}
```

### 3.2 Challenge: Content Quality Consistency

**Problem**: 8-12% alignment docs are lower quality than 12%+ docs
- Risk: BiologyInvestor content perceived as inferior to AI10BRO
- Impact: Reputation damage, lower conversion

**Solution**: Higher bar for investor content
```javascript
// Investor content requires:
// 1. Alignment >= 8% (base quality)
// 2. Entity mention OR funding keyword (commercial signal)
// 3. LLM quality check (additional validation)

async function validateInvestorContent(broadcast) {
    const qualityPrompt = `
        Rate this biotech investment article on a scale of 1-10 for:
        - Investment relevance (1-10)
        - Commercial viability (1-10)
        - Data quality (1-10)

        Return JSON: {"investment_relevance": N, "commercial_viability": N, "data_quality": N}

        Article: ${broadcast.content}
    `;

    const quality = await ollama.generate(qualityPrompt);
    const avgScore = (quality.investment_relevance + quality.commercial_viability + quality.data_quality) / 3;

    if (avgScore < 6) {
        // Reject: quality too low
        return false;
    }

    return true;
}
```

### 3.3 Challenge: Brand Differentiation

**Problem**: Sites may feel too similar (same source content)
- Risk: Users subscribe to one, get value, don't need others
- Impact: Lower total revenue

**Solution**: Distinct brand positioning
```
AI10BRO:
- Brand: "Bio Innovation for Everyone"
- Tone: Accessible, educational, inspiring
- Audience: General biotech enthusiasts, students, entrepreneurs
- Content: Breakthroughs, trends, "what's possible"

BiologyInvestor:
- Brand: "Deal Flow & Investment Intelligence"
- Tone: Analytical, data-driven, insider knowledge
- Audience: VCs, corporate dev, investment banks
- Content: Funding, valuations, exits, risk analysis

SyntheticBioResearch:
- Brand: "Academic & R&D Intelligence"
- Tone: Technical, rigorous, peer-reviewed quality
- Audience: PhD researchers, R&D teams, consultants
- Content: Methodologies, lab trends, technical depth

BioTechProtocols:
- Brand: "Practitioner's Playbook"
- Tone: How-to, troubleshooting, hands-on
- Audience: Lab techs, startup scientists, CROs
- Content: Protocols, equipment guides, workflows
```

---

## 4. Cost-Benefit Analysis

### 4.1 Costs

**One-Time Costs**:
- Domain registration: $12/yr × 5 sites = $60/yr ($5/mo)
- WordPress themes: $0 (use Astra/GeneratePress free)
- Development time: 3 days per site × 5 sites = 15 days (already sunk cost)

**Recurring Costs**:
- Hosting: $50/mo (5 separate WordPress installations)
  - Self-hosted option: Cloudways "DO2GB" plan ($14/mo) hosts 3-5 sites
  - OR Kinsta "Starter" plan ($35/mo) hosts 1 site (need 5× = $175/mo)
  - **Recommended: Cloudways** ($14-28/mo for 5 sites depending on traffic)
- Mailchimp: $50/mo (email newsletters, 5 separate lists, 5K subscribers total)
- Stripe: $0/mo base + 2.9% + $0.30 per transaction
- **Total: $75-105/mo operational cost** (depends on hosting choice)

**WordPress Hosting Breakdown** (5 independent installations):
- Each site is a separate WordPress installation with its own:
  - Database (MySQL/MariaDB)
  - Files (wp-content, themes, plugins)
  - Domain name
  - Admin panel
- Hosting options:
  - **Shared Hosting** (Bluehost, SiteGround): $10-20/mo for 1-5 sites (cheapest but slowest)
  - **Managed WordPress** (Cloudways): $14/mo for 3-5 sites (recommended balance)
  - **Premium Managed** (Kinsta, WP Engine): $35/mo per site (fastest but expensive)

**Marginal Cost per Additional Site**:
- Additional domain: $12/yr = $1/mo
- Additional hosting slot: $0-10/mo (depends on plan capacity)
- Additional Mailchimp list: $0 (included in plan up to 5 lists)
- **Total: $1-11/mo per additional site**

### 4.2 Revenue Projections

**Conservative Case (20% of target)**:

| Site | Target Subs | Price | Conservative (20%) | Monthly Revenue |
|------|-------------|-------|-------------------|-----------------|
| BiologyInvestor | 500 | $99 | 100 | $9,900 |
| SynBioResearch | 300 | $49 | 60 | $2,940 |
| BioTechProtocols | 200 | $79 | 40 | $3,160 |
| Regional Hubs (3×) | 1,000 each | $29 | 200 each | $5,800 each = $17,400 |
| **Total** | - | - | - | **$33,400/mo** |

**Annual Revenue (Conservative)**: $400,800/yr
**Annual Cost**: $1,260/yr
**Net Profit**: $399,540/yr
**Margin**: 99.7%

**Optimistic Case (50% of target)**:

| Site | Subs | Revenue |
|------|------|---------|
| BiologyInvestor | 250 | $24,750 |
| SynBioResearch | 150 | $7,350 |
| BioTechProtocols | 100 | $7,900 |
| Regional Hubs | 500 each | $43,500 |
| **Total** | - | **$83,500/mo** |

**Annual Revenue (Optimistic)**: $1,002,000/yr

### 4.3 Break-Even Analysis

**Monthly costs**: $105
**Required paying subscribers (at lowest price $29/mo)**:
- 105 / 29 = **3.6 subscribers to break even**

**Required paying subscribers (to justify effort)**:
- $5,000/mo revenue target = 5,000 / 29 = **173 subscribers**
- Across 5 sites: 173 / 5 = **35 subscribers per site**

**Conclusion**: Extremely low barrier to profitability. If ANY site gets 35+ subscribers, project is profitable.

---

## 5. Risk Assessment

### 5.1 High Risks

**Risk 1: No Market Demand**
- **Probability**: Medium (30%)
- **Impact**: High (project fails)
- **Mitigation**:
  - Beta test with 10 VCs before launch
  - Measure: Would pay $99/mo? (>=5 yes = green light)
  - Pivot: Lower price or different audience

**Risk 2: Content Quality Too Low**
- **Probability**: Medium (40%)
- **Impact**: Medium (reputation damage)
- **Mitigation**:
  - Human review first 50 articles
  - LLM quality gate (score >= 6/10)
  - Feedback loops from beta users

**Risk 3: WordPress.com API Still Blocked**
- **Probability**: Low (20%)
- **Impact**: Medium (delays launch)
- **Mitigation**:
  - Use self-hosted WordPress on Cloudways/Kinsta
  - Cost: $50/mo for 5 sites (already budgeted)

### 5.2 Medium Risks

**Risk 4: SEO Penalties for Thin Content**
- **Probability**: Low (20%)
- **Impact**: Medium (low organic traffic)
- **Mitigation**:
  - Minimum 800 words per article
  - Unique angles per site (investor vs academic)
  - Canonical tags if needed

**Risk 5: Subscriber Churn**
- **Probability**: High (60%)
- **Impact**: Medium (lower LTV)
- **Mitigation**:
  - Engagement metrics (open rates, clicks)
  - Monthly surveys ("What would make this better?")
  - Onboarding emails (value proposition)

### 5.3 Low Risks

**Risk 6: Technical Complexity**
- **Probability**: Very Low (5%)
- **Impact**: Low (solvable with time)
- **Mitigation**: Already solved in AI10BRO WordPress integration

---

## 6. Success Metrics

### 6.1 Phase 1 Metrics (BiologyInvestor Pilot)

**Beta Test (Week 1-2)**:
- ✅ 10 VC signups
- ✅ >=7/10 complete onboarding survey
- ✅ >=5/10 say "would pay $99/mo"
- ✅ >=3/10 provide detailed feedback

**Launch (Month 1)**:
- ✅ 50 free subscribers
- ✅ 5 paying subscribers ($495 MRR)
- ✅ 40% email open rate
- ✅ 10% click-through rate

**Decision Gate**: If <3 paying subs after Month 1, pivot or shut down

### 6.2 Phase 2 Metrics (Multi-Site Expansion)

**Month 2**:
- ✅ 3 sites live (BiologyInvestor, SynBioResearch, Regional)
- ✅ 150 total free subscribers (50 per site)
- ✅ 15 total paying subscribers ($1,500 MRR)

**Month 3**:
- ✅ 300 total free subscribers
- ✅ 30 total paying subscribers ($3,000 MRR)

**Decision Gate**: If <20 paying subs after Month 3, re-evaluate pricing or positioning

### 6.3 Phase 3 Metrics (Scale & Profit)

**Month 6**:
- ✅ 1,000 total free subscribers
- ✅ 100 total paying subscribers ($10,000 MRR)

**Month 12**:
- ✅ 3,000 total free subscribers
- ✅ 300 total paying subscribers ($30,000 MRR)

**Ultimate Goal**: $50K+ MRR within 18 months

---

## 7. Implementation Roadmap

### Week 1: BiologyInvestor Pilot Prep
- [x] Bycatch analysis complete
- [ ] Register biologyinvestor.com domain
- [ ] Set up WordPress instance (investor.ai10bro.com)
- [ ] Create investor-focused prompts
- [ ] Modify broadcast generation routing

### Week 2: Content Generation & Beta Test
- [ ] Generate 10 sample investor articles
- [ ] Recruit 10 VC beta testers
- [ ] Send welcome email + onboarding survey
- [ ] Collect initial feedback

### Week 3-4: Iterate & Launch
- [ ] Refine prompts based on feedback
- [ ] Set up Stripe paywall
- [ ] Public launch announcement
- [ ] Marketing push (LinkedIn, email)

### Month 2: Expand to 3 Sites
- [ ] Launch SyntheticBioResearch.com
- [ ] Launch BioTechProtocols.com
- [ ] Launch Regional hub (Boston OR Bay Area)

### Month 3-6: Scale & Optimize
- [ ] Add remaining regional hubs
- [ ] Build API access tier
- [ ] Marketing automation
- [ ] Customer success process

---

## 8. Open Questions

1. **Hosting Provider Choice**:
   - WordPress.com ($25/mo per site, waiting for API access) - Clean but expensive
   - Cloudways ($14/mo for 5 sites) - Best value, flexible
   - Kinsta ($35/mo per site) - Premium performance but $175/mo total
   - **Recommendation**: Start with Cloudways, migrate to Kinsta if traffic grows

2. **Pricing Validation**: Is $99/mo right price for BiologyInvestor? Beta test will answer.

3. **Content Frequency**: Daily vs 3×/week vs weekly? Start with 3×/week, adjust based on engagement.

4. **Geographic Focus**: Which regional hub first? Boston (stronger bio ecosystem) or Bay Area (larger tech audience)?

5. **Enterprise Tier**: What features justify $499/mo? API access, white-label reports, custom alerts?

---

## 9. Next Steps (User Decision Required)

### Option A: Proceed with BiologyInvestor Pilot (Recommended)
- **Timeline**: 2-3 weeks to launch
- **Cost**: $12 domain + $14-35/mo hosting (one site)
- **Hosting Choice**:
  - WordPress.com ($25/mo) - Waiting for API access, clean interface
  - Cloudways ($14/mo) - Self-hosted, immediate start, flexible
  - Kinsta ($35/mo) - Premium performance, immediate start
- **Risk**: Low (can shut down if no traction)
- **Decision gate**: 5+ paying subs at Month 1 OR shut down

### Option B: Implement All 5 Sites Simultaneously
- **Timeline**: 6-8 weeks to launch all
- **Cost**: $60 domains + $75-175/mo hosting (5 sites)
  - Cloudways: $14-28/mo for 5 sites
  - Kinsta: $175/mo for 5 sites
  - WordPress.com: $125/mo for 5 sites
- **Risk**: Medium (spreading resources thin, higher commitment)

### Option C: Wait for More Data
- Run entity extraction on full database
- Analyze bycatch content quality more deeply
- Validate assumptions before building
- **Timeline**: 1-2 weeks research, then Option A or B
- **Cost**: $0 incremental

**Recommendation**: **Option A with Cloudways**
- Start with BiologyInvestor pilot on Cloudways ($14/mo)
- Validate market demand via beta test (10 VCs)
- If >=5 say "would pay $99/mo" → public launch
- If successful at Month 1 (5+ paid subs) → expand to more sites
- Low commitment, fast validation, clear decision gates

---

**Last Updated**: 2026-01-22
**Status**: Ready for implementation pending user decision
**Key Clarification**: This architecture uses 5 completely separate WordPress installations (NOT WordPress multisite)
