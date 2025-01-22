import { Client, IAgentRuntime, elizaLogger } from "@elizaos/core";
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

export class ObsidianAutoClient {
    interval: NodeJS.Timeout;
    runtime: IAgentRuntime;
    private isRunning = false;

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        this.startUpdateLoop();
    }

    private startUpdateLoop() {
        // Run immediately on start
        this.runUpdate();

        // Then start the interval
        this.interval = setInterval(() => {
            this.runUpdate();
        }, 5 * 60 * 1000); // 5 minutes in milliseconds
    }

    private runUpdate() {
        if (this.isRunning) {
            elizaLogger.log("Update already in progress, skipping...");
            return;
        }

        const scriptPath = path.join(projectRoot, 'scripts', 'update-obsidian-knowledge.ts');
        const characterPath = path.join(projectRoot, 'characters', 'ai10bro.character.json');

        elizaLogger.log("Running Obsidian knowledge update...");
        this.isRunning = true;

        return new Promise((resolve) => {
            exec(`cd ${projectRoot} && pnpm tsx ${scriptPath} ${characterPath}`, (error, stdout, stderr) => {
                this.isRunning = false;

                if (error) {
                    elizaLogger.error(`Error executing update script: ${error}`);
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

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
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