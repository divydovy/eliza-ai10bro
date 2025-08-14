import { Action, Memory, State, IAgentRuntime, elizaLogger } from "@elizaos/core";
import { githubProvider } from "../providers/githubProvider.js";

export const syncGithubAction: Action = {
    name: "SYNC_GITHUB",
    description: "Sync and update knowledge from GitHub repository content",
    similes: [
        "Synchronize knowledge with GitHub repository",
        "Update knowledge from GitHub repository",
        "Import new content from GitHub repository"
    ],
    examples: [
        [
            {
                user: "system",
                content: {
                    text: "SYNC_GITHUB",
                    source: "system"
                }
            }
        ]
    ],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return message.content.text.includes("SYNC_GITHUB");
    },
    handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        elizaLogger.log("Starting GitHub knowledge sync...");

        try {
            const processedCount = await githubProvider.get(runtime, message, state);

            if (processedCount > 0) {
                elizaLogger.success(`Successfully processed ${processedCount} files from GitHub repository`);
                return true;
            } else {
                elizaLogger.warn("No files were processed from GitHub repository");
                return false;
            }
        } catch (error) {
            elizaLogger.error("Error syncing GitHub knowledge:", error);
            return false;
        }
    }
};