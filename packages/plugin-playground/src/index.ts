import { generateBlueprintAction } from "./actions/generate-blueprint";
import { createPlaygroundAction } from "./actions/create-playground";
import { elizaLogger } from "@elizaos/core";

elizaLogger.info("Initializing playground plugin");

const playgroundPlugin = {
    name: "plugin-playground",
    description: "Create and manage WordPress playgrounds with natural language commands",
    actions: [generateBlueprintAction, createPlaygroundAction],
    providers: [],
    evaluators: [],
    clients: [],
    services: []
};

elizaLogger.info("Playground plugin initialized with actions:", playgroundPlugin.actions.map(a => a.name));

export default playgroundPlugin;