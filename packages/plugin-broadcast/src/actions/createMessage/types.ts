import { BroadcastClient } from "../../types";

export interface CreateMessageParams {
    documentId: string;
    client?: BroadcastClient;
    maxLength?: number;
    prompt?: string;
}

export interface CreateMessageResult {
    success: boolean;
    broadcastId?: string;
    error?: string;
}