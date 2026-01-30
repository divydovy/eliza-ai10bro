# BiologyInvestor Quick Start

## What Is BiologyInvestor?

**Purpose**: Monetize AI10BRO's bycatch content (8-12% alignment) by creating investor-focused intelligence for VCs and corporate development teams.

**Target Audience**: Venture capitalists, biotech investors, corporate development
**Revenue Model**: Premium subscription ($99-499/mo)
**Content Differentiation**: Deal flow intelligence vs general biotech news

## Daily Workflow

### 1. Generate Investor Broadcasts (Manual for now)
```bash
cd /Users/davidlockie/Documents/Projects/Eliza
/Users/davidlockie/.nvm/versions/node/v23.3.0/bin/node generate-biologyinvestor-broadcasts.js 5
```
- Analyzes bycatch documents (8-12% alignment)
- Detects investor signals (VC mentions, funding keywords, commercial milestones)
- Generates 800-1200 word investment analyses
- Threshold: ≥30% investor signal score
- Expected: ~8 viable documents per 100 bycatch docs analyzed

### 2. Publish to BiologyInvestor WordPress
```bash
CLIENT=biologyinvestor_insight /Users/davidlockie/.nvm/versions/node/v23.3.0/bin/node send-pending-to-biologyinvestor.js
```
- Publishes pending broadcasts to http://localhost:8886
- Custom post type: `investment-insight`
- Includes featured images and metadata
- Marks broadcasts as 'sent' in database

### 3. Review Published Content
```bash
open http://localhost:8886/investment-insights/
```

## Database Queries

### Check BiologyInvestor Pipeline
```sql
-- Pending broadcasts
SELECT COUNT(*) FROM broadcasts
WHERE client = 'biologyinvestor_insight' AND status = 'pending';

-- Published broadcasts
SELECT COUNT(*) FROM broadcasts
WHERE client = 'biologyinvestor_insight' AND status = 'sent';

-- View recent broadcasts
SELECT
    id,
    json_extract(content, '$.title') as title,
    alignment_score,
    status
FROM broadcasts
WHERE client = 'biologyinvestor_insight'
ORDER BY createdAt DESC
LIMIT 10;
```

### Check Bycatch Availability
```sql
-- Total bycatch pool
SELECT COUNT(*) FROM memories
WHERE type = 'documents'
AND alignment_score >= 0.08
AND alignment_score < 0.12;

-- Documents with entity mentions (high-quality candidates)
SELECT COUNT(DISTINCT m.id)
FROM memories m
JOIN entity_mentions em ON em.document_id = m.id
WHERE m.type = 'documents'
AND m.alignment_score >= 0.08
AND m.alignment_score < 0.12;
```

## Signal Detection

### Investor Signal Scoring (0-100%)

**Entity Mentions (40% weight)**:
- VC mention: +30% per VC (e.g., SOSV, Temasek, a16z)
- Company mention: +10% per company

**Funding Keywords (40% weight)**:
- Series A/B/C: +15%
- Funding amount: +15%
- IPO/Acquisition: +10%
- Valuation: +10%
- Unicorn: +5%

**Commercial Milestones (20% weight)**:
- FDA approval: +10%
- Clinical trial: +8%
- Commercial scale: +8%
- Partnership: +5%

### Threshold Decision
- **Target**: ≥30% investor signal score
- **Rationale**: Single VC mention (30%) + biotech context = valuable deal flow intelligence
- **Example**: "Carverr raised funding from SOSV" = 30% signal (VC mention alone)

## Content Strategy

### Daily Insight Structure (800-1200 words)
1. **Investment Thesis** (150-200w) - Why investors care, market size, quick take
2. **The Opportunity** (300-400w) - TAM/SAM/SOM, TRL, regulatory pathway
3. **Competitive Position** (200-300w) - Competitors, moats, strategic acquirers
4. **Risks & Considerations** (150-200w) - Technical, regulatory, market risks
5. **What to Watch** (100-150w) - 6-12 month milestones

### Tone
- Professional, analytical, data-driven
- Skeptical but fair
- Like reading a Pitchbook tearsheet
- Focus on: exit potential, TAM, competitive moats, risks

## WordPress Configuration

**Site**: http://localhost:8886
**Username**: eliza
**Password**: UfoT MbyuxLhH 2SXl 19PF uZda

**Custom Post Types**:
- `investment-insight` - Daily 800-1200 word analysis
- `deal-brief` - 300-500 word funding announcements
- `deep-dive` - 2000-3000 word comprehensive DD reports

**Custom Meta Fields**:
- `alignment_score` - Source document quality
- `source_url` - Original source link
- `eliza_document_id` - Database reference
- `funding_amount` - Deal size (deal-brief only)
- `company_name` - Company name (deal-brief only)
- `lead_investors` - Investor list (deal-brief only)

## Expected Content Volume

**Current Pipeline**:
- Total bycatch: 5,682 documents
- With investor signals (≥30%): ~450 documents (8% of bycatch)
- Conversion rate: 8% of bycatch → BiologyInvestor content

**Publishing Schedule** (when automated):
- Daily Insights: 3 per day (every 8 hours)
- Expected volume: 90-100 insights/month
- Pipeline depth: ~5 months at current rate

## Troubleshooting

### "Module version mismatch" Error
Use Node 23.3.0 explicitly:
```bash
/Users/davidlockie/.nvm/versions/node/v23.3.0/bin/node <script.js>
```

### "Command failed: ollama run" Error
Fixed in generate-biologyinvestor-broadcasts.js (using echo pipe instead of command-line args)

### Zero Broadcasts Generated
Check signal detection:
```bash
/Users/davidlockie/.nvm/versions/node/v23.3.0/bin/node test-all-signals.js
```

### WordPress 401 Unauthorized
Verify credentials in `/Users/davidlockie/Studio/biologyinvestor/ELIZA_CREDENTIALS.md`

## Next Steps

1. ✅ Test 3 generated broadcasts
2. ⏭️ Publish to WordPress and review quality
3. ⏭️ Integrate into main pipeline (process-unprocessed-docs.js)
4. ⏭️ Set up automated publishing schedule (cron)
5. ⏭️ Beta test with 5-10 VCs
6. ⏭️ Scale to other bycatch sites (Research, Methodology, Regional)

## Revenue Projections

**Target**: 500 subscribers at $99/mo = $50K/mo ARR
**Differentiation**: Deal flow intelligence vs general biotech news (AI10BRO)
**Zero Marginal Cost**: Content already collected, just routing differently
