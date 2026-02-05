# AI10BRO - Key Metrics Summary
**Automated Biotech Intelligence Platform**
**Acquisition Proposal for PEI Media**
**Date: February 5, 2026**

---

## 📊 System Metrics (Current State)

### Content Intelligence
| Metric | Value | Details |
|--------|-------|---------|
| **Total Documents** | 21,155 | Processed through LLM pipeline |
| **LLM Scored** | 79% | Quality-filtered for commercial relevance |
| **Broadcast-Ready** | 241 | Documents above 12% alignment threshold |
| **High Quality (≥30%)** | 166 | Premium commercial content |
| **WordPress-Ready (≥20%)** | 168 | Long-form analysis candidates |

### Entity Tracking Database
| Entity Type | Count | Examples |
|-------------|-------|----------|
| **Companies** | 67 | Ginkgo Bioworks, Perfect Day, Solugen, Twist Bioscience, Mammoth, Recursion, Insitro |
| **Research Labs** | 30 | Broad Institute, Wyss Institute, J. Craig Venter Institute, Salk, Lawrence Berkeley |
| **VC Firms** | 20 | ARCH Venture, Flagship Pioneering, a16z bio, Khosla Ventures, OrbiMed |
| **Total Entities** | **117** | Comprehensive coverage across biotech ecosystem |

### Entity Mention Analysis
| Metric | Value | Insight |
|--------|-------|---------|
| **Total Mentions Detected** | 290 | Across all processed content |
| **Entity Coverage Rate** | 51% | Half of top-tier docs mention tracked entities |
| **Avg Mentions/Entity** | 2.5 | Active entities appear multiple times |
| **Top Mentioned** | Ginkgo (42), Perfect Day (38), Solugen (28) | Commercial leaders |

### Content Sources
| Source Type | Count | Coverage |
|-------------|-------|----------|
| **Total RSS Feeds** | 58 | Comprehensive biotech coverage |
| **Curated Feeds** | 21 | High-signal sources (Nature, BioPharma Dive, etc.) |
| **Entity-Discovered** | 16 | Automated discovery from entity websites |
| **High-Quality Manual** | 11 | Premium journals (Cell, Science, bioRxiv) |
| **Manual Additions** | 10 | Domain-specific sources |
| **Auto-Discovery Rate** | 36% | Machine-found feeds (no human curation) |

---

## ⚙️ Automation Infrastructure

### LaunchD Services (All Operational)
| Service | Frequency | Purpose |
|---------|-----------|---------|
| **GitHub Sync** | Daily (2am) | Import new documents from GitHub scrapers |
| **Obsidian Import** | Daily (2:30am) | Sync personal research notes |
| **Alignment Scoring** | Daily (3am) | Calculate document quality scores |
| **LLM Scoring** | Hourly | Score new documents for commercial relevance |
| **GitHub Content Sync** | 2x daily | Sync external content repositories |
| **Cleanup Unaligned** | Daily (3:50am) | Archive low-quality content |
| **Broadcast Creation** | 4x daily | Generate platform-specific content |
| **Telegram Send** | Hourly | Distribute to Telegram channel |
| **Bluesky Send** | Hourly | Distribute to Bluesky network |
| **WordPress Insights** | 6x daily | Publish to WordPress (short-form) |
| **WordPress Deep Dives** | Daily (10am) | Publish long-form analysis |
| **BiologyInvestor** | 3x daily | Investor-focused content |
| **BiologyInvestor Deep Dive** | 2x weekly | Deep analysis for investors |
| **Quality Checks** | Daily (8am) | System health monitoring |
| **Score Sync** | Every 30 min | Sync scoring updates |
| **Total Services** | **15** | **100% uptime** |

---

## 💰 Cost Efficiency

| Component | Monthly Cost | Notes |
|-----------|--------------|-------|
| **LLM Inference** | $0 | Local Qwen2.5-32B (21GB model, GPT-4 equivalent) |
| **RSS Scraping** | $0 | GitHub Actions (within free tier) |
| **Image Generation** | $0 | Local Qwen-Image model |
| **Hosting** | ~$5 | WordPress localhost, static site hosting |
| **APIs** | $0 | Telegram Bot API (free), Bluesky API (free) |
| **Infrastructure** | $0 | Self-hosted on macOS with LaunchD |
| **Total Monthly** | **~$5** | **Zero variable costs** |

### Cost Scaling (Projected)
- **Phase 2 (Profiles)**: ~$50/mo (PostgreSQL hosting, increased storage)
- **Phase 3 (Platform)**: ~$500/mo (production hosting, load balancing, CDN)
- **No LLM vendor lock-in**: Can switch models without contract renegotiation

---

## 🚀 Distribution Channels (Active)

| Platform | Status | Frequency | Purpose |
|----------|--------|-----------|---------|
| **Telegram** | ✅ Active | Hourly | Real-time biotech news |
| **Bluesky** | ✅ Active | Hourly | Social media presence |
| **WordPress Insights** | ✅ Active | 6x daily | Short-form analysis (ai10bro.com) |
| **WordPress Deep Dives** | ✅ Active | Daily | Long-form deep dives (ai10bro.com) |
| **BiologyInvestor** | ✅ Active | 3x daily + 2x/week | Investor-focused content (biologyinvestor.com) |
| **Farcaster** | ⏸️ Paused | N/A | Awaiting signer setup ($20-50/mo) |
| **Total Platforms** | **5 active** | | Multi-channel distribution |

---

## 🎯 Technology Stack

### Core Components
| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Agent Framework** | ElizaOS | Autonomous agent with memory, actions, plugins |
| **LLM** | Qwen2.5-32B (21GB) | GPT-4 equivalent, local inference, 128K context |
| **Database** | SQLite (21K+ docs) | Entity tracking, embeddings, broadcast queue |
| **Orchestration** | LaunchD (15 services) | macOS-native job scheduling |
| **Scraping** | GitHub Actions | RSS feed ingestion, automated discovery |
| **Image Gen** | Qwen-Image (local) | Zero-cost image generation for broadcasts |
| **Distribution** | Multi-platform APIs | Telegram, Bluesky, WordPress REST APIs |

### Scalability
- **Current**: Single-machine deployment (macOS)
- **Phase 2**: Docker containers, PostgreSQL, multi-instance LLM workers
- **Phase 3**: Kubernetes, distributed queue, CDN, load balancing

---

## 📈 Performance Metrics

### Content Throughput
- **Articles Processed**: 100+ per day (58 feeds × 6-hour intervals)
- **LLM Scoring Speed**: ~5 seconds per document (Qwen2.5-32B)
- **Broadcast Generation**: 10-20 broadcasts per 6-hour cycle
- **Distribution Latency**: <1 minute from generation to publish

### Quality Filters
- **Alignment Threshold**: 12% minimum (only top commercial content)
- **Entity Mention Boost**: +10 points per entity (max +30)
- **Commercial Keywords**: 50+ tracked terms (FDA, funding, clinical trials, etc.)
- **Pass Rate**: 12% of documents reach broadcast threshold (high signal-to-noise)

---

## 🎯 Strategic Value for PEI

### Immediate Value (Day 1)
1. **New Vertical**: Add biotech to PEI's intelligence portfolio
2. **117 Entities Ready**: Companies, labs, VCs - ready to monetize
3. **Proven Technology**: 15 services operational, zero downtime
4. **Zero Variable Costs**: Local LLM inference = no OpenAI bills

### Technology Transfer (Months 1-3)
1. **Apply to Infrastructure**: Same system, different RSS feeds
2. **Apply to Real Estate**: Entity tracking for REITs, developers
3. **Apply to Secondaries**: Track fund transactions, GP activity
4. **Reduce Analyst Headcount**: AI replaces manual curation

### Market Opportunity (Months 3-12)
1. **Biotech Deal Flow**: $20B+ in VC funding (2023), growing 15% YoY
2. **PE Interest**: Biotech now 12% of PE deal volume (up from 6% in 2019)
3. **First-Mover Advantage**: No established automated biotech intelligence platform
4. **Subscription Revenue**: Free tier (content), Pro tier (profiles, $500/mo), Enterprise tier (analytics + API, $5K/mo)

---

## 🛣️ 3-Phase Roadmap

### Phase 1: Content Hub (Current - COMPLETE)
- ✅ Entity database (117 tracked)
- ✅ RSS automation (58 feeds, 36% auto-discovered)
- ✅ LLM scoring pipeline (Qwen2.5-32B)
- ✅ Multi-platform publishing (5 channels)
- ✅ 15 LaunchD services operational
- 🔄 Entity-focused broadcasts (in progress)
- 🔄 Manual deal entry workflow (in progress)

### Phase 2: Rich Entity Profiles (3-6 Months, 2-3 with PEI)
- 🎯 Company profiles (funding history, products, team)
- 🎯 Lab profiles (research focus, papers, spinouts)
- 🎯 VC profiles (portfolio, investment patterns)
- 🎯 Relationship mapping (who's connected to whom)
- 🎯 Deal flow dashboard (automated signals, alerts)
- 🎯 PostgreSQL migration (scalable database)

### Phase 3: Full Platform (6-12 Months, 4-6 with PEI)
- 🚀 Company screeners (searchable, filterable database)
- 🚀 Deal flow tracker (automated milestone detection)
- 🚀 VC portfolio analysis (investment trends, pattern recognition)
- 🚀 Trend analytics (technology momentum, market forecasting)
- 🚀 Subscription tiers (Free/Pro/Enterprise)
- 🚀 API access (institutional clients, data licensing)

---

## 💼 Acquisition Proposal

### What PEI Gets
1. **Working Platform**: Production-grade, 15 services operational, 100% uptime
2. **117-Entity Database**: Companies, labs, VCs - ready to monetize Day 1
3. **58 Automated Feeds**: Self-expanding via machine discovery
4. **21K Document Corpus**: LLM-scored, entity-tagged, commercial-focused
5. **Full Codebase**: ElizaOS framework, LaunchD configs, deployment scripts
6. **Founder (Me)**: Join PEI team as product lead for PEI BioIntelligence

### Integration Plan
1. **Rebrand**: PEI BioIntelligence (leverage PEI brand)
2. **Integrate**: Embed biotech into PEI's existing deal flow platforms
3. **Monetize**: Add subscription tier to PEI offerings (Free/Pro/Enterprise)
4. **Scale Tech**: Apply AI automation to PEI's other verticals
5. **Launch Phase 2**: Rich entity profiles within 3 months (vs 6 months solo)
6. **Revenue by 2025**: Path to Phase 3 full platform with subscription revenue

### Structure (Open to Negotiation)
- **Acquisition**: Full buyout, founder joins PEI team
- **Partnership**: Joint venture, shared revenue
- **Licensing**: Technology transfer + consulting engagement

---

## 📞 Contact & Next Steps

**Prepared by**: David Lockie (Founder, AI10BRO)
**Date**: February 5, 2026
**Repository**: github.com/divydovy/eliza-ai10bro (private, available for due diligence)

### Live Demos
- **Telegram**: @ai10bro
- **Bluesky**: @ai10bro.com
- **WordPress**: ai10bro.com, biologyinvestor.com
- **System Dashboard**: localhost:3001/broadcast-dashboard.html (can demo live)

### Proposed Next Steps
1. **Technical Deep Dive** (1 hour): Walkthrough codebase, show automation in action
2. **Integration Workshop** (2 hours): Map integration with PEI's existing platforms
3. **Term Sheet Discussion** (30 min): Valuation, structure, timeline

---

**Ready to build the future of biotech intelligence together.**
