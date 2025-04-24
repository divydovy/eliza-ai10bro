import { Client, IAgentRuntime, elizaLogger } from "@elizaos/core";
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createBroadcastMessage } from '@elizaos/plugin-broadcast';
import { BroadcastDB } from '@elizaos/plugin-broadcast/src/db/operations';
import { processBroadcastQueue } from '@elizaos/plugin-broadcast/src/actions/processQueue/service';

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
        // Add delay before starting processes to ensure agent is ready
        setTimeout(() => {
            this.startAllProcesses();
        }, 10000); // 10 second delay
    }

    private startAllProcesses() {
        elizaLogger.log("Starting auto client processes...");
        // Start knowledge update process (every 10 minutes)
        this.runKnowledgeUpdate();
        this.knowledgeInterval = setInterval(() => {
            this.runKnowledgeUpdate();
        }, 10 * 60 * 1000);

        // Start broadcast creation process (every 10 minutes)
        this.runBroadcastCreate();
        this.broadcastInterval = setInterval(() => {
            this.runBroadcastCreate();
        }, 10 * 60 * 1000);

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

        elizaLogger.log("Running knowledge update...");
        this.isKnowledgeUpdateRunning = true;

        // Logic to check Obsidian for new files and trigger create_knowledge
        // ... existing code ...

        this.isKnowledgeUpdateRunning = false;
        elizaLogger.log("Knowledge update completed");
    }

    private async runBroadcastCreate() {
        if (this.isBroadcastCreateRunning) {
            elizaLogger.log("Broadcast creation already in progress, skipping...");
            return;
        }

        elizaLogger.log("Running broadcast message creation...");
        this.isBroadcastCreateRunning = true;

        try {
            await createBroadcastMessage(this.runtime, this.runtime.character.name);
            elizaLogger.log("Broadcast message creation completed");
            return true;
        } catch (error) {
            elizaLogger.error(`Error executing broadcast creation: ${error}`);
            return false;
        } finally {
            this.isBroadcastCreateRunning = false;
        }
    }

    private async runQueueProcess() {
        if (this.isQueueProcessRunning) {
            elizaLogger.log("Queue processing already in progress, skipping...");
            return;
        }

        elizaLogger.log("Running broadcast queue processing...");
        this.isQueueProcessRunning = true;

        try {
            const db = new BroadcastDB(this.runtime.databaseAdapter.db);
            const result = await processBroadcastQueue(this.runtime, {}, db);
            elizaLogger.log(`Broadcast queue processing completed. Processed: ${result.processedCount}, Failed: ${result.failedCount}`);
            return true;
        } catch (error) {
            elizaLogger.error(`Error executing queue processing: ${error}`);
            return false;
        } finally {
            this.isQueueProcessRunning = false;
        }
    }

    stop() {
        if (this.knowledgeInterval) {
            clearInterval(this.knowledgeInterval);
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