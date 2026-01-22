# Trend Analysis & Synthetic Insights Implementation Plan

**Date**: 2026-01-22
**Goal**: Transform AI10BRO's 37K+ document knowledge base into synthetic trend analysis pieces

## Current System State

**Content Types**:
- **Daily Insights**: Single-source news articles (800-1200 words, every 4 hours)
- **Analysis (Deep Dives)**: Currently single-source, should be multi-source synthetic

**Database**:
- 37,537 total documents
- 2,351 broadcast-ready (alignment ≥12%)
- 106 tracked entities (42 companies, 20 labs, 20 VCs)
- 12 bio themes (biomimicry, synbio, materials, energy, agtech, health, ai, innovation, environment, space, manufacturing)
- Entity mention detection system (290 mentions tracked)

**Problem**: Analysis pieces are just detailed write-ups of single sources, not true synthesis

---

## Industry Best Practices Research

### 1. CB Insights Approach

**Source**: [CB Insights Methodology](https://www.cbinsights.com/research/)

**Their Method**:
- **Signal-based detection**: Track financing, patents, partnerships, acquisitions
- **Trend funnel framework**: Weak signals → Emerging trends → Key trends → Macro trends → Megatrends → Paradigm shifts
- **Multi-source synthesis**: Combine unstructured news, patents, startup websites, VC financing
- **AI-powered monitoring**: Continuously monitor millions of companies using proprietary algorithms
- **Maturity scoring**: Commercial Maturity + M&A Probability + Business Health (Mosaic scores)

**Key Takeaway**: Identify "signals" (events) and cluster them to detect patterns

### 2. BERTopic & Modern Topic Modeling

**Sources**:
- [BERTrend: Neural Topic Modeling](https://arxiv.org/html/2411.05930v1)
- [LLM-Guided Semantic-Aware Clustering](https://aclanthology.org/2025.acl-long.902.pdf)
- [QualIT: LLM Enhanced Topic Modeling](https://arxiv.org/html/2409.15626)

**Technical Approach**:
1. **Document Embeddings**: Use BERT/RoBERTa to create dense vector representations
2. **Clustering**: HDBSCAN groups semantically similar documents
3. **Topic Extraction**: c-TF-IDF (class-based TF-IDF) identifies key terms per cluster
4. **LLM Enhancement**: GPT/Claude generate human-readable topic labels
5. **Temporal Tracking**: Monitor topic prevalence over time batches

**Key Finding**: BERTopic generates more cohesive, interpretable topics than LDA (traditional)

**Performance (2025 study)**:
- Best diversity: Phi (0.717), LLaMA (0.682)
- Best relevance: Qwen (0.610), GPT (0.536)

### 3. Knowledge Graph & Entity Co-occurrence

**Sources**:
- [Semantic Knowledge Graphs for News](https://dl.acm.org/doi/10.1145/3543508)
- [Event-Centric Knowledge Graphs](https://www.researchgate.net/publication/390611069_ECS-KG_An_Event-Centric_Semantic_Knowledge_Graph_for_Event-Related_News_Articles)

**Approach**:
- **Entity extraction**: Identify companies, people, technologies, locations
- **Co-occurrence graphs**: Nodes = entities, edges = co-mentions in documents
- **Community detection**: Dense subgraphs = emerging trends
- **Temporal relations**: Track entity relationships over time
- **Event-centric**: Structure around events (funding, product launch, research)

**HEER System** (Heterogeneous Embedding for Emerging Relations):
- Represents news as graphs based on entity co-occurrence
- Incrementally maintains joint embeddings
- Detects emerging entities/relations not yet in knowledge graph

**Key Takeaway**: Entity co-occurrence reveals hidden connections

---

## Recommended Implementation Strategy

### Option 1: Time-Window + Entity Trending (SIMPLE, START HERE) ⭐

**Concept**: Find entities mentioned frequently in recent high-quality docs

**Algorithm**:
```sql
-- Find trending entities (last 30 days)
SELECT
    entity_id,
    e.name,
    e.type,
    COUNT(DISTINCT em.document_id) as mention_count,
    AVG(m.alignment_score) as avg_score,
    GROUP_CONCAT(DISTINCT m.id) as document_ids
FROM entity_mentions em
JOIN tracked_entities e ON em.entity_id = e.id
JOIN memories m ON em.document_id = m.id
WHERE m.createdAt >= date('now', '-30 days')
  AND m.alignment_score >= 0.20
  AND m.type = 'documents'
GROUP BY entity_id
HAVING mention_count >= 3
ORDER BY mention_count DESC, avg_score DESC
LIMIT 10
```

**Synthesis Prompt**:
```
You are analyzing a trend for AI10BRO Analysis.

ENTITY: {entity_name} ({entity_type})
MENTIONS: {mention_count} documents in last 30 days

RELATED DOCUMENTS:
{doc1_summary}
{doc2_summary}
{doc3_summary}
...

TASK: Identify the emerging trend connecting these developments.
- What pattern do you see across these documents?
- Why is this entity appearing more frequently?
- What signals indicate this is significant?
- What's the "why now" moment?

Generate a 2000-4000 word Analysis piece synthesizing this trend.
```

**Pros**:
- Simple to implement (queries existing database)
- Leverages entity tracking already built
- Clear signal (frequency = importance)
- Easy to explain/debug

**Cons**:
- Requires entities to be mentioned explicitly
- Misses thematic trends without named entities
- Limited to entities already tracked

**Implementation Time**: 2-3 hours

---

### Option 2: Bio Theme + Recency Clustering (MEDIUM)

**Concept**: Find clusters of recent high-scoring docs within same bio theme

**Algorithm**:
```sql
-- For each bio theme, find recent high-scoring docs
SELECT
    json_extract(content, '$.category') as bio_theme,
    COUNT(*) as doc_count,
    AVG(alignment_score) as avg_score,
    GROUP_CONCAT(id) as document_ids
FROM memories
WHERE type = 'documents'
  AND createdAt >= date('now', '-30 days')
  AND alignment_score >= 0.25
GROUP BY bio_theme
HAVING doc_count >= 3
ORDER BY doc_count DESC, avg_score DESC
```

**Synthesis Approach**:
1. Extract top keywords from each document in cluster
2. Find common keywords across cluster (TF-IDF)
3. Present cluster to LLM with keyword context
4. LLM identifies trend

**Pros**:
- Works without entity mentions
- Naturally groups by domain
- Finds thematic trends

**Cons**:
- Themes are broad (may group unrelated topics)
- Requires keyword extraction step
- Less precise than entity-based

**Implementation Time**: 1 day

---

### Option 3: Keyword Co-occurrence Network (ADVANCED)

**Concept**: Build graph of which keywords appear together, find dense communities

**Algorithm**:
1. Extract top 20 keywords per high-scoring document (last 30 days)
2. Build co-occurrence matrix: keywords × keywords
3. Create weighted graph: edge weight = co-occurrence count
4. Run community detection (Louvain or Leiden algorithm)
5. Each community = a trend cluster
6. Retrieve documents containing community keywords
7. LLM synthesizes trend

**Pros**:
- Discovers hidden patterns
- More sophisticated than simple clustering
- Finds non-obvious connections

**Cons**:
- Requires graph analysis library (NetworkX)
- More complex to implement
- Keyword extraction quality critical

**Implementation Time**: 2-3 days

---

### Option 4: LLM-Powered Weekly Trend Detection (HYBRID) ⭐

**Concept**: Use LLM to identify trends from sample of recent docs

**Algorithm**:
```javascript
// Every Sunday at midnight
async function detectWeeklyTrends() {
    // 1. Sample recent high-quality documents
    const recentDocs = db.prepare(`
        SELECT id, content, alignment_score
        FROM memories
        WHERE type = 'documents'
          AND createdAt >= date('now', '-7 days')
          AND alignment_score >= 0.25
        ORDER BY alignment_score DESC
        LIMIT 100
    `).all();

    // 2. Create document summaries
    const summaries = recentDocs.map(doc => ({
        id: doc.id,
        title: extractTitle(doc.content),
        summary: extractFirstParagraph(doc.content)
    }));

    // 3. Ask LLM to identify trends
    const trendPrompt = `
    You are analyzing 100 recent biotech/synbio research documents.
    Identify 5-10 emerging TRENDS (not individual discoveries).

    A trend is a PATTERN across multiple documents, such as:
    - Multiple companies solving the same problem
    - Convergence of different technologies
    - Market shift (e.g., precision fermentation cost parity)
    - Research breakthroughs in related areas

    For each trend:
    - Name (5-10 words)
    - Pattern description (what's connecting these?)
    - Supporting document IDs
    - Significance (why does this matter?)

    DOCUMENTS:
    ${summaries.map(s => `ID: ${s.id}\nTitle: ${s.title}\nSummary: ${s.summary}`).join('\n\n')}
    `;

    const trends = await callLLM(trendPrompt);

    // 4. For each trend, retrieve full documents
    for (const trend of trends) {
        const docs = db.prepare(`
            SELECT * FROM memories WHERE id IN (${trend.document_ids.join(',')})
        `).all();

        // 5. Generate Analysis piece
        await generateAnalysis(trend, docs);
    }
}
```

**Pros**:
- Leverage LLM's pattern recognition
- Discovers nuanced connections humans might miss
- Flexible (no fixed algorithm)
- Can handle diverse trend types

**Cons**:
- LLM token cost (100 docs × summaries = ~50K tokens)
- Quality depends on LLM capability
- Less deterministic than algorithmic approaches

**Implementation Time**: 1 day

**Cost**: ~$0.50-$1.00 per weekly run (with Sonnet)

---

### Option 5: Embedding-Based Semantic Clustering (IF EMBEDDINGS EXIST)

**Concept**: Use document embeddings to find semantically similar docs

**Algorithm**:
```python
from sklearn.cluster import DBSCAN
import numpy as np

# 1. Get recent high-scoring documents with embeddings
docs_with_embeddings = db.query("""
    SELECT id, embedding, alignment_score
    FROM memories
    WHERE type = 'documents'
      AND createdAt >= date('now', '-30 days')
      AND alignment_score >= 0.25
      AND embedding IS NOT NULL
""")

# 2. Extract embedding vectors
embeddings = np.array([doc.embedding for doc in docs_with_embeddings])

# 3. Cluster using DBSCAN (density-based)
clustering = DBSCAN(eps=0.3, min_samples=3, metric='cosine')
labels = clustering.fit_predict(embeddings)

# 4. For each cluster, get documents
for cluster_id in set(labels):
    if cluster_id == -1:  # Skip noise
        continue

    cluster_docs = [doc for i, doc in enumerate(docs_with_embeddings)
                    if labels[i] == cluster_id]

    if len(cluster_docs) >= 3:
        # Generate Analysis piece synthesizing cluster
        synthesize_cluster(cluster_docs)
```

**Pros**:
- Most semantically accurate clustering
- Finds truly related content regardless of keywords
- State-of-the-art approach (used by BERTopic)

**Cons**:
- Requires embeddings to exist in database
- Need to generate embeddings if missing
- Computationally intensive

**Prerequisites**:
- Check if embeddings exist: `SELECT COUNT(*) FROM memories WHERE embedding IS NOT NULL`
- If not, generate using OpenAI/Voyage/Ollama embeddings API

**Implementation Time**: 2 days (if embeddings exist), 1 week (if need to generate)

---

## Recommended Phased Rollout

### Phase 1: MVP (Week 1) - Entity Trending

**Implementation**:
1. ✅ Use Option 1 (Time-Window + Entity Trending)
2. Create `detect-entity-trends.js` script
3. Run weekly (Sunday nights)
4. Generate 2-3 Analysis pieces per week

**Success Criteria**:
- Identify 5+ trending entities per week
- Generate at least 2 synthetic Analysis pieces
- Articles successfully connect 3+ documents

**Effort**: 4-6 hours

### Phase 2: Enhancement (Week 2) - Add Theme Clustering

**Implementation**:
1. Add Option 2 (Bio Theme + Recency)
2. Run alongside entity trending
3. Combine signals: entity trends + theme trends
4. Increase to 3-5 Analysis pieces per week

**Success Criteria**:
- Discover trends not captured by entities alone
- Analysis pieces feel more comprehensive
- User feedback indicates "this connects dots I hadn't seen"

**Effort**: 1-2 days

### Phase 3: Advanced (Week 3-4) - LLM-Powered Detection

**Implementation**:
1. Add Option 4 (LLM Weekly Trend Detection)
2. Use as "editorial oversight" layer
3. LLM validates/expands trends found by algorithms
4. Queue best 5-7 trends for Analysis generation

**Success Criteria**:
- LLM discovers non-obvious patterns
- Trend quality improves (less noise)
- Can produce 5+ Analysis pieces per week

**Effort**: 2-3 days

### Phase 4: Sophistication (Month 2) - Embeddings + Keywords

**Implementation**:
1. Generate embeddings for all high-scoring docs
2. Implement Option 5 (Semantic Clustering)
3. Implement Option 3 (Keyword Co-occurrence)
4. Combine all signals for robust trend detection

**Success Criteria**:
- Multiple trend detection methods agree
- Can produce 7-10 Analysis pieces per week
- Trends are discovered 1-2 weeks before mainstream coverage

**Effort**: 1 week

---

## Synthesis Prompt Template (Multi-Document Analysis)

```markdown
You are writing a comprehensive Analysis piece for AI10BRO that synthesizes multiple related developments into a cohesive trend analysis.

ANALYSIS TYPE: Multi-Source Trend Synthesis
TARGET LENGTH: 2000-4000 words
PUBLISH STATUS: Auto-publish (carefully written)

TREND IDENTIFIED:
{trend_name}

PATTERN DESCRIPTION:
{pattern_description}

SUPPORTING DOCUMENTS ({doc_count} sources):

DOCUMENT 1:
Title: {doc1_title}
Source: {doc1_source}
Published: {doc1_date}
Key Points:
- {doc1_point1}
- {doc1_point2}
- {doc1_point3}

DOCUMENT 2:
Title: {doc2_title}
Source: {doc2_source}
Published: {doc2_date}
Key Points:
- {doc2_point1}
- {doc2_point2}
- {doc2_point3}

[... additional documents ...]

SYNTHESIS TASK:

Your goal is to identify and explain the PATTERN connecting these developments. This is NOT a summary of individual documents—it's an analysis of what they reveal TOGETHER.

STRUCTURE:

1. EXECUTIVE SUMMARY (200-300 words)
   - State the trend/pattern clearly upfront
   - Why this matters (market impact, scientific significance)
   - Key supporting evidence from the documents
   - What this signals for the future

2. THE PATTERN ANALYSIS (400-600 words)
   - What connects these developments?
   - Is this convergence, acceleration, market shift, or paradigm change?
   - Timeline: When did this pattern emerge? (reference document dates)
   - Who are the key players? (companies/labs mentioned)
   - Quantify the trend: funding amounts, technical metrics, adoption rates

3. DEEP DIVE: SUPPORTING EVIDENCE (600-800 words)
   - Walk through each document's contribution to the pattern
   - Highlight specific data points that support the trend
   - Show how developments build on or relate to each other
   - Technical details that explain WHY this is happening now
   - Compare/contrast different approaches if relevant

4. MARKET & INDUSTRY IMPLICATIONS (400-600 words)
   - Industries affected by this trend
   - Economic sizing and opportunity
   - Winners and losers (companies positioned to benefit/lose)
   - Investment implications (which VCs are active, funding data)
   - Competitive dynamics shifts
   - Regulatory considerations if relevant

5. FUTURE TRAJECTORY (300-400 words)
   - Near-term (6-12 months): What to watch
   - Medium-term (1-3 years): Expected milestones
   - Long-term (3-5 years): Where this leads
   - Catalysts that could accelerate/decelerate
   - Adjacent trends that could amplify impact

6. CONCLUSION: THE BIG PICTURE (150-200 words)
   - Synthesize into a single narrative: what does this trend mean?
   - Connect to broader movements (decarbonization, bio-manufacturing revolution, etc.)
   - Signal vs. noise: how confident are we this is real?
   - Actionable insight: what should readers track/do?

CRITICAL SYNTHESIS REQUIREMENTS:

✅ DO:
- Explicitly state the pattern/connection upfront
- Use specific data from multiple documents to support claims
- Show how developments relate to each other (build on, compete with, validate, etc.)
- Identify the "why now" moment (what changed to enable this trend?)
- Quote specific researchers, companies, and numbers
- Acknowledge when documents present conflicting approaches or data

❌ DON'T:
- Simply summarize each document sequentially
- Ignore contradictions or competing approaches
- Make claims without citing which document(s) support them
- Use generic trend language without specific evidence
- Speculate beyond what the documents support

WRITING STYLE:
- Analytical and evidence-based
- Clear statements of causation and connection
- Specific names, numbers, dates throughout
- Academic but accessible tone
- No hype or breathless enthusiasm
- Honest about uncertainties and limitations

OUTPUT FORMAT:
{
  "title": "Descriptive title that names the trend (80-120 chars)",
  "excerpt": "200 char summary highlighting the pattern and its significance",
  "content": "<p>Full article in HTML with <h2> section headers</p>"
}

TITLE EXAMPLES:
- "Three Converging Technologies Make Carbon-Negative Concrete Commercially Viable"
- "Precision Fermentation Reaches Cost Parity Across Five Major Protein Types"
- "AI-Designed Enzymes: How Machine Learning Is Accelerating Bio-Manufacturing"
- "The Bio-Materials Tipping Point: From Lab Curiosity to $50B Market in 36 Months"
```

---

## Technical Implementation Files

### 1. `detect-entity-trends.js` (Phase 1)

```javascript
#!/usr/bin/env node

const sqlite3 = require('better-sqlite3');
const path = require('path');

const db = sqlite3(path.join(__dirname, 'agent/data/db.sqlite'));

function detectEntityTrends(daysBack = 30, minMentions = 3) {
    console.log(`🔍 Detecting entity trends (last ${daysBack} days)\n`);

    const trends = db.prepare(`
        SELECT
            e.id as entity_id,
            e.name as entity_name,
            e.type as entity_type,
            e.focus_area,
            COUNT(DISTINCT em.document_id) as mention_count,
            AVG(m.alignment_score) as avg_score,
            GROUP_CONCAT(DISTINCT m.id) as document_ids,
            GROUP_CONCAT(DISTINCT json_extract(m.content, '$.title'), ' | ') as titles
        FROM entity_mentions em
        JOIN tracked_entities e ON em.entity_id = e.id
        JOIN memories m ON em.document_id = m.id
        WHERE m.createdAt >= datetime('now', '-' || ? || ' days')
          AND m.alignment_score >= 0.20
          AND m.type = 'documents'
        GROUP BY e.id
        HAVING mention_count >= ?
        ORDER BY mention_count DESC, avg_score DESC
        LIMIT 10
    `).all(daysBack, minMentions);

    console.log(`Found ${trends.length} trending entities:\n`);

    trends.forEach((trend, i) => {
        console.log(`${i + 1}. ${trend.entity_name} (${trend.entity_type})`);
        console.log(`   Mentions: ${trend.mention_count} docs`);
        console.log(`   Avg Score: ${(trend.avg_score * 100).toFixed(1)}%`);
        console.log(`   Focus: ${trend.focus_area || 'General'}`);
        console.log(`   Docs: ${trend.document_ids}`);
        console.log();
    });

    return trends;
}

function getTrendDocuments(documentIds) {
    const ids = documentIds.split(',');
    return db.prepare(`
        SELECT id, content, alignment_score, createdAt
        FROM memories
        WHERE id IN (${ids.map(() => '?').join(',')})
        ORDER BY alignment_score DESC
    `).all(...ids);
}

// Run detection
const trends = detectEntityTrends();

// For each trend, get full documents
trends.forEach(trend => {
    console.log(`\n📄 Documents for ${trend.entity_name}:`);
    const docs = getTrendDocuments(trend.document_ids);
    docs.forEach(doc => {
        const content = JSON.parse(doc.content);
        console.log(`  - ${content.title || 'Untitled'}`);
        console.log(`    Score: ${(doc.alignment_score * 100).toFixed(1)}%`);
    });
});

db.close();
```

### 2. `generate-trend-analysis.js` (Synthesis Script)

```javascript
#!/usr/bin/env node

const sqlite3 = require('better-sqlite3');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');

const execPromise = promisify(exec);
const db = sqlite3(path.join(__dirname, 'agent/data/db.sqlite'));

async function generateTrendAnalysis(trendData, documents) {
    // Load synthesis prompt template
    const promptTemplate = fs.readFileSync(
        path.join(__dirname, 'trend-synthesis-prompt.txt'),
        'utf8'
    );

    // Prepare document summaries
    const docSummaries = documents.map((doc, i) => {
        const content = JSON.parse(doc.content);
        return `
DOCUMENT ${i + 1}:
Title: ${content.title || 'Untitled'}
Source: ${content.source || content.url || 'Unknown'}
Published: ${doc.createdAt}
Alignment Score: ${(doc.alignment_score * 100).toFixed(1)}%
Content Summary: ${content.text?.substring(0, 500)}...
`;
    }).join('\n\n');

    // Fill prompt template
    const prompt = promptTemplate
        .replace('{trend_name}', trendData.trend_name)
        .replace('{pattern_description}', trendData.pattern_description)
        .replace('{doc_count}', documents.length)
        .replace('{document_summaries}', docSummaries);

    // Call ollama for synthesis
    console.log('🤖 Generating trend analysis with Ollama...');
    const response = await execPromise(
        `ollama run qwen2.5:32b "${prompt.replace(/"/g, '\\"')}"`
    );

    const analysis = JSON.parse(response.stdout);

    // Save to broadcasts table
    const broadcastId = crypto.randomUUID();
    db.prepare(`
        INSERT INTO broadcasts (id, documentId, client, content, status, alignment_score, createdAt)
        VALUES (?, ?, 'wordpress_deepdive', ?, 'pending', ?, datetime('now'))
    `).run(
        broadcastId,
        documents[0].id, // Primary document
        JSON.stringify(analysis),
        trendData.avg_score
    );

    console.log(`✅ Analysis created: ${analysis.title}`);
    console.log(`   Broadcast ID: ${broadcastId}`);

    return analysis;
}

module.exports = { generateTrendAnalysis };
```

---

## Success Metrics

### Quantitative
- **Trend Detection**: Identify 5-10 trends per week
- **Coverage**: Generate 2-5 Analysis pieces per week
- **Multi-source**: Each Analysis cites 3-7 supporting documents
- **Quality**: Analysis pieces score ≥30% alignment

### Qualitative
- **Synthesis Quality**: Articles reveal non-obvious patterns (not just summaries)
- **Insight Depth**: Readers learn something they couldn't from individual sources
- **Actionability**: Clear implications and next steps provided
- **Timeliness**: Trends identified 1-2 weeks before mainstream coverage

---

## Next Steps

1. **Review this plan** - Confirm approach aligns with vision
2. **Choose starting point** - Phase 1 (Entity Trending) recommended
3. **Implement MVP** - `detect-entity-trends.js` + synthesis prompt
4. **Test with sample** - Generate 2-3 Analysis pieces manually
5. **Evaluate quality** - Does synthesis feel "insightful"?
6. **Iterate** - Refine prompts and detection algorithms
7. **Automate** - Schedule weekly trend detection

**Estimated Timeline**: 2 weeks to production-ready trend analysis system

---

## Sources

1. [CB Insights Research Methodology](https://www.cbinsights.com/research/)
2. [BERTrend: Neural Topic Modeling for Emerging Trends Detection](https://arxiv.org/html/2411.05930v1)
3. [LLM-Guided Semantic-Aware Clustering for Topic Modeling](https://aclanthology.org/2025.acl-long.902.pdf)
4. [QualIT: LLM Enhanced Topic Modeling](https://arxiv.org/html/2409.15626)
5. [BERTopic Documentation](https://maartengr.github.io/BERTopic/api/bertopic.html)
6. [Semantic Knowledge Graphs for News](https://dl.acm.org/doi/10.1145/3543508)
7. [Event-Centric Knowledge Graphs](https://www.researchgate.net/publication/390611069_ECS-KG_An_Event-Centric_Semantic_Knowledge_Graph_for_Event-Related_News_Articles)
8. [Text Clustering and Topic Modeling with LLMs](https://medium.com/@piyushkashyap045/text-clustering-and-topic-modeling-with-llms-446dd7657366)
