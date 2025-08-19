import { Plugin, IAgentRuntime, ServiceType } from "@elizaos/core";
import { createMessageAction } from "./actions/createMessage";
import { processQueueAction } from "./actions/processQueue";
import { initializeBroadcastSchema } from "./db/schema";
import { autoBroadcastService } from "./services/AutoBroadcastService";
export { createBroadcastMessage } from "./scripts/create-broadcast-message";
export { createBroadcastMessageFixed } from "./scripts/create-broadcast-message-fixed";
export { processBroadcastQueue } from "./actions/processQueue/service";

// Function to initialize the plugin
export function initializePlugin(runtime: IAgentRuntime) {
    // Access the database instance through the adapter
    const db = runtime.databaseAdapter.db;
    initializeBroadcastSchema(db);
    
    // Don't initialize service here - it's initialized through the services array
    // autoBroadcastService.initialize(runtime);
}

const plugin: Plugin = {
    name: "broadcast",
    description: "Plugin for managing broadcast messages across multiple channels",
    actions: [
        createMessageAction,
        processQueueAction
    ],
    evaluators: [],
    services: [
        autoBroadcastService
    ],
    providers: [],
};

export default plugin;