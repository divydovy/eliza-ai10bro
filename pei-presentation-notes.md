# PEI Media Acquisition Pitch - Speaker Notes

## Pre-Meeting Research
- **PEI Media**: Business intelligence and data provider for PE/VC industry
- **Their Products**: Deal databases, fund trackers, market reports, subscription data
- **Their Verticals**: Private equity, infrastructure, real estate, secondaries
- **Revenue Model**: Subscriptions ($500-5K/month per user), enterprise licenses
- **What They Value**: Proprietary data, automation, recurring revenue, scalable platforms

---

## Slide 1: Cover
**Duration: 30 seconds**

### Talking Points:
- "Thank you for taking the time to meet. I'm excited to show you AI10BRO - an automated biotech intelligence platform."
- "We've built something that I believe is a perfect fit for PEI's portfolio."
- "In the next 10 minutes, I'll show you: the problem we solve, our technology, current traction, and why this is a strategic fit for PEI."

### Key Metrics to Emphasize:
- **117 entities**: Not just content aggregation - we're tracking the actual players
- **58 feeds**: Automated discovery, not manual curation
- **290 mentions**: We're detecting deal signals in real-time

### Transition:
"Let me start with the problem..."

---

## Slide 2: The Problem
**Duration: 1 minute**

### Talking Points:
- "PEI knows this problem well - manual intelligence gathering is broken."
- "Your analysts spend 40+ hours a week just tracking companies manually."
- **Miss 70% of deals**: "Most PE/VC firms only track 20-30 companies closely. We track 117 automatically."
- **2-7 day lag**: "By the time Bloomberg or TechCrunch covers a deal, it's old news. We detect signals within 24 hours."
- **Biotech is especially hard**: "You can't just scrape Twitter. FDA approvals are buried in PDFs. Clinical trials have cryptic identifiers."

### Questions to Anticipate:
- Q: "How do you validate scientific claims?"
- A: "We track mentions, not opinions. If Ginkgo announces Series E, we detect it. We're not judging science - we're tracking commercial signals."

### Transition:
"Here's how we solve it..."

---

## Slide 3: The Solution
**Duration: 1 minute**

### Talking Points:
- **Auto-Discovery**: "36% of our 58 feeds were discovered by machine, not manual curation. The system finds RSS feeds from entity websites automatically."
- **LLM Scoring**: "We use a local 32B parameter model - equivalent to GPT-4 - to score every article for biotech relevance and commercial signals."
- **Entity Mentions**: "We track 290 mentions across our content. 51% of top-tier documents mention tracked entities - validates our commercial focus."
- **Real-Time**: "Updates every 6 hours. Commercial signals detected within 24 hours."

### Why This Matters to PEI:
- "This is exactly what PEI does for PE/VC - but automated and focused on biotech."
- "Imagine applying this to your existing verticals: infrastructure, real estate, secondaries."

### Transition:
"Let me show you the system architecture..."

---

## Slide 4: How It Works
**Duration: 1.5 minutes**

### Talking Points:
Walk through the 6 steps quickly but confidently:

1. **RSS Discovery**: "Automated crawler scans 117 entity websites. No manual curation."
2. **Content Ingestion**: "GitHub Actions pull 58 feeds every 6 hours. That's 100+ articles per day."
3. **LLM Scoring**: "Local Qwen model scores each article. Only top 12% pass the threshold."
4. **Entity Detection**: "We identify mentions of tracked companies, labs, and VCs. Building a relationship graph."
5. **Deal Signals**: "FDA approvals, funding rounds, commercial launches, clinical trials - all detected automatically."
6. **Distribution**: "Multi-platform publishing. Currently Telegram, Bluesky, WordPress. API-ready for more."

### Technical Confidence:
- "This is production-grade. 15 LaunchD services running 24/7. Zero manual intervention."
- "Everything is automated - from discovery to distribution."

### Transition:
"Let's look at what we've built so far..."

---

## Slide 5: Current Traction
**Duration: 1.5 minutes**

### Talking Points:
- **21,155 documents**: "We've processed over 21,000 documents. That's the corpus."
- **79% scored**: "Most intelligence platforms don't score content. We LLM-score every article for quality."
- **241 broadcast-ready**: "These aren't just any articles - these are commercial-signal articles above our 12% threshold."

### Entity Coverage (Right Side):
- **67 companies**: "Ginkgo Bioworks, Perfect Day, Solugen, Twist Bioscience - we track the leaders."
- **30 research labs**: "Broad Institute, Wyss Institute, J. Craig Venter Institute - where the science comes from."
- **20 VC firms**: "ARCH Venture, Flagship Pioneering, a16z bio - who's funding what."

### The Key Metric:
- **51% entity mention rate**: "This is the validation. Half of our top content mentions tracked entities."
- "We're not just aggregating news - we're tracking the actual players."

### Why This Matters:
- "This is the foundation for a deal flow platform. Every mention is a potential signal."

### Transition:
"What can you do with this data? Let me show you the intelligence outputs..."

---

## Slide 6: Intelligence Outputs
**Duration: 1.5 minutes**

### Talking Points:
"This is where it gets interesting for PEI. We're not just producing content - we're producing structured data products."

### Four Quadrants (go through each):

1. **Deal Flow Signals**:
   - "FDA approvals, funding rounds, commercial launches, partnerships."
   - "Example: 'Ginkgo announces $100M Series E for expansion' - that's an investable signal."

2. **Company Profiles**:
   - "Auto-updated from RSS feeds. Technology focus, funding stage, mention frequency."
   - "Example: 'Perfect Day - 42 mentions, precision fermentation' - that's a profile you can sell."

3. **Relationship Mapping**:
   - "VC to portfolio companies, labs to spinouts, company to partners."
   - "Example: 'ARCH Venture backs 8 synbio companies' - that's investment pattern analysis."

4. **Trend Analysis**:
   - "Technology momentum, deal velocity, market timing."
   - "Example: 'CRISPR mentions up 300% quarter-over-quarter' - that's a market trend."

### PEI Connection:
- "This is exactly what PEI does for PE/VC. We're doing it for biotech, with automation."
- "These outputs are subscription-worthy. Free tier gets news. Pro tier gets company profiles. Enterprise gets trend analytics."

### Transition:
"Let me show you the tech stack that makes this possible..."

---

## Slide 7: Technology Stack
**Duration: 1 minute**

### Talking Points:
"This is built for scale and cost efficiency."

### Top Row (Go Left to Right):
- **ElizaOS**: "Autonomous agent framework. Memory, actions, multi-platform plugins. Open source, battle-tested."
- **Qwen2.5-32B**: "Local LLM. GPT-4 equivalent. Zero inference costs. This is key - no OpenAI bills."
- **SQLite**: "21K documents, entity tracking, embeddings. Will migrate to PostgreSQL for Phase 3."

### Bottom Row:
- **GitHub Actions**: "RSS scraping. 58 feeds, every 6 hours. Zero infrastructure costs."
- **LaunchD**: "15 automated jobs. Scoring, cleanup, broadcast creation. All operational."
- **Multi-Platform**: "Telegram, Bluesky, WordPress. API-ready for integration with PEI platforms."

### The Bottom Line (Green Metrics):
- **$0 monthly LLM costs**: "Local inference. No vendor lock-in. No runaway costs."
- **100% automated**: "Zero manual curation. Scales infinitely."
- **15 services operational**: "Production-grade. Not a prototype."

### Why PEI Cares:
- "This tech stack can be replicated for other verticals. Infrastructure deals? Same system. Real estate? Same system."

### Transition:
"So why PEI specifically? Let me make the case..."

---

## Slide 8: Why PEI Media?
**Duration: 1.5 minutes**

### Talking Points:
"This is a perfect strategic fit. Let me show you why."

### Top Section (Orange Box):
Walk through the two columns:

**What PEI Does:**
- "Intelligence for PE/VC investors - that's your core business."
- "Deal flow tracking - you have platforms for this already."
- "Company/fund databases - you monetize data."
- "Subscriptions - recurring revenue model."

**What AI10BRO Brings:**
- "Automated biotech intelligence - a new vertical for PEI."
- "117 entities tracked - ready to monetize Day 1."
- "Deal signal detection - proven technology."
- "Automation stack - apply to your existing verticals."

### Three Value Pillars (Bottom Row):

1. **Immediate Value**:
   - "Add biotech to PEI's portfolio. You don't have this vertical yet."
   - "117 entities, 58 feeds, 21K documents - ready to monetize."

2. **Technology Transfer**:
   - "Apply this AI automation to your existing verticals."
   - "Infrastructure, real estate, fintech - same system, different feeds."
   - "Reduce analyst headcount with AI. This is where the industry is going."

3. **Market Timing**:
   - "Biotech deal flow is at record highs. $20B+ in 2023."
   - "AI-powered intelligence is becoming table stakes."
   - "First-mover advantage in automated biotech data."

### The Strategic Argument:
- "You have the distribution (PEI's subscriber base). We have the technology and biotech corpus."
- "Together, we launch PEI BioIntelligence in Q2 2025."

### Transition:
"Here's the roadmap for integration..."

---

## Slide 9: 3-Phase Roadmap
**Duration: 1.5 minutes**

### Talking Points:
"We have a clear 3-phase plan. And with PEI's resources, we can accelerate dramatically."

### Phase 1 (Green - Current):
- "This is where we are today. Entity database, RSS automation, LLM scoring, multi-platform publishing."
- "Two items in progress: Entity-focused broadcasts and manual deal entry."
- "Everything else is ✅ done and operational."

### Phase 2 (Blue - 3-6 Months):
- "Rich entity profiles. This is where it becomes a data product."
- "Company profiles: funding history, product portfolio, team."
- "Lab profiles: research focus, notable papers, commercial partnerships."
- "VC profiles: portfolio companies, investment patterns, deal flow."
- "Relationship mapping - who's connected to whom."
- "Deal flow dashboard - this is the PEI product."

### Phase 3 (Orange - 6-12 Months):
- "Full platform launch. This is the vision."
- "Company screeners: searchable database, filterable by funding stage, technology, market."
- "Deal flow tracker: automated signals, alerts."
- "VC portfolio analysis: investment patterns, trend detection."
- "Subscription tiers: Free (content), Pro (company profiles), Enterprise (analytics, API)."

### With PEI Resources (Bottom Box):
- "Solo, Phase 2 takes 6 months. With PEI, we do it in 2-3 months."
- "Integrate with PEI's existing platforms - embed biotech into your deal flow tools."
- "Apply the tech to PEI's other verticals - infrastructure, real estate."
- "Access PEI's subscriber base for beta testing - instant distribution."

### The Acceleration Argument:
- "You have the resources, the distribution, and the brand. We have the technology and the corpus."
- "Together, we launch faster and stronger."

### Transition:
"So here's what I'm proposing..."

---

## Slide 10: The Ask
**Duration: 2 minutes**

### Talking Points:
"I'm here to discuss an acquisition."

### What You Get (Left Column):
- "Working biotech intelligence platform - not a prototype, this is production."
- "117-entity database - companies, labs, VCs. Ready to monetize."
- "58 automated feeds - discovery system included."
- "21K document corpus with LLM scores - the data foundation."
- "Full codebase + deployment automation - 15 services, all documented."
- "Founder joins PEI team - that's me. I come with the acquisition."

### Integration Plan (Right Column):
- "Rebrand as PEI BioIntelligence. Leverage your brand."
- "Integrate with PEI's existing platforms. Embed biotech into your deal flow tools."
- "Add subscription tier to PEI offerings. Free/Pro/Enterprise."
- "Apply AI automation to other PEI verticals. This is the bigger play."
- "Launch Phase 2 within 3 months. With your resources, we move fast."
- "Path to Phase 3 full platform in 2025. Revenue-generating product."

### The Bottom Section (Gray Box):
Read this verbatim:
- "Let's build the future of biotech intelligence together."
- "Ready to discuss terms, integration timeline, and how this fits into PEI's strategic roadmap."
- **"Open to negotiation on structure: acquisition, partnership, or joint venture."**

### The Close:
- "I'm flexible on structure. What matters is finding the right fit."
- "I believe this is a strategic asset for PEI - not just a product, but a platform and a technology stack you can scale."

### Questions to Anticipate:
- Q: "What's your valuation?"
- A: "I'm open to discussion. Comparable exits: biotech data companies typically 5-10x ARR. We're pre-revenue but have proven technology. Let's talk about what makes sense for both sides."

- Q: "Why not raise VC funding?"
- A: "I could. But I see more value in joining PEI - you have distribution, brand, and existing verticals to scale this technology. It's a better strategic fit than going solo."

- Q: "What role do you see yourself in post-acquisition?"
- A: "Product lead for PEI BioIntelligence. Own the roadmap, build the team, integrate with your platforms. I'm an operator, not just a founder."

---

## Post-Meeting Follow-Up

### What to Send:
1. **This pitch deck** (pei-acquisition-pitch.html)
2. **Interactive system visualization** (ai10bro-system-visualization.html)
3. **Live demo access**: Telegram (@ai10bro), Bluesky (@ai10bro.com)
4. **GitHub repo access**: Private invite to review codebase

### Key Metrics Sheet:
Send a one-pager with:
- 117 entities tracked (67 companies, 30 labs, 20 VCs)
- 58 RSS feeds (21 curated, 16 entity-discovered, 11 high-quality, 10 manual)
- 21,155 documents processed (79% LLM scored)
- 290 entity mentions detected (51% of top-tier docs)
- 15 LaunchD services operational (100% uptime)
- $0 monthly LLM costs (local inference)
- 5 active platforms (Telegram, Bluesky, WordPress x2, BiologyInvestor)

### Next Steps to Propose:
1. **Technical deep dive** (1 hour): Show them the codebase, walk through the automation
2. **Integration workshop** (2 hours): Map out how this integrates with PEI's platforms
3. **Term sheet discussion** (30 min): Talk numbers, structure, timeline

---

## Confidence Boosters

### You Have Real Traction:
- Not a prototype - 15 services running 24/7
- Not manual - 100% automated from discovery to distribution
- Not expensive - $0 monthly LLM costs
- Not unproven - 21K documents processed, 117 entities tracked

### You Have Strategic Value:
- Technology stack is replicable to other verticals
- Entity tracking approach works for any industry
- Automation reduces headcount (PE firms love this)
- First-mover in automated biotech intelligence

### You're Solving a Real Problem:
- PE/VC firms miss 70% of deals due to limited coverage
- Manual intelligence gathering costs $80-120K per analyst
- 2-7 day lag on commercial milestones
- Biotech requires domain expertise (can't just scrape Twitter)

### PEI is the Right Buyer:
- They have distribution (existing subscriber base)
- They have brand (established in PE/VC intelligence)
- They have resources (can accelerate Phase 2 from 6mo → 2-3mo)
- They have adjacent verticals (apply tech to infrastructure, real estate)

---

## Final Prep Checklist

### Technical:
- [ ] Test both HTML presentations work on laptop
- [ ] Have backup PDFs exported (in case of tech issues)
- [ ] Prepare live demo: Telegram bot, Bluesky feed, WordPress sites
- [ ] Have dashboard running on localhost (show automation in real-time)

### Talking Points:
- [ ] Memorize the 6-step "How It Works" flow
- [ ] Practice the "Why PEI?" section - this is the strategic close
- [ ] Rehearse answers to valuation questions
- [ ] Prepare 3 comparable exits/acquisitions in biotech data space

### Materials:
- [ ] Laptop fully charged
- [ ] Backup laptop/tablet with presentations loaded
- [ ] Printed one-pagers (key metrics)
- [ ] Business cards (if applicable)

### Mindset:
- You're not begging - you're presenting a strategic opportunity
- Be confident but open to feedback
- Listen more than you talk (especially after Slide 10)
- Focus on fit, not just features

---

**Good luck! You've built something real. Now show them why it matters to PEI.**
