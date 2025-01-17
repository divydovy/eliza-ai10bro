import fs from 'fs';

async function createBroadcastMessage(characterName: string = 'photomatt') {
    try {
        // Send system message to the agent's API to create a broadcast message
        const response = await fetch(`http://localhost:3000/${characterName}/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: "Based on the new knowledge you've acquired, create a single social media style message summarizing the key insights. Do not try to save this as a file - just return the message text.",
                type: "system",
                userId: "system",
                userName: "system"
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create broadcast message: ${response.status} ${response.statusText}\n${errorText}`);
        }

        const data = await response.json();
        console.log("Broadcast message created successfully.");
        console.log("Response:", JSON.stringify(data, null, 2));
        return data;
    } catch (error) {
        console.error("Error creating broadcast message:", error);
        throw error;
    }
}

// Export for use in other files
export { createBroadcastMessage };

// If run directly
if (require.main === module) {
    createBroadcastMessage();
}