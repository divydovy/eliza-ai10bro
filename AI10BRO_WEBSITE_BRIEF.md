# AI10BRO Website Brief
**Bio Intelligence Hub & Content Platform**

## Executive Decision: WordPress vs Custom Build

### Recommendation: **Traditional WordPress (NOT Headless)**

**Why WordPress:**
1. ✅ **Content Management**: Editorial team can manage posts without dev involvement
2. ✅ **Plugin Ecosystem**: REST API, SEO (Yoast), analytics, social sharing built-in
3. ✅ **Auto-posting**: Jetpack Publicize, WP to Twitter/LinkedIn/etc. plugins available
4. ✅ **Taxonomies**: Custom post types + taxonomies align perfectly with database entities
5. ✅ **Chatbot Integration**: Multiple AI chatbot plugins (WPBot, Tidio, custom embed)
6. ✅ **Speed**: Modern WP themes (Kadence, GeneratePress) + caching = fast enough
7. ✅ **Simplicity**: One system, one deployment, easier maintenance
8. ✅ **Cost**: Single hosting plan (no separate frontend hosting)
9. ✅ **Future-proof**: Can migrate to database platform later, WP as content layer

**Architecture:** Traditional WordPress (all-in-one) → Eliza integration via REST API

**Why NOT Headless:**
- Extra complexity (two systems instead of one)
- Higher cost (WP hosting + Vercel/frontend hosting)
- Slower development (build frontend from scratch)
- No real benefit (content site doesn't need React/Vue interactivity)
- Modern WP is already fast with proper caching

---

## 1. Project Overview

### Vision
Transform AI10BRO from a broadcast-only presence into a discoverable content hub and future home for the Bio Intelligence Platform (PEI-style database).

### Primary Goals
1. **Discovery**: SEO-optimized content hub for bio/sustainability/tech innovations
2. **Brand Building**: Establish AI10BRO as thought leader in biology century
3. **Content Archive**: Searchable, categorized repository of all broadcasts
4. **Community**: Interactive hub with chatbot, comments, newsletter signups
5. **Platform Foundation**: Taxonomies align with future database entities

### Success Metrics (Year 1)
- 50,000+ monthly visitors (organic search)
- 10,000+ newsletter subscribers
- 500+ engaged community members
- Top 3 Google rankings for 20+ bio/sustainability keywords
- 100+ quality backlinks

---

## 2. Content Strategy

### Content Types (WordPress Custom Post Types)

#### 2.1 Daily Insights (Primary Feed)
**Source**: Current Telegram/Bluesky broadcasts
**Format**: 400-800 word articles
**Publishing**: 3-5x per day (automated from Eliza)
**Structure**:
```
Title: [Compelling headline from broadcast]
Featured Image: [Generated Gemini image]
Excerpt: [First 160 chars for meta description]
Body:
  - Hook (broadcast opening)
  - Context & Details (expanded from source document)
  - Why It Matters (impact analysis)
  - Related Developments (2-3 links to previous posts)
  - Source Citation (with proper attribution)
Categories: [Technology theme(s)]
Tags: [Companies, researchers, applications]
```

#### 2.2 Deep Dives (Weekly)
**Source**: Obsidian notes + PubMed papers
**Format**: 2,000-4,000 word analysis
**Publishing**: 1-2x per week (manually curated)
**Examples**:
- "The Race to Carbon-Negative Concrete: 5 Technologies to Watch"
- "Biomimicry in Materials Science: Q4 2025 Landscape"
- "Synthetic Biology Funding Trends: What Changed in 2025"

#### 2.3 Company Profiles
**Future Integration**: Database platform company entities
**Format**: 600-1,000 words
**Structure**:
- Overview & mission
- Technology/innovation description
- Funding history
- Key milestones
- Team (founders/key people)
- Related technologies (taxonomy links)

#### 2.4 Technology Explainers
**Future Integration**: Database platform technology entities
**Format**: 800-1,500 words
**Structure**:
- What it is (ELI5)
- How it works (technical detail)
- Applications & use cases
- Companies working on it
- Research papers (PubMed links)
- Market size & outlook

#### 2.5 Market Reports (Quarterly)
**Format**: 3,000-5,000 words + visualizations
**Publishing**: 4x per year
**Examples**:
- "Q1 2025 Bio Innovation Funding Report"
- "State of Biomimicry: 2025 Industry Landscape"

---

## 3. Information Architecture

### 3.1 Taxonomy Design (Aligns with Future Database)

#### Primary Taxonomy: Technology Themes
*Maps to `alignment-keywords-refined.json` themes*
```
- Biomimicry & Nature-Inspired Design
- Synthetic Biology & Bioengineering
- Advanced Materials
- Clean Energy & Carbon Capture
- Agriculture & Food Tech
- Health & Medicine
- AI & Computing
- Innovation & Markets
- Environmental Conservation
- Space & Exploration
- Manufacturing & Industry
```

#### Secondary Taxonomy: Entity Types
*Aligns with database platform entities*
```
Companies:
  - Startups
  - Scale-ups
  - Public Companies
  - Research Spin-offs

Technologies:
  - Lab Stage (TRL 1-3)
  - Pilot Stage (TRL 4-6)
  - Commercial (TRL 7-9)

Investors:
  - Venture Capital
  - Corporate VC
  - Government/Grants
  - Angels & Family Offices

Research:
  - Academic Papers
  - University Labs
  - National Labs
  - Private R&D
```

#### Tertiary Taxonomy: Applications
```
- Energy & Power
- Transportation
- Construction & Built Environment
- Manufacturing & Industrial
- Agriculture & Food Production
- Healthcare & Pharmaceutics
- Consumer Products
- Waste & Recycling
- Water & Sanitation
```

#### Tags: Granular Topics
- Company names (auto-tagged when mentioned)
- Researcher names
- Specific technologies (CRISPR, DNA barcodes, etc.)
- Materials (graphene, bioplastics, etc.)
- Geographic regions
- Funding rounds (Series A, B, C, etc.)

### 3.2 URL Structure
```
Homepage:              ai10bro.com/
Daily Insights:        ai10bro.com/insights/[slug]
Deep Dives:           ai10bro.com/analysis/[slug]
Company Profiles:     ai10bro.com/companies/[company-slug]
Technology Pages:     ai10bro.com/technologies/[tech-slug]
Market Reports:       ai10bro.com/reports/[report-slug]

Category Archives:    ai10bro.com/topic/[theme-slug]
Tag Archives:         ai10bro.com/tag/[tag-slug]
About:                ai10bro.com/about
Newsletter:           ai10bro.com/newsletter
Database (Future):    ai10bro.com/database
```

### 3.3 Navigation Structure
```
Primary Nav:
- Home
- Insights (Daily feed)
- Analysis (Deep dives)
- Companies (Future)
- Technologies (Future)
- Reports
- About
- Newsletter

Footer Nav:
- About AI10BRO
- How It Works
- Contact
- Privacy Policy
- Terms of Service

Sidebar/Secondary:
- Popular This Week
- Recent Deep Dives
- Browse by Theme
- Subscribe (email capture)
- AI10BRO Chat (embedded agent)
```

---

## 4. Design Requirements

### 4.1 Brand Identity

**Personality**: Scientific, forward-thinking, optimistic but grounded
**Tone**: Informative and authoritative without being academic
**Aesthetic**: Clean, modern, data-rich, biology-inspired accents

**Color Palette**:
- Primary: Deep blue (#0A2540) - trust, depth, technology
- Secondary: Vibrant green (#10B981) - biology, growth, sustainability
- Accent: Warm amber (#F59E0B) - energy, innovation, optimism
- Neutrals: Off-white (#F9FAFB), Medium gray (#6B7280), Dark gray (#1F2937)

**Typography**:
- Headings: Inter (clean, modern, highly legible)
- Body: System font stack (fast, native, accessible)
- Code/Data: JetBrains Mono (technical content)

**Visual Elements**:
- Biology-inspired patterns (subtle DNA helices, cellular structures)
- Data visualization (charts, graphs, network diagrams)
- Microscopy-style imagery (when appropriate)
- Generated images (Gemini V2) for content

### 4.2 Layout Patterns

#### Homepage
```
┌─────────────────────────────────────────────────┐
│ Header: Logo | Nav | Search | Subscribe         │
├─────────────────────────────────────────────────┤
│ Hero: Featured Deep Dive                        │
│ - Large image                                   │
│ - Headline + excerpt                            │
│ - "Read Analysis" CTA                           │
├─────────────────────────────────────────────────┤
│ Latest Insights (3-column grid)                 │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│ │ Image    │ │ Image    │ │ Image    │         │
│ │ Title    │ │ Title    │ │ Title    │         │
│ │ Excerpt  │ │ Excerpt  │ │ Excerpt  │         │
│ └──────────┘ └──────────┘ └──────────┘         │
├─────────────────────────────────────────────────┤
│ Theme Navigator                                 │
│ [Biomimicry] [Synbio] [Materials] [Energy] ... │
├─────────────────────────────────────────────────┤
│ Recent Deep Dives (2-column)                    │
├─────────────────────────────────────────────────┤
│ Stats Banner                                    │
│ "Tracking 1,460+ innovations | 60+ daily ..."   │
├─────────────────────────────────────────────────┤
│ Newsletter Signup (centered, compelling copy)   │
├─────────────────────────────────────────────────┤
│ Footer: About | Contact | Social | Legal        │
└─────────────────────────────────────────────────┘
```

#### Article Page (Daily Insight)
```
┌─────────────────────────────────────────────────┐
│ Header (minimal, sticky)                        │
├─────────────────────────────────────────────────┤
│ Article Header:                                 │
│ - Breadcrumb (Home > Theme > Article)           │
│ - Title (H1)                                    │
│ - Meta (Date | Read time | Share buttons)       │
│ - Featured Image (full-width)                   │
├─────────────────────────────────────────────────┤
│ Content (2-column layout)                       │
│ ┌────────────────────────┬──────────────────┐   │
│ │ Article Body           │ Sidebar:         │   │
│ │ - Rich text            │ - Categories     │   │
│ │ - Images               │ - Tags           │   │
│ │ - Pull quotes          │ - Related posts  │   │
│ │ - Source citation      │ - AI10BRO chat   │   │
│ │                        │ - Newsletter CTA │   │
│ └────────────────────────┴──────────────────┘   │
├─────────────────────────────────────────────────┤
│ Related Content (3-card horizontal)             │
├─────────────────────────────────────────────────┤
│ Comments (optional, launch later)               │
├─────────────────────────────────────────────────┤
│ Footer                                          │
└─────────────────────────────────────────────────┘
```

#### Category Archive (Theme Page)
```
┌─────────────────────────────────────────────────┐
│ Header                                          │
├─────────────────────────────────────────────────┤
│ Theme Header:                                   │
│ - Theme Name (H1)                               │
│ - Description (1-2 sentences)                   │
│ - Stats (X posts | X companies | X technologies)│
├─────────────────────────────────────────────────┤
│ Filter Bar:                                     │
│ [All] [Companies] [Tech] [Research] [Reports]   │
├─────────────────────────────────────────────────┤
│ Content Grid (3-column, masonry style)          │
│ - Card: Image + Title + Excerpt + Meta          │
│ - Infinite scroll or pagination                 │
├─────────────────────────────────────────────────┤
│ Footer                                          │
└─────────────────────────────────────────────────┘
```

### 4.3 Component Library

**Cards**:
- Insight Card (image, title, excerpt, meta)
- Company Card (logo, name, tagline, funding)
- Technology Card (icon, name, TRL badge, applications)
- Report Card (thumbnail, title, date, download CTA)

**Interactive Elements**:
- Search (instant results, fuzzy matching)
- Filter dropdowns (multi-select with counts)
- Tag clouds (clickable, weighted by frequency)
- Share buttons (native + custom)
- Newsletter signup (inline + modal variants)

**Data Visualizations**:
- Funding trends (line charts)
- Theme distribution (pie/donut charts)
- Company network (force-directed graph)
- Geographic heatmaps
- Timeline views (milestones)

### 4.4 Responsive Behavior

**Breakpoints**:
- Mobile: 320px - 767px (single column, hamburger nav)
- Tablet: 768px - 1023px (2-column grid, collapsible sidebar)
- Desktop: 1024px - 1439px (3-column grid, fixed sidebar)
- Large: 1440px+ (max-width container, generous whitespace)

**Mobile Priorities**:
1. Fast load times (<3s)
2. Readable typography (16px base)
3. Thumb-friendly tap targets (44px min)
4. Bottom nav for key actions
5. Simplified search (full-screen overlay)

---

## 5. Technical Architecture

### 5.1 Stack Recommendation

**Traditional WordPress (Recommended)**
```
Platform:  WordPress 6.4+ (WP Engine or Kinsta hosting)
Theme:     Kadence or GeneratePress (modern, fast, flexible)
Database:  MySQL (managed by host)
Media:     Cloudflare Images (CDN + optimization) OR native WP
Caching:   WP Rocket + Redis (server-level)
Search:    Native WP search (start) → Algolia (if needed later)
Analytics: Plausible (privacy-first) + Google Analytics 4
```

**Benefits**:
- ✅ One system to manage (simpler than headless)
- ✅ Full plugin ecosystem available
- ✅ Modern themes are already fast (90+ Lighthouse scores)
- ✅ Easy for non-technical team to manage
- ✅ Lower hosting costs (one plan vs two)
- ✅ Faster development time

**Alternative: Full Custom (NOT Recommended)**
```
Backend:   Node.js + Fastify (API)
Frontend:  Next.js 14+ (Vercel hosting)
Database:  PostgreSQL (Supabase)
CMS:       Payload CMS or Sanity
Media:     Cloudflare Images
Search:    Typesense (self-hosted)
```

**Benefits**:
- Full control over data model
- Can integrate directly with future database platform
- Better performance potential
- Tighter Eliza integration

**Trade-offs**: More dev time, no plugin ecosystem, team needs technical skills

---

### 5.1b Simplified DIY Stack (For Us)

Since we're building this ourselves with no budget:

**Phase 1: MVP (Weeks 1-4)**
```
Hosting:   Cloudways ($14/mo) or DigitalOcean ($12/mo)
           - Managed WordPress hosting
           - Easy 1-click install
           - Built-in caching + CDN

Theme:     Kadence Free (best free theme, blocks-based)
           - Header/footer builder
           - Fast, clean, accessible
           - Extensible with plugins

Essential Plugins (All Free):
- Yoast SEO Free - meta tags, sitemaps
- Classic Editor - if prefer over Gutenberg
- Autoptimize - CSS/JS minification
- EWWW Image Optimizer - automatic WebP conversion
- Really Simple SSL - force HTTPS
- UpdraftPlus Free - backups to Dropbox/Google Drive

Optional (Can Add Later):
- WP Rocket ($59/year) - better caching if needed
- ACF Pro ($49/year) - custom fields for company profiles
```

**Phase 2: Eliza Integration (Week 5)**
```javascript
publish-to-wordpress.js (new file in Eliza project):
- Reads broadcasts from database
- Enriches to 800-1200 words via LLM
- Uploads image to WP via REST API
- Creates post with categories/tags
- Auto-publishes if score >= 0.20
```

**Phase 3: Polish (Week 6-8)**
```
- Import 50 best broadcasts as backfill
- Set up Cloudflare (free tier) for DNS + CDN
- Add Plausible analytics ($9/mo or self-host free)
- Configure auto-posting (Jetpack Publicize free tier)
- Create About page + legal pages
```

**Total Monthly Cost: $14-23**
- Hosting: $12-14/mo (Cloudways/DigitalOcean)
- Analytics: $0 (self-host) or $9/mo (Plausible cloud)
- Domain: $15/year = $1.25/mo
- Plugins: All free to start

**Development Time: 6-8 weeks** (working evenings/weekends)

### 5.2 WordPress Configuration (If Using WP)

**Required Plugins**:
- **Yoast SEO** - Meta tags, XML sitemaps, breadcrumbs
- **Advanced Custom Fields Pro** - Custom post types, taxonomies
- **WPGraphQL** - GraphQL API for Next.js
- **WP Rocket** - Caching, optimization (if not using headless)
- **Akismet** - Spam protection (if using comments)
- **Wordfence** - Security hardening
- **UpdraftPlus** - Automated backups
- **Jetpack** (optional) - Stats, social sharing, CDN

**Custom Post Types**:
```php
- daily_insight (Daily Insights)
- deep_dive (Deep Dives / Analysis)
- company_profile (Company Profiles)
- technology (Technology Explainers)
- market_report (Market Reports)
```

**Custom Taxonomies**:
```php
- technology_theme (hierarchical) - 11 main themes
- entity_type (non-hierarchical) - Companies, Tech, Investors, Research
- application (hierarchical) - Use cases
- development_stage (non-hierarchical) - TRL levels
```

**Custom Fields** (via ACF):
```
Company Profile:
- company_name (text)
- founded_date (date)
- location (text)
- website (url)
- funding_total (number)
- funding_rounds (repeater: date, type, amount, investors)
- team_size (number)
- technology_focus (relationship → technologies)
- related_documents (relationship → posts)

Technology:
- technology_name (text)
- trl_level (select: 1-9)
- applications (checkbox: energy, materials, etc.)
- market_size (number)
- companies_using (relationship → company_profiles)
- research_papers (repeater: title, url, date)
```

### 5.3 Eliza Integration Points

#### 5.3.1 Automated Publishing Flow
```
Eliza Agent → WordPress REST API

1. process-unprocessed-docs.js creates broadcast
2. NEW: publish-to-wordpress.js enriches & posts
   - Fetch full source document
   - Generate rich article (longer prompt)
   - Upload featured image to WP
   - Set categories/tags (map alignment themes → WP taxonomies)
   - Create draft post via REST API
   - (Optional) Auto-publish or queue for review

3. WordPress processes:
   - Yoast SEO generates meta tags
   - WPGraphQL exposes to Next.js frontend
   - Jetpack Publicize auto-shares to social (optional)
```

**API Endpoints**:
```javascript
// Create post
POST /wp-json/wp/v2/posts
{
  title: "Carverr creates DNA barcodes...",
  content: "<p>...</p>", // Rich HTML
  excerpt: "First 160 chars",
  status: "publish", // or "draft"
  categories: [3, 7], // IDs from taxonomy mapping
  tags: [12, 45, 67],
  featured_media: 123, // Uploaded image ID
  meta: {
    alignment_score: 0.26,
    source_url: "https://...",
    eliza_document_id: "uuid"
  }
}

// Upload image
POST /wp-json/wp/v2/media
Content-Type: multipart/form-data
file: [binary image data]
title: "Broadcast image for doc uuid"
```

#### 5.3.2 Rich Article Generation Prompt
```
Current broadcast prompt: 400-600 chars
New WordPress prompt: 800-1200 words

Structure:
1. Hook (1-2 sentences, compelling opening)
2. Overview (2-3 paragraphs, what happened)
3. Context & Details (3-4 paragraphs, deep dive)
4. Why It Matters (2-3 paragraphs, implications)
5. Related Developments (1-2 paragraphs, links)
6. Looking Ahead (1 paragraph, future outlook)
7. Source & Further Reading (citations)

Tone: Informative journalism (not academic, not hype)
Style: Short paragraphs (2-4 sentences), subheadings, bullet lists
SEO: Natural keyword integration, internal linking
```

#### 5.3.3 AI10BRO Chat Embed
```
Options:

A. Custom Eliza Embed (Recommended)
   - Build simple chat UI widget
   - Connect to Eliza agent via WebSocket
   - Embed on every page
   - Context-aware: Can answer about current article

B. Third-party AI Chatbot Plugin
   - WPBot AI ChatBot (uses GPT)
   - Tidio (live chat + AI)
   - Ada Support

Recommendation: Start with A (custom) for brand control
```

### 5.4 Performance Requirements

**Core Web Vitals Targets**:
- LCP (Largest Contentful Paint): <2.5s
- FID (First Input Delay): <100ms
- CLS (Cumulative Layout Shift): <0.1
- TTFB (Time to First Byte): <600ms

**Optimization Strategy**:
- Next.js ISR (Incremental Static Regeneration) - regenerate pages every 5 min
- Image optimization (WebP, lazy loading, responsive sizes)
- Code splitting (route-based)
- CDN for static assets (Cloudflare or Vercel Edge Network)
- Database query optimization (indexes on taxonomy joins)
- Caching (Redis for API responses, browser cache for assets)

---

## 6. Content Workflow & Publishing

### 6.1 Automated Daily Flow (Eliza → WordPress)
```
Every hour:
1. Eliza creates 1-3 broadcasts (existing system)
2. For each broadcast with alignment_score >= 0.15:
   a. Generate rich article version (800-1200 words)
   b. Upload featured image to WordPress
   c. Map alignment themes → WordPress categories
   d. Extract entity mentions → WordPress tags
   e. Create post via REST API (status: draft)
   f. (Optional) Auto-publish high-quality (score >= 0.20)

3. Slack notification to editorial team:
   - "3 new drafts ready for review"
   - Link to WP admin
```

### 6.2 Manual Editorial Flow (Weekly Deep Dives)
```
1. Editor selects topic from:
   - Obsidian notes (high-quality manual content)
   - Cluster of related broadcasts
   - PubMed papers with high alignment
   - Reader requests

2. Research & writing:
   - 2-4 hours per article
   - 2,000-4,000 words
   - Custom graphics/charts (Figma → export)
   - Multiple source citations

3. WordPress workflow:
   - Create draft post
   - Add custom fields (if company/tech profile)
   - Set featured image
   - Set categories/tags
   - Preview in Next.js frontend
   - Publish + social promotion

4. Post-publish:
   - Monitor analytics (views, time on page, shares)
   - Respond to comments
   - Update with new developments (evergreen content)
```

### 6.3 Quality Control Checklist
- [ ] Alignment score >= 0.15 (automated posts) or manual review
- [ ] Featured image uploaded (high-res, optimized)
- [ ] Meta description written (150-160 chars, compelling)
- [ ] Categories selected (1-3 themes)
- [ ] Tags added (5-10, including entities)
- [ ] Internal links added (2-4 to related posts)
- [ ] Source citations included (with proper attribution)
- [ ] Yoast SEO score: Green (80+/100)
- [ ] Preview on mobile + desktop
- [ ] Spell check + readability check (Grammarly)

---

## 7. SEO Strategy

### 7.1 Keyword Research (Target Keywords)

**Primary Keywords** (500-5k monthly searches):
- "synthetic biology news"
- "biomimicry innovations"
- "sustainable technology"
- "bioengineering breakthroughs"
- "clean energy technology"
- "advanced materials research"

**Long-tail Keywords** (50-500 monthly searches):
- "DNA barcode food tracing technology"
- "bio-inspired materials companies"
- "carbon capture startup funding"
- "CRISPR applications agriculture"
- "lab-grown meat latest news"

**Entity Keywords** (Company/Tech names):
- "Ginkgo Bioworks news"
- "synthetic spider silk companies"
- "bio concrete self healing"
- Target: Rank #1 for 100+ entity keywords by end of Year 1

### 7.2 On-Page SEO Template
```
Every post must include:
- Title tag: 50-60 chars, keyword-rich, compelling
- Meta description: 150-160 chars, call-to-action
- H1: Title (unique, includes primary keyword)
- H2-H3: Subheadings (include secondary keywords)
- Image alt text: Descriptive, keyword-relevant
- Internal links: 2-4 to related posts/categories
- External links: 1-3 to authoritative sources
- Schema markup: Article type, author, date, organization
```

### 7.3 Content Clustering Strategy
```
Pillar Page (Comprehensive guide, 3,000-5,000 words):
"The Complete Guide to Biomimicry in Materials Science"

Cluster Posts (Daily insights + deep dives, 800-2,000 words):
├─ "Lotus Effect: How Nature Inspired Self-Cleaning Surfaces"
├─ "Spider Silk Proteins: 5 Companies Racing to Scale Production"
├─ "Velcro to Gecko Tape: Biomimicry's Greatest Hits"
├─ "Q1 2025 Biomimetic Materials Funding Report"
└─ "Interview: [Researcher Name] on Bio-Inspired Adhesives"

All cluster posts link to pillar page
Pillar page links to all cluster posts
Result: Google sees topic authority, ranks pillar page highly
```

### 7.4 Link Building Strategy (First 6 Months)
- **Guest posts**: Contribute to sustainability/tech blogs (2/month)
- **HARO responses**: Help A Reporter Out, get quoted in articles (5/month)
- **Research citations**: Reach out when cited in academic papers
- **Resource pages**: Get listed on "Best Synthetic Biology News" roundups
- **Partnerships**: Collaborate with complementary sites (accelerators, universities)
- **Social proof**: Reddit r/Futurology, Hacker News (authentic participation)

**Target**: 100 quality backlinks (DR 40+) by Month 6

---

## 8. AI10BRO Chat Agent Implementation

### 8.1 Functionality Requirements

**Core Capabilities**:
- Answer questions about articles ("What is Carverr?")
- Explain technologies ("How does CRISPR work?")
- Recommend related content ("Show me more about biomimicry")
- Search the archive ("Find articles about carbon capture")
- Provide definitions ("What is TRL?")
- Connect entities ("Which companies are working on spider silk?")

**Context Awareness**:
- Knows current article user is reading
- Can reference article content in responses
- Suggests related articles based on conversation
- Remembers conversation history (session-based)

**Limitations** (Set Clear Expectations):
- "I focus on bio/sustainability/tech innovations covered on this site"
- "I can't provide investment advice or medical recommendations"
- "For detailed data, check out our upcoming Database platform"

### 8.2 Technical Implementation

**Option A: Custom Eliza Widget (Recommended)**
```javascript
// Embed code for WordPress
<div id="ai10bro-chat"></div>
<script src="https://cdn.ai10bro.com/chat-widget.js"></script>
<script>
  AI10BRO.init({
    apiUrl: 'wss://eliza-api.ai10bro.com',
    agentId: 'ai10bro',
    context: {
      pageUrl: window.location.href,
      pageTitle: document.title,
      pageCategories: ['biomimicry', 'materials'],
      pageContent: document.querySelector('article').innerText.substring(0, 1000)
    }
  });
</script>
```

**Widget Features**:
- Minimizable (bottom-right corner)
- Mobile-friendly (full-screen on mobile)
- Typing indicators
- Markdown support (links, bold, lists)
- "Suggested questions" chips
- "Read related article" cards
- Analytics (question volume, satisfaction rating)

**Backend**:
- Existing Eliza agent
- NEW: WordPress content index for RAG (Retrieval-Augmented Generation)
  - Ingest all WP posts into vector database (Pinecone or Weaviate)
  - When user asks question, retrieve relevant articles
  - Include retrieved content in Eliza prompt context
  - Generate answer + suggest articles

### 8.3 Chat Agent Prompt
```
You are AI10BRO, an expert on innovations in biomimicry, synthetic biology, sustainable technology, and the biology century. You help readers explore and understand cutting-edge developments in these fields.

Context:
- You operate on ai10bro.com, a content platform tracking bio/sustainability/tech
- You have access to an archive of articles, company profiles, and technology explainers
- You are helpful, knowledgeable, and enthusiastic (but not overhyped)

Current article: {page_title}
Categories: {page_categories}
Excerpt: {page_excerpt}

User's question: {user_query}

Relevant articles (RAG):
{retrieved_articles}

Your response should:
1. Directly answer the user's question (2-3 sentences)
2. Provide relevant context from the archive (if applicable)
3. Suggest 1-2 related articles to read
4. If question is off-topic, politely redirect to bio/sustainability/tech

Tone: Informative and friendly, like a knowledgeable colleague
Format: Plain text with markdown (bold, links, bullets)
Length: 100-200 words (be concise)
```

---

## 9. Analytics & Measurement

### 9.1 Key Metrics Dashboard (Plausible + GA4)

**Traffic**:
- Pageviews (total, unique)
- Visitors (new vs returning)
- Traffic sources (organic, social, direct, referral)
- Top pages (by views)
- Bounce rate by page type
- Avg time on page by page type

**Engagement**:
- Newsletter signups (total, conversion rate)
- Article shares (by platform)
- Comments (if enabled)
- Chat interactions (questions asked, satisfaction rating)
- Scroll depth (% of article read)
- Internal link clicks

**SEO**:
- Organic traffic (trend over time)
- Keyword rankings (target keywords)
- Backlinks (total, new, DR distribution)
- Click-through rate from SERPs (Google Search Console)
- Impressions by query

**Content Performance**:
- Top articles (by views, time on page, shares)
- Category performance (views by theme)
- Tag performance (views by entity)
- Author performance (if multiple writers)

### 9.2 A/B Testing Roadmap

**Month 1-2**: Headline formulas
- Test: "Company X Does Y" vs "How Company X is Revolutionizing Y"
- Measure: CTR from homepage, social shares

**Month 3-4**: Featured image styles
- Test: Illustration vs Photo vs Generated (Gemini)
- Measure: CTR, time on page

**Month 5-6**: Article length
- Test: 600-800 words vs 1200-1500 words
- Measure: Bounce rate, time on page, scroll depth

**Month 7-8**: Newsletter CTA placement
- Test: End of article vs sidebar vs inline (mid-article)
- Measure: Signup conversion rate

**Month 9-10**: Chat agent behavior
- Test: Proactive greeting vs passive availability
- Measure: Interaction rate, satisfaction score

---

## 10. Launch Plan

### Phase 1: Foundation (Weeks 1-4)
- [ ] Domain setup (ai10bro.com)
- [ ] Hosting provisioned (WP Engine or custom)
- [ ] WordPress installed + configured (if using WP)
- [ ] Theme development (homepage, article page, archives)
- [ ] Taxonomy setup (categories, tags, custom fields)
- [ ] Eliza→WordPress integration built
- [ ] Backfill content (50 best broadcasts → articles)
- [ ] SEO foundation (Yoast, sitemaps, robots.txt)

### Phase 2: Content & Polish (Weeks 5-6)
- [ ] Newsletter signup working (Mailchimp or ConvertKit)
- [ ] Social sharing buttons functional
- [ ] Analytics installed (Plausible + GA4)
- [ ] Search implemented (Algolia or native WP)
- [ ] About page written
- [ ] 2-3 deep dive articles published
- [ ] Internal linking completed (50 articles)

### Phase 3: Soft Launch (Week 7)
- [ ] Announce on Telegram/Bluesky ("New home: ai10bro.com")
- [ ] Email to early subscribers (if any)
- [ ] Post to relevant subreddits (r/Futurology, r/sustainability)
- [ ] Submit to Hacker News
- [ ] Share with personal network
- **Goal**: 1,000 visitors, 50 newsletter signups

### Phase 4: Feature Rollout (Weeks 8-12)
- [ ] AI10BRO chat agent deployed (Week 8)
- [ ] Company profiles launched (Week 9)
- [ ] Technology explainers launched (Week 10)
- [ ] First market report published (Week 12)
- [ ] Guest post campaign begins (Week 8+)
- **Goal**: 5,000 visitors/month, 200 newsletter signups

### Phase 5: Growth & Optimization (Months 4-6)
- [ ] SEO optimization (based on GSC data)
- [ ] Content calendar standardized (3-5 daily + 1-2 weekly)
- [ ] A/B testing program running
- [ ] Partnerships established (2-3 sites)
- [ ] Comments enabled (if moderation capacity available)
- **Goal**: 20,000 visitors/month, 1,000 newsletter signups

### Phase 6: Platform Preview (Months 7-12)
- [ ] Database platform beta signup (waitlist)
- [ ] Company profile pages enriched (funding, team, etc.)
- [ ] Technology pages enriched (applications, market size)
- [ ] Investor profiles added (select VCs)
- [ ] "Browse Database" preview section
- **Goal**: 50,000 visitors/month, 5,000 newsletter signups, 500 platform beta signups

---

## 11. Auto-Posting to Other Platforms

### 11.1 WordPress → Social Distribution

**Native WordPress Options**:
- **Jetpack Publicize**: Auto-share to Twitter, Facebook, LinkedIn, Tumblr
  - Pros: Built-in, reliable, no coding
  - Cons: Limited platforms, basic formatting
- **Blog2Social**: More platforms (Instagram, Pinterest, Medium)
  - Pros: Rich formatting, scheduling, analytics
  - Cons: Paid ($99/year)

**Custom Integration** (Recommended for Full Control):
```javascript
WordPress Webhook → n8n Workflow → Multiple Platforms

1. WordPress publishes post
2. Webhook triggers n8n.io workflow
3. n8n sends to:
   - Twitter (via API) - Share title + link + image
   - LinkedIn (via API) - Rich preview with excerpt
   - Bluesky (existing integration) - Same as current broadcasts
   - Telegram (existing integration) - Link to WP article
   - (Future) Threads, Mastodon, etc.

4. n8n logs results, sends Slack notification
```

**Content Adaptation by Platform**:
```
WordPress Article (1200 words)
    ↓
Twitter/X (280 chars):
  "🧬 [Headline]

   [1-2 sentence hook]

   Read more: [short link]

   #SyntheticBiology #Biotech"

LinkedIn (1300 chars):
  "[Headline]

   [3-4 sentence summary of article, including key stat or quote]

   This development is part of the broader trend toward [theme].
   [Why it matters - business impact]

   Read the full analysis: [link]

   #Biotech #Innovation #Sustainability"

Bluesky (300 chars):
  "[Headline]

   [2-3 sentence summary]

   [Link]"

Telegram:
  "📰 New on AI10BRO:

   [Headline]

   [Excerpt - 2-3 sentences]

   Read more: [link]"
```

### 11.2 Cross-Posting Strategy Matrix

| Platform | Frequency | Format | Objective |
|----------|-----------|--------|-----------|
| **WordPress** | 3-5x/day | Long-form (800-1200w) | SEO, authority, archive |
| **Twitter** | 3-5x/day | Short (280 chars) | Discovery, engagement |
| **LinkedIn** | 2-3x/day | Medium (1300 chars) | Professional audience, B2B |
| **Bluesky** | 3-5x/day | Short (300 chars) | Tech early adopters |
| **Telegram** | 3-5x/day | Short (current format) | Loyal subscribers |
| **Hacker News** | 1-2x/week | Link (best articles only) | Tech community, backlinks |
| **Reddit** | 2-3x/week | Link (selected subreddits) | Discovery, discussion |

**Automation Rules**:
- All WordPress posts auto-share to Twitter, LinkedIn, Bluesky, Telegram
- High-quality posts (alignment >= 0.20) also posted to Hacker News, Reddit
- Weekly deep dives get enhanced promotion (LinkedIn article, Reddit AMA)

---

## 12. Success Criteria & KPIs

### 12.1 Year 1 Targets

**Traffic**:
- [ ] Month 1: 1,000 visitors
- [ ] Month 3: 5,000 visitors
- [ ] Month 6: 20,000 visitors
- [ ] Month 12: 50,000+ visitors
- [ ] 70%+ from organic search by Month 12

**Content**:
- [ ] 500+ articles published (automated daily insights)
- [ ] 50+ deep dive articles (manual)
- [ ] 20+ company profiles
- [ ] 20+ technology explainers
- [ ] 4 market reports (quarterly)

**Community**:
- [ ] 10,000 newsletter subscribers
- [ ] 100+ quality backlinks (DR 40+)
- [ ] Top 3 Google rankings for 20+ keywords
- [ ] 1,000+ chat interactions/month

**Platform Foundation**:
- [ ] Complete taxonomy mapping (11 themes, 50+ tags)
- [ ] 100+ company entities tagged
- [ ] 50+ technology entities tagged
- [ ] Database platform beta launched (Q4)

### 12.2 North Star Metric
**Engaged Readers**: Users who return 3+ times per month
- Target: 5,000 by end of Year 1
- Measure: Google Analytics cohort analysis
- Indicates: Content quality, brand loyalty, platform readiness

---

## 13. Team & Responsibilities

### 13.1 Initial Team (Months 1-6)
- **Developer** (0.5 FTE): Build site, Eliza integration, maintenance
- **Designer** (0.25 FTE): Brand, UI/UX, graphics (Bolt/Lovable designs)
- **Editor/Writer** (0.5 FTE): Deep dives, quality control, community management
- **Growth/SEO** (0.25 FTE): Keyword research, link building, analytics

**Note**: Eliza agent handles 80%+ of daily content creation (automated)

### 13.2 Scaled Team (Months 7-12)
- **Developer** (1 FTE): Site + database platform development
- **Designer** (0.5 FTE): Ongoing UI/UX, marketing assets
- **Editor-in-Chief** (1 FTE): Content strategy, team management
- **Writer** (0.5 FTE): Deep dives, interviews
- **Community Manager** (0.5 FTE): Comments, chat moderation, social
- **Growth Lead** (0.75 FTE): SEO, partnerships, paid acquisition

---

## 14. Budget Estimate (Year 1)

### 14.1 Infrastructure
- Domain: $15/year
- Hosting (WP Engine): $290/month = $3,480/year
- CDN (Cloudflare Pro): $20/month = $240/year
- Search (Algolia Starter): $0 (up to 10k requests/month)
- Analytics (Plausible): $9/month = $108/year
- Email (ConvertKit): $29/month = $348/year
- **Total Infrastructure**: ~$4,200/year

### 14.2 Tools & Services
- Yoast SEO Premium: $99/year
- ACF Pro: $49/year
- Figma (design): $12/month = $144/year
- Grammarly Business: $150/year
- Ahrefs (SEO): $99/month = $1,188/year
- **Total Tools**: ~$1,600/year

### 14.3 Development (One-time)
- Site build (WordPress + theme): $10,000-15,000
- Eliza→WordPress integration: $5,000-8,000
- Chat widget development: $3,000-5,000
- **Total Development**: ~$18,000-28,000

### 14.4 Content & Growth (Ongoing)
- Writer/Editor (0.5 FTE): $50,000/year
- Growth/SEO (0.25 FTE): $25,000/year
- Guest post placements: $200/month = $2,400/year
- **Total Content & Growth**: ~$77,000/year

### 14.5 Total Year 1 Cost
**Low Estimate**: $100,000 (lean, mostly automated)
**High Estimate**: $150,000 (more manual content, faster growth)

**Note**: Existing infrastructure (Eliza, content pipeline) significantly reduces costs vs building from scratch

---

## 15. Risks & Mitigations

### Risk 1: Low Organic Traffic Growth
**Mitigation**:
- Front-load SEO optimization (Months 1-3)
- Publish high-quality pillar content early
- Aggressive link building (guest posts, HARO)
- Paid distribution (Twitter Ads, Reddit Ads) if needed

### Risk 2: Content Quality Concerns (AI-Generated)
**Mitigation**:
- Human editorial oversight (review all auto-posts)
- Quality threshold (alignment score >= 0.15)
- Mix of automated (80%) + manual (20%) content
- Transparent about AI involvement ("AI-assisted journalism")

### Risk 3: Duplicate Content Issues (Same broadcasts on multiple platforms)
**Mitigation**:
- WordPress version is significantly longer (800-1200 words vs 400 chars)
- Broadcast = teaser, WordPress = full article
- Canonical tags point to WordPress
- Different formatting (rich HTML vs plain text)

### Risk 4: Eliza Integration Complexity
**Mitigation**:
- Start with manual posting (copy/paste) if API integration delayed
- Build integration incrementally (first just create drafts, then enrich, then auto-publish)
- Extensive testing before auto-publish enabled

### Risk 5: Chat Agent Provides Inaccurate Info
**Mitigation**:
- Limit scope to site content only (no external claims)
- Disclaimer: "Informational purposes only, not professional advice"
- Human review of chat transcripts (sample 10% weekly)
- Feedback mechanism ("Was this helpful?")

---

## 16. Future Platform Integration

### 16.1 Database Platform Alignment

**Phase 1 (Months 1-6): Content Hub**
- Focus: SEO, brand, community
- Entities: Lightweight tagging (companies, technologies)
- Data: All in WordPress custom fields

**Phase 2 (Months 7-12): Platform Preview**
- Focus: Showcase database value proposition
- Entities: Rich profiles (funding, team, patents)
- Data: Still in WordPress, but structured for migration

**Phase 3 (Year 2): Full Platform Launch**
- Focus: Paid subscriptions, advanced analytics
- Entities: Full database (companies, investors, technologies, deals)
- Data: Migrate to dedicated database (PostgreSQL)
- WordPress becomes content layer only

**Migration Path**:
```
WordPress (Year 1)
    ↓
WordPress + PostgreSQL (Year 2 Q1-Q2)
    ↓
Full Platform (Next.js + PostgreSQL) + WordPress CMS (Year 2 Q3+)
```

**Key Principle**: WordPress content always feeds platform, never the reverse. WordPress is the publishing layer, database is the intelligence layer.

### 16.2 Taxonomy Mapping (WordPress → Database)

| WordPress Taxonomy | Database Entity | Relationship |
|--------------------|-----------------|--------------|
| Technology Theme (category) | `technologies.category` | Many-to-many via `document_entities` |
| Company (tag) | `companies.id` | Foreign key via `document_entities` |
| Technology (tag) | `technologies.id` | Foreign key via `document_entities` |
| Investor (tag) | `investors.id` | Foreign key via `document_entities` |
| Institution (tag) | `research_institutions.id` | Foreign key via `document_entities` |
| Application (taxonomy) | `markets.name` | Many-to-many via `company_markets` |

**Example Document Flow**:
```
1. Eliza creates broadcast about "Carverr DNA barcodes"
2. publish-to-wordpress.js:
   - Creates WP post
   - Tags: "Carverr" (company), "DNA barcodes" (technology), "food tech" (theme)
   - Custom field: eliza_document_id = "uuid"

3. (Future) Database platform:
   - Reads WP posts via API
   - Creates/updates company entity "Carverr"
   - Links document to company via document_entities table
   - Enriches company profile with funding data, website, etc.

4. WordPress profile pages:
   - Pull enriched data from database API
   - Display: "Carverr - 23 mentions | $X funding | Founded 2019"
   - Link to full database profile (paid tier)
```

---

## 17. Design Brief Summary for Bolt/Lovable

### For Design Agents:
**Create mockups for:**
1. Homepage (desktop + mobile)
2. Article page (desktop + mobile)
3. Category archive (desktop + mobile)
4. Company profile page (desktop + mobile)
5. Newsletter signup modal
6. Chat widget (minimized + expanded)
7. Search overlay (mobile)

**Brand Assets**:
- Logo (wordmark + icon)
- Color palette (primary, secondary, accent, neutrals)
- Typography system (headings, body, code)
- Icon set (theme icons, UI icons)
- Component library (cards, buttons, forms, navigation)

**Design System**:
- 8px grid system
- 4 breakpoints (mobile, tablet, desktop, large)
- Accessibility: WCAG 2.1 AA compliance
- Dark mode support (optional for V1)

**Deliverables**:
- Figma file with all pages + components
- Design tokens (colors, spacing, typography)
- Exported assets (logos, icons, images)
- Style guide (1-page PDF)

### For Build Agent:
**Tech stack:**
- Headless WordPress (backend)
- Next.js 14+ (frontend)
- TailwindCSS (styling)
- TypeScript (type safety)
- WPGraphQL (data fetching)

**Key integrations:**
- WordPress REST API (content publishing)
- Eliza agent (chat widget)
- Gemini API (featured images)
- Analytics (Plausible + GA4)
- Email (ConvertKit)

**Performance targets:**
- Lighthouse score: 90+ (all metrics)
- Core Web Vitals: Pass (LCP <2.5s, FID <100ms, CLS <0.1)
- Accessibility: WCAG 2.1 AA

**Deployment:**
- Vercel (Next.js frontend)
- WP Engine or Kinsta (WordPress backend)
- Cloudflare (CDN + DNS)

---

## 18. Stakeholder Decisions (CONFIRMED)

✅ **Domain**: ai10bro.com (secured)
✅ **Stack**: Traditional WordPress (NOT headless - simpler, faster, cheaper)
✅ **Auto-publish**: Yes (alignment score >= 0.20)
✅ **Chat agent**: Add later (backlog for now)
✅ **Comments**: No (not enabling)
✅ **Newsletter**: Backlog (focus on content first)
✅ **Budget**: Just us building it (no external budget)
✅ **Timeline**: Ship when ready (no fixed deadline)
✅ **Team**: You + me (editorial + dev)
✅ **Success metric**: Engaged Readers (users returning 3+ times/month)

---

## Next Steps

1. **You review this brief** → feedback/revisions
2. **Bolt/Lovable create designs** (2-3 weeks) → you approve
3. **Build agent develops site** (4-6 weeks) → iterative testing
4. **Eliza integration** (1-2 weeks) → automated publishing live
5. **Content backfill** (1 week) → 50 articles migrated
6. **Soft launch** (Week 8) → announce to community
7. **Iterate & grow** (ongoing) → analytics-driven optimization

**Ready to proceed?** Let me know any changes to the brief and we can kick off design! 🚀
