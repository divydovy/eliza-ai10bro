import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';

export interface AgentMessage {
    text: string;
    type: string;
    metadata?: {
        systemMessage?: boolean;
        excludeFromHistory?: boolean;
        [key: string]: any;
    };
}

export interface AgentResponse {
    text: string;
    type: string;
    metadata?: {
        [key: string]: any;
    };
}

export async function sendMessageToAgent(characterName: string, message: AgentMessage): Promise<AgentResponse[]> {
    // Always use character settings for server URL
    const characterPath = path.join(process.cwd(), 'characters', `${characterName}.character.json`);
    const characterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));
    const serverPort = characterSettings.settings?.serverPort || 3005;
    const serverUrl = `http://localhost:${serverPort}`;

    console.log('\nUsing server URL from character settings:', {
        serverPort,
        serverUrl,
        characterName
    });

    console.log('\nFinal server URL configuration:', {
        serverUrl,
        characterName,
        messageType: message.type
    });

    console.log('\nSending message to agent:', {
        characterName,
        messageType: message.type,
        messageLength: message.text.length,
        metadata: message.metadata,
        serverUrl
    });

    const response = await fetch(`${serverUrl}/${characterName}/message`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Message-Type': 'system',
            'X-Exclude-History': 'true'
        },
        body: JSON.stringify({
            ...message,
            metadata: {
                ...message.metadata,
                excludeFromHistory: true,
                systemMessage: true
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
        messages: data.map((msg: AgentResponse) => ({
            text: msg.text,
            type: msg.type,
            metadata: msg.metadata
        }))
    });

    return data;
}