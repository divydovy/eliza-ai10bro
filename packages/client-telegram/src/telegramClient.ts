import { Context, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { IAgentRuntime, elizaLogger } from "@elizaos/core";
import { MessageManager } from "./messageManager.ts";
import { getOrCreateRecommenderInBe } from "./getOrCreateRecommenderInBe.ts";

elizaLogger.log("🔴 LOADING TELEGRAM CLIENT SOURCE FILE - VERSION CHECK 🔴");

export class TelegramClient {
    private bot: Telegraf<Context>;
    private runtime: IAgentRuntime;
    private messageManager: MessageManager;
    private backend;
    private backendToken;
    private tgTrader;

    constructor(runtime: IAgentRuntime, botToken: string) {
        elizaLogger.log("📱 Constructing new TelegramClient...");
        this.runtime = runtime;
        this.bot = new Telegraf(botToken);
        this.messageManager = new MessageManager(this.bot, this.runtime);
        this.backend = runtime.getSetting("BACKEND_URL");
        this.backendToken = runtime.getSetting("BACKEND_TOKEN");
        this.tgTrader = runtime.getSetting("TG_TRADER"); // boolean To Be added to the settings
        elizaLogger.log("✅ TelegramClient constructor completed");
    }

    public async start(): Promise<void> {
        elizaLogger.log("🚀 Starting Telegram bot...");
        try {
            // Setup handlers BEFORE launching bot
            this.setupMessageHandlers();
            this.setupShutdownHandlers();
            await this.initializeBot();
        } catch (error) {
            elizaLogger.error("❌ Failed to launch Telegram bot:", error);
            throw error;
        }
    }

    private async initializeBot(): Promise<void> {
        elizaLogger.log("Initializing bot WITHOUT await on launch...");

        // Don't await bot.launch() - it blocks forever due to polling loop
        // Launch returns a promise that resolves only when bot stops
        this.bot.launch({
            allowedUpdates: ['message', 'edited_message', 'callback_query', 'inline_query']
        });

        elizaLogger.log("Bot launch initiated (non-blocking)...");

        // Get bot info to ensure connection is established
        const botInfo = await this.bot.telegram.getMe();
        this.bot.botInfo = botInfo;
        elizaLogger.success(`✨ Bot ready: @${botInfo.username}`);
        elizaLogger.log(`Bot can_read_all_group_messages: ${botInfo.can_read_all_group_messages}`);

        this.messageManager.bot = this.bot;
    }

    private async isGroupAuthorized(ctx: Context): Promise<boolean> {
        const config = this.runtime.character.clientConfig?.telegram;
        if (ctx.from?.id === ctx.botInfo?.id) {
            return false;
        }

        if (!config?.shouldOnlyJoinInAllowedGroups) {
            return true;
        }

        const allowedGroups = config.allowedGroupIds || [];
        const currentGroupId = ctx.chat.id.toString();

        if (!allowedGroups.includes(currentGroupId)) {
            elizaLogger.info(`Unauthorized group detected: ${currentGroupId}`);
            try {
                await ctx.reply("Not authorized. Leaving.");
                await ctx.leaveChat();
            } catch (error) {
                elizaLogger.error(
                    `Error leaving unauthorized group ${currentGroupId}:`,
                    error
                );
            }
            return false;
        }

        return true;
    }

    private setupMessageHandlers(): void {
        elizaLogger.log("Setting up message handler...");

        // Catch ALL updates to debug
        this.bot.use(async (ctx, next) => {
            elizaLogger.log("🔔 UPDATE RECEIVED:", ctx.updateType);
            elizaLogger.log("Update data:", JSON.stringify(ctx.update).substring(0, 200));
            await next();
        });

        this.bot.on(message("new_chat_members"), async (ctx) => {
            try {
                const newMembers = ctx.message.new_chat_members;
                const isBotAdded = newMembers.some(
                    (member) => member.id === ctx.botInfo.id
                );

                if (isBotAdded && !(await this.isGroupAuthorized(ctx))) {
                    return;
                }
            } catch (error) {
                elizaLogger.error("Error handling new chat members:", error);
            }
        });

        this.bot.on("message", async (ctx) => {
            elizaLogger.log("📨 TELEGRAM MESSAGE RECEIVED");
            elizaLogger.log("From:", ctx.from?.id, ctx.from?.username);
            elizaLogger.log("Chat:", ctx.chat?.id, ctx.chat?.type);
            elizaLogger.log("BotInfo available:", !!this.bot.botInfo);

            try {
                // Check group authorization first
                const isAuthorized = await this.isGroupAuthorized(ctx);
                elizaLogger.log("Authorization check result:", isAuthorized);

                if (!isAuthorized) {
                    elizaLogger.log("❌ Message REJECTED by authorization");
                    return;
                }

                elizaLogger.log("✅ Calling messageManager.handleMessage");

                if (this.tgTrader) {
                    const userId = ctx.from?.id.toString();
                    const username =
                        ctx.from?.username || ctx.from?.first_name || "Unknown";
                    if (!userId) {
                        elizaLogger.warn(
                            "Received message from a user without an ID."
                        );
                        return;
                    }
                    try {
                        await getOrCreateRecommenderInBe(
                            userId,
                            username,
                            this.backendToken,
                            this.backend
                        );
                    } catch (error) {
                        elizaLogger.error(
                            "Error getting or creating recommender in backend",
                            error
                        );
                    }
                }

                await this.messageManager.handleMessage(ctx);
            } catch (error) {
                elizaLogger.error("❌ Error handling message:", error);
                // Don't try to reply if we've left the group or been kicked
                if (error?.response?.error_code !== 403) {
                    try {
                        await ctx.reply(
                            "An error occurred while processing your message."
                        );
                    } catch (replyError) {
                        elizaLogger.error(
                            "Failed to send error message:",
                            replyError
                        );
                    }
                }
            }
        });

        this.bot.on("photo", (ctx) => {
            elizaLogger.log(
                "📸 Received photo message with caption:",
                ctx.message.caption
            );
        });

        this.bot.on("document", (ctx) => {
            elizaLogger.log(
                "📎 Received document message:",
                ctx.message.document.file_name
            );
        });

        this.bot.catch((err, ctx) => {
            elizaLogger.error(`❌ Telegram Error for ${ctx.updateType}:`, err);
            ctx.reply("An unexpected error occurred. Please try again later.");
        });
    }

    private setupShutdownHandlers(): void {
        const shutdownHandler = async (signal: string) => {
            elizaLogger.log(
                `⚠️ Received ${signal}. Shutting down Telegram bot gracefully...`
            );
            try {
                await this.stop();
                elizaLogger.log("🛑 Telegram bot stopped gracefully");
            } catch (error) {
                elizaLogger.error(
                    "❌ Error during Telegram bot shutdown:",
                    error
                );
                throw error;
            }
        };

        process.once("SIGINT", () => shutdownHandler("SIGINT"));
        process.once("SIGTERM", () => shutdownHandler("SIGTERM"));
        process.once("SIGHUP", () => shutdownHandler("SIGHUP"));
    }

    public async stop(): Promise<void> {
        elizaLogger.log("Stopping Telegram bot...");
        await this.bot.stop();
        elizaLogger.log("Telegram bot stopped");
    }
}
