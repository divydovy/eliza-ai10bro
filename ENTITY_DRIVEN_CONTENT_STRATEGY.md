# Entity-Driven Content Strategy
**Integrating Entity Tracking with Website & Platform**

## Executive Summary

Entity tracking is now the **core organizing principle** for AI10BRO's content strategy. By tracking 106 entities (companies, labs, VCs) and their **products, deals, and investments**, we can:

1. **Auto-generate entity-focused content** (Company Profiles, Deal Analyses, Product Launches)
2. **Power WordPress taxonomies** (auto-tag articles with mentioned entities)
3. **Build the platform database** (structured data ready for PEI-style analytics)
4. **Improve broadcast quality** (entity-aware scoring and context)

**Current State**: 106 entities tracked, mention detection working, 122 mentions found in 1,000 docs
**Next Phase**: Track deals, products, investments → Generate entity-centric content

---

## 1. Entity-Centric Content Types

### 1.1 Deal-Focused Content 💰

**What to Track:**
- Funding rounds (amount, investors, date, stage)
- M&A transactions (acquirer, target, price)
- Partnerships (companies involved, type, scope)
- IPOs (company, valuation, date)
- Licensing agreements

**Auto-Generated Content:**

```markdown
## Funding Round Article Template
Title: "[Company] Raises $XM Series [Stage] Led by [Lead Investor]"

Body:
- Opening: "{Company} announced a ${amount} {stage} funding round..."
- Investors: "The round was led by {lead_investor}, with participation from {other_investors}..."
- Use of Funds: Extract from press release/document
- Company Context: "{Company} develops {technology_focus}... Previously raised ${prior_funding} in {prior_date}..."
- Market Context: "{Technology_category} funding trends show {trend_data}..."
- Investor Context: "{Lead_investor} has backed {portfolio_count} biotech companies including {examples}..."

Entities Tagged:
- Company: [company_id]
- Investors: [investor_ids]
- Technologies: [tech_ids]
- Market: [market_id]

Call to Action:
- "Track {Company}'s progress in our database →"
- "See all {Technology} deals this quarter →"
```

**Example from Current Corpus:**
- **Cemvita**: FermOil™ productivity milestone (product launch)
- **Newlight**: $125M funding round led by GenZero (deal)
- **eXoZymes**: 100x scale-up achievement (milestone)
- **Ginkgo Bioworks**: $190M cost savings, AI-driven automation (performance update)

### 1.2 Product Launch Content 🚀

**What to Track:**
- Product name & description
- Launch date
- Technology basis
- Target market
- Pricing/availability
- Performance metrics
- Regulatory status (FDA approval, GRAS, etc.)

**Auto-Generated Content:**

```markdown
## Product Launch Article Template
Title: "[Company] Launches [Product]: [Key Benefit]"

Body:
- Opening: "{Company} today announced {product}, a {technology_type} that {key_benefit}..."
- Product Details: Specifications, capabilities, performance metrics
- Technology Basis: "Powered by {company}'s {core_technology} platform..."
- Market Context: "{Market_size} market, competing with {alternatives}..."
- Company Context: "This is {company}'s {nth} commercial product..."
- Future Plans: Scaling, partnerships, next milestones

Entities Tagged:
- Company: [company_id]
- Product: [product_id]
- Technology: [tech_id]
- Market: [market_id]
- Competitors: [competitor_ids]

Call to Action:
- "Compare {Product} to alternatives →"
- "Track {Company}'s product pipeline →"
```

**Example from Current Corpus:**
- **Cemvita FermOil™**: 6-month early productivity milestone with crude glycerol
- **Cemvita FermNPK™**: Soil bio-stimulant with third-party validation
- **Newlight AirCarbon**: Greenhouse gas-to-material product (5,000+ locations)
- **eXoZymes NCT**: 100-fold scale-up with 99%+ conversion rate

### 1.3 Company Performance Updates 📊

**What to Track:**
- Revenue milestones
- Scale-up achievements (10x, 100x production)
- Cost reductions
- Market expansion
- Customer acquisitions
- Team growth
- Technology breakthroughs

**Auto-Generated Content:**

```markdown
## Performance Update Article Template
Title: "[Company] Achieves [Milestone]: [Impact]"

Body:
- Opening: "{Company} announced {milestone}, marking {significance}..."
- Performance Metrics: Specific numbers, comparisons to previous state
- Technology Context: "{Achievement} demonstrates {technology} viability at scale..."
- Commercial Implications: Cost per unit, market readiness, competitive position
- Company Trajectory: Timeline of milestones, what's next
- Industry Context: How this compares to peers

Entities Tagged:
- Company: [company_id]
- Technology: [tech_id]
- Market: [market_id]

Call to Action:
- "See {Company}'s full milestone history →"
- "Compare {Company} to competitors →"
```

### 1.4 Investor Activity Reports 💼

**What to Track:**
- New fund announcements
- Portfolio company updates
- Investment themes/thesis
- Co-investment patterns
- Exit events

**Auto-Generated Content:**

```markdown
## Investor Activity Article Template
Title: "[Investor] Backs [Company] in $XM Round, Signals [Theme] Focus"

Body:
- Opening: "{Investor} led a ${amount} investment in {company}..."
- Investment Thesis: Extract from press release or infer from portfolio
- Portfolio Context: "{Investor}'s portfolio includes {companies}, all focused on {theme}..."
- Co-investors: Network analysis of syndicate
- Market Signal: "This marks {investor}'s {nth} investment in {sector} in {timeframe}..."

Entities Tagged:
- Investor: [investor_id]
- Company: [company_id]
- Co-investors: [investor_ids]
- Technology: [tech_id]

Call to Action:
- "See {Investor}'s full portfolio →"
- "Track {Sector} investment trends →"
```

### 1.5 Research Lab Spin-Offs & Breakthroughs 🔬

**What to Track:**
- Lab-to-startup transitions
- Major publications from tracked labs
- Research partnerships with companies
- Technology transfer deals

**Auto-Generated Content:**

```markdown
## Lab Breakthrough Article Template
Title: "[Lab] Research Enables [Technology]: [Commercial Path]"

Body:
- Research Summary: What was discovered/developed
- Researchers: Key PIs and their backgrounds
- Commercial Potential: Companies licensing, spin-offs forming
- Technology Readiness: TRL level, timeline to market
- Funding Sources: NIH, DARPA, corporate sponsors

Entities Tagged:
- Lab: [lab_id]
- Researchers: [researcher_ids]
- Technology: [tech_id]
- Companies: [company_ids] (licensing/spin-offs)

Call to Action:
- "See all innovations from {Lab} →"
- "Track {Technology} commercial development →"
```

---

## 2. Database Schema Extensions

### 2.1 Deals & Transactions Table

```sql
CREATE TABLE deals (
    id TEXT PRIMARY KEY,
    deal_type TEXT NOT NULL, -- 'funding', 'ma', 'partnership', 'ipo', 'licensing'
    announced_date DATE,
    closed_date DATE,

    -- Parties
    company_id TEXT REFERENCES tracked_entities(id),
    lead_investor_id TEXT REFERENCES tracked_entities(id), -- for funding
    acquirer_id TEXT, -- for M&A
    partner_ids TEXT[], -- for partnerships (JSON array)

    -- Financial
    amount_usd BIGINT,
    amount_currency TEXT,
    valuation_usd BIGINT,

    -- Funding specifics
    round_stage TEXT, -- 'pre-seed', 'seed', 'series_a', 'series_b', etc.
    investors TEXT[], -- JSON array of investor_ids

    -- Context
    description TEXT,
    use_of_funds TEXT,
    source_document_id TEXT REFERENCES memories(id),
    source_url TEXT,

    -- Metadata
    confidence TEXT, -- 'confirmed', 'announced', 'rumored'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deals_company ON deals(company_id);
CREATE INDEX idx_deals_type ON deals(deal_type);
CREATE INDEX idx_deals_date ON deals(announced_date);
CREATE INDEX idx_deals_investor ON deals(lead_investor_id);
```

### 2.2 Products Table

```sql
CREATE TABLE products (
    id TEXT PRIMARY KEY,
    company_id TEXT REFERENCES tracked_entities(id),

    -- Product details
    name TEXT NOT NULL,
    description TEXT,
    category TEXT, -- 'material', 'chemical', 'diagnostic', 'therapeutic', 'platform', 'service'

    -- Launch info
    launch_date DATE,
    launch_stage TEXT, -- 'research', 'pilot', 'beta', 'commercial', 'scaled'

    -- Market
    target_market TEXT,
    target_application TEXT[],
    competitive_alternatives TEXT,

    -- Performance
    key_metrics JSONB, -- {'conversion_rate': 0.99, 'scale': '100x', 'cost_reduction': '50%'}
    trl_level INTEGER, -- 1-9

    -- Regulatory
    regulatory_status TEXT, -- 'fda_approved', 'gras', 'in_trials', 'cleared', 'pending'
    regulatory_date DATE,

    -- References
    technology_ids TEXT[], -- JSON array of technology IDs
    source_document_id TEXT REFERENCES memories(id),
    source_url TEXT,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_company ON products(company_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_launch_date ON products(launch_date);
CREATE INDEX idx_products_regulatory_status ON products(regulatory_status);
```

### 2.3 Company Milestones Table

```sql
CREATE TABLE company_milestones (
    id TEXT PRIMARY KEY,
    company_id TEXT REFERENCES tracked_entities(id),

    -- Milestone details
    milestone_type TEXT, -- 'revenue', 'production_scale', 'customer', 'partnership', 'regulatory', 'team', 'technology'
    title TEXT NOT NULL,
    description TEXT,
    announced_date DATE,

    -- Quantitative (if applicable)
    metric_name TEXT, -- 'revenue_usd', 'production_volume', 'conversion_rate', 'cost_reduction_percent'
    metric_value NUMERIC,
    metric_unit TEXT,
    previous_value NUMERIC, -- for comparison

    -- Context
    significance TEXT, -- 'breakthrough', 'incremental', 'target_met', 'target_exceeded'
    source_document_id TEXT REFERENCES memories(id),
    source_url TEXT,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_milestones_company ON company_milestones(company_id);
CREATE INDEX idx_milestones_type ON company_milestones(milestone_type);
CREATE INDEX idx_milestones_date ON company_milestones(announced_date);
```

### 2.4 Technologies Table (Enhanced)

```sql
CREATE TABLE technologies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT, -- 'biomimicry', 'synthetic_biology', 'materials', 'energy', 'agriculture'

    -- Maturity
    trl_level INTEGER, -- 1-9
    market_readiness TEXT, -- 'research', 'pilot', 'commercial', 'scaled'

    -- Performance
    key_benefits TEXT[],
    performance_metrics JSONB,
    cost_competitiveness TEXT, -- 'cheaper', 'competitive', 'premium'

    -- Ecosystem
    pioneering_labs TEXT[], -- Research institutions that developed it
    commercial_companies TEXT[], -- Companies implementing it
    related_technologies TEXT[], -- Other tech IDs

    -- Market
    target_markets TEXT[],
    market_size_usd BIGINT,
    cagr_percent NUMERIC,

    -- Sources
    source_document_ids TEXT[],
    source_urls TEXT[],

    -- Metadata
    confidence TEXT, -- 'high', 'medium', 'low'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_technologies_category ON technologies(category);
CREATE INDEX idx_technologies_trl ON technologies(trl_level);
CREATE INDEX idx_technologies_market_readiness ON technologies(market_readiness);
```

---

## 3. Content Generation Pipeline

### 3.1 Entity Extraction from Documents

**Current**: Mention detection working (122 mentions in 1,000 docs)

**Enhancement Needed**: Extract structured data from documents

```javascript
// detect-entity-deals.js - NEW SCRIPT

const dealPatterns = [
    // Funding rounds
    /(\$[\d.]+[MBK]?)\s*(Series\s+[A-Z]|seed|pre-seed)\s*(funding|round|investment)/gi,
    /(raised|secured|closed)\s*(\$[\d.]+[MBK]?)/gi,
    /(led by|participated|invested by)\s+([A-Z][a-zA-Z\s&]+)/gi,

    // M&A
    /(acquires|acquired|acquisition of)\s+([A-Z][a-zA-Z\s]+)/gi,
    /(merger with|merged with)\s+([A-Z][a-zA-Z\s]+)/gi,

    // Partnerships
    /(partners with|partnership with|collaborates with)\s+([A-Z][a-zA-Z\s]+)/gi,
    /(signs agreement|announces collaboration)\s+(with\s+)?([A-Z][a-zA-Z\s]+)/gi,

    // Products
    /(launches|announces|unveils|introduces)\s+([A-Z][a-zA-Z0-9]+)/gi,
    /(product|platform|technology|system)\s+called\s+([A-Z][a-zA-Z0-9]+)/gi,

    // Milestones
    /achieves?\s+(\d+x|\d+%|\d+-fold)\s+(scale-up|increase|improvement)/gi,
    /(FDA|GRAS|Phase\s+[I-III])\s+(approval|clearance|status)/gi,
    /(commercial\s+scale|pilot\s+scale|production|manufacturing)/gi
];

function extractDeals(document) {
    const text = document.content.text;
    const entities = detectEntitiesInDocument(document.id, text);

    const deals = [];

    // Look for funding patterns when companies are mentioned
    for (const [entityId, entity] of entities) {
        if (entity.type === 'company') {
            // Extract funding info around company mentions
            const fundingMatches = extractFundingRounds(text, entity.name);
            deals.push(...fundingMatches.map(m => ({
                type: 'funding',
                company_id: entityId,
                ...m
            })));
        }
    }

    return deals;
}
```

### 3.2 WordPress Content Generation

**Enhanced Broadcast Generation**: Create entity-aware versions

```javascript
// generate-entity-focused-broadcasts.js

async function generateEntityFocusedBroadcast(document, deals) {
    // Detect which entities are central to this document
    const entities = await detectEntitiesInDocument(document.id, document.content.text);
    const primaryEntity = selectPrimaryEntity(entities, deals);

    if (!primaryEntity) {
        return null; // Not entity-focused, use standard broadcast
    }

    // Choose template based on what happened
    let template;
    if (deals.some(d => d.type === 'funding')) {
        template = 'funding_round';
    } else if (deals.some(d => d.type === 'product_launch')) {
        template = 'product_launch';
    } else if (hasPerformanceMilestone(document)) {
        template = 'performance_update';
    } else {
        template = 'company_mention';
    }

    // Generate broadcast with entity context
    const prompt = buildEntityAwarePrompt(primaryEntity, deals, document, template);
    const broadcast = await generateWithLLM(prompt);

    // Add entity metadata for WordPress
    broadcast.entity_ids = Array.from(entities.keys());
    broadcast.primary_entity_id = primaryEntity.id;
    broadcast.deal_ids = deals.map(d => d.id);
    broadcast.content_type = template;

    return broadcast;
}
```

### 3.3 WordPress Taxonomy Auto-Tagging

**On Article Creation**: Auto-apply entity tags

```php
// wordpress theme functions.php or plugin

function ai10bro_auto_tag_entities($post_id, $post_data) {
    // Get entity metadata from broadcast
    $entity_ids = get_post_meta($post_id, 'entity_ids', true);

    if (!empty($entity_ids)) {
        // Query Eliza database for entity details
        $entities = query_eliza_entities($entity_ids);

        foreach ($entities as $entity) {
            // Create/get tag for this entity
            $tag_id = ai10bro_get_or_create_entity_tag($entity);
            wp_set_post_tags($post_id, $tag_id, true);

            // Add to appropriate taxonomy
            switch ($entity['type']) {
                case 'company':
                    wp_set_post_terms($post_id, [$entity['name']], 'companies', true);
                    break;
                case 'lab':
                    wp_set_post_terms($post_id, [$entity['name']], 'research_labs', true);
                    break;
                case 'vc':
                    wp_set_post_terms($post_id, [$entity['name']], 'investors', true);
                    break;
            }
        }
    }
}
add_action('publish_post', 'ai10bro_auto_tag_entities', 10, 2);
```

---

## 4. Platform Integration Roadmap

### Phase 1: Entity Data Collection (Months 1-2)
- ✅ Entity tracking database (106 entities)
- ✅ Mention detection working
- 🔄 Deal extraction implementation
- 🔄 Product tracking implementation
- 🔄 Milestone detection

### Phase 2: Content Automation (Months 2-3)
- Entity-aware broadcast generation
- Deal-focused article templates
- Product launch article templates
- Company profile auto-generation
- WordPress auto-tagging

### Phase 3: Website Launch (Month 3)
- WordPress site with taxonomies
- Entity archive pages
- Deal database page (simple version)
- Auto-publishing pipeline
- Newsletter integration

### Phase 4: Platform MVP (Months 4-6)
- Full entity database UI
- Company screener
- Deal flow tracker
- Technology database
- Investor profiles

### Phase 5: Analytics & Intelligence (Months 7-12)
- Trend detection
- Network graph visualization
- Benchmarking tools
- Forecasting models
- API access

---

## 5. Immediate Next Steps (This Week)

### 1. Implement Deal Detection
```bash
node create-deal-tracking-schema.js  # Create deals table
node detect-entity-deals.js sample    # Test on 1000 docs
```

**Expected Output**: Extract 50-100 deals from sample

### 2. Generate Entity-Focused Broadcasts
```bash
node generate-entity-focused-broadcasts.js 10  # Generate 10 test broadcasts
```

**Success Criteria**: Broadcasts mention company context, funding history, related entities

### 3. Run Full Entity Mention Detection
```bash
node detect-entity-mentions.js full  # Scan all 21,155 documents
```

**Expected**: 1,000-2,000 entity mentions across corpus, top entities get rich profiles

### 4. Create Entity Profile Pages (WordPress)
- Company template: Name, description, funding history, products, recent mentions
- Lab template: Name, affiliation, PIs, research focus, spin-offs, recent papers
- VC template: Name, AUM, portfolio, recent deals, investment thesis

### 5. Test Entity Auto-Tagging
- Publish 10 test articles to WordPress
- Verify entity tags appear correctly
- Check archive pages load properly

---

## 6. Content Quality Improvements

### 6.1 Entity-Aware LLM Scoring Enhancement

**Current**: +10 points per entity mention (max +30)

**Enhancement**: Context-aware scoring

```javascript
// Enhanced scoring considers:
// 1. Entity mention count (+10 per entity, max +30) ✅ DONE
// 2. Entity centrality (is article ABOUT the entity?) +20
// 3. Deal presence (funding, M&A, partnership) +15
// 4. Product launch/milestone +15
// 5. Multiple entity interactions (partnerships, investments) +10

function calculateEntityAwareScore(document, entities, deals, products) {
    let baseScore = document.alignment_score * 100; // 0-100

    // Entity mention bonus (existing)
    const entityBonus = Math.min(entities.size * 10, 30);
    baseScore += entityBonus;

    // Centrality bonus (is document ABOUT an entity?)
    const primaryEntity = selectPrimaryEntity(entities, document);
    if (primaryEntity) {
        baseScore += 20;
    }

    // Deal presence bonus
    if (deals.length > 0) {
        baseScore += 15;
    }

    // Product/milestone bonus
    if (products.length > 0 || hasMilestone(document)) {
        baseScore += 15;
    }

    // Multi-entity interaction (partnerships, co-investments)
    if (entities.size >= 2 && hasEntityInteraction(document, entities)) {
        baseScore += 10;
    }

    return Math.min(baseScore / 100, 1.0); // Normalize to 0-1
}
```

### 6.2 Entity Context in Broadcasts

**Before**:
> "Cemvita achieves key milestones in biotechnology"

**After (Entity-Aware)**:
> "Cemvita achieves 100-fold FermOil™ scale-up 6 months early, positioning FermWorks™ for commercial viability. The Houston-based biotech previously raised $30M Series B led by Khosla Ventures in 2024."

**Context Added**:
- Product name (FermOil™, FermWorks™)
- Funding history ($30M Series B)
- Investors (Khosla Ventures)
- Location (Houston)
- Timeline context (6 months early)

---

## 7. Success Metrics

### Entity Database Health
- Target: 500 companies by Month 6
- Target: 100 labs
- Target: 50 VCs
- Target: 1,000 deals tracked
- Target: 500 products tracked
- Quality: 95%+ accuracy on verified entities

### Content Quality
- Entity mention rate: 50%+ of broadcasts mention tracked entity
- Entity-focused content: 20%+ of broadcasts are entity-centric (deals, products, milestones)
- Entity context: 80%+ of entity mentions include historical context

### Website Performance
- Entity archive pages: 500+ indexed by Google
- Entity-tagged articles: 2,000+ within 6 months
- Search traffic: 30% from entity-related queries
- User engagement: 2x time-on-page for entity-focused articles

### Platform Readiness
- Structured data coverage: 70%+ of entities have complete profiles
- Relationship mapping: 500+ company-investor edges
- Deal freshness: <24hr latency for major deals
- API readiness: 100% of entity data accessible via REST

---

## 8. Resources Needed

### Technical
- [ ] Database migration scripts (deals, products, milestones tables)
- [ ] Entity extraction pipeline enhancements
- [ ] WordPress theme with entity taxonomies
- [ ] Auto-tagging plugin/functions
- [ ] Entity profile page templates

### Content
- [ ] Deal article templates (6 types)
- [ ] Product launch templates
- [ ] Company profile templates
- [ ] Enhanced broadcast prompts (entity-aware)

### Operational
- [ ] Entity verification workflow (for deal accuracy)
- [ ] Data quality monitoring
- [ ] Content review process for entity articles
- [ ] Editorial guidelines for entity mentions

---

## Conclusion

Entity tracking transforms AI10BRO from a **document aggregator** to a **knowledge platform**. By tracking companies, deals, products, and investments, we can:

1. **Generate better content**: Entity-aware articles with context and history
2. **Build the platform**: Structured data ready for PEI-style analytics
3. **Improve discovery**: SEO-optimized entity pages drive organic traffic
4. **Serve target users**: Investors, corporates, researchers need entity intelligence

**Next Action**: Implement deal detection and run full entity mention scan across 21,155 documents.
