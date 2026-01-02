import { Plugin } from "@elizaos/core";
import { syncGithubAction } from "./actions/createKnowledge.js";
import { githubProvider } from "./providers/githubProvider.js";

export const githubPlugin: Plugin = {
    name: "github",
    description: "GitHub integration for syncing repository content into knowledge base (scheduled via cron, not per-message)",
    actions: [
        syncGithubAction
    ],
    evaluators: [],
    services: [],
    providers: [
        // Removed githubProvider - GitHub sync should be scheduled, not called on every message
        // Use cron job to trigger SYNC_GITHUB action instead
    ]
};

export default githubPlugin;

// Export for direct use in cron scripts
export { githubProvider };