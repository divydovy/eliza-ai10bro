#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { sendMessageToAgent } from './utils';
import fetch from 'node-fetch';

async function main() {
    const characterPath = process.argv[2];
    if (!characterPath) {
        console.error('Please provide a character path as an argument');
        process.exit(1);
    }

    console.log(`Starting GitHub knowledge update using character file: ${characterPath}`);

    try {
        // Read character settings
        const characterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));
        const characterName = characterSettings.name;

        console.log('Character settings loaded:', {
            name: characterName,
            pluginsCount: characterSettings.plugins?.length,
            plugins: characterSettings.plugins
        });

        // Check if GitHub plugin is in the plugins list
        const hasGithubPlugin = characterSettings.plugins?.includes('@elizaos/plugin-github');
        console.log('GitHub plugin status:', { isIncluded: hasGithubPlugin });

        // Check GitHub repository settings
        const githubToken = characterSettings.settings?.secrets?.GITHUB_TOKEN;
        const githubRepoUrl = characterSettings.settings?.GITHUB_REPO_URL;
        const githubTargetPath = characterSettings.settings?.GITHUB_TARGET_PATH;

        console.log('GitHub settings:', {
            hasToken: !!githubToken,
            tokenFirstChars: githubToken ? githubToken.substring(0, 5) + '...' : 'none',
            repoUrl: githubRepoUrl,
            targetPath: githubTargetPath
        });

        // First, try sending the message with the action
        console.log('Attempting to send SYNC_GITHUB action...');

        const syncMessage = {
            text: 'SYNC_GITHUB',
            type: 'system',
            action: 'SYNC_GITHUB',
            metadata: {
                systemMessage: true,
                excludeFromHistory: true,
                action: 'SYNC_GITHUB',
                content: {
                    action: 'SYNC_GITHUB',
                    text: 'SYNC_GITHUB'
                }
            }
        };

        try {
            const response = await sendMessageToAgent(characterName, syncMessage);
            console.log('Response from action message:', response);
        } catch (error) {
            console.error('Error sending action message:', error);
        }

        console.log('GitHub knowledge update completed');
        process.exit(0);
    } catch (error) {
        console.error('Error during GitHub knowledge sync:', error);
        process.exit(1);
    }
}

main();