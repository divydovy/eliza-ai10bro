import { Plugin } from "@elizaos/core";
import { playgroundAction } from "./actions/playground";
import { woocommerceAction } from "./actions/woocommerce";
import { generateBlueprintAction } from "./actions/generate-blueprint";

const playgroundPlugin: Plugin = {
    name: "plugin-playground",
    description: "Create and manage WordPress playgrounds with natural language commands",
    actions: [playgroundAction, generateBlueprintAction, woocommerceAction],
    providers: [],
    evaluators: [],
    clients: [],
    services: [],
};

export default playgroundPlugin;