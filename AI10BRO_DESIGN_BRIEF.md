# AI10BRO Design Brief
**Bio Intelligence Hub & Content Platform**

## Project Overview

### Vision
Transform AI10BRO from a broadcast-only presence (Telegram/Bluesky) into a discoverable content hub for bio/sustainability/tech innovations.

### Primary Goals
1. **Discovery**: SEO-optimized content hub driving organic traffic
2. **Brand Building**: Establish AI10BRO as thought leader in "biology century"
3. **Content Archive**: Searchable repository of innovations
4. **Community**: Interactive hub with future chatbot integration

---

## Content Types

### 1. Daily Insights (Primary Feed)
**Format**: 800-1200 word articles, 3-5x per day
**Source**: Auto-generated from current broadcast system

**Structure**:
- Compelling headline
- Featured image (AI-generated)
- Hook (2-3 sentences)
- Context & Details (3-4 paragraphs)
- Why It Matters (2-3 paragraphs)
- Related Developments (links to previous posts)
- Source Citation

**Example Topics**:
- "Carverr Creates DNA Barcodes to Trace Food Through Supply Chain"
- "MIT Researchers Unveil Affordable Advanced Materials AI System"
- "Princeton Engineers Design Crystalline Materials That Bend Light"

### 2. Deep Dives (Weekly Analysis)
**Format**: 2,000-4,000 word analysis, 1-2x per week
**Source**: Manual curation from best content

**Examples**:
- "The Race to Carbon-Negative Concrete: 5 Technologies to Watch"
- "Biomimicry in Materials Science: Q4 2025 Landscape"
- "Synthetic Biology Funding Trends: What Changed in 2025"

### 3. Company Profiles (Future)
**Format**: 600-1,000 words
- Overview & mission
- Technology description
- Funding history
- Key milestones
- Team highlights

### 4. Technology Explainers (Future)
**Format**: 800-1,500 words
- What it is (simple explanation)
- How it works (technical detail)
- Applications & use cases
- Companies working on it
- Market outlook

### 5. Market Reports (Quarterly)
**Format**: 3,000-5,000 words + visualizations
- "Q1 2025 Bio Innovation Funding Report"
- "State of Biomimicry: 2025 Industry Landscape"

---

## Information Architecture

### URL Structure
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
```

### Navigation Structure
```
Primary Nav:
- Home
- Insights
- Analysis
- Companies (coming soon)
- Technologies (coming soon)
- Reports
- About

Footer Nav:
- About AI10BRO
- Contact
- Privacy Policy
- Terms of Service

Sidebar/Secondary:
- Popular This Week
- Recent Deep Dives
- Browse by Theme
- Subscribe (future)
```

### Content Taxonomy

**11 Technology Themes** (Primary Categories):
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

**Tags** (Granular):
- Company names (auto-tagged when mentioned)
- Researcher names
- Specific technologies (CRISPR, DNA barcodes, etc.)
- Materials (graphene, bioplastics, etc.)
- Geographic regions

---

## Brand Identity

### Personality
- **Scientific**: Grounded in research and data
- **Forward-thinking**: Optimistic about innovation
- **Accessible**: Not academic, not hype - informative journalism

### Tone of Voice
- Informative and authoritative without being dry
- Enthusiastic but measured (avoid "revolutionary" / "game-changing")
- Short paragraphs (2-4 sentences)
- Active voice, clear language

### Color Palette
```
Primary:   Deep Blue     #0A2540  (trust, depth, technology)
Secondary: Vibrant Green #10B981  (biology, growth, sustainability)
Accent:    Warm Amber    #F59E0B  (energy, innovation, optimism)

Neutrals:
  Off-white:   #F9FAFB
  Medium gray: #6B7280
  Dark gray:   #1F2937
```

### Typography
```
Headings:    Inter (clean, modern, highly legible)
Body:        System font stack (fast, native)
Code/Data:   JetBrains Mono (for technical content)

Sizes:
  H1: 2.5rem (40px)
  H2: 2rem (32px)
  H3: 1.5rem (24px)
  Body: 1rem (16px)
  Small: 0.875rem (14px)
```

### Visual Style
- **Biology-inspired patterns**: Subtle DNA helices, cellular structures (background accents)
- **Clean, modern layouts**: Generous whitespace, clear hierarchy
- **Data visualization**: Charts, graphs when showing trends/stats
- **Photography style**: Microscopy-style imagery, research lab aesthetic
- **AI-generated images**: Every article has unique featured image (Gemini V2)

---

## Page Layouts

### Homepage
```
┌─────────────────────────────────────────────────────────────┐
│ Header: Logo | Nav | Search                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Hero: Featured Deep Dive                                    │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ [Large Featured Image - full width]                  │   │
│ │                                                       │   │
│ │ Headline (H1)                                        │   │
│ │ Excerpt (2-3 sentences)                              │   │
│ │ [Read Analysis Button]                               │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ Latest Insights                                             │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐                 │
│ │ [Image]   │ │ [Image]   │ │ [Image]   │                 │
│ │ Title     │ │ Title     │ │ Title     │                 │
│ │ Excerpt   │ │ Excerpt   │ │ Excerpt   │                 │
│ │ 3 min read│ │ 4 min read│ │ 5 min read│                 │
│ └───────────┘ └───────────┘ └───────────┘                 │
│                                                              │
│ [Load More or View All Insights]                            │
├─────────────────────────────────────────────────────────────┤
│ Theme Navigator                                             │
│ [Biomimicry] [Synbio] [Materials] [Energy] [AgTech] ...    │
│ (Clickable pills/chips leading to category pages)           │
├─────────────────────────────────────────────────────────────┤
│ Recent Deep Dives                                           │
│ ┌────────────────────┐ ┌────────────────────┐             │
│ │ [Image]            │ │ [Image]            │             │
│ │ Title              │ │ Title              │             │
│ │ Excerpt            │ │ Excerpt            │             │
│ │ 12 min read        │ │ 15 min read        │             │
│ └────────────────────┘ └────────────────────┘             │
├─────────────────────────────────────────────────────────────┤
│ Stats Banner                                                │
│ "Tracking 1,460+ innovations | Publishing 3-5 daily ..."   │
├─────────────────────────────────────────────────────────────┤
│ Footer: About | Contact | Social | Legal                   │
└─────────────────────────────────────────────────────────────┘
```

### Article Page (Daily Insight / Deep Dive)
```
┌─────────────────────────────────────────────────────────────┐
│ Header (minimal, sticky)                                    │
├─────────────────────────────────────────────────────────────┤
│ Breadcrumb: Home > Theme > Article                          │
│                                                              │
│ Title (H1)                                                  │
│ Meta: Date | 5 min read | [Share buttons]                  │
│                                                              │
│ [Featured Image - full width, high quality]                │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ Content Layout:                                             │
│ ┌────────────────────────┬──────────────────────┐          │
│ │ Article Body           │ Sidebar:             │          │
│ │                        │                      │          │
│ │ Paragraph              │ Categories:          │          │
│ │ Paragraph              │ • Biomimicry         │          │
│ │                        │ • Materials          │          │
│ │ [Embedded image]       │                      │          │
│ │                        │ Tags:                │          │
│ │ Subheading (H2)        │ #Carverr #DNA        │          │
│ │ Paragraph              │ #FoodTech            │          │
│ │ Paragraph              │                      │          │
│ │                        │ Popular This Week:   │          │
│ │ Subheading (H2)        │ • Article 1          │          │
│ │ Paragraph              │ • Article 2          │          │
│ │                        │ • Article 3          │          │
│ │ [Pull quote]           │                      │          │
│ │                        │                      │          │
│ │ Paragraph              │ [Ad space or        │          │
│ │ Paragraph              │  future CTA]        │          │
│ │                        │                      │          │
│ │ Source Citation:       │                      │          │
│ │ 🔗 [URL]               │                      │          │
│ └────────────────────────┴──────────────────────┘          │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ Related Content                                             │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐                 │
│ │ [Image]   │ │ [Image]   │ │ [Image]   │                 │
│ │ Title     │ │ Title     │ │ Title     │                 │
│ │ Excerpt   │ │ Excerpt   │ │ Excerpt   │                 │
│ └───────────┘ └───────────┘ └───────────┘                 │
├─────────────────────────────────────────────────────────────┤
│ Footer                                                      │
└─────────────────────────────────────────────────────────────┘
```

### Category Archive (Theme Page)
```
┌─────────────────────────────────────────────────────────────┐
│ Header                                                      │
├─────────────────────────────────────────────────────────────┤
│ Theme Header:                                               │
│ Biomimicry & Nature-Inspired Design (H1)                   │
│ Description: Innovations that learn from nature's 3.8B...  │
│ Stats: 247 posts | 23 companies | 15 technologies          │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ Filter Bar:                                                 │
│ [All Posts] [Companies] [Technologies] [Research] [Reports]│
├─────────────────────────────────────────────────────────────┤
│ Content Grid (3-column, masonry style)                      │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│ │ [Image]    │ │ [Image]    │ │ [Image]    │              │
│ │ Title      │ │ Title      │ │ Title      │              │
│ │ Excerpt    │ │ Excerpt    │ │ Excerpt    │              │
│ │ 4 min | Tag│ │ 6 min | Tag│ │ 3 min | Tag│              │
│ └────────────┘ └────────────┘ └────────────┘              │
│                                                              │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│ │ [Image]    │ │ [Image]    │ │ [Image]    │              │
│ │ ...        │ │ ...        │ │ ...        │              │
│ └────────────┘ └────────────┘ └────────────┘              │
│                                                              │
│ [Load More or Pagination]                                   │
├─────────────────────────────────────────────────────────────┤
│ Footer                                                      │
└─────────────────────────────────────────────────────────────┘
```

### About Page
```
┌─────────────────────────────────────────────────────────────┐
│ Header                                                      │
├─────────────────────────────────────────────────────────────┤
│ About AI10BRO (H1)                                         │
│                                                              │
│ [Hero section with brand image/pattern]                    │
│                                                              │
│ Mission Statement (2-3 paragraphs)                         │
│ - Tracking innovations in biology century                  │
│ - Making cutting-edge research accessible                  │
│ - Building the bio intelligence platform                   │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ What We Cover (3-column)                                    │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│ │ [Icon]   │ │ [Icon]   │ │ [Icon]   │                    │
│ │ Biomimicry│ │ Synbio   │ │ Materials│                    │
│ │ Desc...  │ │ Desc...  │ │ Desc...  │                    │
│ └──────────┘ └──────────┘ └──────────┘                    │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ How It Works                                                │
│ 1. Daily Content Curation (explain AI-assisted process)    │
│ 2. Quality Scoring & Selection                             │
│ 3. Multi-Platform Distribution                             │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ Get Involved                                                │
│ - Follow on Telegram/Bluesky                               │
│ - Submit innovations (mailto link)                          │
│ - Partner with us                                           │
├─────────────────────────────────────────────────────────────┤
│ Footer                                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Library

### Cards

**Insight Card** (for grids)
```
┌───────────────────────┐
│ [Featured Image]      │
│                       │
├───────────────────────┤
│ [Category Badge]      │
│ Article Title (H3)    │
│ Excerpt (2 lines)     │
│ 4 min read · Mar 15   │
└───────────────────────┘
```

**Deep Dive Card** (larger, featured)
```
┌───────────────────────┐
│ [Featured Image]      │
│                       │
├───────────────────────┤
│ [ANALYSIS Badge]      │
│ Article Title (H2)    │
│ Excerpt (3-4 lines)   │
│ 15 min read · Mar 10  │
│ [Read Analysis →]     │
└───────────────────────┘
```

**Company Card** (future)
```
┌───────────────────────┐
│ [Company Logo]        │
│ Company Name          │
│ Tagline (1 line)      │
│ $X.XM funding         │
│ [View Profile →]      │
└───────────────────────┘
```

**Technology Card** (future)
```
┌───────────────────────┐
│ [Icon/Image]          │
│ Technology Name       │
│ [TRL 7 Badge]         │
│ Applications (2 lines)│
│ 12 companies using    │
└───────────────────────┘
```

### Badges & Labels
```
Category Badges:
[Biomimicry]  - Green background, dark text
[Synbio]      - Blue background, white text
[Materials]   - Purple background, white text
[Energy]      - Amber background, dark text
... (one for each theme)

Content Type Badges:
[INSIGHT]     - Default style
[ANALYSIS]    - Emphasized style
[REPORT]      - Special style
[PROFILE]     - Alternative style

Status Badges (future):
[TRL 1-3]     - Red (early research)
[TRL 4-6]     - Amber (pilot stage)
[TRL 7-9]     - Green (commercial)
```

### Buttons
```
Primary:   Blue background (#0A2540), white text
Secondary: White background, blue border, blue text
Accent:    Green background (#10B981), white text

States:
- Default
- Hover (slightly lighter/darker)
- Active (pressed state)
- Disabled (gray, low opacity)
```

### Forms (future)
```
Newsletter Signup:
- Email input field (large, prominent)
- Subscribe button (accent green)
- Privacy notice (small text below)

Search:
- Search input (with icon)
- Instant results dropdown
- Recent searches
```

### Interactive Elements
```
Share Buttons:
- Twitter/X
- LinkedIn
- Copy link
- (Future: Bluesky, email)

Read Time Indicator:
"4 min read" - small, gray text

Tag Pills:
[#DNA] [#FoodTech] [#Carverr]
Clickable, blue text, light blue background
```

---

## Responsive Design

### Breakpoints
```
Mobile:   320px - 767px   (1 column)
Tablet:   768px - 1023px  (2 columns)
Desktop:  1024px - 1439px (3 columns, sidebar)
Large:    1440px+         (3 columns, wider max-width)
```

### Mobile-Specific Design
```
Navigation:
- Hamburger menu (top-right)
- Full-screen overlay when open
- Clear close button

Homepage:
- Single column card list
- Hero image scaled down
- Simplified theme navigator (horizontal scroll)

Article Page:
- No sidebar (moves to bottom)
- Sticky header (collapses on scroll down)
- Floating share button (bottom-right)
- Larger tap targets (44px minimum)

Typography:
- Slightly smaller (H1: 32px instead of 40px)
- Line height increased (1.6 instead of 1.5)
- Optimal line length maintained (60-70 chars)
```

---

## Accessibility Requirements

### Standards
- **WCAG 2.1 AA compliance** minimum
- Color contrast ratio: 4.5:1 for normal text, 3:1 for large text
- Keyboard navigation support (tab order, focus indicators)
- Screen reader friendly (semantic HTML, ARIA labels)
- Alt text for all images (auto-generated or manual)

### Best Practices
- Skip to main content link
- Focus visible on all interactive elements
- No reliance on color alone for information
- Captions for video content (if added later)
- Consistent navigation structure

---

## Performance Targets

### Core Web Vitals
- **LCP** (Largest Contentful Paint): < 2.5s
- **FID** (First Input Delay): < 100ms
- **CLS** (Cumulative Layout Shift): < 0.1

### Image Optimization
- WebP format with JPEG fallback
- Responsive images (srcset)
- Lazy loading below fold
- Blur-up placeholder while loading

### General Performance
- Lighthouse score: 90+ on all metrics
- First Contentful Paint: < 1.8s
- Time to Interactive: < 3.8s

---

## Design Deliverables

### Required from Bolt/Lovable

**1. Homepage Design**
- Desktop (1440px)
- Tablet (768px)
- Mobile (375px)

**2. Article Page Design**
- Desktop with sidebar
- Mobile (no sidebar)
- Typography hierarchy showcase

**3. Category Archive**
- Desktop grid view
- Mobile list view

**4. About Page**
- Desktop layout
- Mobile layout

**5. Component Library**
- All card types
- Buttons (all states)
- Badges & labels
- Form elements
- Navigation (desktop + mobile)

**6. Brand Assets**
- Logo (wordmark + icon versions)
- Color palette (with hex codes)
- Typography system (fonts, sizes, weights)
- Icon set (if custom icons designed)

**7. Style Guide** (1-2 page PDF)
- Color usage guidelines
- Typography rules
- Spacing system (8px grid)
- Component usage examples

---

## Content Examples

### Sample Headlines (Good)
- "Carverr Creates DNA Barcodes to Trace Food Through Supply Chain"
- "Princeton Engineers Design Crystalline Materials That Bend Light"
- "MIT Researchers Unveil Affordable Advanced Materials AI System"
- "Protein Therapeutics Market Expanding with AI-Driven Design Tools"

### Sample Headlines (Avoid)
- "Revolutionary New Technology Could Change Everything!" ❌
- "You Won't Believe What Scientists Just Discovered" ❌
- "This One Weird Trick is Disrupting Biology" ❌

### Sample Body Text (Tone)
✅ **Good**: "Researchers have identified a genetic element called pWPMR2 that helps bacteria rapidly evolve antibiotic resistance. This discovery could lead to new strategies for combating drug-resistant infections, a growing public health threat affecting millions globally."

❌ **Too Academic**: "The identification of the pWPMR2 genetic element represents a significant advancement in our understanding of horizontal gene transfer mechanisms in prokaryotic organisms."

❌ **Too Hype**: "AMAZING breakthrough! Scientists just found the SECRET to beating superbugs FOREVER!"

---

## Design Inspiration References

### Similar Sites (Aesthetic)
- **The Verge**: Clean, modern, strong typography
- **Stratechery**: Simple, focused on content
- **Nature.com**: Scientific but accessible
- **MIT Technology Review**: Authoritative, data-rich

### Biology/Science Aesthetic
- Subtle cellular patterns (background textures)
- Microscopy color palettes (deep blues, vibrant greens)
- Clean data visualization
- High-quality research imagery

### What to Avoid
- Generic tech startup aesthetic (too many gradients)
- Overly corporate/sterile design
- Busy, cluttered layouts
- Stock photo biology imagery (lab coats, petri dishes)

---

## Notes for Designers

### Key Principles
1. **Content First**: Design serves the content, not the other way around
2. **Readability**: Typography and spacing optimize for reading 800-1200 word articles
3. **Scalability**: System works for 5 posts or 5,000 posts
4. **Performance**: Every design decision considers page load impact
5. **Future-Proof**: Layout accommodates future features (profiles, database)

### Flexibility Needed
- Component-based design (reusable across page types)
- Modular layout system (easy to rearrange sections)
- Clear design tokens (colors, spacing, typography)
- Documentation of patterns and usage

---

## Questions?

This brief is a living document. If anything is unclear or you need additional context, please ask before making assumptions. Better to clarify upfront than redesign later!
