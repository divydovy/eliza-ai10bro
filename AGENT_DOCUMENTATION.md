# AI10BRO Agent - Complete Documentation
**Date**: 2026-01-21
**Agent**: AI10BRO (Eliza-based Biotechnology Broadcasting System)

---

## 1. Agent Capabilities and Limitations

### Core Identity
**Mission**: Accelerate humanity's transition to a sustainable future by identifying and amplifying innovations that solve major problems

**Voice & Style**:
- Biomimetic perspective (views technology through nature's lens)
- Precise, factual language without flowery descriptions
- Direct communication focused on practical applications
- Quiet enthusiasm conveying genuine wonder about natural/tech convergence

### Technical Architecture

#### Model Configuration
- **LLM**: Ollama qwen2.5:32b (21GB, 128K context)
- **Embeddings**: mxbai-embed-large:latest
- **Temperature**: 0.3 (focused, consistent outputs)
- **Max Context**: 30,000 tokens
- **Provider**: Local Ollama (zero API costs)

#### Active Plugins
1. **@elizaos/plugin-obsidian** - Personal knowledge base integration
2. **@elizaos/plugin-dashboard** - System monitoring and analytics
3. **@elizaos/plugin-broadcast** - Multi-platform content distribution
4. **@elizaos/plugin-github** - Repository synchronization

### Broadcasting Capabilities

#### Supported Platforms
| Platform | Status | Schedule | Features |
|----------|--------|----------|----------|
| Telegram | ✅ Active | Hourly at :00 | Direct bot integration, admin controls |
| Bluesky | ✅ Active | Hourly at :40 | Image attachments, thread support |
| WordPress | ✅ Active | Every 4hrs at :20 | Full articles (800-1200 words), featured images |
| Farcaster | ⏸️ Paused | Manual only | Requires active signer ($20-50/mo) |
| Twitter/X | ❌ Disabled | N/A | Credentials available but not integrated |

#### Broadcast Generation
- **Frequency**: Every 6 hours (4am, 10am, 4pm, 10pm)
- **Batch Size**: 20 documents per run
- **Quality Threshold**: ≥8% alignment score (general), ≥20% (WordPress Insights)
- **Image Generation**: JIT (Just-In-Time) via Gemini API when sending
- **Content Types**:
  - Short-form (Telegram/Bluesky): 750 chars max, direct and factual
  - Long-form (WordPress): 800-1200 words, detailed analysis with sources

### Content Pipeline

#### 1. Content Import
**Sources**:
- **GitHub Repository** (ai10bro-gdelt): 14,309 markdown files
  - Papers, Notes, Reddit discussions, arXiv/bioRxiv papers
  - Daily sync at 2:00am via git clone (zero API calls)

- **Obsidian Vault**: Personal notes and curated content
  - iCloud sync: iCloud~md~obsidian/Documents/AI10bro
  - Daily import at 2:30am via Obsidian Local REST API

- **RSS Feeds** (via GitHub Actions): 21 biotechnology sources
  - BioPharma Dive, Fierce Biotech, GEN, SynBioBeta, medRxiv
  - Nature Biotech, STAT News, Cell Press, ACS Synthetic Biology
  - BioSpace, Endpoints News, FDA, EPA, bioRxiv

#### 2. Alignment Scoring (LLM-Based)
**Model**: qwen2.5:32b (local Ollama)

**Scoring Criteria**:
- Biology Focus: Must involve living organisms or biological processes
- Domain Relevance: Biotechnology, synthetic biology, biomaterials, bioengineering
- Commercial Viability: Products, funding, FDA approval, market launches
- Entity Mentions: +10 points per tracked entity (max +30)

**Thresholds**:
- ≥8%: Broadcast-ready (general platforms)
- ≥12%: High-priority broadcasts
- ≥20%: WordPress Insights eligible
- ≥30%: Premium quality content

**Schedule**:
- Hourly scoring: New documents (score-new-documents.js at :30)
- Nightly batch: All unscored documents (3:00am)

#### 3. Content Cleanup
**Tombstone System**:
- Documents <8% alignment converted to tombstones at 3:50am
- Content deleted, hash retained (prevents re-import)
- Maintains database health (31% broadcast-ready ratio)

#### 4. Broadcast Creation
- Generates platform-specific content using dedicated LLM prompts
- Creates Telegram, Bluesky, WordPress, Farcaster broadcasts simultaneously
- Stores in database as "pending" status

#### 5. Distribution
- Platform-specific send scripts query pending broadcasts
- Images generated JIT (Gemini API, free tier: 1,500/day)
- Broadcasts marked "sent" after successful posting
- Failed broadcasts logged for manual review

### Database Schema

**Core Tables**:
- `memories` (38,258 documents): Content storage with alignment scores
- `broadcasts` (5,952 total): Platform-specific broadcast queue
- `tracked_entities` (117 entities): Companies, labs, VCs for entity detection
- `entity_mentions` (101 mentions): Document-entity relationships
- `company_milestones`, `deals`, `products`: Commercial signal tracking

### Entity Tracking System

**Tracked Entities** (117 total):
- **67 Companies**: Ginkgo Bioworks, Upside Foods, Perfect Day, Illumina, Sanofi, etc.
- **30 Research Labs**: Broad Institute, MIT, Stanford Bio-X, JCVI, etc.
- **20 VCs**: ARCH Venture, Flagship Pioneering, a16z bio, Khosla Ventures, etc.

**Detection**:
- LLM scoring identifies entity mentions in content
- +10 alignment points per entity mention (max +30)
- 51% of high-quality documents mention tracked entities

### Automation Schedule

```
2:00am  → GitHub repository sync (14,309 files)
2:30am  → Obsidian vault import
3:00am  → Alignment scoring (batch, all unscored)
3:30am  → GitHub scraper content import
3:50am  → Cleanup unaligned documents (tombstones)

4:00am  → Broadcast creation (20 docs)
10:00am → Broadcast creation (20 docs)
4:00pm  → Broadcast creation (20 docs)
10:00pm → Broadcast creation (20 docs)

Hourly:
:00 → Send Telegram broadcasts
:30 → Score new documents (LLM)
:40 → Send Bluesky broadcasts

Every 4 hours:
:20 → Send WordPress Insights (9 articles per run = 54/day)

Every 12 hours:
3:30am, 3:30pm → Import GitHub scraper content

Daily:
8:00am → Quality checks
```

### Current Performance Metrics

**Content Database**:
- Total documents: 38,258
- Broadcast-ready (≥12%): 2,623 (6.9%)
- High quality (≥30%): 522 (1.4%)
- Active docs: ~7,400 (non-tombstone)

**Broadcast Queue**:
- Pending: 4,561 broadcasts
- Sent: 1,377 broadcasts
- Success rate: ~95% (failures mostly Bluesky API hiccups)

**Platform Distribution** (Sent):
- Telegram: 667 posts
- Bluesky: 655 posts (7 failed)
- WordPress: 58 articles
- Farcaster: 0 (paused, no signer)

**Publishing Rates**:
- Telegram: 24 posts/day (1 per hour)
- Bluesky: 24 posts/day (1 per hour)
- WordPress: 54 articles/day (9 every 4 hours)
- Total: 102 pieces of content per day

### Limitations

#### Technical Constraints
1. **Local LLM Only**: No cloud API fallback if Ollama unavailable
2. **Farcaster Disabled**: Requires paid signer service ($20-50/mo)
3. **Twitter/X Not Integrated**: Credentials exist but platform not connected
4. **Image Generation Quota**: Limited to 1,500 images/day (Gemini free tier)
5. **WordPress Local Only**: Running on localhost:8885, not production server

#### Content Quality
1. **Alignment Scoring Variability**: LLM scoring can vary ±5-10% between runs
2. **Off-Topic Content**: ~93% of imported content below 8% threshold (filtered)
3. **Entity Detection**: Only 51% of high-quality docs mention tracked entities
4. **Commercial Signal**: Heavy bias toward research vs market-ready products

#### Operational
1. **Manual Restarts**: WordPress server requires manual restart if it crashes
2. **No Error Recovery**: Failed broadcasts remain in "failed" state (no auto-retry)
3. **Image Storage**: Generated images stored locally, not backed up
4. **Log Rotation**: No automatic log cleanup (manual maintenance required)

#### Scalability
1. **Single Instance**: No redundancy or failover
2. **Local Processing**: Limited by single machine compute
3. **Database Size**: SQLite may hit limits beyond 1M documents
4. **Cron Dependency**: All automation relies on crontab (no systemd/launchd)

---

## 2. Current Implementation Status

### Production Systems (Green)

#### ✅ Content Import Pipeline
- **Status**: Fully operational
- **GitHub Sync**: 14,309 files imported, 100% coverage
- **Obsidian Import**: Daily sync working
- **RSS Feeds**: 21 sources active via GitHub Actions

#### ✅ LLM Scoring System
- **Status**: Fully operational
- **Model**: qwen2.5:32b (GPT-4o equivalent)
- **Hourly Processing**: New documents scored within 1 hour
- **Batch Processing**: Nightly batch completes all unscored
- **Quality**: 79% of documents have LLM scores

#### ✅ Entity Tracking
- **Status**: Deployed and operational
- **Entities**: 117 tracked (67 companies, 30 labs, 20 VCs)
- **Mentions**: 101 detected across documents
- **Integration**: Entity mentions boost alignment scores

#### ✅ Broadcast Generation
- **Status**: Fully operational
- **Frequency**: Every 6 hours (4x daily)
- **Batch Size**: 20 documents per run
- **Platforms**: Telegram, Bluesky, WordPress, Farcaster (all generated)

#### ✅ Platform Distribution
- **Telegram**: Hourly posts, 667 sent, 100% success rate
- **Bluesky**: Hourly posts, 655 sent, 99% success rate
- **WordPress**: 54 articles/day, 58 sent, 100% image coverage

#### ✅ Image Generation
- **Status**: JIT generation via Gemini API
- **Coverage**: 100% of WordPress posts have featured images
- **Cost**: $0/month (free tier, 1,500 images/day)
- **Quality**: 1024px scientific illustrations

#### ✅ Quality Systems
- **Tombstone Cleanup**: Daily at 3:50am, maintains 31% broadcast-ready ratio
- **Alignment Monitoring**: Hourly tracking via sync-broadcast-scores.js
- **Quality Checks**: Daily validation at 8:00am

### Paused Systems (Yellow)

#### ⏸️ Farcaster Publishing
- **Status**: Broadcasts generated but not sending
- **Reason**: No active Farcaster signer ($20-50/mo cost)
- **Queue**: 1,412 pending broadcasts ready to send
- **Action Required**: Activate signer if Farcaster distribution desired

#### ⏸️ WordPress Deep Dives
- **Status**: Manual review workflow
- **Queue**: 139 pending broadcasts (≥42.6% alignment)
- **Reason**: Long-form content (2,000-4,000 words) requires human review
- **Frequency**: As needed (not automated)

### Disabled Systems (Red)

#### ❌ Twitter/X Integration
- **Status**: Not implemented
- **Credentials**: Available in character config
- **Reason**: Risk of account suspension (automation against ToS)
- **Alternative**: Manual posting or $100/mo API tier

#### ❌ OpenRouter API
- **Status**: Completely disabled
- **Reason**: Burned through all credits, using free local Ollama instead
- **Impact**: Zero API costs, but requires local compute

### Recent Fixes (Last 7 Days)

#### January 20, 2026
- ✅ Fixed WordPress authentication (Application Passwords)
- ✅ Increased image upload limit (2MB → 10MB)
- ✅ Cleaned 402 malformed WordPress broadcasts
- ✅ Increased publishing rate (6 → 54 articles/day)
- ✅ Backfilled 18 missing images on existing posts

#### January 21, 2026
- ✅ Generated 28 missing WordPress images via Gemini API
- ✅ Achieved 100% WordPress image coverage (73/73 posts)
- ✅ Created batch generation pipeline for future images

### Known Issues

#### Low Priority
1. Bluesky occasional 500 errors (7 failed out of 662 attempts)
2. Punycode deprecation warnings (Node.js 23.x)
3. Manual WordPress server restart required after system reboot
4. No log rotation (logs growing unbounded)

#### Medium Priority
1. 4,561 pending broadcasts queued (backlog clearance: ~45 days at current rate)
2. Only 6.9% of documents reach broadcast threshold (aggressive filtering)
3. Entity mentions detected in only 101 documents (low coverage)
4. No automated backup of generated images

#### No Current Issues
- All critical systems operational
- No authentication failures
- No API rate limit issues
- No database corruption

---

## 3. Development Priorities

### Immediate Priorities (Next 7 Days)

#### Priority 1: Increase Content Quality Signal
**Problem**: Only 6.9% of documents reach broadcast threshold
**Impact**: HIGH - Limited content pipeline despite 38K documents

**Actions**:
1. **Tune LLM Scoring Prompt**
   - Reduce off-topic filtering (too aggressive)
   - Add more commercial keywords (current: 80, target: 150)
   - Adjust entity mention weighting (current: +10, test: +15)

2. **Expand Entity Tracking**
   - Add Phase 3 entities: NIH, FDA, EPA (regulatory bodies)
   - Add top 50 biotech founders/researchers
   - Target: 200 total entities (current: 117)

3. **RSS Feed Quality Check**
   - Audit 21 current feeds for signal quality
   - Add 10 more high-signal sources (e.g., BioCentury, Labiotech)
   - Remove low-signal feeds if SNR < 5%

**Expected Impact**: +50-100% increase in broadcast-ready documents

---

#### Priority 2: Clear Pending Broadcast Backlog
**Problem**: 4,561 pending broadcasts, 45-day clearance time
**Impact**: MEDIUM - Stale content, delayed distribution

**Actions**:
1. **Temporary Rate Increase**
   - Telegram: 1/hr → 2/hr (48/day)
   - Bluesky: 1/hr → 2/hr (48/day)
   - Duration: 30 days until backlog cleared

2. **Batch Delete Old Broadcasts**
   - Identify broadcasts >30 days old
   - Delete if alignment score <12%
   - Keep high-quality (≥20%) for WordPress

3. **Priority Queue Implementation**
   - Send highest alignment scores first
   - Age penalty: -0.5% per day older than 7 days
   - Ensures fresh content prioritized

**Expected Impact**: Backlog cleared in 15-20 days instead of 45

---

#### Priority 3: Production WordPress Deployment
**Problem**: WordPress running on localhost:8885 only
**Impact**: LOW - Functional but not production-ready

**Actions**:
1. **Domain Setup**
   - Point ai10bro.com to production server
   - Configure SSL (Let's Encrypt)
   - Update DNS records

2. **Server Migration**
   - Move from `php -S` to nginx + php-fpm
   - Configure proper upload limits (10MB)
   - Set up Application Passwords

3. **Deployment Automation**
   - Update crontab with production URL
   - Test image uploads on production
   - Monitor first 24 hours of automated publishing

**Expected Impact**: Public-facing WordPress site with full automation

---

### Short-Term Priorities (Next 30 Days)

#### Priority 4: Farcaster Integration
**Decision Required**: Enable or permanently remove?

**Option A: Enable** ($20-50/mo)
- Activate Farcaster signer
- Deploy 1,412 pending broadcasts
- Add to hourly sending schedule
- **Pros**: Reach crypto/web3 audience, diversify platforms
- **Cons**: Ongoing cost, audience overlap with Bluesky

**Option B: Remove**
- Delete 1,412 pending Farcaster broadcasts
- Remove from broadcast generation
- Stop creating Farcaster content
- **Pros**: Simplify system, reduce queue
- **Cons**: Lose potential audience

**Recommendation**: Remove unless specific Farcaster audience value identified

---

#### Priority 5: Image Generation Optimization
**Current**: JIT generation works but could be optimized

**Actions**:
1. **Pre-generate During Broadcast Creation**
   - Generate images during process-unprocessed-docs.js
   - Reuse images across platforms (already works)
   - Reduces send-time latency

2. **Image Quality Tiers**
   - Telegram/Bluesky: 512px (faster generation)
   - WordPress: 1024px (current)
   - Deep Dives: 2048px (premium quality)

3. **Fallback Strategy**
   - If Gemini API fails, use placeholder image
   - Retry failed generations next day
   - Track generation success rate

**Expected Impact**: Faster sends, more reliable image attachment

---

#### Priority 6: Entity Mention Detection Enhancement
**Current**: Only 101 entity mentions detected (0.3% of documents)

**Actions**:
1. **Implement Dedicated Detection Pass**
   - Run entity detection on all documents ≥12% alignment
   - Use regex + LLM confirmation for accuracy
   - Store in entity_mentions table

2. **Entity Relationship Mapping**
   - Track company partnerships (e.g., Genentech + Sanofi)
   - Identify VC investment patterns
   - Map lab → company spin-offs

3. **Entity-Focused Newsletters**
   - Weekly digest: "Top 10 entities mentioned this week"
   - Company-specific feeds (e.g., "Ginkgo Bioworks Updates")
   - Investor reports for tracked VCs

**Expected Impact**: 10x increase in detected mentions, enable entity analytics

---

### Medium-Term Priorities (Next 90 Days)

#### Priority 7: Multi-Model Architecture
**Problem**: Single LLM (qwen2.5:32b) for all tasks

**Actions**:
1. **Task-Specific Models**
   - Scoring: qwen2.5:32b (current, works well)
   - Short-form generation: llama3.3:8b (faster, good quality)
   - WordPress articles: qwen2.5:72b or deepseek-v3 (higher quality)

2. **Model Performance Benchmarking**
   - Test 5-10 models on 100 sample documents
   - Measure: alignment accuracy, generation quality, speed
   - Select optimal model per task

3. **Fallback Chain**
   - Primary: Local Ollama
   - Secondary: OpenRouter (if budget allows)
   - Tertiary: Anthropic API (for critical tasks only)

**Expected Impact**: 30-50% faster processing, better long-form quality

---

#### Priority 8: Analytics and Reporting Dashboard
**Current**: Dashboard shows basic metrics, could be enhanced

**Actions**:
1. **Engagement Tracking**
   - Telegram: Message views, forwards
   - Bluesky: Likes, reposts, replies
   - WordPress: Page views, time on page

2. **Content Performance Analysis**
   - Top-performing topics by platform
   - Alignment score vs engagement correlation
   - Entity mention impact on performance

3. **Automated Reports**
   - Weekly summary: "This week in biotechnology"
   - Monthly trends: Entity activity, topic clusters
   - Quarterly review: System health, quality metrics

**Expected Impact**: Data-driven content optimization, better audience understanding

---

#### Priority 9: Content Recommendation Engine
**Goal**: Help users discover relevant content based on interests

**Actions**:
1. **User Interest Profiles**
   - Track user interactions (Telegram commands, WordPress visits)
   - Build interest vectors from engagement
   - Cluster users by topic preferences

2. **Personalized Digests**
   - Telegram: /digest command for personalized content
   - Email: Weekly newsletter with user-specific content
   - WordPress: "Recommended for you" section

3. **Feedback Loop**
   - Thumbs up/down on broadcasts
   - Topic preferences in Telegram bot
   - Use feedback to refine recommendations

**Expected Impact**: Higher engagement, better retention, stronger community

---

### Long-Term Vision (Next 6-12 Months)

#### Vision 1: Deal Flow Intelligence Platform
**Goal**: Become go-to source for biotech investment intelligence

**Components**:
1. **Real-Time Deal Detection**
   - FDA approvals within 24 hours
   - Series B+ funding rounds within 6 hours
   - M&A announcements within 12 hours

2. **Company Intelligence Profiles**
   - Auto-generated dossiers for 200+ tracked companies
   - Funding history, product pipeline, key hires
   - Competitive landscape analysis

3. **Investor Network**
   - Track VC portfolio activity
   - Identify emerging investment themes
   - Connect founders with relevant investors

**Monetization**: Premium tier for investors ($99-499/mo)

---

#### Vision 2: AI-Powered Research Assistant
**Goal**: Help researchers stay current with biotech literature

**Components**:
1. **Paper Summarization**
   - Daily digest of arXiv/bioRxiv papers
   - 3-sentence summaries + key findings
   - Link to original papers + related work

2. **Research Topic Tracking**
   - Follow specific proteins, pathways, organisms
   - Alert when new research published
   - Trend analysis: "CRISPR research up 40% this quarter"

3. **Literature Graph**
   - Map citation networks
   - Identify influential papers
   - Predict research directions

**Monetization**: Academic tier ($29-99/mo)

---

#### Vision 3: Biomimicry Innovation Database
**Goal**: Bridge natural systems and technological solutions

**Components**:
1. **Nature-Tech Mapping**
   - 10,000+ natural systems cataloged
   - Link to technological applications
   - Search: "How does nature solve X?"

2. **Innovation Opportunities**
   - Identify unsolved natural problems
   - Match to technological capabilities
   - Generate biomimetic design ideas

3. **Collaboration Platform**
   - Connect biologists with engineers
   - Facilitate biomimetic projects
   - Track successful nature-inspired innovations

**Monetization**: Enterprise tier for R&D departments ($1K-10K/mo)

---

## Summary

### Current State
✅ **Production-Ready Broadcasting System**
- 102 pieces of content per day across 3 platforms
- 100% automated pipeline (import → score → generate → distribute)
- Zero API costs (local LLM + free image generation)
- High reliability (95%+ success rate)

### Immediate Focus
1. **Increase content quality signal** (more broadcast-ready docs)
2. **Clear pending broadcast backlog** (4,561 → 0 in 15-20 days)
3. **Deploy production WordPress** (public-facing site)

### Next 30 Days
- Optimize image generation (pre-generate during creation)
- Enhance entity detection (10x coverage increase)
- Decide on Farcaster (enable or remove)

### Vision (6-12 Months)
- Deal flow intelligence platform for investors
- AI research assistant for academics
- Biomimicry innovation database for R&D

---

**Documentation Status**: ✅ COMPLETE
**Last Updated**: 2026-01-21
**Next Review**: 2026-02-21 (monthly cadence)
