import { Service, IAgentRuntime, Memory, UUID, ServiceType } from "@elizaos/core";
import { BroadcastDB } from "../db/operations";
import { createBroadcastMessage } from "../actions/createMessage/service";

export class AutoBroadcastService extends Service {
    private runtime: IAgentRuntime;
    private db: BroadcastDB;
    private lastCheckTime: number;
    private checkInterval: NodeJS.Timeout | null = null;

    static get serviceType(): ServiceType {
        return ServiceType.BACKGROUND;
    }

    constructor() {
        super();
        this.lastCheckTime = Date.now();
    }

    async initialize(runtime: IAgentRuntime): Promise<void> {
        this.runtime = runtime;
        this.db = new BroadcastDB(runtime.databaseAdapter.db);
        
        console.log("🚀 AutoBroadcastService initialized");
        
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
            
            // Get recent documents from GitHub or Obsidian
            const recentDocs = await this.runtime.documentsManager.getMemories({
                roomId: this.runtime.agentId as UUID,
                count: 10,
                start: this.lastCheckTime
            });
            
            // Filter for documents that are actually from knowledge sources
            const knowledgeDocs = recentDocs.filter(doc => {
                const content = doc.content;
                return content.source === 'github' || 
                       content.source === 'obsidian' ||
                       (content.metadata && content.metadata.path);
            });
            
            console.log(`Found ${knowledgeDocs.length} new knowledge documents`);
            
            for (const doc of knowledgeDocs) {
                // Check if this document already has a broadcast
                const existingBroadcast = this.db.getBroadcastByDocumentId(doc.id);
                if (existingBroadcast) {
                    console.log(`Document ${doc.id} already has broadcast, skipping`);
                    continue;
                }
                
                // Check if document is substantial enough
                const text = doc.content.text || '';
                if (text.length < 100) {
                    console.log(`Document ${doc.id} too short, skipping`);
                    continue;
                }
                
                console.log(`Creating broadcast for document ${doc.id}`);
                
                // Create broadcast message for Telegram
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
                    console.log(`✅ Created broadcast ${result.broadcastId} for document ${doc.id}`);
                } else {
                    console.log(`❌ Failed to create broadcast for document ${doc.id}: ${result.error}`);
                }
            }
            
            this.lastCheckTime = Date.now();
            
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
}

export const autoBroadcastService = new AutoBroadcastService();