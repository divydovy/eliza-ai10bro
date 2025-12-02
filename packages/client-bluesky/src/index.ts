import {
    Client,
    IAgentRuntime,
    elizaLogger,
    ModelClass,
    generateText
} from "@elizaos/core";
import { AtpAgent } from "@atproto/api";

export class BlueskyClient implements Client {
    private agent: AtpAgent;
    private runtime: IAgentRuntime;
    private postInterval: NodeJS.Timeout | null = null;
    private isConnected: boolean = false;

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        const serviceUrl = "https://bsky.social";
        elizaLogger.info(`🔍 Creating AtpAgent with service: "${serviceUrl}"`);
        elizaLogger.info(`🔍 serviceUrl type: ${typeof serviceUrl}, value: ${JSON.stringify(serviceUrl)}`);
        this.agent = new AtpAgent({
            service: serviceUrl
        });
        elizaLogger.info("🔍 AtpAgent created");
        const sessionManager = (this.agent as any).sessionManager;
        elizaLogger.info(`🔍 sessionManager.serviceUrl: ${JSON.stringify(sessionManager?.serviceUrl)}`);
        elizaLogger.info(`🔍 sessionManager.serviceUrl.href: ${sessionManager?.serviceUrl?.href}`);
        const fetchHandler = (this.agent as any).fetchHandler;
        elizaLogger.info(`🔍 fetchHandler exists: ${typeof fetchHandler === 'function'}`);
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

            const loginResult = await this.agent.login({
                identifier: handle.includes(".") ? handle : `${handle}.bsky.social`,
                password: password
            });

            this.isConnected = true;
            elizaLogger.success(`✅ Bluesky client connected for @${handle}`);

            // FIX: Replace fetchHandler to construct full URLs from pathnames
            // Based on @atproto/api v0.18+ breaking changes
            const sessionManager = (this.agent as any).sessionManager;
            elizaLogger.info("🔧 Applying fetchHandler fix for URL construction");

            sessionManager.fetchHandler = async (pathname: string, init: RequestInit) => {
                // Use serviceUrl for all requests (posting works with this)
                const baseUrl = sessionManager.serviceUrl;
                const fullUrl = new URL(pathname, baseUrl);

                elizaLogger.debug(`Request to: ${fullUrl.href}`);

                const fetchFn = sessionManager.fetch || globalThis.fetch;
                return await fetchFn(fullUrl.toString(), init);
            };

            elizaLogger.info(`🔍 Session info:`, {
                did: loginResult.data.did,
                handle: loginResult.data.handle,
                hasSession: !!this.agent.session,
                sessionDid: this.agent.session?.did || 'none'
            });

            // Only start auto-posting if explicitly enabled
            const enableAutoPost = this.runtime.getSetting("BLUESKY_AUTO_POST") === "true";
            if (enableAutoPost) {
                elizaLogger.info("Starting Bluesky auto-posting loop...");
                this.startPostingLoop();
            } else {
                elizaLogger.info("Bluesky auto-posting disabled (set BLUESKY_AUTO_POST=true to enable)");
            }

            // Only start mention monitoring if explicitly enabled
            const enableMentions = this.runtime.getSetting("BLUESKY_MONITOR_MENTIONS") !== "false"; // Enabled by default
            if (enableMentions) {
                elizaLogger.info("Starting Bluesky mention monitoring...");
                this.startMentionMonitoring();
            } else {
                elizaLogger.info("Bluesky mention monitoring disabled");
            }

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
        // Check if we have a valid session
        if (!this.agent.session) {
            elizaLogger.warn("No valid Bluesky session found, skipping post creation");
            return;
        }

        elizaLogger.info("🔍 Creating Bluesky post...", {
            hasSession: !!this.agent.session,
            sessionDid: this.agent.session?.did
        });

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
                    $type: 'app.bsky.feed.post',
                    text: text,
                    createdAt: new Date().toISOString()
                });

                elizaLogger.info(`Posted to Bluesky: ${text.substring(0, 50)}...`);
                elizaLogger.debug(`Post URI: ${post.uri}`);
            }
        } catch (error) {
            // Log error details but don't throw - prevents infinite loops
            const errorDetails = error instanceof Error ? error.message : JSON.stringify(error);
            const errorStack = error instanceof Error ? error.stack : '';
            const sessionManager = (this.agent as any).sessionManager;
            elizaLogger.error("Error creating Bluesky post:", errorDetails);
            elizaLogger.error("Stack trace:", errorStack);
            elizaLogger.error("🔍 Error context - dispatchUrl:", sessionManager?.dispatchUrl);
            elizaLogger.error("🔍 Error context - pdsUrl:", sessionManager?.pdsUrl);
            elizaLogger.error("🔍 Full error object:", JSON.stringify(error, null, 2));

            // If unauthorized, try to refresh session
            if (errorDetails.includes('401') || errorDetails.includes('Unauthorized')) {
                elizaLogger.warn("Session expired, attempting to reconnect...");
                this.isConnected = false;
            }
        }
    }

    private async startMentionMonitoring() {
        const checkInterval = parseInt(this.runtime.getSetting("BLUESKY_POLL_INTERVAL") || "120") * 1000;

        const checkMentions = async () => {
            if (!this.isConnected) return;

            // Check if we have a valid session
            if (!this.agent.session) {
                elizaLogger.warn("No valid Bluesky session found, skipping mention check");
                return;
            }

            try {
                elizaLogger.info("🔍 Checking Bluesky mentions...", {
                    hasSession: !!this.agent.session,
                    sessionDid: this.agent.session?.did
                });

                elizaLogger.info("🔍 About to call listNotifications");
                const sessionManager = (this.agent as any).sessionManager;
                elizaLogger.info("🔍 Current dispatchUrl before call:", JSON.stringify(sessionManager?.dispatchUrl));

                const notifications = await this.agent.listNotifications({
                    limit: 10
                });

                elizaLogger.info("🔍 listNotifications succeeded!");

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
                // Log error details but don't throw - prevents infinite loops
                const errorDetails = error instanceof Error ? error.message : JSON.stringify(error);
                const errorStack = error instanceof Error ? error.stack : '';
                elizaLogger.error("Error checking Bluesky mentions:", errorDetails);
                elizaLogger.error("Stack trace:", errorStack);

                // If unauthorized, try to refresh session
                if (errorDetails.includes('401') || errorDetails.includes('Unauthorized')) {
                    elizaLogger.warn("Session expired, attempting to reconnect...");
                    this.isConnected = false;
                }
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

            // Check if thread is a ThreadViewPost (has post property)
            if (!thread.data.thread || !('post' in thread.data.thread)) {
                elizaLogger.warn("Thread not found or blocked");
                return;
            }

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
                    $type: 'app.bsky.feed.post',
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
            // Log error details but don't throw - prevents infinite loops
            const errorDetails = error instanceof Error ? error.message : JSON.stringify(error);
            elizaLogger.error("Error handling Bluesky mention:", errorDetails);
        }
    }
}

export default BlueskyClient;