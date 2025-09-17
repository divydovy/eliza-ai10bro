# Eliza Unified Scheduling System

## Overview

This document describes the consolidated scheduling system for the Eliza AI Agent project. The system has been unified to use **LaunchAgents as the single source of truth** for automated task scheduling on macOS.

## Previous State (Multiple Conflicting Systems)

Before consolidation, the project had **4 different scheduling mechanisms** running simultaneously:

1. **Cron Jobs** - System crontab with hourly broadcasts and daily sync
2. **LaunchAgents** - 3 services with different schedules, some failing due to missing scripts
3. **PM2 Ecosystem** - Process management with cron restart (not running)
4. **Custom Scheduler Service** - Node.js-based scheduler with health checks (not running)

### Problems Identified

- **Duplicate operations**: Multiple systems trying to perform the same tasks
- **Conflicting schedules**: Different frequencies and timing
- **Missing dependencies**: Scripts referenced by LaunchAgents didn't exist
- **No coordination**: Systems didn't communicate, causing race conditions
- **Inefficient resource usage**: Redundant processes and API calls

## New Unified System

### Architecture: LaunchAgents Only

The new system uses **3 coordinated LaunchAgent services**:

| Service | File | Purpose | Schedule |
|---------|------|---------|----------|
| **GitHub Sync** | `com.eliza.github-sync.plist` | Sync documents from GitHub repos | 4x daily: 01:00, 07:00, 13:00, 19:00 |
| **Broadcast Creation** | `com.eliza.broadcast-create.plist` | Generate new broadcasts from documents | 6x daily: 02:00, 06:00, 10:00, 14:00, 18:00, 22:00 |
| **Broadcast Sending** | `com.eliza.broadcast-send.plist` | Send pending broadcasts to platforms | 6x daily: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 |

### Schedule Coordination

The timing is carefully coordinated to create an efficient pipeline:

```
00:00 → Send broadcasts
01:00 → Sync GitHub (fresh content)
02:00 → Create broadcasts (from new content)
04:00 → Send broadcasts
06:00 → Create broadcasts
07:00 → Sync GitHub
08:00 → Send broadcasts
10:00 → Create broadcasts
12:00 → Send broadcasts
13:00 → Sync GitHub
14:00 → Create broadcasts
16:00 → Send broadcasts
18:00 → Create broadcasts
19:00 → Sync GitHub
20:00 → Send broadcasts
22:00 → Create broadcasts
```

**Key Benefits:**
- **8-hour GitHub sync cycle** ensures fresh content
- **4-hour broadcast creation cycle** maintains content pipeline
- **4-hour broadcast sending cycle** provides regular posting
- **2-hour offset** between creation and sending allows content to be available

### Implementation Details

#### 1. Service Files Location
```
~/Library/LaunchAgents/
├── com.eliza.github-sync.plist
├── com.eliza.broadcast-create.plist
└── com.eliza.broadcast-send.plist
```

#### 2. Script Dependencies
```
/Users/davidlockie/Documents/Projects/Eliza/
├── sync-github-direct.js          # GitHub sync implementation
├── create-new-broadcasts.js       # Broadcast creation wrapper (NEW)
├── run-broadcast-tasks.sh         # Broadcast sending script
└── manage-scheduling.sh           # Management utility (NEW)
```

#### 3. Environment Variables
All services include proper environment setup:
- **PATH**: Includes Node.js and system binaries
- **NODE_ENV**: Set to production
- **Service-specific configs**: LIMIT, ACTION_API_PORT, etc.

#### 4. Logging
Centralized logging in `/Users/davidlockie/Documents/Projects/Eliza/logs/`:
- `github-sync.log`
- `broadcast-creation.log`
- `broadcast-send.log`

## Management Commands

### Using the Management Script

The system includes a comprehensive management script:

```bash
# Check status of all services
./manage-scheduling.sh status

# Start all services
./manage-scheduling.sh start

# Stop all services
./manage-scheduling.sh stop

# Restart all services
./manage-scheduling.sh restart

# View current schedule
./manage-scheduling.sh schedule

# View recent logs
./manage-scheduling.sh logs

# Test individual services
./manage-scheduling.sh test github-sync
./manage-scheduling.sh test broadcast-create
./manage-scheduling.sh test broadcast-send
```

### Manual LaunchControl Commands

```bash
# Load services
launchctl load ~/Library/LaunchAgents/com.eliza.github-sync.plist
launchctl load ~/Library/LaunchAgents/com.eliza.broadcast-create.plist
launchctl load ~/Library/LaunchAgents/com.eliza.broadcast-send.plist

# Check status
launchctl list | grep eliza

# Unload services
launchctl unload ~/Library/LaunchAgents/com.eliza.github-sync.plist
launchctl unload ~/Library/LaunchAgents/com.eliza.broadcast-create.plist
launchctl unload ~/Library/LaunchAgents/com.eliza.broadcast-send.plist
```

## System Dependencies

### Required Services
The LaunchAgent system depends on these services being available:

1. **Action API** (Port 3003) - Handles PROCESS_QUEUE actions
   - File: `packages/plugin-dashboard/src/services/action-api.js`
   - Start: `node packages/plugin-dashboard/src/services/action-api.js`

2. **Database** - SQLite database for broadcasts and documents
   - Path: `agent/data/db.sqlite`

### External Dependencies
- **Node.js v23.3.0** (via NVM)
- **GitHub API access** for syncing repositories
- **Telegram API** for sending broadcasts
- **cURL** for HTTP requests

## Removed Systems

### Cron Jobs (Removed)
- All Eliza-related cron entries have been removed from system crontab
- Old scripts `run-broadcast-tasks.sh` and `run-data-sync.sh` are still available for manual use

### PM2 Ecosystem (Dormant)
- `ecosystem.config.js` still exists but is not used by the scheduling system
- Can be used independently for process management if needed

### Custom Scheduler Service (Dormant)
- `scheduler-service.js` still exists but is not active
- Contains useful health check logic that could be integrated later

## Validation Results

### Service Status
All three LaunchAgent services are loaded and operational:
```
✅ com.eliza.github-sync: Loaded (waiting for schedule)
✅ com.eliza.broadcast-create: Loaded (waiting for schedule)
✅ com.eliza.broadcast-send: Loaded (waiting for schedule)
```

### Functional Testing
- **Broadcast Creation**: Successfully processes queue with 47 pending broadcasts
- **GitHub Sync**: Successfully scans and processes 3662 markdown files
- **Management Script**: All commands working correctly

## Benefits of New System

### 1. **Reliability**
- Native macOS LaunchAgents are more reliable than cron
- Automatic restart on failure
- Better handling of system sleep/wake cycles

### 2. **Efficiency**
- Eliminated duplicate operations
- Coordinated timing prevents conflicts
- Single source of truth for scheduling

### 3. **Maintainability**
- One system to manage instead of four
- Clear documentation and management tools
- Consistent logging and error handling

### 4. **Observability**
- Centralized logging
- Management dashboard with status checks
- Easy testing and debugging tools

## Future Considerations

### Potential Enhancements

1. **Health Monitoring**
   - Integrate health check logic from `scheduler-service.js`
   - Add service dependency checks
   - Implement automatic restart on API failures

2. **Dynamic Scheduling**
   - Adjust frequencies based on content availability
   - Pause scheduling during maintenance windows
   - Scale based on system load

3. **Multi-Platform Support**
   - Create equivalent systemd services for Linux
   - Windows Task Scheduler implementation
   - Cross-platform management script

4. **Notification System**
   - Email alerts for failed services
   - Slack/Discord integration for status updates
   - Dashboard integration for real-time monitoring

### Migration Path for Other Environments

For non-macOS environments, the logical migration would be:
- **Linux**: Convert to systemd timer units
- **Windows**: Use Task Scheduler with PowerShell scripts
- **Docker**: Use cron + healthcheck in containers

## Conclusion

The unified LaunchAgent-based scheduling system provides a robust, efficient, and maintainable solution for automating Eliza's broadcast operations. By eliminating conflicts and redundancies while maintaining the same functionality, the system is now easier to manage and more reliable.

---

**Last Updated**: 2025-09-17
**Migration Completed**: 2025-09-17 11:50 UTC
**Status**: ✅ Active and Operational