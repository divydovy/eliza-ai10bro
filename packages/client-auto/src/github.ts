import { Client, IAgentRuntime, elizaLogger } from "@elizaos/core";
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

export class GitHubAutoClient {
    knowledgeInterval: NodeJS.Timeout;
    runtime: IAgentRuntime;
    private isKnowledgeUpdateRunning = false;

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        // Add delay before starting processes to ensure agent is ready
        setTimeout(() => {
            this.startProcess();
        }, 10000); // 10 second delay
    }

    private startProcess() {
        elizaLogger.log("Starting GitHub auto client process...");

        // Get update interval from settings or use default (24 hours)
        const updateInterval = Number(this.runtime.getSetting("GITHUB_UPDATE_INTERVAL")) || 86400;

        // Start knowledge update process
        this.runKnowledgeUpdate();
        this.knowledgeInterval = setInterval(() => {
            this.runKnowledgeUpdate();
        }, updateInterval * 1000); // Convert to milliseconds
    }

    private async runKnowledgeUpdate() {
        if (this.isKnowledgeUpdateRunning) {
            elizaLogger.log("GitHub knowledge update already in progress, skipping...");
            return;
        }

        const scriptPath = path.join(projectRoot, 'scripts', 'update-github-knowledge.ts');
        const characterPath = path.join(projectRoot, 'characters', `${this.runtime.character.name}.character.json`);

        elizaLogger.log("Running GitHub knowledge update...");
        this.isKnowledgeUpdateRunning = true;

        return new Promise((resolve) => {
            exec(`cd ${projectRoot} && pnpm tsx ${scriptPath} ${characterPath}`,
                { maxBuffer: 1024 * 1024 * 10 }, // 10MB buffer
                (error, stdout, stderr) => {
                    this.isKnowledgeUpdateRunning = false;

                    if (stderr) elizaLogger.error(stderr);
                    if (stdout) elizaLogger.log(stdout);

                    if (error) {
                        elizaLogger.error(`Error executing GitHub knowledge update script: ${error}`);
                        resolve(false);
                        return;
                    }

                    elizaLogger.log("GitHub knowledge update completed");
                    resolve(true);
            });
        });
    }

    stop() {
        if (this.knowledgeInterval) {
            clearInterval(this.knowledgeInterval);
        }
    }
}

export const GitHubAutoClientInterface: Client = {
    start: async (runtime: IAgentRuntime) => {
        const client = new GitHubAutoClient(runtime);
        return client;
    },
    stop: async (runtime: IAgentRuntime) => {
        const client = runtime.clients.find(c => c instanceof GitHubAutoClient) as GitHubAutoClient;
        if (client) {
            client.stop();
        }
    },
};