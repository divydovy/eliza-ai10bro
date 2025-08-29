import { Action, Plugin, HandlerCallback, IAgentRuntime, Memory, State, elizaLogger } from '@elizaos/core';
import { getObsidianStatus } from './trackers/obsidian';
import { DashboardState } from './types';
import { broadcastServiceManager } from './services/broadcast-service-manager';

const getStatusAction: Action = {
    name: 'GET_DASHBOARD_STATUS',
    similes: [
        'SHOW_DASHBOARD',
        'DISPLAY_STATUS',
        'CHECK_PLUGINS',
        'PLUGIN_STATUS'
    ],
    description: 'Get the current status of all plugins',
    examples: [
        [
            {
                user: '{{user1}}',
                content: { text: 'Show me the dashboard status' }
            },
            {
                user: '{{agentName}}',
                content: { text: 'Here is the current dashboard status...' }
            }
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'What is the status of all plugins?' }
            },
            {
                user: '{{agentName}}',
                content: { text: 'Here is the status of all plugins...' }
            }
        ]
    ],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // Check if user has admin permission in character secrets
        const adminUsers = runtime.character.settings.secrets?.ADMIN_USERS?.split(',') || [];
        if (!adminUsers.includes(message.userId)) {
            elizaLogger.warn(`User ${message.userId} attempted to access dashboard without admin privileges`);
            return false;
        }
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback?: HandlerCallback
    ) => {
        elizaLogger.info('Getting dashboard status');

        try {
            // Get Obsidian status
            const obsidianStatus = await getObsidianStatus(runtime);
            
            // Get Broadcast services status
            const broadcastStatus = broadcastServiceManager.getStatus();

            const dashboardState: DashboardState = {
                plugins: {
                    obsidian: obsidianStatus,
                    broadcast: {
                        isActive: broadcastStatus.broadcastApi && broadcastStatus.actionApi,
                        lastSync: new Date(),
                        errors: [],
                        metadata: {
                            broadcastApi: broadcastStatus.broadcastApi,
                            actionApi: broadcastStatus.actionApi,
                            dashboardUrl: 'http://localhost:3002/broadcast-dashboard.html'
                        }
                    }
                },
                lastUpdated: new Date()
            };

            if (callback) {
                callback({
                    text: `Dashboard Status:\n\n${formatDashboardState(dashboardState)}`,
                    metadata: dashboardState
                });
            }

            return true;
        } catch (error) {
            elizaLogger.error('Error getting dashboard status:', error);
            if (callback) {
                callback({
                    text: `Error getting dashboard status: ${error instanceof Error ? error.message : String(error)}`,
                    error: true
                });
            }
            return false;
        }
    }
};

function formatDashboardState(state: DashboardState): string {
    const lines: string[] = [];

    Object.entries(state.plugins).forEach(([pluginName, status]) => {
        lines.push(`## ${pluginName}`);
        lines.push(`Status: ${status.isActive ? '🟢 Active' : '🔴 Inactive'}`);
        if (status.lastSync) {
            lines.push(`Last Sync: ${status.lastSync.toISOString()}`);
        }
        if (status.totalDocuments !== undefined) {
            lines.push(`Documents: ${status.processedDocuments}/${status.totalDocuments}`);
        }
        if (status.errors.length > 0) {
            lines.push('\nErrors:');
            status.errors.forEach(error => lines.push(`- ${error}`));
        }
        lines.push(''); // Empty line between plugins
    });

    lines.push(`\nLast Updated: ${state.lastUpdated.toISOString()}`);

    return lines.join('\n');
}

// Auto-start broadcast services when plugin initializes
const initializeBroadcastServices = async () => {
    try {
        elizaLogger.info('Initializing broadcast dashboard services...');
        await broadcastServiceManager.start();
    } catch (error) {
        elizaLogger.error('Failed to initialize broadcast services:', error);
    }
};

// Start services immediately when plugin loads
initializeBroadcastServices();

export const dashboardPlugin: Plugin = {
    name: 'dashboard',
    description: 'Plugin for monitoring the status of other plugins and broadcast system',
    actions: [getStatusAction],
    evaluators: [],
    services: [],
    providers: []
};

export default dashboardPlugin;