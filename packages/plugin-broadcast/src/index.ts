import { Plugin, IAgentRuntime } from "@elizaos/core";
import { createMessageAction } from "./actions/createMessage";
import { processQueueAction } from "./actions/processQueue";
import { initializeBroadcastSchema } from "./db/schema";
import { processBroadcastQueue } from './actions/processQueue';

// Function to initialize the plugin
export function initializePlugin(runtime: IAgentRuntime) {
    // Access the database instance through the adapter
    const db = runtime.databaseAdapter.db;
    initializeBroadcastSchema(db);
}

const plugin: Plugin = {
    name: "broadcast",
    description: "Plugin for managing broadcast messages across multiple channels",
    actions: [
        createMessageAction,
        processQueueAction,
        processBroadcastQueue
    ],
    evaluators: [],
    services: [],
    providers: [],
};

export default plugin;