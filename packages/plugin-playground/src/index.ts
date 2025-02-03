import { customAction } from "./actions/generate-blueprint";

// Temporarily removing all actions while we work on blueprint
// import { playgroundAction } from "./actions/playground";
// import { woocommerceAction } from "./actions/woocommerce";

export const playgroundPlugin = {
    name: "plugin-playground",
    description: "Create and manage WordPress playgrounds with natural language commands",
    actions: [customAction],
    providers: [],
    evaluators: [],
    clients: [],
    services: [],
};

export default playgroundPlugin;