import { Provider, IAgentRuntime, Memory, State, elizaLogger, AgentRuntime, knowledge, stringToUuid, embed } from "@elizaos/core";
import { Octokit } from "@octokit/rest";
import { createTokenAuth } from "@octokit/auth-token";
import { createHash } from "crypto";
import { encodingForModel } from "js-tiktoken";
import { DashboardState, DashboardConfig } from '../state/dashboard.js';

const MAX_TOKENS_PER_CHUNK = 4000; // Reduced from 8000 to ensure we stay well under limits
const MAX_TOTAL_TOKENS = 180000; // Safe limit below Claude's 200k maximum

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

/**
 * Split text into chunks that respect token limits
 */
function splitIntoTokenChunks(text: string): string[] {
    const startTime = Date.now();
    elizaLogger.debug('Starting token chunking process');

    const encoding = encodingForModel("gpt-4");
    const tokens = encoding.encode(text);

    // Early check for total token count
    if (tokens.length > MAX_TOTAL_TOKENS) {
        elizaLogger.warn(`Document exceeds maximum token limit: ${tokens.length} tokens (max: ${MAX_TOTAL_TOKENS})`);
        // Take only the first MAX_TOTAL_TOKENS tokens
        const truncatedTokens = tokens.slice(0, MAX_TOTAL_TOKENS);
        elizaLogger.info(`Truncating document to maximum allowed tokens: original: ${tokens.length}, truncated: ${truncatedTokens.length}`);
        text = encoding.decode(truncatedTokens);
    }

    elizaLogger.info(`Token analysis: ${tokens.length} tokens, ${text.length} chars, ${(tokens.length / text.length).toFixed(3)} tokens per char`);

    const chunks: string[] = [];
    let currentChunk: number[] = [];
    let chunkCount = 0;
    let maxChunkSize = 0;
    let minChunkSize = Number.MAX_SAFE_INTEGER;
    let totalTokensProcessed = 0;

    // Process tokens with overlap for context preservation
    const overlap = 100; // Number of tokens to overlap between chunks
    for (const token of tokens) {
        if (currentChunk.length >= MAX_TOKENS_PER_CHUNK) {
            const chunkSize = currentChunk.length;
            maxChunkSize = Math.max(maxChunkSize, chunkSize);
            minChunkSize = Math.min(minChunkSize, chunkSize);

            elizaLogger.debug(`Creating chunk ${chunkCount + 1}: ${chunkSize} tokens (${((chunkSize / MAX_TOKENS_PER_CHUNK) * 100).toFixed(1)}% of max)`);

            chunks.push(encoding.decode(currentChunk));
            // Keep overlap tokens for context
            currentChunk = currentChunk.slice(-overlap);
            chunkCount++;
        }
        currentChunk.push(token);
        totalTokensProcessed++;
    }

    if (currentChunk.length > overlap) {
        const finalChunkSize = currentChunk.length;
        maxChunkSize = Math.max(maxChunkSize, finalChunkSize);
        minChunkSize = Math.min(minChunkSize, finalChunkSize);
        chunks.push(encoding.decode(currentChunk));
        chunkCount++;
    }

    const endTime = Date.now();
    elizaLogger.info(`Chunking complete: ${chunks.length} chunks, avg: ${Math.round(totalTokensProcessed / chunks.length)} tokens/chunk, ${endTime - startTime}ms`);

    return chunks;
}

/**
 * Calculate cosine similarity between two vectors with detailed logging
 */
function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        elizaLogger.warn({
            message: 'Vector length mismatch in similarity calculation',
            vectorALength: a.length,
            vectorBLength: b.length
        });
        throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));

    elizaLogger.debug({
        message: 'Similarity calculation',
        metrics: {
            dotProduct,
            normA: Math.sqrt(normA),
            normB: Math.sqrt(normB),
            similarity
        }
    });

    return similarity;
}

/**
 * Converts markdown text to plaintext with detailed logging
 */
function markdownToPlaintext(markdown: string): string {
    const startTime = Date.now();
    elizaLogger.debug(`Starting markdown conversion: ${markdown?.length || 0} chars`);

    if (!markdown || typeof markdown !== 'string') {
        elizaLogger.warn('Invalid markdown content received');
        return '';
    }

    let text = markdown;
    const transformations: Record<string, number> = {};

    // Track each transformation
    const trackTransformation = (name: string, before: string, after: string) => {
        transformations[name] = before.length - after.length;
        return after;
    };

    // Remove code blocks but preserve content
    text = trackTransformation(
        'codeBlocks',
        text,
        text.replace(/```[\s\S]*?```/g, (match) => match.slice(3, -3).trim())
    );

    // Remove inline code
    text = trackTransformation(
        'inlineCode',
        text,
        text.replace(/`([^`]+)`/g, '$1')
    );

    // Remove headers while preserving content
    text = trackTransformation(
        'headers',
        text,
        text.replace(/^#{1,6}\s+(.*)$/gm, '$1')
    );

    // Remove formatting markers
    text = trackTransformation(
        'formatting',
        text,
        text.replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
    );

    // Process other markdown elements...
    // [Additional transformations remain the same]

    const endTime = Date.now();

    const transformationStr = Object.entries(transformations)
        .map(([name, reduction]) => `${name}: -${reduction}`)
        .join(', ');

    elizaLogger.info(`Markdown conversion complete: ${markdown.length} → ${text.length} chars (${((markdown.length - text.length) / markdown.length * 100).toFixed(1)}% reduction), time: ${endTime - startTime}ms, changes: ${transformationStr}`);

    return text.trim();
}

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

        return client.syncKnowledge();
    }
};

export class GitHubClient {
    private octokit: Octokit;
    private runtime: AgentRuntime;
    private static instance: GitHubClient | null = null;
    private dashboardState: DashboardState;

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

    /**
     * Process content using BGE model to generate embeddings and find relevant sections
     */
    private async processContentWithBGE(content: string): Promise<{
        processedContent: string;
        relevantSections: string[];
    }> {
        const startTime = Date.now();
        elizaLogger.info(`Starting BGE content processing - content length: ${content.length}, estimated tokens: ${Math.round(content.length / 4)}`);

        // Clean the content first
        const cleanedContent = markdownToPlaintext(content);
        elizaLogger.info(`Content cleaned - original length: ${content.length}, cleaned length: ${cleanedContent.length}, reduction: ${((content.length - cleanedContent.length) / content.length * 100).toFixed(2)}%`);

        // Split into manageable chunks if content is too large
        const contentChunks = splitIntoTokenChunks(cleanedContent);
        elizaLogger.info(`Content chunking complete - ${contentChunks.length} chunks created, average length: ${Math.round(cleanedContent.length / contentChunks.length)}, total length: ${cleanedContent.length}`);

        let allSectionEmbeddings: Array<{
            text: string;
            embedding: number[];
            length: number;
        }> = [];

        // Process each chunk
        for (const [chunkIndex, chunk] of contentChunks.entries()) {
            const chunkStartTime = Date.now();

            // Split chunk into sections
            const sections = chunk.split('\n\n').filter(s => s.trim().length > 0);
            elizaLogger.info(`Processing chunk ${chunkIndex + 1} of ${contentChunks.length} - ${sections.length} sections, avg section length: ${Math.round(chunk.length / sections.length)}`);

            // Generate embeddings for each section in the chunk
            const chunkEmbeddings = await Promise.all(
                sections.map(async (section, sectionIndex) => {
                    const sectionStartTime = Date.now();
                    const embedding = await embed(this.runtime, section);
                    const sectionEndTime = Date.now();

                    elizaLogger.info(`Section ${sectionIndex + 1} embedding generated - length: ${section.length}, dimensions: ${embedding.length}, time: ${sectionEndTime - sectionStartTime}ms`);

                    return {
                        text: section,
                        embedding,
                        length: section.length
                    };
                })
            );

            allSectionEmbeddings = allSectionEmbeddings.concat(chunkEmbeddings);
            const chunkEndTime = Date.now();

            elizaLogger.info(`Chunk ${chunkIndex + 1} processing complete - ${chunkEmbeddings.length} embeddings, ${(chunkEndTime - chunkStartTime)}ms, ${(sections.length / ((chunkEndTime - chunkStartTime) / 1000)).toFixed(2)} sections/sec`);
        }

        if (allSectionEmbeddings.length === 0) {
            elizaLogger.warn('No sections found for embedding generation');
            return {
                processedContent: cleanedContent,
                relevantSections: []
            };
        }

        // Generate embedding for entire document (using first chunk as representative)
        const documentEmbeddingStartTime = Date.now();
        const documentEmbedding = await embed(this.runtime, contentChunks[0]);
        elizaLogger.info(`Document-level embedding generated - dimensions: ${documentEmbedding.length}, time: ${Date.now() - documentEmbeddingStartTime}ms`);

        // Calculate similarity scores
        const similarityStartTime = Date.now();
        const sectionScores = allSectionEmbeddings.map((section, index) => {
            const similarity = cosineSimilarity(documentEmbedding, section.embedding);
            return {
                index,
                text: section.text,
                similarity,
                length: section.length
            };
        });

        // Sort sections by similarity and take top 5
        const topSections = sectionScores
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 5);

        const avgSimilarity = sectionScores.reduce((acc, curr) => acc + curr.similarity, 0) / sectionScores.length;
        const maxSimilarity = Math.max(...sectionScores.map(s => s.similarity));
        const minSimilarity = Math.min(...sectionScores.map(s => s.similarity));

        elizaLogger.info(`Similarity scoring complete - ${sectionScores.length} sections scored, avg: ${avgSimilarity.toFixed(4)}, max: ${maxSimilarity.toFixed(4)}, min: ${minSimilarity.toFixed(4)}, time: ${Date.now() - similarityStartTime}ms`);

        const topSectionPreviews = topSections.map(s => ({
            similarity: s.similarity.toFixed(4),
            length: s.length,
            preview: s.text.substring(0, 50) + '...'
        }));

        elizaLogger.info(`Top sections selected: ${JSON.stringify(topSectionPreviews)}`);

        const endTime = Date.now();
        elizaLogger.info(`Content processing complete - total time: ${endTime - startTime}ms, sections: ${allSectionEmbeddings.length}, relevant: ${topSections.length}, processing rate: ${(cleanedContent.length / ((endTime - startTime) / 1000)).toFixed(2)} chars/sec`);

        return {
            processedContent: cleanedContent,
            relevantSections: topSections.map(s => s.text)
        };
    }

    async syncKnowledge(): Promise<number> {
        const { owner, repo } = this.parseRepoUrl(this.repoUrl);
        let processedCount = 0;
        let totalFiles = 0;

        try {
            // Update initial state
            await this.dashboardState.updateSourceState({
                lastChecked: new Date().toISOString(),
                totalDocuments: 0,
                processedDocuments: 0
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
                    // Update document state to pending
                    await this.dashboardState.updateDocumentState(docId, {
                        path: file.path,
                        status: 'pending',
                        lastProcessed: new Date().toISOString()
                    });

                    elizaLogger.info(`Processing file: ${file.path}`);

                    // Get file content
                    try {
                        const contentResponse = await this.octokit.repos.getContent({
                            owner,
                            repo,
                            path: file.path
                        });

                        if ('content' in contentResponse.data) {
                            const content = Buffer.from(contentResponse.data.content, 'base64').toString();
                            elizaLogger.info(`Successfully retrieved content for file: ${file.path} (${content.length} characters)`);

                            // Process the content
                            const { processedContent, relevantSections } = await this.processContentWithBGE(content);
                            elizaLogger.info(`Content processed for file: ${file.path}, identified ${relevantSections.length} relevant sections`);

                            // Create knowledge entry
                            await knowledge.set(this.runtime, {
                                id: docId,
                                content: {
                                    text: processedContent,
                                    source: 'github',
                                    metadata: {
                                        path: file.path,
                                        sections: relevantSections
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
                                hash: createHash('md5').update(content).digest('hex')
                            });

                            // Update source state with progress
                            await this.dashboardState.updateSourceState({
                                processedDocuments: processedCount
                            });
                        } else {
                            elizaLogger.error(`File ${file.path} does not contain expected content field`, {
                                responseData: logSafeStringify(contentResponse.data)
                            });
                            throw new Error(`No content field in GitHub API response for ${file.path}`);
                        }
                    } catch (contentError) {
                        elizaLogger.error(`Error retrieving content for file: ${file.path}`, {
                            error: contentError instanceof Error ? contentError.message : String(contentError),
                            stack: contentError instanceof Error ? contentError.stack : undefined
                        });
                        throw contentError;
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
                processedDocuments: processedCount
            });

            return processedCount;
        } catch (error) {
            // Update source state with error
            await this.dashboardState.updateSourceState({
                lastError: error instanceof Error ? error.message : String(error)
            });

            throw error;
        }
    }
}
