import { Plugin } from "@elizaos/core";
import { syncGithubAction } from "./actions/createKnowledge.js";
import { githubProvider } from "./providers/githubProvider.js";

export const githubPlugin: Plugin = {
    name: "github",
    description: "GitHub integration for syncing repository content into knowledge base",
    actions: [
        syncGithubAction
    ],
    evaluators: [],
    services: [],
    providers: [
        githubProvider
    ]
};

export default githubPlugin;