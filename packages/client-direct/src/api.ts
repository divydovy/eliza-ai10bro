import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

import {
    AgentRuntime,
    elizaLogger,
    getEnvVariable,
    validateCharacterConfig,
} from "@elizaos/core";

import { REST, Routes } from "discord.js";
import { DirectClient } from ".";
import { stringToUuid } from "@elizaos/core";

export function createApiRouter(
    agents: Map<string, AgentRuntime>,
    directClient: DirectClient
) {
    const router = express.Router();

    router.use(cors());
    router.use(bodyParser.json());
    router.use(bodyParser.urlencoded({ extended: true }));
    router.use(
        express.json({
            limit: getEnvVariable("EXPRESS_MAX_PAYLOAD") || "100kb",
        })
    );

    router.get("/", (req, res) => {
        res.send("Welcome, this is the REST API!");
    });

    router.get("/hello", (req, res) => {
        res.json({ message: "Hello World!" });
    });

    router.get("/agents", (req, res) => {
        const agentsList = Array.from(agents.values()).map((agent) => ({
            id: agent.agentId,
            name: agent.character.name,
            clients: Object.keys(agent.clients),
        }));
        res.json({ agents: agentsList });
    });

    router.get("/agents/:agentId", (req, res) => {
        const agentId = req.params.agentId;
        const agent = agents.get(agentId);

        if (!agent) {
            res.status(404).json({ error: "Agent not found" });
            return;
        }

        res.json({
            id: agent.agentId,
            character: agent.character,
        });
    });

    router.post("/agents/:agentId/set", async (req, res) => {
        const agentId = req.params.agentId;
        console.log("agentId", agentId);
        let agent: AgentRuntime = agents.get(agentId);

        // update character
        if (agent) {
            // stop agent
            agent.stop();
            directClient.unregisterAgent(agent);
            // if it has a different name, the agentId will change
        }

        // load character from body
        const character = req.body;
        try {
            validateCharacterConfig(character);
        } catch (e) {
            elizaLogger.error(`Error parsing character: ${e}`);
            res.status(400).json({
                success: false,
                message: e.message,
            });
            return;
        }

        // start it up (and register it)
        agent = await directClient.startAgent(character);
        elizaLogger.log(`${character.name} started`);

        res.json({
            id: character.id,
            character: character,
        });
    });

    router.get("/agents/:agentId/channels", async (req, res) => {
        const agentId = req.params.agentId;
        const runtime = agents.get(agentId);

        if (!runtime) {
            res.status(404).json({ error: "Runtime not found" });
            return;
        }

        const API_TOKEN = runtime.getSetting("DISCORD_API_TOKEN") as string;
        const rest = new REST({ version: "10" }).setToken(API_TOKEN);

        try {
            const guilds = (await rest.get(Routes.userGuilds())) as Array<any>;

            res.json({
                id: runtime.agentId,
                guilds: guilds,
                serverCount: guilds.length,
            });
        } catch (error) {
            console.error("Error fetching guilds:", error);
            res.status(500).json({ error: "Failed to fetch guilds" });
        }
    });

    router.get("/api/broadcast-stats", async (req, res) => {
        try {
            // Get first agent (assuming single agent setup)
            const agent = Array.from(agents.values())[0];
            if (!agent) {
                res.status(404).json({ error: "No agent found" });
                return;
            }

            // Query broadcast statistics from database adapter
            const db = agent.databaseAdapter;
            
            // Get broadcast statistics using the adapter methods
            const totalBroadcastsResult = await db.db.prepare("SELECT COUNT(*) as count FROM broadcasts").get();
            const totalBroadcasts = totalBroadcastsResult?.count || 0;
            
            const pendingBroadcastsResult = await db.db.prepare("SELECT COUNT(*) as count FROM broadcasts WHERE status = 'pending'").get();
            const pendingBroadcasts = pendingBroadcastsResult?.count || 0;
            
            const sentBroadcastsResult = await db.db.prepare("SELECT COUNT(*) as count FROM broadcasts WHERE status = 'sent'").get();
            const sentBroadcasts = sentBroadcastsResult?.count || 0;
            
            const failedBroadcastsResult = await db.db.prepare("SELECT COUNT(*) as count FROM broadcasts WHERE status = 'failed'").get();
            const failedBroadcasts = failedBroadcastsResult?.count || 0;
            
            // Get total documents (memories)
            const totalDocsResult = await db.db.prepare("SELECT COUNT(*) as count FROM memories").get();
            const totalDocuments = totalDocsResult?.count || 0;
            
            // Get recent activity (last 20 broadcasts)
            const recentBroadcasts = await db.db.prepare(`
                SELECT b.id, b.client as platform, b.status, b.content as text, 
                       b.createdAt, b.sent_at as sentAt
                FROM broadcasts b
                ORDER BY b.createdAt DESC 
                LIMIT 20
            `).all();
            
            const recentActivity = recentBroadcasts.map(broadcast => ({
                platform: broadcast.platform || 'telegram',
                status: broadcast.status,
                text: broadcast.text || 'No content',
                createdTime: broadcast.createdAt ? new Date(broadcast.createdAt).toLocaleString() : 'Unknown',
                sentTime: broadcast.sentAt ? new Date(broadcast.sentAt).toLocaleString() : null
            }));
            
            const data = {
                totalDocuments,
                totalBroadcasts,
                pendingBroadcasts,
                sentBroadcasts,
                failedBroadcasts,
                docsWithoutBroadcasts: Math.max(0, totalDocuments - totalBroadcasts),
                recentActivity
            };
            
            res.json(data);
        } catch (error) {
            console.error("Error fetching broadcast stats:", error);
            res.status(500).json({ error: "Failed to fetch broadcast statistics" });
        }
    });

    router.get("/agents/:agentId/:roomId/memories", async (req, res) => {
        const agentId = req.params.agentId;
        const roomId = stringToUuid(req.params.roomId);
        let runtime = agents.get(agentId);

        // if runtime is null, look for runtime with the same name
        if (!runtime) {
            runtime = Array.from(agents.values()).find(
                (a) => a.character.name.toLowerCase() === agentId.toLowerCase()
            );
        }

        if (!runtime) {
            res.status(404).send("Agent not found");
            return;
        }

        try {
            const memories = await runtime.messageManager.getMemories({
                roomId,
            });
            const response = {
                agentId,
                roomId,
                memories: memories.map((memory) => ({
                    id: memory.id,
                    userId: memory.userId,
                    agentId: memory.agentId,
                    createdAt: memory.createdAt,
                    content: {
                        text: memory.content.text,
                        action: memory.content.action,
                        source: memory.content.source,
                        url: memory.content.url,
                        inReplyTo: memory.content.inReplyTo,
                        attachments: memory.content.attachments?.map(
                            (attachment) => ({
                                id: attachment.id,
                                url: attachment.url,
                                title: attachment.title,
                                source: attachment.source,
                                description: attachment.description,
                                text: attachment.text,
                                contentType: attachment.contentType,
                            })
                        ),
                    },
                    embedding: memory.embedding,
                    roomId: memory.roomId,
                    unique: memory.unique,
                    similarity: memory.similarity,
                })),
            };

            res.json(response);
        } catch (error) {
            console.error("Error fetching memories:", error);
            res.status(500).json({ error: "Failed to fetch memories" });
        }
    });

    // Manual broadcast trigger endpoint for dashboard  
    const triggerHandler = async (req, res) => {
        try {
            const agent = Array.from(agents.values())[0];
            if (!agent) {
                res.status(404).json({ error: "No agent found" });
                return;
            }

            // Look for AutoBroadcastService - check multiple possible locations
            let broadcastService = null;
            
            // Try agent.services (direct services array)
            if (Array.isArray(agent.services)) {
                broadcastService = agent.services.find(
                    (service: any) => service.constructor.name === "_AutoBroadcastService" || service.constructor.name === "AutoBroadcastService"
                );
            }

            // Try agent.runtime.services if it exists
            if (!broadcastService && agent.runtime && Array.isArray(agent.runtime.services)) {
                broadcastService = agent.runtime.services.find(
                    (service: any) => service.constructor.name === "_AutoBroadcastService" || service.constructor.name === "AutoBroadcastService"
                );
            }

            // Try services as a Map
            if (!broadcastService && agent.runtime && agent.runtime.services instanceof Map) {
                for (const service of agent.runtime.services.values()) {
                    if (service.constructor.name === "_AutoBroadcastService" || service.constructor.name === "AutoBroadcastService") {
                        broadcastService = service;
                        break;
                    }
                }
            }

            // Try agent.services as a Map
            if (!broadcastService && agent.services instanceof Map) {
                for (const service of agent.services.values()) {
                    if (service.constructor.name === "_AutoBroadcastService" || service.constructor.name === "AutoBroadcastService") {
                        broadcastService = service;
                        break;
                    }
                }
            }

            if (!broadcastService) {
                // Log detailed debug information
                console.log("Debug info:", {
                    agentKeys: Object.keys(agent),
                    hasRuntime: !!agent.runtime,
                    runtimeKeys: agent.runtime ? Object.keys(agent.runtime) : [],
                    servicesType: agent.services ? typeof agent.services : "undefined",
                    servicesConstructor: agent.services ? agent.services.constructor.name : "undefined",
                    runtimeServicesType: agent.runtime?.services ? typeof agent.runtime.services : "undefined"
                });

                res.status(404).json({ 
                    error: "AutoBroadcastService not found. Check server logs for debug info."
                });
                return;
            }

            // Call checkForNewDocuments method
            await (broadcastService as any).checkForNewDocuments();

            res.json({ 
                success: true, 
                message: "Broadcast generation triggered successfully" 
            });
        } catch (error) {
            console.error("Error triggering broadcasts:", error);
            res.status(500).json({ 
                success: false, 
                error: "Failed to trigger broadcast generation" 
            });
        }
    };
    
    // Register trigger endpoint on both paths for compatibility
    router.post("/trigger", triggerHandler);
    router.post("/api/trigger", triggerHandler);

    return router;
}
