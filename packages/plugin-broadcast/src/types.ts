import { Memory } from "@elizaos/core";

export type BroadcastClient = "telegram" | "twitter";

export interface BroadcastMessage {
    id: string;
    documentId: string;
    client: BroadcastClient;
    messageId: string;
    status: BroadcastStatus;
    sentAt: number | null;
    createdAt: number;
    content: string;
}

export type BroadcastStatus = "pending" | "sent" | "failed";

export interface BroadcastResult {
    success: boolean;
    messageId?: string;
    error?: string;
}

export interface ClientConfig {
    maxLength: number;
    formatMessage?: (message: string) => string;
}

export interface BroadcastPluginConfig {
    clients: {
        [key in BroadcastClient]?: ClientConfig;
    };
    defaultClient?: BroadcastClient;
    broadcastPrompt?: string;
    retryDelay?: number;
    maxRetries?: number;
}