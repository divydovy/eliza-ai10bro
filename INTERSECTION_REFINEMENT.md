# Tech + Biology Intersection Refinement
**Date**: 2025-12-03
**Focus**: Refined content sourcing to focus on the INTERSECTION of technology and biology

## Problem Statement
Initial content sourcing was pulling generic AI/ML content (POET, HyperCLOVA) that wasn't relevant to AI10BRO's mission of nature-inspired technology and biomimicry.

## Solution
Refined all content sources to focus specifically on the **intersection** of technology and biology:
- Where biology meets technology
- Where nature inspires innovation
- Where living systems guide engineering

## Changes Made

### 1. YouTube RSS Keywords (`fetch-youtube-rss.js`)

**Before**: Generic AI/ML keywords
- 'ai', 'artificial intelligence', 'machine learning', 'algorithm', 'computing'
- Only 2 biology words: 'biotech', 'nanotech'

**After**: Intersection-focused keywords (40 keywords organized by theme)
- **Biomimicry & Nature-inspired Tech**: biomimicry, nature-inspired, swarm intelligence, evolutionary algorithm
- **Synthetic Biology & Bioengineering**: CRISPR, gene editing, cellular agriculture, lab-grown
- **Bio-computing & AI**: neuromorphic, DNA computing, bio-AI, computational biology
- **Bio-materials & Design**: living materials, mycelium, bio-concrete, self-healing materials
- **Clean Energy (Bio-focused)**: biofuel, algae fuel, photosynthesis, microbial fuel cell

### 2. YouTube Channels (`fetch-youtube-rss.js`)

**Removed**:
- Google, Microsoft, SpaceX (too generic tech)
- Two Minute Papers (generic AI focus)

**Added**:
- SynBioBeta (synthetic biology)
- iBiology (molecular biology)
- Deep Look (microscopic life)
- Journey to the Microcosmos (micro-organisms)
- SciShow (science communication)
- Nature Video (Nature journal)

**Kept**:
- MIT, TED (good mix of bio+tech)
- Veritasium, Kurzgesagt (science communication)

### 3. Reddit Subreddits (`sync-reddit.js`)

**Added**:
- r/Biohackers (DIY biology & experimentation)
- r/bioinformatics (computational biology)
- r/Myco (mycology & fungal applications)
- r/Futurology (with keyword filtering)

**Reorganized** into tiers:
- Tier 1: Core Intersection (Tech + Bio)
- Tier 2: Applied Bio-tech
- Tier 3: Sustainable Tech
- Tier 4: Broader Context

**Total**: 19 subreddits (was 13)

## Content Focus Areas

### ✅ What We WANT (Intersection)
1. **Biomimicry**: Technology inspired by nature
   - Swarm robotics inspired by ants
   - Velcro from burrs
   - Bullet trains from kingfisher beaks

2. **Synthetic Biology**: Engineering living systems
   - CRISPR gene editing
   - Cellular agriculture (lab-grown meat)
   - Metabolic engineering for biofuels

3. **Bio-computing**: Biological approaches to computing
   - Neuromorphic chips (brain-inspired)
   - DNA computing and storage
   - Neural networks (originally bio-inspired)

4. **Bio-materials**: Materials from or inspired by biology
   - Mycelium construction
   - Spider silk proteins
   - Self-healing concrete with bacteria

5. **Bio-energy**: Biological energy production
   - Algae biofuels
   - Microbial fuel cells
   - Artificial photosynthesis

### ❌ What We DON'T Want
- Pure computer science (unless bio-inspired)
- Generic ML algorithms (unless biomimetic)
- Traditional engineering (unless nature-inspired)
- Pure biology (unless applied to technology)

## Expected Outcomes

1. **Content Quality**: 70-80% of new content will be intersection-focused
2. **Alignment Scores**: Will naturally score higher with refined alignment weights
3. **Broadcast Relevance**: More unique, nature-inspired technology content
4. **Reduced Noise**: Eliminate generic AI/ML content like POET, HyperCLOVA

## Testing

To verify the refinement is working:
```bash
# Run YouTube scraper
node fetch-youtube-rss.js

# Run Reddit scraper
node sync-reddit.js

# Check top 20 new documents by alignment score
sqlite3 agent/data/db.sqlite "SELECT id, content FROM broadcasts ORDER BY alignment_score DESC LIMIT 20"
```

Expected: Should see content about:
- Biomimicry innovations
- CRISPR and synthetic biology
- Nature-inspired robotics
- Living materials and bio-construction
- Bio-inspired computing

Should NOT see:
- Generic ML models (unless biomimetic)
- Pure software/algorithms
- Traditional engineering
- Generic "AI innovation" without biology connection

## Combined with Alignment Scoring

This refinement works in combination with the updated alignment scores:
- **New alignment weights** prioritize biomimicry (0.50), biology_biotech (0.40), environmental_conservation (0.35)
- **New content sources** now naturally provide more content in these categories
- **Result**: Virtuous cycle where better content + better scoring = better broadcasts
