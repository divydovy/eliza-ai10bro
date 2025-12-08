# PubMed Integration Setup

This guide walks through adding daily PubMed biology paper fetching to the existing `ai10bro-gdelt` repository.

## What This Does

- Fetches 10-20 new biology papers daily from PubMed (free API, no key needed)
- Searches for: biomimicry, synthetic biology, bioengineering
- Saves as markdown files in `Papers/` folder
- Eliza auto-syncs and creates broadcasts
- Papers get 1.15x "trusted" source quality multiplier

## Setup Steps

### 1. Clone the ai10bro-gdelt Repository

```bash
cd ~/Projects
git clone git@github.com:divydovy/ai10bro-gdelt.git
cd ai10bro-gdelt
```

### 2. Add PubMed Files

```bash
# Create Papers directory
mkdir -p Papers

# Copy the workflow file
mkdir -p .github/workflows
cp /Users/davidlockie/Documents/Projects/Eliza/pubmed-workflow-template.yml \
   .github/workflows/fetch-pubmed.yml

# Copy the fetch script
cp /Users/davidlockie/Documents/Projects/Eliza/fetch-pubmed-template.js \
   fetch-pubmed.js

# Make script executable
chmod +x fetch-pubmed.js
```

### 3. Install Dependencies

```bash
# Create package.json if it doesn't exist
cat > package.json <<EOF
{
  "name": "ai10bro-content",
  "version": "1.0.0",
  "dependencies": {
    "axios": "^1.6.0"
  }
}
EOF

npm install
```

### 4. Test Locally (Optional)

```bash
# Test fetching papers
node fetch-pubmed.js biomimicry

# Check that Papers/ has new markdown files
ls Papers/
```

### 5. Commit and Push

```bash
git add .
git commit -m "Add PubMed daily fetch workflow"
git push origin main
```

### 6. Enable GitHub Actions

If not already enabled:
1. Go to https://github.com/divydovy/ai10bro-gdelt/settings/actions
2. Under "Actions permissions", select "Allow all actions and reusable workflows"
3. Click "Save"

### 7. Test the Workflow

1. Go to https://github.com/divydovy/ai10bro-gdelt/actions
2. Click "Fetch PubMed Biology Papers"
3. Click "Run workflow" → "Run workflow"
4. Watch it run (should take ~30 seconds)
5. Check the Papers/ folder for new files

## Schedule

The workflow runs daily at **6:00 AM UTC** (1:00 AM EST / 10:00 PM PST).

You can also trigger it manually anytime from the Actions tab.

## What Eliza Will Do

1. **Every hour**, Eliza runs `sync-github-multi-repo.js`
2. Detects new files in `Papers/` folder
3. Imports them as documents with `source: 'pubmed'`
4. Calculates alignment scores (with 1.15x multiplier for PubMed)
5. Creates broadcasts for papers scoring >= 0.12
6. Sends broadcasts via Telegram/Bluesky

## Monitoring

Check if it's working:

```bash
# In Eliza project
sqlite3 agent/data/db.sqlite "
SELECT
  COUNT(*) as count,
  MAX(createdAt) as latest
FROM memories
WHERE type = 'documents'
  AND json_extract(content, '$.source') = 'pubmed';
"
```

Should show new PubMed documents after the workflow runs.

## Customization

Edit `fetch-pubmed.js` to change:
- Search terms (line 36-38)
- Number of papers per search (`retmax: 10` in line 19)
- Date range (`reldate: 1` = last day, change to 7 for last week, etc.)

Edit `.github/workflows/fetch-pubmed.yml` to change:
- Schedule (line 3: `cron: '0 6 * * *'`)
- Which search terms to use (lines 20-28)

## Troubleshooting

**Papers not showing up in Eliza?**
- Check GitHub Actions tab for errors
- Verify Papers/ folder has new files
- Run `node sync-github-multi-repo.js` manually in Eliza project

**Workflow failing?**
- Check if axios is in package.json
- Verify PubMed API is accessible (sometimes rate-limited if too many requests)

**Too many/too few papers?**
- Adjust `retmax` parameter in fetch-pubmed.js
- Adjust `reldate` (1 = last day, 7 = last week)

## Expected Results

**First Day**: 10-30 new papers (depending on search terms)
**Daily**: 10-20 new papers
**Monthly**: ~300-600 new high-quality biology documents
**Cost**: $0 (PubMed API is free, GitHub Actions free tier)
