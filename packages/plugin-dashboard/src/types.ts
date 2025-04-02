import { UUID } from '@elizaos/core';

export interface PluginStatus {
    pluginName: string;
    isActive: boolean;
    lastSync?: Date;
    totalDocuments?: number;
    processedDocuments?: number;
    errors: string[];
    metadata?: Record<string, any>;
}

export interface ObsidianStatus extends PluginStatus {
    vaultPath?: string;
    notes: {
        id: UUID;
        path: string;
        lastProcessed?: Date;
        status: 'pending' | 'processed' | 'error';
        error?: string;
        metadata?: {
            tags?: string[];
            frontmatter?: Record<string, any>;
        };
    }[];
}

export interface DashboardState {
    plugins: {
        [pluginName: string]: PluginStatus;
    };
    lastUpdated: Date;
}