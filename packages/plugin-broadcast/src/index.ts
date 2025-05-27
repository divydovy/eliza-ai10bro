import { Plugin, IAgentRuntime } from "@elizaos/core";
import { createMessageAction } from "./actions/createMessage";
import { processQueueAction } from "./actions/processQueue";
import { initializeBroadcastSchema } from "./db/schema";
import { createBroadcastMessage } from "./scripts/create-broadcast-message";
export { createBroadcastMessage } from "./scripts/create-broadcast-message";
export { processBroadcastQueue } from "./actions/processQueue/service";

// Function to initialize the plugin
export function initializePlugin(runtime: IAgentRuntime) {
    console.log('\n🔄 [BROADCAST] Initializing broadcast plugin...');

    // Access the database instance through the adapter
    const db = runtime.databaseAdapter.db;
    initializeBroadcastSchema(db);
    console.log('✅ [BROADCAST] Schema initialized');

    // Schedule broadcast message creation every 10 minutes
    const BROADCAST_INTERVAL = 10 * 60 * 1000; // 10 minutes
    console.log(`⏰ [BROADCAST] Setting up schedule: every ${BROADCAST_INTERVAL/1000/60} minutes`);

    // Store the interval ID so we can track it
    const intervalId = setInterval(async () => {
        try {
            console.log('\n📢 [BROADCAST] Starting scheduled broadcast message creation...');
            await createBroadcastMessage(runtime);
            console.log('✅ [BROADCAST] Scheduled broadcast message creation completed');
        } catch (error) {
            console.error('❌ [BROADCAST] Error in scheduled broadcast message creation:', error);
        }
    }, BROADCAST_INTERVAL);

    // Log the interval ID for debugging
    console.log(`🔍 [BROADCAST] Schedule interval ID: ${intervalId}`);

    // Run immediately on startup
    console.log('🚀 [BROADCAST] Running initial broadcast message creation...');
    createBroadcastMessage(runtime)
        .then(() => console.log('✅ [BROADCAST] Initial broadcast message creation completed'))
        .catch(error => {
            console.error('❌ [BROADCAST] Error in initial broadcast message creation:', error);
        });

    // Return cleanup function
    return () => {
        console.log('🧹 [BROADCAST] Cleaning up broadcast plugin...');
        clearInterval(intervalId);
    };
}

const plugin: Plugin = {
    name: "broadcast",
    description: "Plugin for managing broadcast messages across multiple channels",
    actions: [
        createMessageAction,
        processQueueAction
    ],
    evaluators: [],
    services: [],
    providers: [],
};

export default plugin;