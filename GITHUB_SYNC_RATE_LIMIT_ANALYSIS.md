# GitHub Sync Rate Limit Analysis
**Date**: 2026-01-02
**Issue**: Hit GitHub API rate limit + Missing ~9,000 files

## Current Situation

### Rate Limit Status
```json
{
  "core": {
    "limit": 5000,
    "used": 5000,
    "remaining": 0,
    "reset": 1767373809  // Thu Jan 02 2026 17:10:09 WET (38 minutes from now)
  }
}
```

**What Happened**:
- Made exactly 5,000 GitHub API calls in one session
- Hit the hourly rate limit at file #4,106
- 999 files failed with rate limit errors
- All Reddit/ subreddit files were rate-limited at the end

### File Count Discrepancy - CRITICAL ⚠️

| Source | Count | Notes |
|--------|-------|-------|
| **Local Repo (on disk)** | 14,106 files | Actual files in gdelt-obsidian/Notes, Papers, Reddit |
| **GitHub API Returned** | 5,105 files | What API found via recursive scan |
| **MISSING FROM API** | **8,901 files** | 63% of files NOT returned by API! |

**Files Successfully Imported**:
- Processed: 2,098 new/changed files
- Skipped: 2,008 unchanged files
- Failed: 999 rate limit errors
- **Total attempted**: 5,105 (matches API count)

**Database Status**:
- Total documents: 26,040
- Active documents: 4,747
- GitHub documents: 4,196
- Tombstones: 21,293

## Root Causes

### 1. GitHub API Rate Limit
- **Limit**: 5,000 requests per hour (authenticated)
- **Our Usage**: 1 API call per file to fetch content
- **5,105 files** = 5,105 API calls = exceeded limit

### 2. GitHub API Not Returning All Files
**Possible Reasons**:

1. **API Pagination Limits**
   - GitHub API may have max items per directory response
   - Recursive scan might be hitting pagination limits
   - Not following pagination links correctly

2. **Repository Size/Structure**
   - Very large directories might be truncated
   - Deep nesting might cause issues
   - API might timeout on large directories

3. **File Type/Size Filtering**
   - API might filter certain file types
   - Large files might be excluded
   - Binary files vs text files

4. **Branch/Ref Issues**
   - Scanning `master` branch only
   - Some files might be in different branches
   - Need to verify branch contains all files

## Solutions

### Immediate: Finish Current Sync
**Timeline**: Rate limit resets at **17:10 WET** (38 minutes)

**Option A: Wait for Rate Limit Reset**
```bash
# Run at 17:10 WET to get remaining 999 Reddit files
node sync-github-now.js
```
- Will pick up the 999 failed files
- Another 5,000 requests available
- Should complete remaining files

**Option B: Run at 2am Cron** (Scheduled)
- Tomorrow's 2am cron will automatically sync
- Rate limit fully reset
- Will import remaining files

### Long-term: Avoid Rate Limits

#### Solution 1: Add Rate Limit Detection + Automatic Pause ⭐ RECOMMENDED
```javascript
// In sync-github-now.js
async function fetchWithRetry(path) {
    try {
        const response = await octokit.repos.getContent({...});

        // Check rate limit after each request
        const rateLimit = response.headers['x-ratelimit-remaining'];
        if (rateLimit < 100) {
            console.log(`⚠️  Rate limit low (${rateLimit} remaining). Pausing sync...`);
            console.log(`Will resume automatically at next scheduled run (2am)`);
            return null; // Exit gracefully
        }

        return response;
    } catch (error) {
        if (error.status === 403 && error.message.includes('rate limit')) {
            // Rate limit hit - log and exit gracefully
            console.log('⚠️  Rate limit exceeded. Sync will resume at next run.');
            process.exit(0);
        }
        throw error;
    }
}
```

**Benefits**:
- Stops sync before hitting hard limit
- Logs checkpoint for resume
- Prevents error spam
- Graceful degradation

#### Solution 2: Add Throttling/Delay Between Requests
```javascript
// Add delay between API calls
async function processFiles(files) {
    for (const file of files) {
        await processFile(file);
        await sleep(200); // 200ms delay = max 300 files/minute = 18,000/hour (safe)
    }
}
```

**Trade-offs**:
- Safer (won't hit rate limit)
- Slower (5,105 files × 200ms = 17 minutes vs 5-10 minutes)
- More predictable

#### Solution 3: Use Git Clone Instead of API ⭐⭐ BEST LONG-TERM
```javascript
// Clone repo locally, read files directly (NO API CALLS!)
import simpleGit from 'simple-git';

async function syncViaGitClone() {
    const git = simpleGit();
    const repoPath = '/tmp/ai10bro-gdelt-clone';

    // Clone or pull
    if (!fs.existsSync(repoPath)) {
        await git.clone('https://github.com/divydovy/ai10bro-gdelt.git', repoPath);
    } else {
        await git.cwd(repoPath).pull();
    }

    // Read files directly from disk (NO API CALLS!)
    const files = glob.sync(`${repoPath}/**/*.md`);

    for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const hash = createHash('sha256').update(content).digest('hex');
        // ... import to database
    }
}
```

**Benefits**:
- **Zero API calls** (no rate limit!)
- Guaranteed to find ALL files (14,106 files)
- Faster (disk read vs HTTP)
- More reliable

**Trade-offs**:
- Requires disk space (~50-100MB for repo)
- Needs git credentials
- Slightly more complex setup

#### Solution 4: GitHub GraphQL API (Advanced)
```graphql
query {
  repository(owner: "divydovy", name: "ai10bro-gdelt") {
    object(expression: "master:") {
      ... on Tree {
        entries {
          name
          type
          object {
            ... on Blob {
              text
            }
          }
        }
      }
    }
  }
}
```

**Benefits**:
- Single query for multiple files
- More efficient than REST API
- Same rate limit pool (5,000/hour)

**Trade-offs**:
- More complex queries
- Still limited by rate limits
- Needs GraphQL client

### Immediate Action Plan

**Step 1: Fix Missing Files Issue** (Priority 1)
- Option A: Use git clone approach (gets all 14,106 files)
- Option B: Debug API pagination (why only 5,105 of 14,106 files?)

**Step 2: Add Rate Limit Handling** (Priority 2)
- Add rate limit detection and graceful pause
- Log checkpoint for resume
- Exit cleanly instead of error spam

**Step 3: Choose Long-Term Strategy** (Priority 3)
- Recommended: Git clone approach (no API limits, finds all files)
- Alternative: Throttled API approach (safer but slower)

## Recommendations

### Immediate (Today)
1. ✅ Document the issue (this file)
2. ⏭️ Wait for rate limit reset (17:10 WET)
3. ⏭️ Run sync again to get 999 failed files
4. ⏭️ Investigate why API only found 5,105 of 14,106 files

### Short-Term (This Week)
1. Implement git clone approach to get ALL 14,106 files
2. Add rate limit detection + graceful pause
3. Update sync-github-now.js with new approach
4. Test with full import

### Long-Term (Next Month)
1. Monitor daily sync performance
2. Consider scheduled chunked syncs (e.g., 1,000 files per hour)
3. Add sync status dashboard
4. Implement incremental sync (only changed files)

## Questions for User

1. **Missing 9,000 files**: Should we switch to git clone approach to get ALL files?
2. **Rate limit strategy**: Add throttling OR wait for rate limit reset?
3. **Scheduling**: Keep daily 2am sync OR spread across multiple hours?
4. **Priority**: Import all 14,106 files OR focus on most recent/important ones?
