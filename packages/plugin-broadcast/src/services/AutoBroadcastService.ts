import { Service, IAgentRuntime, Memory, UUID, ServiceType, embed } from "@elizaos/core";
import { BroadcastDB } from "../db/operations";
import { createBroadcastMessage } from "../actions/createMessage/service";

export class AutoBroadcastService extends Service {
    private runtime: IAgentRuntime;
    private db: BroadcastDB;
    private checkInterval: NodeJS.Timeout | null = null;
    private static isInitialized: boolean = false;
    private goalEmbeddings: number[][] = [];
    private alignmentThreshold: number = 0.6;

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
        
        console.log("🚀 AutoBroadcastService initialized with alignment checking");
        AutoBroadcastService.isInitialized = true;
        
        // Check for new documents every 30 minutes
        this.checkInterval = setInterval(() => {
            this.checkForNewDocuments();
        }, 30 * 60 * 1000);
        
        // Also check immediately on startup
        setTimeout(() => this.checkForNewDocuments(), 5000);
    }

    async checkForNewDocuments(): Promise<void> {
        try {
            console.log("🔍 Checking for new documents to broadcast...");
            
            // Try getting knowledge documents directly
            const knowledgeMemories = await this.runtime.knowledgeManager.getMemories({
                roomId: this.runtime.agentId as UUID,
                count: 100, // Check more documents
            });
            
            console.log(`Total knowledge memories: ${knowledgeMemories.length}`);
            
            // Also try documentsManager
            const recentDocs = await this.runtime.documentsManager.getMemories({
                roomId: this.runtime.agentId as UUID,
                count: 100,
            });
            
            console.log(`Total documents retrieved: ${recentDocs.length}`);
            
            // Combine both sources
            const allDocs = [...knowledgeMemories, ...recentDocs];
            console.log(`Combined total: ${allDocs.length} documents`);
            
            if (allDocs.length > 0) {
                console.log(`Sample document:`, {
                    type: allDocs[0].content?.type,
                    source: allDocs[0].content?.source,
                    text: allDocs[0].content?.text?.substring(0, 100),
                    createdAt: allDocs[0].createdAt
                });
            }
            
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
                
                console.log(`Creating broadcast for document ${doc.id} (alignment: ${alignmentScore.toFixed(2)})`);
                
                // Create broadcast message for Telegram with actual alignment score
                const result = await createBroadcastMessage(
                    this.runtime,
                    {
                        documentId: doc.id,
                        client: 'telegram',
                        maxLength: 1000
                    },
                    this.db
                );
                
                if (result.success) {
                    // Update the broadcast with the actual alignment score
                    this.db.db.prepare(
                        `UPDATE broadcasts SET alignment_score = ? WHERE id = ?`
                    ).run(alignmentScore, result.broadcastId);
                    
                    broadcastsCreated++;
                    console.log(`✅ Created broadcast ${result.broadcastId} for document ${doc.id}`);
                } else {
                    console.log(`❌ Failed to create broadcast for document ${doc.id}: ${result.error}`);
                }
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