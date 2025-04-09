export const getClientSpecificMessage = (client: string, playgroundUrl: string) => {
    switch (client) {
        case 'twitter':
            return {
                text: `Your WooCommerce playground is ready! Access it here: ${playgroundUrl}`,
                action: "CREATE_PLAYGROUND"
            };
        case 'telegram':
        default:
            return {
                text: `I've created a playground instance with your blueprint! You can access it here:\n\n${playgroundUrl}\n\nThe playground will load with all your specified configurations. Feel free to explore and test everything.`,
                action: "CREATE_PLAYGROUND"
            };
    }
};