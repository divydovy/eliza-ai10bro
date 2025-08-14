#!/usr/bin/env node

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

class SchedulerService {
    constructor() {
        this.schedules = {
            SYNC_GITHUB: {
                interval: 6 * 60 * 60 * 1000,      // 6 hours
                lastRun: null,
                enabled: true,
                description: 'Sync GitHub repository documents'
            },
            CREATE_KNOWLEDGE: {
                interval: 12 * 60 * 60 * 1000,     // 12 hours
                lastRun: null,
                enabled: true,
                description: 'Import Obsidian knowledge base'
            },
            PROCESS_QUEUE: {
                interval: 30 * 60 * 1000,          // 30 minutes
                lastRun: null,
                enabled: true,
                description: 'Process broadcast queue for Telegram'
            },
            HEALTH_CHECK: {
                interval: 5 * 60 * 1000,           // 5 minutes
                lastRun: null,
                enabled: true,
                description: 'Check system health'
            }
        };
        
        this.logFile = path.join(__dirname, 'logs', 'scheduler.log');
        this.ensureLogDirectory();
    }
    
    ensureLogDirectory() {
        const logDir = path.dirname(this.logFile);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }
    
    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        console.log(logMessage);
        fs.appendFileSync(this.logFile, logMessage);
    }
    
    triggerAction(actionName) {
        this.log(`🔄 Triggering ${actionName}...`);
        
        exec(`node trigger-actions.js ${actionName}`, (error, stdout, stderr) => {
            if (error) {
                this.log(`❌ Error triggering ${actionName}: ${error.message}`);
                return;
            }
            
            this.schedules[actionName].lastRun = new Date();
            this.log(`✅ ${actionName} completed successfully`);
            
            if (stdout) {
                this.log(`Output: ${stdout}`);
            }
        });
    }
    
    healthCheck() {
        this.log('🏥 Running health check...');
        
        // Check if agent is running
        exec('curl -s http://localhost:3000/health', (error, stdout) => {
            if (error) {
                this.log('⚠️ Agent API not responding, may need restart');
                this.attemptRestart('agent');
            } else {
                this.log('✅ Agent API healthy');
            }
        });
        
        // Check if broadcast API is running
        exec('curl -s http://localhost:3002/health', (error, stdout) => {
            if (error) {
                this.log('⚠️ Broadcast API not responding, may need restart');
                this.attemptRestart('broadcast-api');
            } else {
                this.log('✅ Broadcast API healthy');
            }
        });
        
        // Check broadcast statistics
        exec('curl -s http://localhost:3002/api/broadcast-stats', (error, stdout) => {
            if (!error && stdout) {
                try {
                    const stats = JSON.parse(stdout);
                    this.log(`📊 Broadcasts - Pending: ${stats.pendingBroadcasts}, Sent: ${stats.sentBroadcasts}, Failed: ${stats.failedBroadcasts}`);
                } catch (e) {
                    this.log('⚠️ Could not parse broadcast stats');
                }
            }
        });
    }
    
    attemptRestart(service) {
        this.log(`🔄 Attempting to restart ${service}...`);
        
        const restartCommands = {
            'agent': 'pm2 restart eliza-agent || pnpm start --character="./characters/ai10bro.character.json" &',
            'broadcast-api': 'pm2 restart broadcast-api || node broadcast-api-simple.js &'
        };
        
        if (restartCommands[service]) {
            exec(restartCommands[service], (error) => {
                if (error) {
                    this.log(`❌ Failed to restart ${service}: ${error.message}`);
                } else {
                    this.log(`✅ ${service} restarted successfully`);
                }
            });
        }
    }
    
    start() {
        this.log('🚀 Starting Scheduler Service...');
        this.log('📅 Schedule Configuration:');
        
        Object.entries(this.schedules).forEach(([action, config]) => {
            if (config.enabled) {
                const hours = Math.floor(config.interval / (1000 * 60 * 60));
                const minutes = Math.floor((config.interval % (1000 * 60 * 60)) / (1000 * 60));
                this.log(`  - ${action}: Every ${hours}h ${minutes}m - ${config.description}`);
            }
        });
        
        // Run initial actions
        this.log('🏃 Running initial actions...');
        this.triggerAction('SYNC_GITHUB');
        setTimeout(() => this.triggerAction('CREATE_KNOWLEDGE'), 5000);
        setTimeout(() => this.triggerAction('PROCESS_QUEUE'), 10000);
        
        // Set up recurring schedules
        Object.entries(this.schedules).forEach(([action, config]) => {
            if (config.enabled) {
                if (action === 'HEALTH_CHECK') {
                    setInterval(() => this.healthCheck(), config.interval);
                } else {
                    setInterval(() => this.triggerAction(action), config.interval);
                }
            }
        });
        
        this.log('✅ Scheduler Service is running');
        
        // Log status every hour
        setInterval(() => {
            this.log('📊 Scheduler Status Report:');
            Object.entries(this.schedules).forEach(([action, config]) => {
                if (config.lastRun) {
                    const timeSince = Date.now() - config.lastRun.getTime();
                    const minutes = Math.floor(timeSince / (1000 * 60));
                    this.log(`  - ${action}: Last run ${minutes} minutes ago`);
                }
            });
        }, 60 * 60 * 1000);
    }
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
    console.log('\n👋 Scheduler Service shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Scheduler Service shutting down gracefully...');
    process.exit(0);
});

// Start the service
const scheduler = new SchedulerService();
scheduler.start();