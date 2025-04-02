import { IAgentRuntime, Memory, elizaLogger } from '@elizaos/core';
import { ObsidianStatus } from '../types';

export async function getObsidianStatus(runtime: IAgentRuntime): Promise<ObsidianStatus> {
    try {
        // Get all notes from memory
        const notes = await runtime.memoryManager.getMemories({
            type: 'note',
            source: 'obsidian'
        });

        // Get any error memories
        const errors = await runtime.memoryManager.getMemories({
            type: 'error',
            source: 'obsidian'
        });

        // Find the most recent sync by looking at memory creation times
        const lastSync = notes.length > 0
            ? new Date(Math.max(...notes.map(m => new Date(m.createdAt).getTime())))
            : undefined;

        // Get vault path from settings
        const vaultPath = runtime.getSetting('OBSIDIAN_VAULT_PATH');

        // Map notes to our status format
        const notesStatus = notes.map(note => ({
            id: note.id,
            path: note.content.path as string,
            lastProcessed: new Date(note.createdAt),
            status: 'processed' as const,
            metadata: {
                tags: note.content.tags as string[],
                frontmatter: note.content.frontmatter as Record<string, any>
            }
        }));

        // Add any error states
        errors.forEach(error => {
            const path = error.content.path as string;
            if (path) {
                notesStatus.push({
                    id: error.id,
                    path,
                    lastProcessed: new Date(error.createdAt),
                    status: 'error',
                    error: error.content.text as string
                });
            }
        });

        return {
            pluginName: 'obsidian',
            isActive: true,
            lastSync,
            totalDocuments: notes.length,
            processedDocuments: notes.filter(n => !n.content.error).length,
            errors: errors.map(e => e.content.text as string),
            vaultPath,
            notes: notesStatus
        };
    } catch (error) {
        elizaLogger.error('Error getting Obsidian status:', error);
        return {
            pluginName: 'obsidian',
            isActive: false,
            errors: [error instanceof Error ? error.message : String(error)],
            notes: []
        };
    }
}