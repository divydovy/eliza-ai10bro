import fs from 'fs';
import fetch from 'node-fetch';
import net from 'net';

// Function to check if a port is in use
async function isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer()
            .once('error', () => resolve(true))
            .once('listening', () => {
                server.close();
                resolve(false);
            })
            .listen(port);
    });
}

// Function to find the active agent port
async function findActivePort(startPort: number = 3000, endPort: number = 3010): Promise<number> {
    console.log('Scanning for active agent port...');
    for (let port = startPort; port <= endPort; port++) {
        if (await isPortInUse(port)) {
            console.log(`Found active port: ${port}`);
            return port;
        }
    }
    console.log('No active port found, using default port 3000');
    return startPort;
}

async function sendMessageToAgent(characterName: string, message: any) {
    console.log('\nSending message to agent:', {
        characterName,
        messageType: message.type,
        messageText: message.text,
        metadata: message.metadata
    });

    // Find the active port
    const port = await findActivePort();
    const serverUrl = process.env.SERVER_URL || `http://localhost:${port}`;
    console.log(`\nUsing server URL: ${serverUrl}`);

    const response = await fetch(`${serverUrl}/${characterName}/message`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Message-Type': 'system',  // Add header to identify system messages
            'X-Exclude-History': 'true'  // Add header to exclude from history
        },
        body: JSON.stringify({
            ...message,
            metadata: {
                ...message.metadata,
                excludeFromHistory: true,  // Add metadata to exclude from history
                systemMessage: true        // Add metadata to identify system messages
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send message: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    console.log('\nReceived response:', {
        status: response.status,
        responseLength: data.length,
        messages: data.map((msg: any) => ({
            text: msg.text,
            type: msg.type,
            metadata: msg.metadata
        }))
    });

    return data;
}

async function updateObsidianKnowledge() {
    try {
        // Load character settings
        const characterPath = process.argv[2] || 'characters/c3po.character.json';
        console.log(`\nLoading settings from: ${characterPath}`);
        const characterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

        // Log relevant settings
        console.log('\nRelevant settings:', {
            modelProvider: characterSettings.modelProvider,
            model: characterSettings.model,
            obsidianSettings: characterSettings.settings?.obsidian,
            plugins: characterSettings.plugins
        });

        // Send system message to create knowledge base
        console.log('\nSending knowledge base creation request...');
        const data = await sendMessageToAgent(characterSettings.name, {
            text: "ACTION: CREATE_KNOWLEDGE\nCreate and update the knowledge base with all documents in the Obsidian vault. Do not create a broadcast message.",
            type: "system",
            userId: "system",
            userName: "system",
            metadata: {
                silent: true,  // Indicate this message should not be broadcast
                action: "CREATE_KNOWLEDGE",
                excludeFromHistory: true,  // Add metadata to exclude from history
                systemMessage: true        // Add metadata to identify system messages
            }
        });

        if (!data || !Array.isArray(data)) {
            throw new Error('Invalid response from agent: ' + JSON.stringify(data));
        }

        console.log('\nAnalyzing response:', {
            messageCount: data.length,
            hasCompletionMessage: data.some(msg => msg.text?.includes("Finished creating knowledge base")),
            messages: data.map(msg => ({
                type: msg.type,
                textPreview: msg.text
            }))
        });

        // Check if knowledge base creation is complete
        const completionMessage = data.find(msg => msg.text?.includes("Finished creating knowledge base"));
        if (completionMessage) {
            console.log("\nKnowledge base update completed successfully.");
            console.log("Completion message:", completionMessage.text);
        } else {
            console.log("\nKnowledge base update may not have completed successfully - no completion message found");
        }

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

// Run the update
updateObsidianKnowledge();