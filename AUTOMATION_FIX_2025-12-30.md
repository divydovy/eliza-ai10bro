# Automation System Fixes - 2025-12-30

## Issues Found and Fixed

### 1. ✅ FIXED: Broadcast Creation Broken Since Dec 10
**Problem**: CREATE_BROADCASTS cron action failing with path error
```
Error: Cannot find module '/Users/create-broadcasts.js'
```

**Root Cause**: API endpoint in cron used incorrect path calculation (going up 5 levels instead of 4)

**Solution**: Replaced broken API call with direct script execution
```bash
# OLD (broken):
0 4,10,16,22 * * * curl -X POST http://localhost:3003/trigger ... CREATE_BROADCASTS

# NEW (working):
0 4,10,16,22 * * * cd /Users/davidlockie/Documents/Projects/Eliza && \
  export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && \
  nvm use 23.3.0 && node process-unprocessed-docs.js 20 >> logs/cron-broadcast-create.log 2>&1
```

**Status**: ✅ Tested and working
**Files Modified**:
- Crontab updated and installed
- `/tmp/fixed_crontab.txt` created with new configuration

**Verification**:
```bash
# Manual test successful - created 5 broadcasts
node process-unprocessed-docs.js 5
```

---

### 2. ⚠️ ONGOING: GitHub Import Authentication Issue

**Problem**: GitHub content sync failing due to 1Password SSH agent requiring user interaction

**Error**:
```
sign_and_send_pubkey: signing failed for ED25519 "GitHub" from agent: agent refused operation
git@github.com: Permission denied (publickey).
```

**Root Cause**:
- 1Password agent requires Touch ID/password for SSH key access
- Cron jobs run without user interaction, so 1Password prompts fail
- No fallback SSH key configured for automation

**Current Status**: GitHub import cron at 3:30am/3:30pm is likely failing

**Attempted Fixes**:
1. ✅ Updated sync script to use `git fetch` + `git reset --hard` (more reliable than pull)
2. ✅ Added local change handling (reset + clean)
3. ⏸️ Authentication still requires resolution

**Options to Fix**:
1. **Option A**: Generate GitHub Personal Access Token and switch to HTTPS
   ```bash
   cd /Users/davidlockie/Documents/Projects/gdelt-obsidian
   git remote set-url origin https://github.com/divydovy/ai10bro-gdelt.git
   # Then configure git credential helper with PAT
   ```

2. **Option B**: Create dedicated SSH deploy key (read-only)
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/github_deploy_key -N ""
   # Add public key to GitHub repo as deploy key
   # Update sync script to use this key
   ```

3. **Option C**: Configure 1Password CLI for automation (if supported)

**Recommendation**: Option A (PAT + HTTPS) is simplest and most reliable for automation

**Files Modified**:
- `/Users/davidlockie/Documents/Projects/Eliza/sync-github-content.sh`
  - Changed from `git pull` to `git fetch` + `git reset --hard origin/master`
  - Removed 1Password agent specification (needs proper auth setup)

---

## System Status Summary

### Working ✅
- **Broadcast Creation**: Now calling script directly every 6 hours (4am, 10am, 4pm, 10pm)
- **Telegram Sends**: Hourly at :00
- **Bluesky Sends**: Hourly at :40
- **WordPress Insights**: Every 4 hours at :20
- **Obsidian Import**: Daily at 2:30am (API call, working)
- **GitHub Sync**: Daily at 2am (API call, working)

### Needs Fix ⚠️
- **GitHub Import**: Twice daily at 3:30am/3:30pm (authentication issue)
  - Script runs but git fetch fails
  - Needs PAT or deploy key setup

### Database Status
- **Total Documents**: 21,084
- **Broadcasts Pending**: ~1,600
- **Last Broadcasts Sent**: Dec 29 at 11pm (before creation was fixed)

---

## Next Steps

1. **IMMEDIATE**: Set up GitHub authentication for automated pulls
   - Recommend: Create PAT and switch gdelt-obsidian to HTTPS

2. **VERIFY**: Monitor next broadcast creation (4pm today)
   - Check logs/cron-broadcast-create.log
   - Confirm new broadcasts appear in database

3. **VERIFY**: Monitor broadcast sends (starting at noon)
   - Check logs/cron-telegram-send.log
   - Check logs/cron-bluesky-send.log
   - Confirm pending broadcasts decrease

4. **DOCUMENT**: Update GITHUB_IMPORT_SETUP.md with authentication solution

---

## Quick Commands

```bash
# Check crontab
crontab -l

# Test broadcast creation
node process-unprocessed-docs.js 5

# Test GitHub sync (will fail until auth fixed)
./sync-github-content.sh

# Check broadcast status
sqlite3 agent/data/db.sqlite "
  SELECT status, COUNT(*) as count
  FROM broadcasts
  GROUP BY status
"

# Check recent logs
tail -20 logs/cron-broadcast-create.log
tail -20 logs/cron-github-import.log
tail -20 logs/cron-telegram-send.log

# Manual broadcast send test
node send-pending-to-telegram.js
node send-pending-to-bluesky.js
```

---

**Session**: 2025-12-30 11:00-11:30 WET
**Status**: Broadcast creation FIXED ✅, GitHub import needs auth setup ⚠️
