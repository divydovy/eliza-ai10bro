import fs from 'fs';
import fetch from 'node-fetch';

async function sendMessageToAgent(characterName: string, message: any) {
    console.log('\nSending message to agent:', {
        characterName,
        messageType: message.type,
        messageText: message.text,
        metadata: message.metadata
    });

    const response = await fetch(`http://localhost:3000/${characterName}/message`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
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
                action: "CREATE_KNOWLEDGE"
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