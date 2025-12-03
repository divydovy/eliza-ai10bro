#!/bin/bash

# Eliza Broadcast System Cleanup Script
# Created: 2025-12-03
# Purpose: Clean up 30+ background processes and 17 redundant broadcast files

set -e

echo "🧹 Eliza Broadcast System Cleanup"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ============================================
# PART 1: Kill Background Node Processes
# ============================================

echo "${YELLOW}PART 1: Background Process Cleanup${NC}"
echo "-----------------------------------"
echo ""

# Count current node processes
NODE_COUNT=$(ps aux | grep -i "pnpm start\|node.*eliza" | grep -v grep | wc -l | tr -d ' ')
echo "Found ${NODE_COUNT} background node processes"

if [ "$NODE_COUNT" -gt 0 ]; then
    echo ""
    echo "Processes to kill:"
    ps aux | grep -i "pnpm start\|node.*eliza" | grep -v grep | awk '{print "  - PID " $2 ": " $11 " " $12 " " $13}' | head -20

    if [ "$NODE_COUNT" -gt 20 ]; then
        echo "  ... and $(($NODE_COUNT - 20)) more"
    fi

    echo ""
    read -p "Kill all ${NODE_COUNT} background processes? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Killing all node processes..."
        killall node 2>/dev/null || echo "No processes to kill"
        sleep 2

        # Verify cleanup
        REMAINING=$(ps aux | grep -i "pnpm start\|node.*eliza" | grep -v grep | wc -l | tr -d ' ')
        if [ "$REMAINING" -eq 0 ]; then
            echo "${GREEN}✅ All background processes killed${NC}"
        else
            echo "${RED}⚠️  ${REMAINING} processes still running${NC}"
        fi
    else
        echo "Skipped process cleanup"
    fi
else
    echo "${GREEN}✅ No background processes found${NC}"
fi

echo ""
echo ""

# ============================================
# PART 2: File Cleanup
# ============================================

echo "${YELLOW}PART 2: Redundant File Cleanup${NC}"
echo "-------------------------------"
echo ""

# Define core working files (keep these)
CORE_FILES=(
    "process-unprocessed-docs.js"
    "send-pending-broadcasts.js"
    "send-pending-to-telegram.js"
    "send-pending-to-bluesky.js"
    "broadcast-dashboard.html"
    "broadcast-api.js"
    "action-api-standalone.js"
)

echo "${GREEN}Core Working Files (KEEP):${NC}"
for file in "${CORE_FILES[@]}"; do
    if [ -f "$file" ]; then
        SIZE=$(ls -lh "$file" | awk '{print $5}')
        echo "  ✅ $file ($SIZE)"
    else
        echo "  ❌ $file (MISSING!)"
    fi
done

echo ""

# Define files to delete
OLD_FILES=(
    "send-pending-to-farcaster.js"
    "create-broadcasts.js"
    "create-new-broadcasts.js"
    "test-broadcast-generation.js"
    "check-broadcast-quality.js"
    "fix-broadcast-notes.js"
    "clean-all-broadcasts.js"
    "action-api.js"
    "trigger-action-api.js"
    "trigger-actions.js"
    "monitor-actions.js"
    "test-practical-actions.js"
)

echo "${RED}Redundant Files (DELETE):${NC}"
DELETE_COUNT=0
for file in "${OLD_FILES[@]}"; do
    if [ -f "$file" ]; then
        SIZE=$(ls -lh "$file" | awk '{print $5}')
        DATE=$(ls -l "$file" | awk '{print $6, $7}')
        echo "  🗑️  $file ($SIZE, $DATE)"
        DELETE_COUNT=$((DELETE_COUNT + 1))
    fi
done

echo ""
echo "Found $DELETE_COUNT redundant files to delete"

if [ "$DELETE_COUNT" -gt 0 ]; then
    echo ""
    read -p "Delete all $DELETE_COUNT redundant files? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Create backup directory
        BACKUP_DIR="./backup-$(date +%Y%m%d-%H%M%S)"
        mkdir -p "$BACKUP_DIR"
        echo "Creating backup in $BACKUP_DIR..."

        # Move files to backup
        for file in "${OLD_FILES[@]}"; do
            if [ -f "$file" ]; then
                mv "$file" "$BACKUP_DIR/"
                echo "  Moved $file to backup"
            fi
        done

        echo ""
        echo "${GREEN}✅ Files moved to $BACKUP_DIR${NC}"
        echo ""
        echo "To permanently delete backup:"
        echo "  rm -rf $BACKUP_DIR"
    else
        echo "Skipped file cleanup"
    fi
else
    echo "${GREEN}✅ No redundant files found${NC}"
fi

echo ""
echo ""

# ============================================
# PART 3: System Status Report
# ============================================

echo "${YELLOW}PART 3: System Status Report${NC}"
echo "----------------------------"
echo ""

# Count remaining processes
PROC_COUNT=$(ps aux | grep -i "pnpm start\|node.*eliza" | grep -v grep | wc -l | tr -d ' ')
echo "Background processes: $PROC_COUNT"

# Count broadcast files
BROADCAST_FILES=$(ls -1 *.js 2>/dev/null | grep -E "(broadcast|pending|action|process-unprocessed)" | wc -l | tr -d ' ')
echo "Broadcast files: $BROADCAST_FILES"

# Verify core files exist
echo ""
echo "Core file status:"
ALL_CORE_EXIST=true
for file in "${CORE_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file (MISSING!)"
        ALL_CORE_EXIST=false
    fi
done

echo ""
if [ "$ALL_CORE_EXIST" = true ] && [ "$PROC_COUNT" -eq 0 ] && [ "$BROADCAST_FILES" -eq 7 ]; then
    echo "${GREEN}✅ System cleanup complete!${NC}"
    echo ""
    echo "System health: 🟢 GREEN"
    echo "  - All core files present"
    echo "  - No background processes"
    echo "  - Optimal file count (7)"
elif [ "$PROC_COUNT" -lt 5 ] && [ "$BROADCAST_FILES" -lt 15 ]; then
    echo "${YELLOW}⚠️  System mostly clean${NC}"
    echo ""
    echo "System health: 🟡 YELLOW"
    echo "  - Minor cleanup remaining"
else
    echo "${RED}⚠️  System needs attention${NC}"
    echo ""
    echo "System health: 🔴 RED"
    echo "  - Significant cleanup needed"
fi

echo ""
echo "Cleanup script complete!"
