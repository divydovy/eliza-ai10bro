import {
    Client,
    IAgentRuntime,
    elizaLogger,
    ModelClass,
    generateText
} from "@elizaos/core";
import { BskyAgent } from "@atproto/api";

export class BlueskyClient implements Client {
    private agent: BskyAgent;
    private runtime: IAgentRuntime;
    private postInterval: NodeJS.Timeout | null = null;
    private isConnected: boolean = false;

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        this.agent = new BskyAgent({
            service: "https://bsky.social"
        });
    }

    async start() {
        try {
            const handle = this.runtime.getSetting("BLUESKY_HANDLE") ||
                          this.runtime.getSetting("BLUESKY_USERNAME");
            const password = this.runtime.getSetting("BLUESKY_APP_PASSWORD") ||
                            this.runtime.getSetting("BLUESKY_PASSWORD");

            if (!handle || !password) {
                elizaLogger.error("Bluesky credentials not found in environment");
                return;
            }

            elizaLogger.info(`Logging into Bluesky as @${handle}...`);

            await this.agent.login({
                identifier: handle.includes(".") ? handle : `${handle}.bsky.social`,
                password: password
            });

            this.isConnected = true;
            elizaLogger.success(`✅ Bluesky client connected for @${handle}`);

            // Start posting loop
            this.startPostingLoop();

            // Start monitoring mentions
            this.startMentionMonitoring();

        } catch (error) {
            elizaLogger.error("Failed to start Bluesky client:", error);
            this.isConnected = false;
        }
    }

    async stop() {
        if (this.postInterval) {
            clearInterval(this.postInterval);
            this.postInterval = null;
        }
        this.isConnected = false;
        elizaLogger.info("Bluesky client stopped");
    }

    private startPostingLoop() {
        const minInterval = parseInt(this.runtime.getSetting("POST_INTERVAL_MIN") || "180");
        const maxInterval = parseInt(this.runtime.getSetting("POST_INTERVAL_MAX") || "300");

        const scheduleNext = () => {
            const interval = (minInterval + Math.random() * (maxInterval - minInterval)) * 60 * 1000;

            this.postInterval = setTimeout(async () => {
                if (this.isConnected) {
                    await this.createPost();
                    scheduleNext();
                }
            }, interval);
        };

        // Check if should post immediately
        const postImmediately = this.runtime.getSetting("POST_IMMEDIATELY") === "true";
        if (postImmediately) {
            this.createPost().then(() => scheduleNext());
        } else {
            scheduleNext();
        }
    }

    private async createPost() {
        try {
            // Generate post content using the runtime
            const bio = Array.isArray(this.runtime.character.bio)
                ? this.runtime.character.bio.join('\n')
                : this.runtime.character.bio;

            const topics = this.runtime.character.topics?.join(', ') || '';
            const examples = this.runtime.character.postExamples?.join('\n') || '';

            const context = `You are posting on Bluesky. Create an engaging post that reflects your personality and mission. Keep it under 300 characters.

Bio: ${bio}

Topics: ${topics}

Examples:
${examples}

Post:`;

            const response = await generateText({
                runtime: this.runtime,
                context,
                modelClass: ModelClass.SMALL
            });

            const text = typeof response === 'string' ? response.trim() : (response as any).text?.trim() || "";

            if (text && text.length <= 300) {
                const post = await this.agent.post({
                    text: text,
                    createdAt: new Date().toISOString()
                });

                elizaLogger.info(`Posted to Bluesky: ${text.substring(0, 50)}...`);
                elizaLogger.debug(`Post URI: ${post.uri}`);
            }
        } catch (error) {
            elizaLogger.error("Error creating Bluesky post:", error);
        }
    }

    private async startMentionMonitoring() {
        const checkInterval = parseInt(this.runtime.getSetting("BLUESKY_POLL_INTERVAL") || "120") * 1000;

        const checkMentions = async () => {
            if (!this.isConnected) return;

            try {
                const notifications = await this.agent.listNotifications({
                    limit: 10
                });

                for (const notif of notifications.data.notifications) {
                    if (!notif.isRead && (notif.reason === "mention" || notif.reason === "reply")) {
                        await this.handleMention(notif);

                        // Mark as read
                        await this.agent.updateSeenNotifications(
                            new Date().toISOString()
                        );
                    }
                }
            } catch (error) {
                elizaLogger.error("Error checking Bluesky mentions:", error);
            }
        };

        // Check mentions periodically
        setInterval(checkMentions, checkInterval);

        // Initial check
        checkMentions();
    }

    private async handleMention(notification: any) {
        try {
            elizaLogger.info(`Handling Bluesky mention from @${notification.author.handle}`);

            // Get the post that mentioned us
            const thread = await this.agent.getPostThread({
                uri: notification.uri
            });

            const post = thread.data.thread.post as any;
            const text = post.record?.text || "";

            // Generate response using runtime
            const bio = Array.isArray(this.runtime.character.bio)
                ? this.runtime.character.bio.join('\n')
                : this.runtime.character.bio;

            const context = `Someone mentioned you on Bluesky. Their message: "${text}".

Bio: ${bio}

Generate a helpful and engaging response that reflects your personality.
Keep it under 300 characters.

Response:`;

            const response = await generateText({
                runtime: this.runtime,
                context,
                modelClass: ModelClass.SMALL
            });

            const replyText = typeof response === 'string' ? response.trim() : (response as any).text?.trim() || "";

            if (replyText && replyText.length <= 300) {
                // Create reply
                const rootPost = thread.data.thread.post as any;
                await this.agent.post({
                    text: replyText,
                    reply: {
                        root: {
                            uri: rootPost.uri,
                            cid: rootPost.cid
                        },
                        parent: {
                            uri: rootPost.uri,
                            cid: rootPost.cid
                        }
                    },
                    createdAt: new Date().toISOString()
                });

                elizaLogger.info(`Replied to @${notification.author.handle}: ${replyText.substring(0, 50)}...`);
            }
        } catch (error) {
            elizaLogger.error("Error handling Bluesky mention:", error);
        }
    }
}

export default BlueskyClient;