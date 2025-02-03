import { generateBlueprintAction } from "./actions/generate-blueprint";
import { elizaLogger, Service, ServiceType, IDatabaseAdapter, UUID } from "@elizaos/core";

// Temporarily removing all actions while we work on blueprint
// import { playgroundAction } from "./actions/playground";
// import { woocommerceAction } from "./actions/woocommerce";

elizaLogger.info("Initializing playground plugin");

class BlueprintsService extends Service {
    static get serviceType(): ServiceType {
        return "blueprints" as ServiceType;
    }

    async initialize(runtime) {
        elizaLogger.info("Initializing blueprints service");
        
        // Initialize database adapter for blueprints
        await runtime.databaseAdapter.init();
        
        elizaLogger.info("Blueprints service initialized");
    }

    // Helper method to save blueprints
    async saveBlueprint(db: IDatabaseAdapter, params: {
        id: UUID,
        content: any,
        userId: UUID,
        roomId: UUID,
        agentId: UUID,
        conversationId: UUID
    }) {
        await db.createMemory(
            {
                id: params.id,
                userId: params.userId,
                agentId: params.agentId,
                roomId: params.roomId,
                content: {
                    text: JSON.stringify(params.content),
                    metadata: {
                        conversationId: params.conversationId
                    }
                },
                embedding: new Array(1536).fill(0)  // Add default embedding with correct dimensions
            },
            "wp_blueprints"
        );
    }
}

export const playgroundPlugin = {
    name: "plugin-playground",
    description: "Create and manage WordPress playgrounds with natural language commands",
    actions: [generateBlueprintAction],
    providers: [],
    evaluators: [],
    clients: [],
    services: [new BlueprintsService()]
};

elizaLogger.info("Playground plugin initialized with actions:", playgroundPlugin.actions.map(a => a.name));

export default playgroundPlugin;