import { Service, IAgentRuntime, Memory, UUID, ServiceType, embed } from "@elizaos/core";
import { BroadcastDB } from "../db/operations";
import { createBroadcastMessage } from "../actions/createMessage/service";
import { spawn } from "child_process";
import * as path from "path";

export class AutoBroadcastService extends Service {
    private runtime: IAgentRuntime;
    private db: BroadcastDB;
    private checkInterval: NodeJS.Timeout | null = null;
    private static isInitialized: boolean = false;
    private goalEmbeddings: number[][] = [];
    private alignmentThreshold: number = 0.6;
    private dashboardProcess: any = null;

    static get serviceType(): ServiceType {
        return ServiceType.BACKGROUND;
    }

    constructor() {
        super();
    }

    async initialize(runtime: IAgentRuntime): Promise<void> {
        // Prevent multiple initializations
        if (AutoBroadcastService.isInitialized) {
            console.log("⚠️ AutoBroadcastService already initialized, skipping...");
            return;
        }
        
        this.runtime = runtime;
        this.db = new BroadcastDB(runtime.databaseAdapter.db);
        
        // Initialize goal embeddings for alignment checking
        await this.initializeGoalEmbeddings();
        
        console.log("🚀 AutoBroadcastService initialized - using unified broadcast creation system");
        console.log("📌 All broadcasts now created via: create-broadcasts.js");

        // Note: Dashboard auto-start disabled due to ES module compatibility
        console.log("📊 To start the broadcast dashboard manually, run: ./start-broadcast-system.sh");
        console.log("📊 Dashboard will be available at: http://localhost:3002/broadcast-dashboard.html");
        
        AutoBroadcastService.isInitialized = true;
        
        // DISABLED: Using cron job instead to avoid duplication
        // The cron job runs create-broadcasts.js on a schedule
        // No need for AutoBroadcastService to also run the same script

        // this.checkInterval = setInterval(() => {
        //     this.checkForNewDocuments();
        // }, 30 * 60 * 1000);

        // setTimeout(() => this.checkForNewDocuments(), 5000);

        console.log("📌 AutoBroadcastService disabled - using cron job for broadcast creation");
    }

    async checkForNewDocuments(): Promise<void> {
        try {
            console.log("🔍 AutoBroadcastService: Triggering unified broadcast creation...");

            // Use the unified broadcast creation system
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execPromise = promisify(exec);

            // Call the unified create-broadcasts script with a limit of 10
            const { stdout, stderr } = await execPromise('node create-broadcasts.js 10', {
                cwd: '/Users/davidlockie/Documents/Projects/Eliza'
            });

            if (stdout) {
                console.log("📢 Unified broadcast creation output:", stdout);
            }
            if (stderr) {
                console.error("⚠️ Unified broadcast creation warnings:", stderr);
            }

            return; // Exit early - we're using the unified system now

            // THIS CODE IS NOW OBSOLETE - Using unified create-broadcasts.js instead
            // The code below is kept for reference but will not execute

            // Filter for documents that are actually from knowledge sources
            const knowledgeDocs = allDocs.filter(doc => {
                const content = doc.content;

                // More lenient check - if it has substantial text content, consider it
                const hasContent = content.text && content.text.length > 100;

                // Check various indicators of knowledge content
                const isKnowledge = hasContent && (
                    content.source === 'github' ||
                    content.source === 'obsidian' ||
                    content.type === 'knowledge' ||
                    content.text.includes('title:') || // Common in knowledge docs
                    content.text.includes('source:') || // Common in knowledge docs
                    (content.metadata && content.metadata.path)
                );
                
                // Don't filter by time for now since timestamps seem wrong
                // Just rely on the database check to avoid duplicates
                
                return isKnowledge;
            });
            
            console.log(`Found ${knowledgeDocs.length} recent knowledge documents`);
            
            let broadcastsCreated = 0;
            let broadcastsSkipped = 0;
            
            for (const doc of knowledgeDocs) {
                // Check if this document already has a broadcast
                const existingBroadcast = this.db.getBroadcastByDocumentId(doc.id);
                if (existingBroadcast) {
                    broadcastsSkipped++;
                    continue;
                }
                
                // Check if document is substantial enough
                const text = doc.content.text || '';
                if (text.length < 100) {
                    console.log(`Document ${doc.id} too short (${text.length} chars), skipping`);
                    continue;
                }
                
                // Clean roleplay elements and check for test/draft content
                const cleanedText = this.cleanRoleplayElements(text);
                const title = this.extractTitle(doc);
                
                if (/test|draft|cache/i.test(title)) {
                    console.log(`Skipping doc "${title}" (unwanted title)`);
                    continue;
                }
                
                // Check alignment with character goals
                const alignmentScore = await this.calculateAlignment(cleanedText);
                
                if (alignmentScore < this.alignmentThreshold) {
                    console.log(`Skipping doc "${title}" (alignment score: ${alignmentScore.toFixed(2)} < ${this.alignmentThreshold})`);
                    continue;
                }
                
                console.log(`Creating broadcasts for document ${doc.id} (alignment: ${alignmentScore.toFixed(2)})`);
                
                // Create broadcast messages for both Telegram AND Twitter
                const clients = ['telegram', 'twitter'];
                let clientBroadcastsCreated = 0;
                
                for (const client of clients) {
                    const result = await createBroadcastMessage(
                        this.runtime,
                        {
                            documentId: doc.id,
                            client: client,
                            maxLength: client === 'telegram' ? 2000 : 280  // Remove length limits for better content
                        },
                        this.db
                    );
                    
                    if (result.success) {
                        // Update the broadcast with the actual alignment score
                        this.db.db.prepare(
                            `UPDATE broadcasts SET alignment_score = ? WHERE id = ?`
                        ).run(alignmentScore, result.broadcastId);
                        
                        clientBroadcastsCreated++;
                        console.log(`✅ Created ${client} broadcast ${result.broadcastId} for document ${doc.id}`);
                    } else {
                        console.log(`❌ Failed to create ${client} broadcast for document ${doc.id}: ${result.error}`);
                    }
                }
                
                broadcastsCreated += clientBroadcastsCreated;
            }
            
            if (broadcastsCreated > 0) {
                console.log(`📢 Created ${broadcastsCreated} new broadcasts`);
            }
            if (broadcastsSkipped > 0) {
                console.log(`⏭️  Skipped ${broadcastsSkipped} already-broadcasted documents`);
            }
            
        } catch (error) {
            console.error("Error in AutoBroadcastService:", error);
        }
    }

    async cleanup(): Promise<void> {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        
        // Stop the dashboard process if it's running
        if (this.dashboardProcess) {
            this.dashboardProcess.kill();
            this.dashboardProcess = null;
            console.log("🛑 Broadcast dashboard stopped");
        }
    }

    private async startBroadcastDashboard(): Promise<void> {
        try {
            // Check if dashboard is already running on port 3002
            const portInUse = await this.isPortInUse(3002);
            if (portInUse) {
                console.log("📊 Broadcast dashboard already running on port 3002");
                return;
            }

            // Find the project root (where broadcast-api-simple.js is located)
            const projectRoot = this.findProjectRoot();
            if (!projectRoot) {
                console.error("❌ Could not find project root for broadcast dashboard");
                return;
            }

            const dashboardScript = path.join(projectRoot, "broadcast-api-simple.js");
            
            console.log("🚀 Starting broadcast dashboard...");
            
            // Start the dashboard process
            this.dashboardProcess = spawn("node", [dashboardScript], {
                cwd: projectRoot,
                stdio: ["ignore", "pipe", "pipe"],
                env: {
                    ...process.env,
                    BROADCAST_API_PORT: "3002",
                    ELIZA_ACTION_PORT: "3005" // Match the agent port
                }
            });

            this.dashboardProcess.stdout.on("data", (data: Buffer) => {
                console.log(`📊 Dashboard: ${data.toString().trim()}`);
            });

            this.dashboardProcess.stderr.on("data", (data: Buffer) => {
                console.error(`📊 Dashboard Error: ${data.toString().trim()}`);
            });

            this.dashboardProcess.on("close", (code: number) => {
                console.log(`📊 Dashboard process exited with code ${code}`);
                this.dashboardProcess = null;
            });

            // Give it a moment to start
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            console.log("✅ Broadcast dashboard started on http://localhost:3002/broadcast-dashboard.html");
            
        } catch (error) {
            console.error("❌ Failed to start broadcast dashboard:", error);
        }
    }

    private findProjectRoot(): string | null {
        let currentDir = __dirname;
        
        // Go up directories until we find broadcast-api-simple.js
        for (let i = 0; i < 10; i++) {
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) break; // Reached root
            
            currentDir = parentDir;
            
            // Check for broadcast-api-simple.js
            try {
                // Use dynamic import for fs in ES module context
                import("fs").then(fs => {
                    const broadcastApiPath = path.join(currentDir, "broadcast-api-simple.js");
                    if (fs.existsSync(broadcastApiPath)) {
                        return currentDir;
                    }
                }).catch(() => {
                    // Continue searching
                });
            } catch (error) {
                // Continue searching
            }
        }
        
        return null;
    }

    private async isPortInUse(port: number): Promise<boolean> {
        try {
            const { createServer } = await import("net");
            return new Promise((resolve) => {
                const server = createServer();
                
                server.listen(port, () => {
                    server.once("close", () => resolve(false));
                    server.close();
                });
                
                server.on("error", () => resolve(true));
            });
        } catch (error) {
            console.error("Error checking port:", error);
            return false; // Assume port is free if we can't check
        }
    }

    private async initializeGoalEmbeddings(): Promise<void> {
        // Extract goal statements from character
        const character = this.runtime.character as any;
        const goalStatements: string[] = [];
        
        // Add mission and vision if present (from character file)
        if (character.mission) goalStatements.push(character.mission);
        if (character.vision) goalStatements.push(character.vision);
        
        // Add explicit goals (from character file)
        if (character.goals) {
            goalStatements.push(...character.goals);
        }
        
        // Add bio and topics
        goalStatements.push(...(character.bio || []));
        goalStatements.push(...(character.topics || []));

        // Add specific alignment statements for content filtering
        goalStatements.push(
            "innovations that solve humanity's biggest problems",
            "technologies that create a more humane and beautiful future",
            "biomimetic innovation and nature-inspired design",
            "regenerative technologies and circular economy",
            "breakthrough discoveries that expand human potential",
            "solutions that harmonize technology with natural systems"
        );

        console.log(`Initializing alignment with ${goalStatements.length} goal statements`);
        
        // Generate embeddings for each goal
        this.goalEmbeddings = await Promise.all(
            goalStatements.map(text => embed(this.runtime, text))
        );
    }

    private async calculateAlignment(text: string): Promise<number> {
        if (this.goalEmbeddings.length === 0) {
            console.warn("No goal embeddings available, using default alignment");
            return 0.8;
        }

        // Generate embedding for the document
        const docEmbedding = await embed(this.runtime, text);
        
        // Calculate cosine similarity with each goal
        const similarities = this.goalEmbeddings.map(goalVec => 
            this.cosineSimilarity(goalVec, docEmbedding)
        );
        
        // Return the maximum similarity score
        return Math.max(...similarities);
    }

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        let dot = 0.0;
        let normA = 0.0;
        let normB = 0.0;
        for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    private cleanRoleplayElements(text: string): string {
        // Remove text between asterisks (roleplay actions)
        let cleaned = text.replace(/\*[^*]+\*/g, '');
        // Trim extra whitespace and normalize spaces
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        return cleaned;
    }

    private extractTitle(doc: Memory): string {
        const content = doc.content;
        
        // Try to extract title from various sources
        if (content.metadata?.frontmatter?.title) {
            return content.metadata.frontmatter.title;
        }
        
        // Look for title in the text itself
        const titleMatch = content.text?.match(/title:\s*([^\n]+)/i);
        if (titleMatch) {
            return titleMatch[1].trim();
        }
        
        // Fallback to first line or portion of text
        if (content.text) {
            const firstLine = content.text.split('\n')[0];
            return firstLine.substring(0, 60) + (firstLine.length > 60 ? '...' : '');
        }
        
        return 'Untitled';
    }
}

export const autoBroadcastService = new AutoBroadcastService();