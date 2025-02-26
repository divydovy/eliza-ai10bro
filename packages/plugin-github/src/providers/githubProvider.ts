import { Provider, IAgentRuntime, Memory, State, elizaLogger, AgentRuntime, knowledge, stringToUuid } from "@elizaos/core";
import { Octokit } from "@octokit/rest";
import { createTokenAuth } from "@octokit/auth-token";
import { createHash } from "crypto";

export const githubProvider: Provider = {
    async get(runtime: IAgentRuntime, message: Memory, state?: State) {
        const token = runtime.getSetting("GITHUB_TOKEN");
        if (!token) {
            throw new Error("GITHUB_TOKEN not configured");
        }

        const repoUrl = runtime.getSetting("GITHUB_REPO_URL");
        if (!repoUrl) {
            throw new Error("GITHUB_REPO_URL not configured");
        }

        const targetPath = runtime.getSetting("GITHUB_TARGET_PATH") || "";

        // Initialize the GitHub client
        const client = await GitHubClient.create(token, repoUrl, targetPath, runtime as AgentRuntime);
        return client.syncKnowledge();
    }
};

export class GitHubClient {
    private octokit: Octokit;
    private runtime: AgentRuntime;
    private static instance: GitHubClient | null = null;

    private constructor(
        private token: string,
        private repoUrl: string,
        private targetPath: string,
        runtime: AgentRuntime
    ) {
        this.octokit = new Octokit({ auth: token });
        this.runtime = runtime;
    }

    static async create(
        token: string,
        repoUrl: string,
        targetPath: string,
        runtime: AgentRuntime
    ): Promise<GitHubClient> {
        if (!GitHubClient.instance) {
            GitHubClient.instance = new GitHubClient(token, repoUrl, targetPath, runtime);
        }
        return GitHubClient.instance;
    }

    private parseRepoUrl(url: string): { owner: string; repo: string } {
        const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) {
            throw new Error("Invalid GitHub repository URL");
        }
        return {
            owner: match[1],
            repo: match[2].replace(".git", ""),
        };
    }

    async syncKnowledge(): Promise<number> {
        try {
            elizaLogger.info("Starting GitHub knowledge sync");
            const { owner, repo } = this.parseRepoUrl(this.repoUrl);

            // Get repository contents
            const { data: contents } = await this.octokit.repos.getContent({
                owner,
                repo,
                path: this.targetPath,
            });

            if (!Array.isArray(contents)) {
                throw new Error("Target path does not point to a directory");
            }

            let processedCount = 0;
            for (const item of contents) {
                if (item.type === "file" && item.name.endsWith(".md")) {
                    try {
                        // Get file content
                        const { data: fileData } = await this.octokit.repos.getContent({
                            owner,
                            repo,
                            path: item.path,
                        });

                        if ("content" in fileData) {
                            const content = Buffer.from(fileData.content, "base64").toString();
                            const contentHash = createHash("sha256")
                                .update(JSON.stringify({
                                    content,
                                    sha: fileData.sha // Include GitHub's SHA in the hash
                                }))
                                .digest("hex");

                            const knowledgeId = stringToUuid(
                                `github-${owner}-${repo}-${item.path}`
                            );

                            const existingDocument =
                                await this.runtime.documentsManager.getMemoryById(knowledgeId);

                            if (
                                existingDocument &&
                                existingDocument.content["hash"] === contentHash
                            ) {
                                elizaLogger.debug(`Skipping unchanged file: ${item.path}`);
                                continue;
                            }

                            elizaLogger.info(
                                `Processing knowledge for ${this.runtime.character.name} - ${item.path}`
                            );

                            await knowledge.set(this.runtime, {
                                id: knowledgeId,
                                content: {
                                    text: content,
                                    hash: contentHash,
                                    source: "github",
                                    attachments: [],
                                    metadata: {
                                        path: item.path,
                                        sha: fileData.sha,
                                        repository: `${owner}/${repo}`,
                                        url: item.html_url
                                    },
                                },
                            });

                            processedCount++;

                            // Add a small delay to avoid rate limiting
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    } catch (error) {
                        elizaLogger.error(`Error processing file ${item.path}:`, error);
                        continue;
                    }
                }
            }

            elizaLogger.success(`Finished syncing GitHub knowledge. Processed ${processedCount} files.`);
            return processedCount;
        } catch (error) {
            elizaLogger.error("Error in syncKnowledge:", error);
            return 0;
        }
    }
}