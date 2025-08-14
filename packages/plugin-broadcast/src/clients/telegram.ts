import { Telegraf } from "telegraf";
import { BroadcastResult } from "../types";

export class TelegramBroadcastClient {
    private bot: Telegraf;
    private chatIds: string[];

    constructor(botToken: string, chatIds: string[]) {
        this.bot = new Telegraf(botToken);
        this.chatIds = chatIds;
    }

    async broadcast(message: string): Promise<BroadcastResult> {
        try {
            const cleanMessage = message.replace(/\[BROADCAST:[^\]]+\]\s*/, '');

            const results = await Promise.all(
                this.chatIds.map(chatId =>
                    this.bot.telegram.sendMessage(chatId, cleanMessage)
                )
            );

            // Consider broadcast successful if at least one message was sent
            const success = results.some(result => result.message_id);
            const messageId = results[0]?.message_id?.toString();

            return {
                success,
                messageId,
                error: success ? undefined : "Failed to send to any chat"
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}