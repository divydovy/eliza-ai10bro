# Archived Broadcast Scripts - December 15, 2025

## Reason for Archiving
These files were moved to archive during a maintenance cleanup to reduce clutter in the project root. They were identified as either:
- Duplicates of files in `packages/plugin-dashboard/src/services/`
- One-off utility scripts that have already completed their purpose
- Testing/development utilities not used in production
- Old/alternative versions superseded by current implementations

## Files Archived (12 total)

### API Duplicates (3 files)
The actual API files run from `packages/plugin-dashboard/src/services/`:
- `action-api.js` - Duplicate (real: packages/plugin-dashboard/src/services/action-api.js)
- `action-api-standalone.js` - Duplicate
- `broadcast-api.js` - Duplicate (real: packages/plugin-dashboard/src/services/broadcast-api.js)

### One-off Utilities - Completed (3 files)
These scripts served their purpose and are no longer needed:
- `backfill-broadcast-images.js` - Generated images for existing broadcasts (completed)
- `backfill-wordpress-broadcasts.js` - Generated WordPress broadcasts for existing documents (completed)
- `fix-broadcast-notes.js` - One-time fix utility (completed)

### Testing/Development Utilities (4 files)
- `check-broadcast-quality.js` - Testing utility for quality analysis
- `clean-all-broadcasts.js` - Utility for clearing broadcasts (dangerous if run accidentally)
- `test-broadcast-generation.js` - Testing script for broadcast generation
- `trigger-action-api.js` - Testing script for API triggers

### Old/Alternative Versions (2 files)
- `create-new-broadcasts.js` - Alternative implementation (superseded by create-broadcasts.js)
- `send-pending-broadcasts.js` - Old wrapper (not used; action-api handles this)

## Files Kept in Production (8 core files)

These files remain in the root directory and are actively used:

1. **process-unprocessed-docs.js** - Core broadcast generation engine
2. **create-broadcasts.js** - Wrapper called by action-api's CREATE_BROADCASTS action
3. **send-pending-to-wordpress.js** - Called by cron every 4 hours
4. **send-pending-to-telegram.js** - Called by action-api's SEND_TELEGRAM action
5. **send-pending-to-bluesky.js** - Called by action-api's SEND_BLUESKY action
6. **send-pending-to-farcaster.js** - Called by action-api's SEND_FARCASTER action
7. **import-obsidian.js** - Called by action-api's IMPORT_OBSIDIAN action
8. **broadcast-dashboard.html** - Web UI at http://localhost:3002

## Active System Architecture

### Cron Schedule:
```bash
0 2 * * * SYNC_GITHUB (via action-api)
30 2 * * * IMPORT_OBSIDIAN (via action-api)
0 3,9,15,21 * * * CREATE_BROADCASTS (via action-api)
0 * * * * SEND_TELEGRAM (via action-api)
40 * * * * SEND_BLUESKY (via action-api)
20 */4 * * * send-pending-to-wordpress.js (direct script call)
```

### API Services:
- **Port 3000**: Main Eliza agent
- **Port 3002**: Broadcast dashboard (broadcast-api.js in plugin)
- **Port 3003**: Action triggers (action-api.js in plugin)

## Restoration Instructions

If you need to restore any archived file:

```bash
# From project root
cp archive/broadcast-scripts-2025-12-15/FILENAME .
```

## Deletion Policy

These files can be safely deleted after 3 months (March 15, 2026) if no issues arise. Before deletion, verify:
1. All broadcast systems continue working correctly
2. No references to these files exist in documentation
3. No dependencies discovered in the codebase
