import { promises as fs } from 'fs';
import path from 'path';
import proper from 'proper-lockfile';
import { elizaLogger } from "@elizaos/core";

export interface GitHubSourceState {
    lastChecked: string;
    totalDocuments: number;
    processedDocuments: number;
    lastError?: string;
}

export interface GitHubDocumentState {
    path: string;
    lastProcessed?: string;
    status: 'pending' | 'processed' | 'error';
    error?: string;
    hash?: string;
}

export interface DashboardConfig {
    enabled?: boolean;
    statePath?: string;
}

export class DashboardState {
    private enabled: boolean;
    private basePath: string;

    constructor(config: DashboardConfig) {
        this.enabled = config.enabled ?? false;

        // Handle relative vs absolute paths
        const statePath = config.statePath ?? '.eliza/rag-state';
        this.basePath = path.isAbsolute(statePath)
            ? statePath
            : path.join(process.cwd(), statePath);

        elizaLogger.info(`Dashboard state tracking ${this.enabled ? 'enabled' : 'disabled'} - base path: ${this.basePath}`);

        if (this.enabled) {
            // Ensure base path exists with proper permissions
            fs.mkdir(this.basePath, { recursive: true, mode: 0o755 })
                .then(() => {
                    elizaLogger.info(`Dashboard directory created at ${this.basePath}`);

                    // Also ensure subdirectories exist
                    return Promise.all([
                        fs.mkdir(path.join(this.basePath, 'sources'), { recursive: true, mode: 0o755 }),
                        fs.mkdir(path.join(this.basePath, 'documents/github'), { recursive: true, mode: 0o755 })
                    ]);
                })
                .then(() => {
                    elizaLogger.info(`Dashboard subdirectories created successfully`);
                })
                .catch(error => {
                    elizaLogger.error(`Failed to create dashboard directory: ${error.message}`);
                });
        } else {
            elizaLogger.info(`Dashboard state tracking disabled - using config: ${JSON.stringify(config)}`);
        }
    }

    async updateSourceState(update: Partial<GitHubSourceState>): Promise<void> {
        if (!this.enabled) return;

        const filePath = path.join(this.basePath, 'sources/github.json');
        await this.writeStateFile(filePath, update);
    }

    async updateDocumentState(docId: string, state: GitHubDocumentState): Promise<void> {
        if (!this.enabled) return;

        const filePath = path.join(this.basePath, 'documents/github', `${docId}.json`);
        await this.writeStateFile(filePath, state);
    }

    private async writeStateFile(filePath: string, data: any): Promise<void> {
        if (!this.enabled) {
            elizaLogger.debug(`Dashboard disabled, skipping write to ${filePath}`);
            return;
        }

        try {
            // Create a test file to verify write access
            const testFile = path.join(this.basePath, '.write-test');
            try {
                await fs.writeFile(testFile, 'test', { flag: 'w' });
                await fs.unlink(testFile);
                elizaLogger.debug(`Write access verified to ${this.basePath}`);
            } catch (writeTestError) {
                elizaLogger.error(`No write access to dashboard directory: ${writeTestError.message}`);
                return; // Exit early if we can't write
            }

            // Ensure directory exists
            const dirPath = path.dirname(filePath);
            elizaLogger.debug(`Ensuring directory exists: ${dirPath}`);
            await fs.mkdir(dirPath, { recursive: true, mode: 0o755 });

            // Read existing state if any
            let currentState = {};
            try {
                const existing = await fs.readFile(filePath, 'utf-8');
                currentState = JSON.parse(existing);
                elizaLogger.debug(`Read existing state from ${filePath}`);
            } catch (error) {
                // File might not exist yet, that's fine
                elizaLogger.debug(`No existing state file found at ${filePath} - creating new file`);
            }

            // Create an empty file if it doesn't exist to allow locking
            try {
                await fs.writeFile(filePath, JSON.stringify(currentState), { flag: 'wx' });
                elizaLogger.debug(`Created new state file: ${filePath}`);
            } catch (createError) {
                // File likely exists, which is fine
            }

            // Acquire lock before writing
            let release;
            try {
                elizaLogger.debug(`Acquiring lock for file: ${filePath}`);
                release = await proper.lock(filePath, {
                    retries: 5,
                    stale: 20000 // Consider lock stale after 20s
                });

                const newState = {
                    ...currentState,
                    ...data,
                    lastUpdated: new Date().toISOString()
                };

                elizaLogger.debug(`Writing state file: ${filePath}`);
                await fs.writeFile(filePath, JSON.stringify(newState, null, 2));
                elizaLogger.info(`Updated dashboard state at ${filePath}`);
            } catch (lockError) {
                elizaLogger.error(`Failed to acquire lock for file ${filePath}: ${lockError.message}`);

                // Fallback: Try to write without lock if locking failed
                try {
                    const newState = {
                        ...currentState,
                        ...data,
                        lastUpdated: new Date().toISOString(),
                        noLock: true
                    };

                    elizaLogger.debug(`Writing state file without lock: ${filePath}`);
                    await fs.writeFile(filePath, JSON.stringify(newState, null, 2));
                    elizaLogger.info(`Updated dashboard state (without lock) at ${filePath}`);
                } catch (fallbackError) {
                    elizaLogger.error(`Fallback write failed for ${filePath}: ${fallbackError.message}`);
                }
            } finally {
                if (release) {
                    try {
                        await release();
                        elizaLogger.debug(`Released lock for file: ${filePath}`);
                    } catch (releaseError) {
                        elizaLogger.warn(`Failed to release lock: ${releaseError.message}`);
                    }
                }
            }
        } catch (error) {
            elizaLogger.warn(`Failed to write dashboard state to ${filePath}: ${error.message}`);
            // Don't throw - dashboard failures shouldn't affect main functionality
        }
    }
}