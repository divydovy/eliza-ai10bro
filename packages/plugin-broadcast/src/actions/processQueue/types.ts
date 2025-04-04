import { BroadcastClient } from "../../types";

export interface ProcessQueueParams {
    client?: BroadcastClient;
    maxRetries?: number;
    retryDelay?: number;
}

export interface ProcessQueueResult {
    success: boolean;
    processedCount: number;
    failedCount: number;
    error?: string;
}