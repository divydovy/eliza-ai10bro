#!/bin/bash

# Automated RSS Discovery & Deployment
# Runs discovery on all tracked entities, syncs to config, and deploys

set -e  # Exit on error

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOG_DIR="$SCRIPT_DIR/logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/rss-discovery-$TIMESTAMP.log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

echo "🤖 Automated RSS Discovery - $(date)" | tee -a "$LOG_FILE"
echo "=======================================" | tee -a "$LOG_FILE"

# Function to log with timestamp
log() {
    echo "[$(date +%H:%M:%S)] $1" | tee -a "$LOG_FILE"
}

# Check if Node 23 is available
NODE_BIN="$HOME/.nvm/versions/node/v23.3.0/bin/node"
if [ ! -f "$NODE_BIN" ]; then
    log "❌ Error: Node 23.3.0 not found at $NODE_BIN"
    exit 1
fi

cd "$SCRIPT_DIR"

# Step 1: Run discovery on all entity types
log "📡 Step 1/4: Running RSS discovery on all entities..."

log "  🏢 Discovering company feeds..."
$NODE_BIN discover-entity-rss-feeds.js --entity-type=company >> "$LOG_FILE" 2>&1
COMPANY_COUNT=$(sqlite3 agent/data/db.sqlite "SELECT COUNT(*) FROM tracked_entities WHERE type='company' AND rss_feed IS NOT NULL AND rss_feed != ''")
log "  ✅ Companies: $COMPANY_COUNT feeds"

log "  🔬 Discovering lab feeds..."
$NODE_BIN discover-entity-rss-feeds.js --entity-type=lab >> "$LOG_FILE" 2>&1
LAB_COUNT=$(sqlite3 agent/data/db.sqlite "SELECT COUNT(*) FROM tracked_entities WHERE type='lab' AND rss_feed IS NOT NULL AND rss_feed != ''")
log "  ✅ Labs: $LAB_COUNT feeds"

log "  💰 Discovering VC feeds..."
$NODE_BIN discover-entity-rss-feeds.js --entity-type=vc >> "$LOG_FILE" 2>&1
VC_COUNT=$(sqlite3 agent/data/db.sqlite "SELECT COUNT(*) FROM tracked_entities WHERE type='vc' AND rss_feed IS NOT NULL AND rss_feed != ''")
log "  ✅ VCs: $VC_COUNT feeds"

TOTAL_FEEDS=$((COMPANY_COUNT + LAB_COUNT + VC_COUNT))
log "  📊 Total: $TOTAL_FEEDS entity feeds in database"

# Step 2: Sync to search_config.yml
log "📝 Step 2/4: Syncing feeds to search_config.yml..."
$NODE_BIN sync-entity-feeds-to-config.js >> "$LOG_FILE" 2>&1
log "  ✅ Config updated"

# Step 3: Commit changes (if any)
log "📤 Step 3/4: Committing changes to Git..."
cd /Users/davidlockie/Documents/Projects/gdelt-obsidian

if git diff --quiet search_config.yml; then
    log "  ℹ️  No changes to commit"
else
    # Get counts of new feeds
    DIFF_LINES=$(git diff search_config.yml | grep "^+.*Auto-discovered from tracked entity" | wc -l | xargs)

    git add search_config.yml
    git commit -m "Update entity RSS feeds (automated discovery)

Discovered $DIFF_LINES new feeds:
- Companies: $COMPANY_COUNT total
- Labs: $LAB_COUNT total
- VCs: $VC_COUNT total

Total entity feeds: $TOTAL_FEEDS
Automation run: $TIMESTAMP" >> "$LOG_FILE" 2>&1

    log "  ✅ Changes committed"

    # Step 4: Push to GitHub
    log "📡 Step 4/4: Pushing to GitHub..."
    GIT_SSH_COMMAND="ssh -o IdentityAgent=~/.1password-agent.sock" git push origin master >> "$LOG_FILE" 2>&1
    log "  ✅ Pushed to GitHub"
fi

cd "$SCRIPT_DIR"

log ""
log "✅ Automated RSS discovery complete!"
log "📊 Final stats:"
log "   Companies: $COMPANY_COUNT feeds"
log "   Labs: $LAB_COUNT feeds"
log "   VCs: $VC_COUNT feeds"
log "   Total: $TOTAL_FEEDS feeds"
log ""
log "📄 Full log: $LOG_FILE"

# Clean up old logs (keep last 30 days)
find "$LOG_DIR" -name "rss-discovery-*.log" -mtime +30 -delete 2>/dev/null || true
