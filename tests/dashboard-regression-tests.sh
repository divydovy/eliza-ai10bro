#!/bin/bash

# Dashboard Regression Test Suite
# Run this to ensure the dashboard has all required features

set -e  # Exit on first failure

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 Dashboard Regression Test Suite"
echo "==================================="
echo ""

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
FAILURES=()

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $test_name"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗${NC} $test_name"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        FAILURES+=("$test_name")
    fi
}

echo "1️⃣  Testing Service Health"
echo "----------------------------"
run_test "Eliza Agent API (port 3000)" "curl -s -f http://localhost:3000/"
run_test "Broadcast API (port 3001)" "curl -s -f http://localhost:3001/health | grep -q healthy"
run_test "Action API (port 3003)" "curl -s -f http://localhost:3003/health | grep -q healthy"

echo ""
echo "2️⃣  Testing Dashboard HTML Features"
echo "------------------------------------"
run_test "Dashboard loads" "curl -s -f http://localhost:3001/broadcast-dashboard.html"
run_test "Source Quality Metrics section" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'Source Quality Metrics'"
run_test "Recently Imported Knowledge section" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'Recently Imported Knowledge'"
run_test "Platform Status element" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'Platform Status'"
run_test "Automation Schedule section" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'Automation Schedule'"
run_test "Automation Logs section" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'Automation Logs'"

echo ""
echo "3️⃣  Testing Dashboard Elements"
echo "-------------------------------"
run_test "Sync GitHub button" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'sync-github-btn'"
run_test "Import Obsidian button" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'import-obsidian-btn'"
run_test "Create Broadcasts button" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'create-broadcasts-btn'"
run_test "Send to Telegram button" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'send-telegram-btn'"
run_test "Send to X button" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'send-twitter-btn'"

echo ""
echo "4️⃣  Testing Knowledge Source Types"
echo "-----------------------------------"
run_test "GitHub GDELT source" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'github-gdelt'"
run_test "GitHub YouTube source" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'github-youtube'"
run_test "GitHub ArXiv source" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'github-arxiv'"
run_test "Obsidian source" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'obsidian'"
run_test "Obsidian Web source" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'obsidian-web'"

echo ""
echo "5️⃣  Testing API Endpoints"
echo "-------------------------"
run_test "Broadcast stats API returns data" "curl -s http://localhost:3001/api/broadcast-stats | jq -r .totalDocuments | grep -q '[0-9]'"
run_test "Total documents field exists" "curl -s http://localhost:3001/api/broadcast-stats | jq -e .totalDocuments"
run_test "Total broadcasts field exists" "curl -s http://localhost:3001/api/broadcast-stats | jq -e .totalBroadcasts"
run_test "Pending broadcasts field exists" "curl -s http://localhost:3001/api/broadcast-stats | jq -e .pendingBroadcasts"
run_test "Sent broadcasts field exists" "curl -s http://localhost:3001/api/broadcast-stats | jq -e .sentBroadcasts"
run_test "Config API endpoint" "curl -s http://localhost:3001/api/config | jq -e .actionPort"

echo ""
echo "6️⃣  Testing CSS Classes"
echo "------------------------"
run_test "Knowledge item classes" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'knowledge-item'"
run_test "Metric card classes" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'metric-card'"
run_test "Platform classes" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'broadcast-platform'"
run_test "Quality bar visualization" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'quality-bar'"
run_test "Progress bar elements" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'progress-bar'"

echo ""
echo "7️⃣  Testing JavaScript Functions"
echo "---------------------------------"
run_test "fetchSourceMetrics function" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'fetchSourceMetrics'"
run_test "updateKnowledgeList function" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'updateKnowledgeList'"
run_test "refreshLogs function" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'refreshLogs'"
run_test "triggerAction function" "curl -s http://localhost:3001/broadcast-dashboard.html | grep -q 'triggerAction'"

echo ""
echo "==================================="
echo "📊 RESULTS"
echo "==================================="
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

if [ $FAILED_TESTS -gt 0 ]; then
    echo ""
    echo -e "${RED}❌ FAILED TESTS:${NC}"
    for failure in "${FAILURES[@]}"; do
        echo -e "   - $failure"
    done
    echo ""
    echo -e "${YELLOW}⚠️  Dashboard has regressions! Please fix the above issues.${NC}"
    exit 1
else
    echo ""
    echo -e "${GREEN}✅ All tests passed! Dashboard is functioning correctly.${NC}"
    exit 0
fi