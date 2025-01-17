import fs from 'fs';
import { fileURLToPath } from 'url';
import { createBroadcastMessage } from './create-broadcast-message';

async function updateObsidianKnowledge() {
    try {
        // Load character settings
        const characterPath = process.argv[2] || 'characters/c3po.character.json';
        const characterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

        // Send system message to the agent's API
        const response = await fetch(`http://localhost:3000/${characterSettings.name}/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: "Create knowledge base",
                type: "system",
                userId: "system",
                userName: "system",
                metadata: {
                    silent: true  // Indicate this message should not be broadcast
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to send message: ${response.status} ${response.statusText}\n${errorText}`);
        }

        const data = await response.json();

        // Check if knowledge base creation is complete
        if (data && Array.isArray(data) && data.some(msg => msg.text?.includes("Finished creating knowledge base"))) {
            console.log("Knowledge base update completed successfully.");

            // Create broadcast message after knowledge update
            console.log("Creating broadcast message...");
            await createBroadcastMessage(characterSettings.name);
        } else {
            console.error("Knowledge base update may not have completed successfully");
            console.log("Response:", JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error("Error updating Obsidian knowledge base:", error);
        process.exit(1);
    }
}

// Execute the function
updateObsidianKnowledge();