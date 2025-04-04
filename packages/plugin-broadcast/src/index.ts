import { Plugin } from "@elizaos/core";
import { createMessageAction } from "./actions/createMessage";
import { processQueueAction } from "./actions/processQueue";
import { initializeBroadcastSchema } from "./db/schema";

const plugin: Plugin = {
    name: "broadcast",
    version: "0.1.0",
    actions: [
        createMessageAction,
        processQueueAction
    ],
    initialize: async (runtime) => {
        // Initialize database schema
        initializeBroadcastSchema(runtime.db);

        runtime.logger.info("Broadcast plugin initialized");
        return true;
    }
};

export default plugin;