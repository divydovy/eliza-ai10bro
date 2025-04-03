#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';

// Utility to inspect runtime plugin loading
function inspectRuntime(runtime: any) {
    console.log("=== Runtime Plugin Inspection ===");

    // Check if runtime has plugins array
    const hasPlugins = !!runtime.plugins;
    console.log("Runtime plugins status:", {
        hasPluginsArray: hasPlugins,
        pluginCount: hasPlugins ? runtime.plugins.length : 0
    });

    // If plugins exist, check each plugin
    if (hasPlugins) {
        const plugins = runtime.plugins;

        plugins.forEach((plugin: any) => {
            console.log(`Plugin: ${plugin.name}`, {
                isLoaded: !!plugin,
                actionCount: plugin.actions?.length || 0,
                actions: plugin.actions?.map((a: any) => a.name) || []
            });
        });
    }

    // Check registered actions
    const hasActions = !!runtime.actions;
    if (hasActions) {
        const actions = runtime.actions;

        console.log("Registered actions:", {
            totalActions: actions.length,
            actions: actions.map((action: any) => ({
                name: action.name,
                similes: action.similes
            }))
        });
    }
}

async function main() {
    const characterPath = process.argv[2];
    if (!characterPath) {
        console.error('Please provide a character path as an argument');
        process.exit(1);
    }

    console.log(`Checking plugins for character file: ${characterPath}`);

    try {
        // Import the core module dynamically
        const { AgentRuntime, CacheManager, MemoryManager } = await import('@elizaos/core');
        const { SqliteDatabaseAdapter } = await import('@elizaos/adapter-sqlite');

        // Read character settings
        const characterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

        // Create a temporary database adapter for testing
        const dbPath = ':memory:';
        const db = new SqliteDatabaseAdapter({ path: dbPath });
        await db.initialize();

        // Create a simple cache manager
        const cache = new CacheManager({
            cacheStore: 'memory'
        });

        // Initialize a runtime with the character settings
        const runtime = new AgentRuntime({
            character: characterSettings,
            databaseAdapter: db,
            cacheManager: cache,
            token: 'test-token',
            modelProvider: characterSettings.modelProvider || 'anthropic',
        });

        // Inspect the runtime
        inspectRuntime(runtime);

        process.exit(0);
    } catch (error) {
        console.error('Error during plugin inspection:', error);
        process.exit(1);
    }
}

main();