import { Client, IAgentRuntime, elizaLogger } from "@elizaos/core";
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

export class ObsidianAutoClient {
    knowledgeInterval: NodeJS.Timeout;
    broadcastInterval: NodeJS.Timeout;
    queueInterval: NodeJS.Timeout;
    runtime: IAgentRuntime;
    private isKnowledgeUpdateRunning = false;
    private isBroadcastCreateRunning = false;
    private isQueueProcessRunning = false;

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        this.startAllProcesses();
    }

    private startAllProcesses() {
        // Start knowledge update process (every 5 minutes)
        this.runKnowledgeUpdate();
        this.knowledgeInterval = setInterval(() => {
            this.runKnowledgeUpdate();
        }, 5 * 60 * 1000);

        // Start broadcast creation process (every 5 minutes)
        this.runBroadcastCreate();
        this.broadcastInterval = setInterval(() => {
            this.runBroadcastCreate();
        }, 5 * 60 * 1000);

        // Start queue processing with random interval
        this.scheduleNextQueueProcess();
    }

    private scheduleNextQueueProcess() {
        // Random delay between 30 minutes and 2 hours
        const minDelay = 30 * 60 * 1000; // 30 minutes
        const maxDelay = 2 * 60 * 60 * 1000; // 2 hours
        const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

        elizaLogger.log(`Scheduling next broadcast queue process in ${Math.round(delay / 60000)} minutes`);

        this.queueInterval = setTimeout(() => {
            this.runQueueProcess().then(() => {
                // Schedule next run after this one completes
                this.scheduleNextQueueProcess();
            });
        }, delay);
    }

    private async runKnowledgeUpdate() {
        if (this.isKnowledgeUpdateRunning) {
            elizaLogger.log("Knowledge update already in progress, skipping...");
            return;
        }

        const scriptPath = path.join(projectRoot, 'scripts', 'update-obsidian-knowledge.ts');
        const characterPath = path.join(projectRoot, 'characters', 'ai10bro.character.json');

        elizaLogger.log("Running Obsidian knowledge update...");
        this.isKnowledgeUpdateRunning = true;

        return new Promise((resolve) => {
            exec(`cd ${projectRoot} && pnpm tsx ${scriptPath} ${characterPath}`, (error, stdout, stderr) => {
                this.isKnowledgeUpdateRunning = false;

                if (error) {
                    elizaLogger.error(`Error executing knowledge update script: ${error}`);
                    if (stderr) elizaLogger.error(stderr);
                    resolve(false);
                    return;
                }

                if (stderr) elizaLogger.error(stderr);
                if (stdout) elizaLogger.log(stdout);

                elizaLogger.log("Obsidian knowledge update completed");
                resolve(true);
            });
        });
    }

    private async runBroadcastCreate() {
        if (this.isBroadcastCreateRunning) {
            elizaLogger.log("Broadcast creation already in progress, skipping...");
            return;
        }

        const scriptPath = path.join(projectRoot, 'scripts', 'create-broadcast-message.ts');
        const characterName = 'ai10bro';

        elizaLogger.log("Running broadcast message creation...");
        this.isBroadcastCreateRunning = true;

        return new Promise((resolve) => {
            exec(`cd ${projectRoot} && pnpm tsx ${scriptPath} ${characterName}`, (error, stdout, stderr) => {
                this.isBroadcastCreateRunning = false;

                if (error) {
                    elizaLogger.error(`Error executing broadcast creation script: ${error}`);
                    if (stderr) elizaLogger.error(stderr);
                    resolve(false);
                    return;
                }

                if (stderr) elizaLogger.error(stderr);
                if (stdout) elizaLogger.log(stdout);

                elizaLogger.log("Broadcast message creation completed");
                resolve(true);
            });
        });
    }

    private async runQueueProcess() {
        if (this.isQueueProcessRunning) {
            elizaLogger.log("Queue processing already in progress, skipping...");
            return;
        }

        const scriptPath = path.join(projectRoot, 'scripts', 'process-broadcast-queue.ts');
        const characterName = 'ai10bro';

        elizaLogger.log("Running broadcast queue processing...");
        this.isQueueProcessRunning = true;

        return new Promise((resolve) => {
            exec(`cd ${projectRoot} && pnpm tsx ${scriptPath} ${characterName}`, (error, stdout, stderr) => {
                this.isQueueProcessRunning = false;

                if (error) {
                    elizaLogger.error(`Error executing queue processing script: ${error}`);
                    if (stderr) elizaLogger.error(stderr);
                    resolve(false);
                    return;
                }

                if (stderr) elizaLogger.error(stderr);
                if (stdout) elizaLogger.log(stdout);

                elizaLogger.log("Broadcast queue processing completed");
                resolve(true);
            });
        });
    }

    stop() {
        if (this.knowledgeInterval) {
            clearInterval(this.knowledgeInterval);
        }
        if (this.broadcastInterval) {
            clearInterval(this.broadcastInterval);
        }
        if (this.queueInterval) {
            clearTimeout(this.queueInterval);
        }
    }
}

export const ObsidianAutoClientInterface: Client = {
    start: async (runtime: IAgentRuntime) => {
        const client = new ObsidianAutoClient(runtime);
        return client;
    },
    stop: async (runtime: IAgentRuntime) => {
        const client = runtime.clients.find(c => c instanceof ObsidianAutoClient) as ObsidianAutoClient;
        if (client) {
            client.stop();
        }
    },
};

export default ObsidianAutoClientInterface;