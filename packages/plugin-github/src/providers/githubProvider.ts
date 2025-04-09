import { Provider, IAgentRuntime, Memory, State, elizaLogger, AgentRuntime, knowledge, stringToUuid } from "@elizaos/core";
import { Octokit } from "@octokit/rest";
import { createHash } from "crypto";
import { DashboardState, DashboardConfig } from '../state/dashboard.js';
import { withRateLimit } from '../utils/rateLimit';
import { Cache } from '../utils/cache';

/**
 * Helper function to stringify any value for logging
 */
function logSafeStringify(value: any): string {
    try {
        if (typeof value === 'object' && value !== null) {
            return JSON.stringify(value);
        }
        return String(value);
    } catch (error) {
        return `[Could not stringify: ${typeof value}]`;
    }
}

// Create a cache for GitHub API responses
const githubCache = new Cache<any>(24 * 60 * 60 * 1000); // 24 hours TTL
let lastSyncTime: number = 0;
const SYNC_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

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

        // Get dashboard configuration from settings
        const dashboardConfig = {
            enabled: runtime.getSetting("DASHBOARD_ENABLED") === "true",
            statePath: runtime.getSetting("DASHBOARD_STATE_PATH")
        };

        // Initialize the GitHub client
        const client = await GitHubClient.create(
            token,
            repoUrl,
            targetPath,
            runtime as AgentRuntime,
            dashboardConfig
        );

        // Only sync if it's been more than 24 hours since last sync
        const now = Date.now();
        if (now - lastSyncTime > SYNC_INTERVAL) {
            elizaLogger.info('Starting GitHub sync - cache is older than 24 hours');
            const result = await client.syncKnowledge();
            lastSyncTime = now;
            return result;
        } else {
            elizaLogger.debug('Skipping GitHub sync - cache is still fresh');
            return 0; // Return 0 to indicate no new files were processed
        }
    }
};

export class GitHubClient {
    private octokit: Octokit;
    private runtime: AgentRuntime;
    private static instance: GitHubClient | null = null;
    private dashboardState: DashboardState;
    private cache: Cache<any>;

    private constructor(
        private token: string,
        private repoUrl: string,
        private targetPath: string,
        runtime: AgentRuntime,
        dashboardConfig?: DashboardConfig
    ) {
        this.octokit = new Octokit({
            auth: token,
            baseUrl: 'https://api.github.com',
            request: {
                timeout: 5000
            },
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        this.runtime = runtime;
        this.dashboardState = new DashboardState(dashboardConfig ?? {});
        this.cache = new Cache(15 * 60 * 1000); // 15 minutes TTL
    }

    static async create(
        token: string,
        repoUrl: string,
        targetPath: string,
        runtime: AgentRuntime,
        dashboardConfig?: DashboardConfig
    ): Promise<GitHubClient> {
        if (!GitHubClient.instance) {
            GitHubClient.instance = new GitHubClient(token, repoUrl, targetPath, runtime, dashboardConfig);
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
        const { owner, repo } = this.parseRepoUrl(this.repoUrl);
        let processedCount = 0;
        let totalFiles = 0;
        let skippedCount = 0;

        try {
            // Update initial state
            await this.dashboardState.updateSourceState({
                lastChecked: new Date().toISOString(),
                totalDocuments: 0,
                processedDocuments: 0,
                skippedDocuments: 0
            });

            // Recursive function to get all Markdown files from a directory and its subdirectories
            const getMarkdownFilesRecursively = async (path: string): Promise<any[]> => {
                elizaLogger.info(`Scanning directory: ${path}`);
                const response = await this.octokit.rest.repos.getContent({
                    owner,
                    repo,
                    path: path || '',
                    ref: 'main'
                });

                if (!Array.isArray(response.data)) {
                    // Single file case
                    if (response.data.type === 'file' && response.data.name.endsWith('.md')) {
                        elizaLogger.info(`Found single Markdown file: ${response.data.path}`);
                        return [response.data];
                    }
                    elizaLogger.info(`Found non-Markdown file: ${response.data.path || 'unknown path'}`);
                    return [];
                }

                // Initialize array to store all markdown files
                let allMarkdownFiles: any[] = [];

                // Filter for markdown files in current directory
                const markdownFiles = response.data.filter(file =>
                    file.type === 'file' && file.name.endsWith('.md')
                );

                if (markdownFiles.length > 0) {
                    elizaLogger.info(`Found ${markdownFiles.length} Markdown files in ${path}`, {
                        files: markdownFiles.map(f => f.path)
                    });
                    allMarkdownFiles = [...allMarkdownFiles, ...markdownFiles];
                } else {
                    elizaLogger.info(`No Markdown files found in ${path}`);
                }

                // Process subdirectories recursively
                const directories = response.data.filter(item => item.type === 'dir');
                elizaLogger.info(`Found ${directories.length} subdirectories in ${path}`, {
                    directories: directories.map(d => d.path)
                });

                for (const dir of directories) {
                    elizaLogger.info(`Processing subdirectory: ${dir.path}`);
                    const filesInSubdir = await getMarkdownFilesRecursively(dir.path);
                    elizaLogger.info(`Found ${filesInSubdir.length} Markdown files in subdirectory ${dir.path}`);
                    allMarkdownFiles = [...allMarkdownFiles, ...filesInSubdir];
                }

                elizaLogger.info(`Total Markdown files found in ${path} (including subdirectories): ${allMarkdownFiles.length}`);
                return allMarkdownFiles;
            };

            // Get all markdown files recursively
            const markdownFiles = await getMarkdownFilesRecursively(this.targetPath);
            totalFiles = markdownFiles.length;

            elizaLogger.info(`Found a total of ${totalFiles} Markdown files recursively from base path: ${this.targetPath}`, {
                fileList: markdownFiles.map(f => f.path).join(', ')
            });

            // Update total document count
            await this.dashboardState.updateSourceState({
                totalDocuments: totalFiles
            });

            // Process each file
            for (const file of markdownFiles) {
                const docId = stringToUuid(file.path);

                try {
                    // Get current document state if it exists
                    const currentState = await this.dashboardState.getDocumentState(docId);
                    const currentHash = currentState?.hash;

                    // Get file content
                    const contentResponse = await this.octokit.repos.getContent({
                        owner,
                        repo,
                        path: file.path
                    });

                    if ('content' in contentResponse.data) {
                        const content = Buffer.from(contentResponse.data.content, 'base64').toString();
                        const newHash = createHash('sha256').update(content).digest('hex');

                        // Skip if content hasn't changed
                        if (currentHash === newHash) {
                            elizaLogger.info(`Skipping unchanged file: ${file.path} (hash: ${newHash})`);
                            skippedCount++;
                            continue;
                        }

                        // Update document state to pending
                        await this.dashboardState.updateDocumentState(docId, {
                            path: file.path,
                            status: 'pending',
                            lastProcessed: new Date().toISOString()
                        });

                        elizaLogger.info(`Processing file: ${file.path} (hash: ${newHash})`);

                        // Create knowledge entry - let core handle chunking and processing
                        await knowledge.set(this.runtime, {
                            id: docId,
                            content: {
                                text: content,
                                hash: newHash,
                                source: 'github',
                                metadata: {
                                    path: file.path
                                }
                            }
                        });

                        elizaLogger.info(`Knowledge entry created for file: ${file.path} with ID: ${docId}`);
                        processedCount++;

                        // Update document state to processed
                        await this.dashboardState.updateDocumentState(docId, {
                            path: file.path,
                            status: 'processed',
                            lastProcessed: new Date().toISOString(),
                            hash: newHash
                        });

                        // Update source state with progress
                        await this.dashboardState.updateSourceState({
                            processedDocuments: processedCount,
                            skippedDocuments: skippedCount
                        });
                    } else {
                        elizaLogger.error(`File ${file.path} does not contain expected content field`, {
                            responseData: logSafeStringify(contentResponse.data)
                        });
                        throw new Error(`No content field in GitHub API response for ${file.path}`);
                    }
                } catch (error) {
                    // Update document state with error
                    await this.dashboardState.updateDocumentState(docId, {
                        path: file.path,
                        status: 'error',
                        error: error instanceof Error ? error.message : String(error),
                        lastProcessed: new Date().toISOString()
                    });

                    elizaLogger.error(`Error processing GitHub file: ${file.path}`, {
                        error: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : undefined
                    });
                }
            }

            // Final source state update
            await this.dashboardState.updateSourceState({
                lastChecked: new Date().toISOString(),
                totalDocuments: totalFiles,
                processedDocuments: processedCount,
                skippedDocuments: skippedCount
            });

            elizaLogger.info(`Sync complete: ${processedCount} files processed, ${skippedCount} files skipped, ${totalFiles} total files`);

            return processedCount;
        } catch (error) {
            // Update source state with error
            await this.dashboardState.updateSourceState({
                lastError: error instanceof Error ? error.message : String(error)
            });

            throw error;
        }
    }

    async getRepositoryContent(owner: string, repo: string, path: string): Promise<any> {
        const cacheKey = `content:${owner}/${repo}:${path}`;

        // First try to get from cache
        const cached = this.cache.get(cacheKey);
        if (cached) {
            elizaLogger.debug(`Cache hit for ${cacheKey}`);
            return cached;
        }

        try {
            // Use rate limiting for the API call with cache fallback
            const content = await withRateLimit(
                `github:${owner}/${repo}`,
                async () => {
                    const response = await this.octokit.repos.getContent({
                        owner,
                        repo,
                        path,
                    });
                    return response.data;
                },
                {
                    getCachedData: () => this.cache.get(cacheKey),
                    onRateLimit: () => {
                        elizaLogger.warn(`GitHub API rate limit hit for ${owner}/${repo}`);
                    }
                }
            );

            // Cache the successful response
            this.cache.set(cacheKey, content);
            return content;
        } catch (error) {
            elizaLogger.error(`Failed to fetch GitHub content for ${owner}/${repo}:${path}`, error);
            // Try to get expired cache as last resort
            const expiredCache = this.cache.get(cacheKey);
            if (expiredCache) {
                elizaLogger.info(`Using expired cache for ${cacheKey}`);
                return expiredCache;
            }
            throw error;
        }
    }

    // Add similar wrappers for other GitHub API methods
    async getRepository(owner: string, repo: string): Promise<any> {
        const cacheKey = `repo:${owner}/${repo}`;

        const cached = this.cache.get(cacheKey);
        if (cached) {
            elizaLogger.debug(`Cache hit for ${cacheKey}`);
            return cached;
        }

        try {
            const repoData = await withRateLimit(
                `github:${owner}/${repo}`,
                async () => {
                    const response = await this.octokit.repos.get({
                        owner,
                        repo,
                    });
                    return response.data;
                }
            );

            this.cache.set(cacheKey, repoData);
            return repoData;
        } catch (error) {
            elizaLogger.error(`Failed to fetch GitHub repository ${owner}/${repo}`, error);
            throw error;
        }
    }
}
