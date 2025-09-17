#!/bin/bash

# Eliza Unified Scheduling Management Script
# This script provides easy management of the LaunchAgent-based scheduling system

ELIZA_PATH="/Users/davidlockie/Documents/Projects/Eliza"
LAUNCH_AGENTS_PATH="$HOME/Library/LaunchAgents"

# Service definitions
SERVICES=(
    "com.eliza.github-sync"
    "com.eliza.broadcast-create"
    "com.eliza.broadcast-send"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}======================================${NC}"
    echo -e "${BLUE}  Eliza Unified Scheduling Manager${NC}"
    echo -e "${BLUE}======================================${NC}"
    echo ""
}

print_schedule() {
    echo -e "${YELLOW}Current Schedule:${NC}"
    echo "  GitHub Sync:       01:00, 07:00, 13:00, 19:00 (6h intervals)"
    echo "  Broadcast Create:  02:00, 06:00, 10:00, 14:00, 18:00, 22:00 (4h intervals)"
    echo "  Broadcast Send:    00:00, 04:00, 08:00, 12:00, 16:00, 20:00 (4h intervals)"
    echo ""
}

check_status() {
    echo -e "${YELLOW}Service Status:${NC}"
    for service in "${SERVICES[@]}"; do
        status=$(launchctl list | grep $service)
        if [ -n "$status" ]; then
            pid=$(echo $status | awk '{print $1}')
            exit_code=$(echo $status | awk '{print $2}')

            if [ "$pid" = "-" ]; then
                if [ "$exit_code" = "0" ]; then
                    echo -e "  $service: ${GREEN}✅ Loaded (waiting for schedule)${NC}"
                else
                    echo -e "  $service: ${RED}❌ Failed (exit code: $exit_code)${NC}"
                fi
            else
                echo -e "  $service: ${GREEN}🔄 Running (PID: $pid)${NC}"
            fi
        else
            echo -e "  $service: ${RED}⭕ Not loaded${NC}"
        fi
    done
    echo ""
}

start_services() {
    echo -e "${YELLOW}Starting all scheduling services...${NC}"
    for service in "${SERVICES[@]}"; do
        echo "Loading $service..."
        launchctl load "$LAUNCH_AGENTS_PATH/$service.plist" 2>/dev/null
        if [ $? -eq 0 ]; then
            echo -e "  ${GREEN}✅ $service loaded${NC}"
        else
            echo -e "  ${YELLOW}⚠️ $service already loaded or error occurred${NC}"
        fi
    done
    echo ""
}

stop_services() {
    echo -e "${YELLOW}Stopping all scheduling services...${NC}"
    for service in "${SERVICES[@]}"; do
        echo "Unloading $service..."
        launchctl unload "$LAUNCH_AGENTS_PATH/$service.plist" 2>/dev/null
        if [ $? -eq 0 ]; then
            echo -e "  ${GREEN}✅ $service unloaded${NC}"
        else
            echo -e "  ${YELLOW}⚠️ $service not loaded or error occurred${NC}"
        fi
    done
    echo ""
}

restart_services() {
    echo -e "${YELLOW}Restarting all scheduling services...${NC}"
    stop_services
    sleep 2
    start_services
}

view_logs() {
    echo -e "${YELLOW}Recent log entries:${NC}"
    echo ""

    echo -e "${BLUE}GitHub Sync:${NC}"
    if [ -f "$ELIZA_PATH/logs/github-sync.log" ]; then
        tail -5 "$ELIZA_PATH/logs/github-sync.log" | sed 's/^/  /'
    else
        echo "  No log file found"
    fi
    echo ""

    echo -e "${BLUE}Broadcast Creation:${NC}"
    if [ -f "$ELIZA_PATH/logs/broadcast-creation.log" ]; then
        tail -5 "$ELIZA_PATH/logs/broadcast-creation.log" | sed 's/^/  /'
    else
        echo "  No log file found"
    fi
    echo ""

    echo -e "${BLUE}Broadcast Sending:${NC}"
    if [ -f "$ELIZA_PATH/logs/broadcast-send.log" ]; then
        tail -5 "$ELIZA_PATH/logs/broadcast-send.log" | sed 's/^/  /'
    else
        echo "  No log file found"
    fi
    echo ""
}

manual_test() {
    local service=$1
    echo -e "${YELLOW}Running manual test for $service...${NC}"

    case $service in
        "github-sync")
            node "$ELIZA_PATH/sync-github-direct.js"
            ;;
        "broadcast-create")
            node "$ELIZA_PATH/create-new-broadcasts.js"
            ;;
        "broadcast-send")
            bash "$ELIZA_PATH/run-broadcast-tasks.sh"
            ;;
        *)
            echo -e "${RED}Unknown service: $service${NC}"
            echo "Available services: github-sync, broadcast-create, broadcast-send"
            ;;
    esac
}

show_help() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  status      Show current status of all services"
    echo "  start       Start all scheduling services"
    echo "  stop        Stop all scheduling services"
    echo "  restart     Restart all scheduling services"
    echo "  schedule    Show the current schedule"
    echo "  logs        View recent log entries"
    echo "  test [service]  Run manual test (github-sync, broadcast-create, broadcast-send)"
    echo "  help        Show this help message"
    echo ""
}

# Main script logic
print_header

case "${1:-status}" in
    "status")
        print_schedule
        check_status
        ;;
    "start")
        start_services
        check_status
        ;;
    "stop")
        stop_services
        check_status
        ;;
    "restart")
        restart_services
        check_status
        ;;
    "schedule")
        print_schedule
        ;;
    "logs")
        view_logs
        ;;
    "test")
        if [ -n "$2" ]; then
            manual_test "$2"
        else
            echo -e "${RED}Please specify a service to test${NC}"
            echo "Available services: github-sync, broadcast-create, broadcast-send"
        fi
        ;;
    "help")
        show_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo ""
        show_help
        ;;
esac