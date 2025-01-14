import { elizaLogger } from "@elizaos/core";
import { Client, IAgentRuntime } from "@elizaos/core";
import { TelegramClient } from "./telegramClient.ts";
import { validateTelegramConfig } from "./environment.ts";

export const TelegramClientInterface: Client = {
    start: async (runtime: IAgentRuntime) => {
        await validateTelegramConfig(runtime);

        const tg = new TelegramClient(
            runtime,
            runtime.getSetting("TELEGRAM_BOT_TOKEN")
        );

        await tg.start();

        elizaLogger.success(
            `✅ Telegram client successfully started for character ${runtime.character.name}`
        );
        return tg;
    },
    stop: async (_runtime: IAgentRuntime) => {
        elizaLogger.warn("Telegram client does not support stopping yet");
    },
    broadcast: async (runtime: IAgentRuntime, content: string) => {
        const client = runtime.clients.telegram as TelegramClient;
        if (!client) {
            throw new Error("Telegram client not found");
        }
        await client.broadcast(content);
    }
};

export default TelegramClientInterface;

export { TelegramClient } from './telegramClient';
export interface TelegramClientInterface {
    start(): Promise<void>;
    stop(): Promise<void>;
    broadcast(content: string): Promise<void>;
}
