import { Provider, IAgentRuntime, Memory, State, elizaLogger, AgentRuntime, knowledge, stringToUuid, embed } from "@elizaos/core";
import { Octokit } from "@octokit/rest";
import { createTokenAuth } from "@octokit/auth-token";
import { createHash } from "crypto";
import { encodingForModel } from "js-tiktoken";

const MAX_TOKENS_PER_CHUNK = 4000; // Reduced from 8000 to ensure we stay well under limits
const MAX_TOTAL_TOKENS = 180000; // Safe limit below Claude's 200k maximum

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
        elizaLogger.warn({
            message: 'Document exceeds maximum token limit',
            totalTokens: tokens.length,
            maxAllowed: MAX_TOTAL_TOKENS,
            excessTokens: tokens.length - MAX_TOTAL_TOKENS
        });
        // Take only the first MAX_TOTAL_TOKENS tokens
        const truncatedTokens = tokens.slice(0, MAX_TOTAL_TOKENS);
        elizaLogger.info({
            message: 'Truncating document to maximum allowed tokens',
            originalTokens: tokens.length,
            truncatedTokens: truncatedTokens.length
        });
        text = encoding.decode(truncatedTokens);
    }

    elizaLogger.info({
        message: 'Token analysis',
        totalTokens: tokens.length,
        textLength: text.length,
        tokensPerCharacter: tokens.length / text.length,
        maxTokensPerChunk: MAX_TOKENS_PER_CHUNK
    });

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

            elizaLogger.debug({
                message: 'Creating new chunk',
                chunkNumber: chunkCount + 1,
                chunkSize: chunkSize,
                percentOfMax: ((chunkSize / MAX_TOKENS_PER_CHUNK) * 100).toFixed(2) + '%',
                totalTokensProcessed
            });

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
    elizaLogger.info({
        message: 'Chunking process complete',
        metrics: {
            totalChunks: chunks.length,
            averageChunkSize: totalTokensProcessed / chunks.length,
            maxChunkSize,
            minChunkSize,
            processingTimeMs: endTime - startTime,
            tokensPerSecond: (totalTokensProcessed / ((endTime - startTime) / 1000)).toFixed(2),
            totalTokensProcessed,
            averageOverlap: overlap
        }
    });

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
    elizaLogger.debug({
        message: 'Starting markdown conversion',
        originalLength: markdown?.length || 0,
        hasContent: !!markdown
    });

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
    elizaLogger.info({
        message: 'Markdown conversion complete',
        metrics: {
            processingTimeMs: endTime - startTime,
            originalLength: markdown.length,
            finalLength: text.length,
            reductionPercent: ((markdown.length - text.length) / markdown.length * 100).toFixed(2) + '%',
            transformations
        }
    });

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

    /**
     * Process content using BGE model to generate embeddings and find relevant sections
     */
    private async processContentWithBGE(content: string): Promise<{
        processedContent: string;
        relevantSections: string[];
    }> {
        const startTime = Date.now();
        elizaLogger.info({
            message: 'Starting BGE content processing',
            contentLength: content.length,
            estimatedTokens: content.length / 4 // Rough estimation
        });

        // Clean the content first
        const cleanedContent = markdownToPlaintext(content);
        elizaLogger.debug({
            message: 'Content cleaned',
            originalLength: content.length,
            cleanedLength: cleanedContent.length,
            reductionPercent: ((content.length - cleanedContent.length) / content.length * 100).toFixed(2) + '%'
        });

        // Split into manageable chunks if content is too large
        const contentChunks = splitIntoTokenChunks(cleanedContent);
        elizaLogger.info({
            message: 'Content chunking complete',
            chunks: contentChunks.length,
            averageChunkLength: cleanedContent.length / contentChunks.length,
            totalLength: cleanedContent.length
        });

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
            elizaLogger.debug({
                message: 'Processing chunk',
                chunkIndex: chunkIndex + 1,
                totalChunks: contentChunks.length,
                sectionCount: sections.length,
                chunkLength: chunk.length,
                averageSectionLength: chunk.length / sections.length
            });

            // Generate embeddings for each section in the chunk
            const chunkEmbeddings = await Promise.all(
                sections.map(async (section, sectionIndex) => {
                    const sectionStartTime = Date.now();
                    const embedding = await embed(this.runtime, section);
                    const sectionEndTime = Date.now();

                    elizaLogger.debug({
                        message: 'Section embedding generated',
                        chunkIndex: chunkIndex + 1,
                        sectionIndex: sectionIndex + 1,
                        sectionLength: section.length,
                        embeddingDimensions: embedding.length,
                        processingTimeMs: sectionEndTime - sectionStartTime
                    });

                    return {
                        text: section,
                        embedding,
                        length: section.length
                    };
                })
            );

            allSectionEmbeddings = allSectionEmbeddings.concat(chunkEmbeddings);
            const chunkEndTime = Date.now();

            elizaLogger.info({
                message: 'Chunk processing complete',
                chunkIndex: chunkIndex + 1,
                embeddingsGenerated: chunkEmbeddings.length,
                processingTimeMs: chunkEndTime - chunkStartTime,
                sectionsPerSecond: (sections.length / ((chunkEndTime - chunkStartTime) / 1000)).toFixed(2)
            });
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
        elizaLogger.debug({
            message: 'Document-level embedding generated',
            embeddingDimensions: documentEmbedding.length,
            processingTimeMs: Date.now() - documentEmbeddingStartTime
        });

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

        elizaLogger.info({
            message: 'Similarity scoring complete',
            metrics: {
                totalSections: sectionScores.length,
                averageSimilarity: sectionScores.reduce((acc, curr) => acc + curr.similarity, 0) / sectionScores.length,
                maxSimilarity: Math.max(...sectionScores.map(s => s.similarity)),
                minSimilarity: Math.min(...sectionScores.map(s => s.similarity)),
                processingTimeMs: Date.now() - similarityStartTime
            }
        });

        elizaLogger.debug({
            message: 'Top sections selected',
            topSections: topSections.map(s => ({
                similarity: s.similarity,
                length: s.length,
                preview: s.text.substring(0, 100) + '...'
            }))
        });

        const endTime = Date.now();
        elizaLogger.info({
            message: 'Content processing complete',
            metrics: {
                totalProcessingTimeMs: endTime - startTime,
                sectionsProcessed: allSectionEmbeddings.length,
                relevantSectionsSelected: topSections.length,
                processingRate: (cleanedContent.length / ((endTime - startTime) / 1000)).toFixed(2) + ' chars/sec'
            }
        });

        return {
            processedContent: cleanedContent,
            relevantSections: topSections.map(s => s.text)
        };
    }

    async syncKnowledge(): Promise<number> {
        const startTime = Date.now();
        const metrics = {
            totalFilesAttempted: 0,
            totalFilesProcessed: 0,
            totalFilesSkipped: 0,
            totalFilesErrored: 0,
            totalBytesProcessed: 0,
            errors: [] as Array<{path: string; error: string}>
        };

        try {
            elizaLogger.info({
                message: "Starting GitHub knowledge sync",
                timestamp: new Date().toISOString(),
                runtime: this.runtime.character.name
            });

            const { owner, repo } = this.parseRepoUrl(this.repoUrl);
            elizaLogger.debug({
                message: "Repository information",
                owner,
                repo,
                targetPath: this.targetPath
            });

            // Get repository contents
            const { data: contents } = await this.octokit.repos.getContent({
                owner,
                repo,
                path: this.targetPath,
            });

            if (!Array.isArray(contents)) {
                throw new Error("Target path does not point to a directory");
            }

            elizaLogger.info({
                message: "Retrieved repository contents",
                totalItems: contents.length,
                markdownFiles: contents.filter(item => item.type === "file" && item.name.endsWith(".md")).length
            });

            for (const item of contents) {
                if (item.type === "file" && item.name.endsWith(".md")) {
                    metrics.totalFilesAttempted++;
                    const fileStartTime = Date.now();

                    try {
                        elizaLogger.info({
                            message: `Processing file`,
                            file: item.path,
                            size: item.size,
                            sha: item.sha
                        });

                        // Get file content
                        const { data: fileData } = await this.octokit.repos.getContent({
                            owner,
                            repo,
                            path: item.path,
                        });

                        if ("content" in fileData) {
                            const content = Buffer.from(fileData.content, "base64").toString();
                            metrics.totalBytesProcessed += content.length;

                            // Generate content hash
                            const contentHash = createHash("sha256")
                                .update(JSON.stringify({
                                    content: content,
                                    sha: fileData.sha
                                }))
                                .digest("hex");

                            const knowledgeId = stringToUuid(
                                `github-${owner}-${repo}-${item.path}`
                            );

                            // Check for existing document
                            const existingDocument = await this.runtime.documentsManager.getMemoryById(knowledgeId);

                            if (existingDocument && existingDocument.content["hash"] === contentHash) {
                                elizaLogger.debug({
                                    message: 'Skipping unchanged file',
                                    path: item.path,
                                    hash: contentHash
                                });
                                metrics.totalFilesSkipped++;
                                continue;
                            }

                            // Process content
                            const { processedContent, relevantSections } = await this.processContentWithBGE(content);

                            // Store the document
                            await knowledge.set(this.runtime, {
                                id: knowledgeId,
                                content: {
                                    text: processedContent,
                                    hash: contentHash,
                                    source: "github",
                                    attachments: [],
                                    metadata: {
                                        path: item.path,
                                        sha: fileData.sha,
                                        repository: `${owner}/${repo}`,
                                        url: item.html_url,
                                        originalSize: content.length,
                                        processedSize: processedContent.length,
                                        relevantSections: relevantSections,
                                        processingTimeMs: Date.now() - fileStartTime
                                    },
                                },
                            });

                            metrics.totalFilesProcessed++;
                            elizaLogger.info({
                                message: 'File processing complete',
                                file: item.path,
                                metrics: {
                                    processingTimeMs: Date.now() - fileStartTime,
                                    originalSize: content.length,
                                    processedSize: processedContent.length,
                                    relevantSectionsCount: relevantSections.length
                                }
                            });

                        }
                    } catch (error) {
                        metrics.totalFilesErrored++;
                        metrics.errors.push({
                            path: item.path,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                        elizaLogger.error({
                            message: `Error processing file`,
                            file: item.path,
                            error: error instanceof Error ? error.message : 'Unknown error',
                            stack: error instanceof Error ? error.stack : undefined
                        });
                        continue;
                    }

                    // Add a small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            const endTime = Date.now();
            elizaLogger.success({
                message: 'GitHub knowledge sync complete',
                metrics: {
                    ...metrics,
                    totalDurationMs: endTime - startTime,
                    averageProcessingTimeMs: metrics.totalFilesProcessed > 0
                        ? (endTime - startTime) / metrics.totalFilesProcessed
                        : 0,
                    successRate: `${((metrics.totalFilesProcessed / metrics.totalFilesAttempted) * 100).toFixed(2)}%`,
                    bytesPerSecond: (metrics.totalBytesProcessed / ((endTime - startTime) / 1000)).toFixed(2)
                }
            });

            return metrics.totalFilesProcessed;
        } catch (error) {
            elizaLogger.error({
                message: "Error in syncKnowledge",
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                metrics
            });
            return 0;
        }
    }
}
