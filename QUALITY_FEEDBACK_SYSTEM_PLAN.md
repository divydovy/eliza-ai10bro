# Quality Feedback System Plan

## Goal
Automated quality assurance that runs hourly/daily and generates actionable issues when problems are detected.

---

## 1. Alignment Scoring Verification

### What to Check
- **Score Distribution**: Verify scores follow expected pattern
  - 70-80% should score 0-20% (off-topic filtered)
  - 15-20% should score 20-50% (on-topic research)
  - 5-10% should score 50-100% (commercial biotech)

- **High Score Validation**: Sample 5 highest-scoring documents daily
  - Verify they're actually biotech/synthetic biology
  - Verify they're actually commercial (products, funding, launches)
  - Alert if off-topic content scores >50%

- **Low Score Validation**: Sample 5 lowest-scoring documents daily
  - Verify they're correctly filtered (not biotech or not commercial)
  - Alert if obvious biotech content scores <10%

- **Drift Detection**: Compare today's distribution to 7-day average
  - Alert if average score changes by >15%
  - Alert if high-score percentage drops >30%

### Implementation
**Script**: `quality-checks/verify-alignment-scoring.js`
**Schedule**: Daily at 8am
**Output**: `logs/quality/alignment-scoring-YYYY-MM-DD.json`
**Alerts**: Create GitHub issue if drift detected

---

## 2. Broadcast Quality Checks

### A. Source URL Validation
**Problems to Detect**:
- ❌ Incomplete URLs: `youtube.com/watch` without `?v=VIDEO_ID`
- ❌ Generic URLs: `github.com` without repo path
- ❌ Localhost URLs: `http://localhost:*`
- ❌ Missing URLs: Empty or null source
- ❌ Broken URLs: 404 responses (optional, expensive)

**Implementation**:
```javascript
function validateSourceURL(url) {
  const issues = [];

  // Check for incomplete YouTube URLs
  if (url.includes('youtube.com/watch') && !url.includes('?v=')) {
    issues.push({ type: 'incomplete_youtube', url });
  }

  // Check for generic domains without paths
  if (url.match(/^https?:\/\/(github\.com|youtube\.com|twitter\.com)$/)) {
    issues.push({ type: 'generic_domain', url });
  }

  // Check for localhost
  if (url.includes('localhost')) {
    issues.push({ type: 'localhost_url', url });
  }

  // Check for missing protocol
  if (!url.match(/^https?:\/\//)) {
    issues.push({ type: 'missing_protocol', url });
  }

  return issues;
}
```

### B. Image Presence & Validity
**Problems to Detect**:
- ❌ Broadcasts with no image (when image_url is null)
- ❌ Invalid image paths (file doesn't exist)
- ❌ Broken image URLs (404s)
- ❌ Images not uploaded to platforms (for sent broadcasts)

**Implementation**:
```javascript
function validateImage(broadcast) {
  const issues = [];

  // Check if image is missing
  if (!broadcast.image_url) {
    issues.push({
      type: 'missing_image',
      broadcast_id: broadcast.id,
      recommendation: 'Enable image generation or use default placeholder'
    });
  }

  // Check if file exists (for local paths)
  if (broadcast.image_url?.startsWith('/')) {
    if (!fs.existsSync(broadcast.image_url)) {
      issues.push({
        type: 'image_file_not_found',
        path: broadcast.image_url,
        broadcast_id: broadcast.id
      });
    }
  }

  return issues;
}
```

### C. Content Quality
**Problems to Detect**:
- ❌ Too short: <100 characters (likely truncated)
- ❌ Too long: >500 chars for Twitter/Bluesky (will be cut off)
- ❌ Missing title in WordPress articles
- ❌ Broken markdown formatting (unclosed brackets, etc.)
- ❌ HTML entities not decoded (&amp; instead of &)
- ❌ Duplicate hashtags (#AI #AI #AI)
- ❌ No call-to-action or source link

**Implementation**:
```javascript
function validateContent(broadcast, client) {
  const issues = [];
  const content = JSON.parse(broadcast.content);
  const text = content.text || content.content || '';

  // Length checks per platform
  const limits = {
    telegram: { min: 100, max: 4096 },
    bluesky: { min: 50, max: 300 },
    farcaster: { min: 50, max: 320 },
    wordpress_insight: { min: 500, max: 2000 }
  };

  const limit = limits[client];
  if (limit) {
    if (text.length < limit.min) {
      issues.push({ type: 'too_short', length: text.length, min: limit.min });
    }
    if (text.length > limit.max) {
      issues.push({ type: 'too_long', length: text.length, max: limit.max });
    }
  }

  // Check for source URL
  if (!text.includes('🔗 Source:') && !text.includes('http')) {
    issues.push({ type: 'missing_source_link' });
  }

  // Check for broken markdown
  const openBrackets = (text.match(/\[/g) || []).length;
  const closeBrackets = (text.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    issues.push({ type: 'unbalanced_markdown_brackets' });
  }

  // Check for HTML entities
  if (text.includes('&amp;') || text.includes('&lt;') || text.includes('&gt;')) {
    issues.push({ type: 'unescaped_html_entities' });
  }

  // Check for duplicate hashtags
  const hashtags = text.match(/#\w+/g) || [];
  const uniqueHashtags = new Set(hashtags);
  if (hashtags.length !== uniqueHashtags.size) {
    issues.push({ type: 'duplicate_hashtags' });
  }

  return issues;
}
```

### D. WordPress-Specific Checks
**Problems to Detect**:
- ❌ Missing title
- ❌ Missing excerpt
- ❌ Article not properly JSON formatted
- ❌ Missing bio theme tag
- ❌ Content not valid HTML

---

## 3. System Health Checks

### A. Scoring System Status
**What to Check**:
- Is LLM scoring process still running?
- How many docs scored in last hour?
- Any documents stuck unscored for >24 hours?
- Is ollama service running?

### B. Broadcast Creation Status
**What to Check**:
- Were broadcasts created in last 6 hours? (cron runs 4am, 10am, 4pm, 10pm)
- Are there documents with alignment_score >= 8% but no broadcasts?
- Are broadcast creation logs showing errors?

### C. Broadcast Sending Status
**What to Check**:
- Were broadcasts sent in last 2 hours? (hourly cron)
- Are broadcasts stuck in 'pending' for >24 hours?
- Are send logs showing errors?

### D. Import System Status
**What to Check**:
- Were documents imported in last 24 hours?
- Are GitHub sync logs showing errors?
- Are Obsidian imports working?

---

## 4. Data Quality Checks

### A. Document Metadata Validation
**Problems to Detect**:
- ❌ Missing title
- ❌ Missing source URL
- ❌ Empty content (text field < 100 chars)
- ❌ Malformed JSON in content field
- ❌ Missing importedAt timestamp

### B. Duplicate Detection
**Problems to Detect**:
- Same source URL imported multiple times
- Nearly identical content (>90% similarity)
- Documents with same title and similar dates

---

## 5. Automated Issue Generation

### Issue Format
```json
{
  "type": "broadcast_quality",
  "severity": "medium",
  "category": "incomplete_url",
  "count": 15,
  "sample": [
    {
      "broadcast_id": "abc-123",
      "document_id": "def-456",
      "problem": "YouTube URL missing video ID",
      "url": "https://youtube.com/watch",
      "fix": "Update import script to extract full URL"
    }
  ],
  "detected_at": "2025-12-30T18:00:00Z",
  "recommendation": "Fix URL extraction in import-github-scrapers.js line 78"
}
```

### Issue Aggregation
- Don't create duplicate issues for same problem
- Aggregate similar issues (e.g., "15 broadcasts have incomplete URLs")
- Include samples (up to 5 examples per issue)
- Auto-close issues when problem is resolved

### Issue Destinations
1. **JSON log file**: `logs/quality-issues/YYYY-MM-DD.json`
2. **GitHub Issue** (for high-severity only): Auto-create with label `quality-check`
3. **Daily digest**: Email/notification with summary

---

## 6. Implementation Plan

### Phase 1: Core Quality Checks (Week 1)
**Script**: `quality-checks/run-quality-checks.js`

```javascript
#!/usr/bin/env node
const db = require('better-sqlite3')('./agent/data/db.sqlite');
const fs = require('fs');

async function runQualityChecks() {
  const results = {
    timestamp: new Date().toISOString(),
    checks: []
  };

  // 1. Alignment Scoring Check
  results.checks.push(await checkAlignmentScoring());

  // 2. Broadcast URL Check
  results.checks.push(await checkBroadcastURLs());

  // 3. Image Presence Check
  results.checks.push(await checkBroadcastImages());

  // 4. Content Quality Check
  results.checks.push(await checkContentQuality());

  // 5. System Health Check
  results.checks.push(await checkSystemHealth());

  // Save results
  const date = new Date().toISOString().split('T')[0];
  fs.writeFileSync(
    `logs/quality/quality-report-${date}.json`,
    JSON.stringify(results, null, 2)
  );

  // Generate issues for problems
  await generateIssues(results);

  // Print summary
  printSummary(results);
}

runQualityChecks();
```

**Schedule**:
- Full check: Daily at 8am
- Quick check: Every 4 hours (after broadcast creation)

### Phase 2: Automated Fixes (Week 2)
For common issues, implement auto-fixes:
- Incomplete URLs → Fetch correct URL from document metadata
- Missing images → Generate placeholder image
- HTML entities → Auto-decode
- Duplicate broadcasts → Auto-delete duplicates

### Phase 3: Monitoring Dashboard (Week 3)
Build simple web dashboard:
- Quality score trend over time
- Current issues count by type
- Recent broadcast samples
- System health status

---

## 7. Metrics to Track

### Quality Metrics
- **URL Validity Rate**: % broadcasts with valid source URLs
- **Image Coverage**: % broadcasts with images
- **Content Quality Score**: Avg score based on length, formatting, etc.
- **Alignment Accuracy**: % high-scoring docs that are truly biotech/commercial

### System Health Metrics
- **Scoring Throughput**: Docs scored per hour
- **Broadcast Creation Rate**: Broadcasts created per day
- **Send Success Rate**: % pending broadcasts sent within 24 hours
- **Import Success Rate**: % import runs without errors

### Trend Alerts
- Alert if any metric drops >20% from 7-day average
- Alert if error rate increases >50%
- Alert if no broadcasts sent for >6 hours

---

## 8. Example Cron Schedule

```bash
# Quality checks - daily at 8am
0 8 * * * cd /Users/davidlockie/Documents/Projects/Eliza && node quality-checks/run-quality-checks.js >> logs/quality/daily-check.log 2>&1

# Quick health check - every 4 hours
0 */4 * * * cd /Users/davidlockie/Documents/Projects/Eliza && node quality-checks/quick-health-check.js >> logs/quality/health-check.log 2>&1

# Generate daily digest - at 9am
0 9 * * * cd /Users/davidlockie/Documents/Projects/Eliza && node quality-checks/generate-digest.js >> logs/quality/digest.log 2>&1
```

---

## 9. Priority Issues to Fix First

Based on current problems:

### P0 - Critical (Fix Today)
1. **Incomplete YouTube URLs**: Fix URL extraction in import script
2. **Malformed JSON in broadcasts**: Investigate and fix JSON encoding

### P1 - High (Fix This Week)
3. **Missing images**: Ensure image generation runs for all broadcasts
4. **Alignment scoring validation**: Verify LLM is scoring correctly

### P2 - Medium (Fix Next Week)
5. **Duplicate detection**: Prevent same content from being broadcast multiple times
6. **Content length validation**: Ensure platform-appropriate lengths

---

## 10. Success Criteria

After implementing this system, we should see:
- ✅ **>95% broadcasts have valid source URLs**
- ✅ **>90% broadcasts have images**
- ✅ **Zero broadcasts with malformed content**
- ✅ **Issues detected and fixed within 24 hours**
- ✅ **Clear visibility into system health**
- ✅ **Automated fixes for common problems**

---

**Next Steps**:
1. Review this plan and adjust priorities
2. Implement Phase 1: Core quality checks script
3. Run first quality check and review results
4. Fix top 3 issues identified
5. Add automated fixes for most common issues
