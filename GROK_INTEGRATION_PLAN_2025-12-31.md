# Grok Research Integration Plan - Phase 2
**Date**: 2025-12-31
**Status**: New comprehensive research received, ready for integration

---

## ✅ What Was Already Done (Dec 29, 2025)

### Implemented
1. **Top 5 RSS Feeds Added** to news scraper:
   - BioPharma Dive
   - Fierce Biotech
   - GEN (Genetic Engineering & Biotechnology News)
   - SynBioBeta
   - medRxiv

2. **Keywords Massively Expanded** - Added 2 new themes:
   - `commercial_milestones` (weight: 0.25) - 35 terms
   - `emerging_tech` (weight: 0.15) - 45 terms

3. **Result**: 28 → 196 broadcast-ready documents (+600% increase!)

---

## 🆕 What's NEW in Today's Research (Dec 31, 2025)

### 1. Additional RSS Feed Sources (15 more)
- FDA Announcements (openFDA API + RSS)
- Crunchbase Biotech (funding tracker)
- bioRxiv (preprints - more detailed than before)
- PitchBook Biotech (quarterly reports)
- Biotech Twitter Lists
- Business of Biotech Podcast (with transcripts)
- Labiotech.eu (European focus)
- Xtalks Biotech (funding tracker)
- Bio-IT World (conference proceedings)
- ISPE Biotechnology Conference (manufacturing focus)
- EPA Regulatory Announcements
- StartUs Insights Biotech
- BiotechBreakthroughAwards
- Clinical Trials Arena

### 2. Entity Lists (MAJOR NEW DATA)
- **50 Commercial Biotech Companies** with:
  - Website, Twitter handle, focus area
  - Funding stage (Seed → Public)
  - Recent milestones
  - Examples: Ginkgo Bioworks, Upside Foods, Perfect Day, Twist Bioscience

- **20 Research Labs/Institutions** with:
  - Principal investigators
  - Focus areas
  - Recent notable work
  - Examples: Broad Institute, Wyss Institute, J. Craig Venter Institute

- **20 Biotech VCs/Investors** with:
  - Twitter handles
  - Investment focus
  - Recent deals
  - Examples: ARCH Venture, Flagship Pioneering, a16z bio fund

### 3. Twitter Intelligence (MAJOR NEW DATA)
- **20 Key Twitter Accounts** to monitor:
  - @JohnCendpts (Endpoints News - breaks funding/deals daily)
  - @adamfeuerstein (STAT - trial results daily)
  - @RyanBethencourt (IndieBio VC - synbio founders)
  - @NatureBiotech (Nature Biotechnology - research/commercial)

- **Essential Hashtags**: #biotech, #synbio, #crispr, #fdaapproval, #clinicaltrials

- **Public Twitter Lists**:
  - "Biotech Influencers" by @veristat
  - "Synthetic Biology" by @f6s
  - "Biotech Twitter" by @feedspot (top 100)

### 4. Expanded Keywords (More Detailed Breakdown)
**200+ terms across 5 categories**:

- **Commercial Readiness** (35 terms): 100-fold scale-up, commercial scale, first customer, production facility, market entry, revenue-generating, pilot commercial, go-to-market, IPO ready, acquisition target

- **Regulatory Milestones** (25 terms): FDA approved, GRAS status, Phase II results, patent granted, EMA approval, IND filing, NDA submission, breakthrough therapy, fast track, CE mark, biosimilar approval

- **Scale & Manufacturing** (35 terms): Pilot scale, fermentation, bioreactor, yield optimization, titer, 10,000L, GMP compliant, process scale-up, fed-batch, continuous manufacturing, strain engineering, 100x yield

- **Emerging Technology** (45 terms): AlphaFold, prime editing, organoid, living material, cultivated meat, base editing, epigenetic editing, AI protein folding, mRNA therapeutics, phage display, single-cell sequencing, CAR-NK, bispecific antibodies

- **Industry-Specific** (60 terms across 5 industries):
  - Food biotech (12): Precision fermentation, alternative protein, cell-based meat, fungal protein, mycoprotein, lab-grown dairy
  - Materials (12): Mycelium, bio-concrete, spider silk, bio-plastics, brewed protein, chitin-based, bio-leather, self-healing materials
  - Energy (12): Enzymatic carbon capture, bio-solar, algal biofuels, microbial fuel cells, hydrogenase enzymes, bio-batteries
  - Medicine (12): Antibody engineering, phage therapy, CAR-T, oncolytic viruses, RNA vaccines, bispecifics, precision oncology
  - Agriculture (12): Bio-pesticide, nitrogen-fixing, CRISPR crops, RNA interference, drought-resistant, gene-edited seeds

### 5. Strategic Intelligence
- **Top 10 sources CEOs/VCs actually read**
- **Search terms investors use to find deals**
- **Preprint servers with highest commercial impact**
- **Regulatory databases with APIs**
- **Slack/Discord communities** (best signal-to-noise)
- **Podcasts featuring founder progress**
- **University tech transfer offices** to track
- **Patent classifications** for high-value IP
- **Conferences with open-access proceedings**

---

## 🎯 Integration Priorities

### IMMEDIATE (This Week) - High Impact, Low Effort

#### 1. Add Next 5 RSS Feeds ⭐ HIGHEST PRIORITY
**Why**: Immediate content boost with zero manual work
**Sources to add** (all FREE with RSS):
```yaml
# Add to gdelt-obsidian/search_config.yml

  - name: "FDA Announcements"
    type: "rss"
    url: "https://www.fda.gov/about-fda/contact-fda/stay-connected/rss-feeds/fda-newsroom/rss.xml"
    signal_quality: "high"
    focus: "regulatory_milestones"

  - name: "bioRxiv"
    type: "rss"
    url: "https://connect.biorxiv.org/biorxiv_xml.php?subject=synthetic_biology"
    signal_quality: "high"
    focus: "research_commercial_potential"

  - name: "Labiotech.eu"
    type: "rss"
    url: "https://www.labiotech.eu/feed/"
    signal_quality: "high"
    focus: "european_commercial_biotech"

  - name: "Clinical Trials Arena"
    type: "rss"
    url: "https://www.clinicaltrialsarena.com/feed/"
    signal_quality: "high"
    focus: "trial_results_commercial"

  - name: "Xtalks Biotech"
    type: "rss"
    url: "https://xtalks.com/feed/"
    signal_quality: "medium"
    focus: "funding_tracker"
```

**Expected Impact**: +30-50 articles/day

#### 2. Enhance LLM Scoring Prompt with Entity Mentions ⭐ HIGH PRIORITY
**Why**: LLM can detect company/entity mentions = higher commercial signal

**Update `llm-score-documents.js` prompt**:
```javascript
const SCORING_PROMPT = `Rate this content's alignment with AI10BRO's mission on a 0-100 scale.

AI10BRO Mission: Highlight COMMERCIAL innovations in biotech/synthetic biology/biomaterials

BONUS POINTS for mentioning these entities (+10 points each):
Companies: Ginkgo Bioworks, Upside Foods, Perfect Day, Twist Bioscience, Synthego,
           Bolt Threads, Mammoth Biosciences, Solugen, Crispr Therapeutics, Recursion

Research Labs: Broad Institute, Wyss Institute, J. Craig Venter Institute,
               Lawrence Berkeley National Lab, Caltech (Frances Arnold lab)

VCs: ARCH Venture, Flagship Pioneering, a16z bio, Khosla Ventures (bio deals)

Score HIGH (60-100) if:
1. In correct domain (biotech/synbio/biomaterials)
2. Commercial (products, funding, FDA approvals, market entry)
3. Mentions tracked entities (companies/labs/VCs above)
...
`;
```

**Expected Impact**: Better detection of high-value commercial content

#### 3. Add Industry-Specific Keywords to LLM Prompt ⭐ HIGH PRIORITY
**Why**: LLM scoring will recognize specialized commercial terms

**Update alignment themes in LLM prompt**:
```javascript
// Add to scoring prompt:
INCLUDE these SPECIFIC commercial terms:
✓ Food biotech: "precision fermentation", "cell-based meat", "fungal protein", "lab-grown dairy"
✓ Materials: "mycelium", "bio-concrete", "spider silk", "bio-plastics", "brewed protein"
✓ Energy: "enzymatic carbon capture", "bio-solar", "algal biofuels", "microbial fuel cells"
✓ Medicine: "CAR-T", "phage therapy", "RNA vaccines", "bispecifics", "antibody engineering"
✓ Agriculture: "bio-pesticide", "nitrogen-fixing", "CRISPR crops", "gene-edited seeds"
```

**Expected Impact**: +15-25% boost in commercial content detection

### SHORT-TERM (Next 2 Weeks)

#### 4. Entity Tracking Database
**Why**: Track mentions of key companies/labs/VCs in documents

**Create new database tables**:
```sql
-- Companies table
CREATE TABLE IF NOT EXISTS tracked_entities (
    id TEXT PRIMARY KEY,
    type TEXT, -- 'company', 'lab', 'vc'
    name TEXT,
    website TEXT,
    twitter TEXT,
    focus_area TEXT,
    metadata JSON
);

-- Entity mentions table
CREATE TABLE IF NOT EXISTS entity_mentions (
    id TEXT PRIMARY KEY,
    document_id TEXT,
    entity_id TEXT,
    mention_count INTEGER,
    context TEXT,
    FOREIGN KEY (document_id) REFERENCES memories(id),
    FOREIGN KEY (entity_id) REFERENCES tracked_entities(id)
);
```

**Populate with Grok's 90 entities**:
- 50 companies (Ginkgo, Upside, Perfect Day, etc.)
- 20 labs (Broad, Wyss, JCVI, etc.)
- 20 VCs (ARCH, Flagship, a16z bio, etc.)

**Expected Impact**: Better entity-based broadcast deduplication, trend tracking

#### 5. Twitter Monitoring (FREE API Tier)
**Why**: Breaking news 24-48 hours before RSS feeds

**Approach**:
1. Use Twitter API v2 free tier (10,000 tweets/month = 330/day)
2. Monitor top 10 accounts:
   - @JohnCendpts, @adamfeuerstein, @RyanBethencourt
   - @NatureBiotech, @helenbranswell
3. Filter for biotech hashtags + entity mentions
4. Store as documents with `source: twitter`

**Expected Impact**: +10-20 early commercial signals/day

### MEDIUM-TERM (Next Month)

#### 6. FDA API Integration
**Why**: Direct regulatory milestone tracking (approvals, trials)

**API**: openFDA (https://open.fda.gov/apis/)
**Endpoints**:
- `/drug/event.json` - Drug approvals
- `/drug/label.json` - Label changes (indicates market readiness)
- `/device/510k.json` - Medical device clearances

**Expected Impact**: +5-10 regulatory milestones/week

#### 7. Company Mention Detection in Broadcasts
**Why**: Tag broadcasts with company mentions for better targeting

**Implementation**:
```javascript
// Add to process-unprocessed-docs.js
function detectEntityMentions(text) {
  const entities = db.prepare(`SELECT name FROM tracked_entities`).all();
  const mentions = [];

  for (const entity of entities) {
    if (text.toLowerCase().includes(entity.name.toLowerCase())) {
      mentions.push(entity.name);
    }
  }

  return mentions;
}
```

**Expected Impact**: Better broadcast targeting, entity trend analysis

#### 8. Expand RSS Feeds (Next 10)
**Rationale**: After testing top 5, add more diversity

**Sources to add**:
- EPA Regulatory Announcements (bio-materials, agriculture)
- Business of Biotech Podcast (with transcripts)
- Bio-IT World (conference proceedings)
- ISPE Biotechnology Conference (manufacturing)
- StartUs Insights Biotech (startup tracker)
- BiotechBreakthroughAwards (quarterly milestones)
- Crunchbase Biotech (funding rounds - requires scraping or API)
- PitchBook Biotech (quarterly reports - paid)

### LONG-TERM (Months 2-3)

#### 9. Twitter Lists Integration
**Why**: Curated expert accounts

**Public lists to track**:
- "Biotech Influencers" by @veristat
- "Synthetic Biology" by @f6s
- "Biotech Twitter" by @feedspot (top 100)

#### 10. Podcast Transcript Scraping
**Why**: Founders discussing real progress

**Podcasts to scrape**:
- Business of Biotech (founders on scale-ups)
- The Long Run (milestones)
- Raising Biotech (fundraising/progress)

#### 11. Patent Tracking
**Why**: Early commercial signal (6-12 months before product)

**USPTO Classifications to monitor**:
- CPC A61K (medical preparations)
- C12N (microorganisms/enzymes)
- C12Q (testing processes)

---

## 📊 Expected Impact

### Content Discovery Improvements

**Before Dec 29**:
- Manual Obsidian clipping: ~10-20 articles/week
- GitHub scrapers: Working but limited sources
- Alignment scores: 28 broadcast-ready docs (>=12%)

**After Dec 29 (Keyword expansion)**:
- Same sources but better detection
- Alignment scores: 196 broadcast-ready docs (+600%)
- **Issue**: Keyword inflation required LLM scoring

**After Phase 2 (This plan)**:
- **RSS feeds**: +30-50 articles/day (5 new sources)
- **Twitter monitoring**: +10-20 signals/day (early breaking news)
- **FDA API**: +5-10 regulatory milestones/week
- **Entity tracking**: Better commercial signal detection
- **LLM scoring**: Already running, will incorporate entity mentions

**Success Metrics**:
- ✅ Commercial milestone detection within 12-24 hours (vs 48-72 hours now)
- ✅ 50% of broadcasts mention tracked entities (companies/labs/VCs)
- ✅ 90%+ reduction in manual clipping
- ✅ Higher quality broadcasts (entity mentions = commercial credibility)

### Content Quality Improvements

**Entity Recognition** (NEW):
- Broadcasts mentioning Ginkgo Bioworks, Upside Foods, Perfect Day, etc. = instant credibility
- VC mentions (ARCH, Flagship) = funding signal
- Lab mentions (Broad, Wyss) = research-to-commercial pipeline

**Source Diversity**:
- Before: 70% arXiv, 30% manual clippings
- After Dec 29: 40% research, 40% commercial news, 20% manual
- After Phase 2: 30% research, 50% commercial news, 15% Twitter, 5% manual

---

## 🚀 Implementation Steps

### Week 1 (Dec 31 - Jan 6)

**Day 1-2**: RSS Feed Integration
1. ✅ Review new Grok research
2. ⏭️ Add 5 new RSS feeds to `search_config.yml`
3. ⏭️ Test news scraper with new feeds
4. ⏭️ Verify articles importing to database

**Day 3-4**: LLM Scoring Enhancement
1. ⏭️ Update `llm-score-documents.js` prompt with:
   - Entity mention bonus (+10 points each)
   - Industry-specific keywords
   - Commercial term emphasis
2. ⏭️ Re-run LLM scoring on 500 recent documents to test
3. ⏭️ Compare scores before/after enhancement
4. ⏭️ Deploy if improvement >= 15%

**Day 5-7**: Entity Database Setup
1. ⏭️ Create `tracked_entities` and `entity_mentions` tables
2. ⏭️ Create script to populate from Grok lists
3. ⏭️ Import 50 companies + 20 labs + 20 VCs
4. ⏭️ Test entity mention detection

### Week 2 (Jan 7-13)

**Day 1-3**: Twitter API Integration
1. ⏭️ Register Twitter API v2 free tier
2. ⏭️ Create Twitter monitoring script
3. ⏭️ Monitor top 10 accounts
4. ⏭️ Filter and store tweets as documents

**Day 4-7**: Testing & Optimization
1. ⏭️ Monitor RSS feed quality (signal-to-noise)
2. ⏭️ Tune LLM scoring thresholds
3. ⏭️ Verify broadcast quality improvement
4. ⏭️ Document results

### Week 3-4 (Jan 14-27)

1. ⏭️ Add FDA API integration
2. ⏭️ Implement company mention detection in broadcasts
3. ⏭️ Add next 5 RSS feeds (if top 5 successful)
4. ⏭️ Begin Twitter lists monitoring

---

## 📝 Technical Notes

### Entity Mention Detection Algorithm
```javascript
function detectEntityMentions(text) {
  const textLower = text.toLowerCase();
  const entities = db.prepare(`SELECT id, name, type FROM tracked_entities`).all();
  const mentions = [];

  for (const entity of entities) {
    // Exact name match
    if (textLower.includes(entity.name.toLowerCase())) {
      mentions.push({
        entity_id: entity.id,
        entity_name: entity.name,
        entity_type: entity.type
      });
    }

    // Twitter handle match (if available)
    const twitter = db.prepare(`SELECT twitter FROM tracked_entities WHERE id = ?`).get(entity.id);
    if (twitter && twitter.twitter && textLower.includes(twitter.twitter.toLowerCase())) {
      mentions.push({
        entity_id: entity.id,
        entity_name: entity.name,
        entity_type: entity.type,
        mention_type: 'twitter_handle'
      });
    }
  }

  return mentions;
}
```

### RSS Feed Deduplication
- Already implemented via cache: `Notes/News_Notes/.cache/processed_articles.json`
- Uses MD5 hash of article URL
- Persists across runs
- **No changes needed**

### LLM Scoring Enhancement
- Current: Domain-specific prompt (biotech/synbio/biomaterials)
- Enhancement: Add entity recognition bonus
- Format: +10 points per entity mention (max +30)
- Example: "Ginkgo Bioworks announces..." = base 60 + 10 = 70%

### Twitter API Quotas
- Free tier: 10,000 tweets/month (330/day)
- Strategy: Monitor 10 accounts × 5 tweets/day = 50 tweets/day
- Headroom: 280 tweets/day for hashtag searches
- Cost: $0/month

### FDA API
- openFDA: Unlimited, rate-limited to 240 requests/minute
- No authentication required
- JSON responses
- Cost: $0/month

---

## ⚠️ Risks & Mitigations

**Risk 1**: New RSS feeds have poor signal-to-noise
- **Mitigation**: Test top 5 first, measure quality before adding more
- **Metric**: % of documents with alignment >= 0.15

**Risk 2**: Entity detection creates false positives (e.g., "Church" matching "George Church")
- **Mitigation**: Use full name matching + context window
- **Example**: Require "George Church" or "@geochurch" not just "church"

**Risk 3**: Twitter API quota exceeded
- **Mitigation**: Start with 10 accounts, monitor usage
- **Fallback**: Reduce to 5 accounts if needed

**Risk 4**: LLM scoring enhancement causes score inflation
- **Mitigation**: Test on 500 docs first, compare before/after
- **Threshold**: Deploy only if improvement >= 15% without inflation

---

## 📈 Success Criteria

### Immediate (Week 1)
- ✅ 5 new RSS feeds integrated and importing documents
- ✅ LLM scoring enhanced with entity mentions
- ✅ Entity database populated with 90 entities

### Short-term (Week 2-4)
- ✅ Twitter monitoring active for top 10 accounts
- ✅ Entity mention detection working in broadcasts
- ✅ Commercial milestone detection within 24 hours
- ✅ 50% of broadcasts mention tracked entities

### Long-term (Months 2-3)
- ✅ 80%+ reduction in manual content clipping
- ✅ 3-5x increase in high-quality broadcasts
- ✅ FDA API integrated and detecting regulatory milestones
- ✅ Comprehensive entity tracking and trend analysis

---

**Status**: Ready for implementation
**Priority**: IMMEDIATE - RSS feeds and LLM enhancement
**Owner**: Claude (me) + User approval for changes
**Timeline**: Week 1 starts NOW (Dec 31, 2025)
