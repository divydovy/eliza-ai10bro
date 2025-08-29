import { elizaLogger } from '@elizaos/core';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hardcode the project root since we know where we are
const projectRoot = '/Users/davidlockie/Documents/Projects/Eliza';

export class BroadcastServiceManager {
    private broadcastApiProcess: ChildProcess | null = null;
    private actionApiProcess: ChildProcess | null = null;
    private isRunning = false;

    async start(): Promise<void> {
        if (this.isRunning) {
            elizaLogger.info('Broadcast services already running');
            return;
        }

        try {
            elizaLogger.info('Starting broadcast dashboard services...');

            // Start Broadcast API on port 3002
            const broadcastApiPath = path.join(projectRoot, 'packages/plugin-dashboard/src/services/broadcast-api.js');
            
            if (!existsSync(broadcastApiPath)) {
                elizaLogger.error(`Broadcast API file not found at: ${broadcastApiPath}`);
                throw new Error(`Broadcast API file not found`);
            }
            
            this.broadcastApiProcess = spawn('node', [broadcastApiPath], {
                env: { ...process.env },
                cwd: projectRoot,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            this.broadcastApiProcess.stdout?.on('data', (data) => {
                elizaLogger.info(`[Broadcast API]: ${data.toString().trim()}`);
            });

            this.broadcastApiProcess.stderr?.on('data', (data) => {
                elizaLogger.error(`[Broadcast API Error]: ${data.toString().trim()}`);
            });

            // Start Action API on port 3003
            const actionApiPath = path.join(projectRoot, 'packages/plugin-dashboard/src/services/action-api.js');
            
            if (!existsSync(actionApiPath)) {
                elizaLogger.error(`Action API file not found at: ${actionApiPath}`);
                throw new Error(`Action API file not found`);
            }
            
            this.actionApiProcess = spawn('node', [actionApiPath], {
                env: { ...process.env },
                cwd: projectRoot,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            this.actionApiProcess.stdout?.on('data', (data) => {
                elizaLogger.info(`[Action API]: ${data.toString().trim()}`);
            });

            this.actionApiProcess.stderr?.on('data', (data) => {
                elizaLogger.error(`[Action API Error]: ${data.toString().trim()}`);
            });

            this.isRunning = true;

            // Wait a moment for services to start
            await new Promise(resolve => setTimeout(resolve, 2000));

            elizaLogger.success('Broadcast dashboard services started successfully');
            elizaLogger.info('Dashboard available at: http://localhost:3002/broadcast-dashboard.html');
            
        } catch (error) {
            elizaLogger.error('Failed to start broadcast services:', error);
            this.stop();
            throw error;
        }
    }

    stop(): void {
        if (this.broadcastApiProcess) {
            this.broadcastApiProcess.kill();
            this.broadcastApiProcess = null;
        }
        
        if (this.actionApiProcess) {
            this.actionApiProcess.kill();
            this.actionApiProcess = null;
        }

        this.isRunning = false;
        elizaLogger.info('Broadcast services stopped');
    }

    getStatus(): { broadcastApi: boolean; actionApi: boolean } {
        return {
            broadcastApi: this.broadcastApiProcess !== null && !this.broadcastApiProcess.killed,
            actionApi: this.actionApiProcess !== null && !this.actionApiProcess.killed
        };
    }
}

export const broadcastServiceManager = new BroadcastServiceManager();