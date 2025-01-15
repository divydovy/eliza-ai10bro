import fs from 'fs';
import { fileURLToPath } from 'url';

async function updateObsidianKnowledge() {
    try {
        // Load character settings
        const characterPath = process.argv[2] || 'characters/photomatt.character.json';
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
                userName: "system"
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to send message: ${response.status} ${response.statusText}\n${errorText}`);
        }

        const data = await response.json();
        console.log("Knowledge base update command sent successfully.");
        console.log("Response:", JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error updating Obsidian knowledge base:", error);
        process.exit(1);
    }
}

// Execute the function
updateObsidianKnowledge();