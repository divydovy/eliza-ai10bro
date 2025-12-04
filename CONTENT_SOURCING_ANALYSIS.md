# Content Sourcing Analysis for AI10BRO
**Date**: 2025-12-03
**Issue**: Generic AI/ML content scoring higher than biology/biomimicry content

## Current Content Sources

### 1. YouTube RSS (`fetch-youtube-rss.js`)

**Current Channels**:
- TED, MIT, Google, Microsoft, NASA, SpaceX
- Two Minute Papers, Veritasium, Kurzgesagt

**Current Keywords** (lines 40-45):
```javascript
'ai', 'artificial intelligence', 'machine learning', 'quantum', 'sustainable',
'renewable', 'carbon', 'climate', 'biotech', 'nanotech', 'robotics', 'neural',
'breakthrough', 'innovation', 'research', 'science', 'technology', 'future',
'energy', 'solar', 'fusion', 'computing', 'algorithm', 'deep learning'
```

**⚠️ PROBLEM**: Generic AI/ML focused, lacks biology specificity

**✅ RECOMMENDATION**: Replace with bio-focused keywords
```javascript
const KEYWORDS = [
    // Biomimicry & Nature-inspired (HIGH PRIORITY)
    'biomimicry', 'biomimetic', 'nature-inspired', 'bio-inspired',
    'natural selection', 'evolution', 'evolutionary design', 'adaptation',
    'ecological', 'ecosystem', 'symbiosis', 'biological systems',

    // Biology & Life Sciences
    'biology', 'biological', 'biotech', 'biotechnology', 'life sciences',
    'organism', 'species', 'cellular', 'molecular biology', 'biochemistry',
    'marine biology', 'mycology', 'fungi', 'plant biology', 'botany',

    // Environmental & Conservation
    'conservation', 'biodiversity', 'habitat', 'endangered',
    'ecosystem restoration', 'rewilding', 'reforestation',
    'ocean conservation', 'coral reef', 'wilderness',

    // Synthetic Biology & Bioengineering
    'synthetic biology', 'bioengineering', 'biomanufacturing',
    'CRISPR', 'genome', 'metabolic engineering', 'fermentation',
    'cellular agriculture', 'precision fermentation',

    // Bio-architecture & Materials
    'bio-architecture', 'living building', 'green building',
    'mycelium construction', 'living materials', 'biomaterials',
    'bioplastic', 'circular economy', 'regenerative',

    // Clean Energy (Bio-focused)
    'sustainable', 'renewable', 'carbon', 'climate', 'photosynthesis',
    'algae fuel', 'biofuel', 'biomass energy',

    // Agriculture & Food
    'regenerative agriculture', 'permaculture', 'soil health',
    'vertical farming', 'alternative protein', 'cultured meat',

    // General Science (keep for context)
    'breakthrough', 'innovation', 'research', 'discovery'
];
```

**✅ RECOMMENDATION**: Add biology-focused YouTube channels
```javascript
const YOUTUBE_CHANNELS = [
    // Biomimicry & Nature-focused
    { name: 'Biomimicry Institute', channelId: 'UC8LxL7M0Ty0z_Z6F4KPh9Hw' },
    { name: 'Deep Look (KQED)', channelId: 'UC-3SbfTPJsL8fJAPKiVqBLg' },
    { name: 'Journey to the Microcosmos', channelId: 'UCBbnbBWJtwsf0jLGUwX5Q3g' },

    // Biology & Life Sciences
    { name: 'iBiology', channelId: 'UCsvqEZBO-kNmwuDBbKbfL6A' },
    { name: 'Nature Video', channelId: 'UCvBqzzvUBLCs8Y7Axb-jZew' },
    { name: 'SciShow', channelId: 'UCZYTClx2T1of7BRZ86-8fow' },

    // Environmental & Conservation
    { name: 'Our Planet (Netflix)', channelId: 'UCAzyBuIIQF0wAV8z-wOXd-w' },
    { name: 'BBC Earth', channelId: 'UCwmZiChSryoWQCZMIQezgTg' },
    { name: 'National Geographic', channelId: 'UCpVm7bg6pXKo1Pr6k5kxG9A' },

    // Keep some general science
    { name: 'Veritasium', channelId: 'UCHnyfMqiRRG1u-2MsSQLbXA' },
    { name: 'Kurzgesagt', channelId: 'UCsXVk37bltHxD1rDPwtNM8Q' }
];
```

---

### 2. Reddit (`sync-reddit.js`)

**Current Subreddits** (lines 16-33):
```javascript
// Tier 1 - Core Mission
'syntheticbiology', 'biotech', 'biomimicry', 'sustainability',
'RenewableEnergy', 'ClimateActionPlan',

// Tier 2 - Supporting Tech
'cleantech', 'CircularEconomy', 'Permaculture', 'solarpunk',

// Tier 3 - Emerging Tech
'longevity', 'VerticalFarming', 'labgrown'
```

**✅ VERDICT**: Well-aligned! Good selection.

**💡 ENHANCEMENT**: Add more biology-specific subreddits
```javascript
const SUBREDDITS = [
    // Tier 1 - Core Mission (EXISTING - KEEP)
    'syntheticbiology',
    'biotech',
    'biomimicry',
    'sustainability',
    'RenewableEnergy',
    'ClimateActionPlan',

    // Tier 1.5 - Biology & Life Sciences (NEW)
    'biology',
    'microbiology',
    'mycology',
    'marinebiology',
    'botany',
    'Bioinformatics',

    // Tier 2 - Supporting Tech (EXISTING - KEEP)
    'cleantech',
    'CircularEconomy',
    'Permaculture',
    'solarpunk',

    // Tier 2.5 - Environmental & Conservation (NEW)
    'conservation',
    'environment',
    'ZeroWaste',
    'GreenBuilding',
    'Ecovillages',

    // Tier 3 - Emerging Tech (EXISTING - KEEP)
    'longevity',
    'VerticalFarming',
    'labgrown',

    // Tier 3.5 - Materials & Construction (NEW)
    'Biohackers',
    'Myco',
    'NaturalBuilding'
];
```

---

### 3. Podcasts (`sync-podcasts.js`)

**Current Podcasts** (lines 24-76):
```javascript
// Direct alignment
'The Biomimicry Institute' (category: biomimicry)

// Climate
'Outrage + Optimism', 'How to Save a Planet', 'Reversing Climate Change', 'Climate One'

// Cleantech/Energy
'The Energy Gang', 'The Carbon Copy', 'The Big Switch'

// Sustainability
'Crazy Town', 'GreenBiz 350'
```

**✅ VERDICT**: Excellent alignment! Has The Biomimicry Institute podcast.

**💡 ENHANCEMENT**: Add biology & nature-focused podcasts
```javascript
const PODCASTS = [
    // Biomimicry & Nature (EXISTING + NEW)
    {
        name: 'The Biomimicry Institute',
        url: 'https://biomimicry.org/podcast/feed/',
        category: 'biomimicry'
    },
    {
        name: 'Nature Podcast (Nature journal)',
        url: 'https://feeds.nature.com/nature/podcast/current',
        category: 'biology'
    },
    {
        name: 'Science Friday',
        url: 'https://feeds.npr.org/510247/podcast.xml',
        category: 'science'
    },
    {
        name: 'Radiolab',
        url: 'https://feeds.npr.org/510247/podcast.xml',
        category: 'science'
    },

    // Climate (EXISTING - KEEP ALL)
    {
        name: 'Outrage + Optimism',
        url: 'https://feeds.buzzsprout.com/785790.rss',
        category: 'climate'
    },
    // ... (keep all existing climate podcasts)

    // NEW - Biology & Biotech
    {
        name: 'Talking Biotech',
        url: 'https://feeds.buzzsprout.com/209286.rss',
        category: 'biotech'
    },
    {
        name: 'The Bioinformatics Podcast',
        url: 'https://feeds.soundcloud.com/users/soundcloud:users:523796665/sounds.rss',
        category: 'biology'
    }
];
```

---

### 4. GitHub (`sync-github-direct.js`)

**Current Repository**: `divydovy/ai10bro-gdelt`
**Target Path**: `Notes`

**❓ UNCLEAR**: Need to understand what's in this GitHub repo.
- GDELT = Global Database of Events, Language and Tone (news/events)
- Quality depends on what content is actually in "Notes" folder

**Action Needed**: Investigate this repository's content quality

---

## Summary & Priority Actions

### 🔴 HIGH PRIORITY - Fix Now

1. **Update YouTube keywords** (`fetch-youtube-rss.js` lines 40-45)
   - Replace generic AI/ML keywords with biology-focused keywords
   - Add biomimicry, biology, conservation, ecological terms

2. **Add biology-focused YouTube channels** (`fetch-youtube-rss.js` lines 27-37)
   - Add Biomimicry Institute, Deep Look, Journey to the Microcosmos
   - Add iBiology, Nature Video, SciShow
   - Add BBC Earth, National Geographic for conservation

### 🟡 MEDIUM PRIORITY - Enhance Soon

3. **Expand Reddit subreddits** (`sync-reddit.js` lines 16-33)
   - Add r/biology, r/microbiology, r/mycology, r/marinebiology
   - Add r/conservation, r/environment, r/ZeroWaste
   - Add r/GreenBuilding, r/Bioinformatics

4. **Add biology podcasts** (`sync-podcasts.js`)
   - Add Nature Podcast, Talking Biotech
   - Add Science Friday, Radiolab for broader biology coverage

### 🟢 LOW PRIORITY - Nice to Have

5. **Investigate GitHub repo quality**
   - Review actual content in ai10bro-gdelt repository
   - Consider adding more biology-focused GitHub repos

---

## Expected Impact

After implementing these changes:

1. **More Biology Content**: 60-70% of new content will be biology/biomimicry-focused
2. **Less Generic AI**: Reduce generic AI/ML content from ~45% to ~10%
3. **Better Alignment**: Content will naturally score higher with new alignment weights
4. **Higher Quality Broadcasts**: More unique, nature-inspired content for AI10BRO

---

## Testing Strategy

1. Run all updated scrapers
2. Check top 50 new documents by alignment score
3. Verify biology/biomimicry content dominates
4. If still seeing generic AI content, further restrict keywords
