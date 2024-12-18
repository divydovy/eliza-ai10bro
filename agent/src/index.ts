import { PostgresDatabaseAdapter } from "@ai16z/adapter-postgres";
import { SqliteDatabaseAdapter } from "@ai16z/adapter-sqlite";
import { AutoClientInterface } from "@ai16z/client-auto";
import { DirectClientInterface } from "@ai16z/client-direct";
import { DiscordClientInterface } from "@ai16z/client-discord";
import { TelegramClientInterface } from "@ai16z/client-telegram";
import { TwitterClientInterface } from "@ai16z/client-twitter";
import { FarcasterAgentClient } from "@ai16z/client-farcaster";
import {
    AgentRuntime,
    CacheManager,
    Character,
    Clients,
    DbCacheAdapter,
    FsCacheAdapter,
    IAgentRuntime,
    ICacheManager,
    IDatabaseAdapter,
    IDatabaseCacheAdapter,
    ModelProviderName,
    defaultCharacter,
    elizaLogger,
    settings,
    stringToUuid,
    validateCharacterConfig,
} from "@ai16z/eliza";
import { zgPlugin } from "@ai16z/plugin-0g";
import createGoatPlugin from "@ai16z/plugin-goat";
import { bootstrapPlugin } from "@ai16z/plugin-bootstrap";
// import { intifacePlugin } from "@ai16z/plugin-intiface";
import {
    coinbaseCommercePlugin,
    coinbaseMassPaymentsPlugin,
    tradePlugin,
    tokenContractPlugin,
    webhookPlugin,
    advancedTradePlugin,
} from "@ai16z/plugin-coinbase";
import { confluxPlugin } from "@ai16z/plugin-conflux";
import { imageGenerationPlugin } from "@ai16z/plugin-image-generation";
import { evmPlugin } from "@ai16z/plugin-evm";
import { createNodePlugin } from "@ai16z/plugin-node";
import { solanaPlugin } from "@ai16z/plugin-solana";
import { teePlugin, TEEMode } from "@ai16z/plugin-tee";
import { aptosPlugin, TransferAptosToken } from "@ai16z/plugin-aptos";
import { flowPlugin } from "@ai16z/plugin-flow";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import yargs from "yargs";
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

export const wait = (minTime: number = 1000, maxTime: number = 3000) => {
    const waitTime =
        Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
    return new Promise((resolve) => setTimeout(resolve, waitTime));
};

const logFetch = async (url: string, options: any) => {
    elizaLogger.info(`Fetching ${url}`);
    elizaLogger.info(options);
    return fetch(url, options);
};

export function parseArguments(): {
    character?: string;
    characters?: string;
} {
    try {
        return yargs(process.argv.slice(3))
            .option("character", {
                type: "string",
                description: "Path to the character JSON file",
            })
            .option("characters", {
                type: "string",
                description:
                    "Comma separated list of paths to character JSON files",
            })
            .parseSync();
    } catch (error) {
        elizaLogger.error("Error parsing arguments:", error);
        return {};
    }
}

function tryLoadFile(filePath: string): string | null {
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch (e) {
        return null;
    }
}

function isAllStrings(arr: unknown[]): boolean {
    return Array.isArray(arr) && arr.every((item) => typeof item === "string");
}

export async function loadCharacters(
    charactersArg: string
): Promise<Character[]> {
    let characterPaths = charactersArg
        ?.split(",")
        .map((filePath) => filePath.trim());
    const loadedCharacters = [];

    if (characterPaths?.length > 0) {
        for (const characterPath of characterPaths) {
            let content = null;
            let resolvedPath = "";

            // Try different path resolutions in order
            const pathsToTry = [
                characterPath, // exact path as specified
                path.resolve(process.cwd(), characterPath), // relative to cwd
                path.resolve(process.cwd(), "agent", characterPath), // Add this
                path.resolve(__dirname, characterPath), // relative to current script
                path.resolve(
                    __dirname,
                    "characters",
                    path.basename(characterPath)
                ), // relative to agent/characters
                path.resolve(
                    __dirname,
                    "../characters",
                    path.basename(characterPath)
                ), // relative to characters dir from agent
                path.resolve(
                    __dirname,
                    "../../characters",
                    path.basename(characterPath)
                ), // relative to project root characters dir
            ];

            elizaLogger.info(
                "Trying paths:",
                pathsToTry.map((p) => ({
                    path: p,
                    exists: fs.existsSync(p),
                }))
            );

            for (const tryPath of pathsToTry) {
                content = tryLoadFile(tryPath);
                if (content !== null) {
                    resolvedPath = tryPath;
                    break;
                }
            }

            if (content === null) {
                elizaLogger.error(
                    `Error loading character from ${characterPath}: File not found in any of the expected locations`
                );
                elizaLogger.error("Tried the following paths:");
                pathsToTry.forEach((p) => elizaLogger.error(` - ${p}`));
                process.exit(1);
            }

            try {
                const character = JSON.parse(content);
                validateCharacterConfig(character);

                // Handle plugins
                if (isAllStrings(character.plugins)) {
                    elizaLogger.info("Plugins are: ", character.plugins);
                    const importedPlugins = await Promise.all(
                        character.plugins.map(async (plugin) => {
                            const importedPlugin = await import(plugin);
                            return importedPlugin.default;
                        })
                    );
                    character.plugins = importedPlugins;
                }

                loadedCharacters.push(character);
                elizaLogger.info(
                    `Successfully loaded character from: ${resolvedPath}`
                );
            } catch (e) {
                elizaLogger.error(
                    `Error parsing character from ${resolvedPath}: ${e}`
                );
                process.exit(1);
            }
        }
    }

    if (loadedCharacters.length === 0) {
        elizaLogger.info("No characters found, using default character");
        loadedCharacters.push(defaultCharacter);
    }

    return loadedCharacters;
}

export function getTokenForProvider(
    provider: ModelProviderName,
    character: Character
) {
    switch (provider) {
        case ModelProviderName.OPENAI:
            return (
                character.settings?.secrets?.OPENAI_API_KEY ||
                settings.OPENAI_API_KEY
            );
        case ModelProviderName.ETERNALAI:
            return (
                character.settings?.secrets?.ETERNALAI_API_KEY ||
                settings.ETERNALAI_API_KEY
            );
        case ModelProviderName.LLAMACLOUD:
        case ModelProviderName.TOGETHER:
            return (
                character.settings?.secrets?.LLAMACLOUD_API_KEY ||
                settings.LLAMACLOUD_API_KEY ||
                character.settings?.secrets?.TOGETHER_API_KEY ||
                settings.TOGETHER_API_KEY ||
                character.settings?.secrets?.XAI_API_KEY ||
                settings.XAI_API_KEY ||
                character.settings?.secrets?.OPENAI_API_KEY ||
                settings.OPENAI_API_KEY
            );
        case ModelProviderName.ANTHROPIC:
            return (
                character.settings?.secrets?.ANTHROPIC_API_KEY ||
                character.settings?.secrets?.CLAUDE_API_KEY ||
                settings.ANTHROPIC_API_KEY ||
                settings.CLAUDE_API_KEY
            );
        case ModelProviderName.REDPILL:
            return (
                character.settings?.secrets?.REDPILL_API_KEY ||
                settings.REDPILL_API_KEY
            );
        case ModelProviderName.OPENROUTER:
            return (
                character.settings?.secrets?.OPENROUTER ||
                settings.OPENROUTER_API_KEY
            );
        case ModelProviderName.GROK:
            return (
                character.settings?.secrets?.GROK_API_KEY ||
                settings.GROK_API_KEY
            );
        case ModelProviderName.HEURIST:
            return (
                character.settings?.secrets?.HEURIST_API_KEY ||
                settings.HEURIST_API_KEY
            );
        case ModelProviderName.GROQ:
            return (
                character.settings?.secrets?.GROQ_API_KEY ||
                settings.GROQ_API_KEY
            );
        case ModelProviderName.GALADRIEL:
            return (
                character.settings?.secrets?.GALADRIEL_API_KEY ||
                settings.GALADRIEL_API_KEY
            );
        case ModelProviderName.FAL:
            return (
                character.settings?.secrets?.FAL_API_KEY || settings.FAL_API_KEY
            );
        case ModelProviderName.ALI_BAILIAN:
            return (
                character.settings?.secrets?.ALI_BAILIAN_API_KEY ||
                settings.ALI_BAILIAN_API_KEY
            );
        case ModelProviderName.VOLENGINE:
            return (
                character.settings?.secrets?.VOLENGINE_API_KEY ||
                settings.VOLENGINE_API_KEY
            );
        case ModelProviderName.NANOGPT:
            return (
                character.settings?.secrets?.NANOGPT_API_KEY ||
                settings.NANOGPT_API_KEY
            );
        case ModelProviderName.HYPERBOLIC:
            return (
                character.settings?.secrets?.HYPERBOLIC_API_KEY ||
                settings.HYPERBOLIC_API_KEY
            );
    }
}

function initializeDatabase(dataDir: string) {
    elizaLogger.info("=== Database Initialization ===");
    elizaLogger.info("Environment variables:", {
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        hasSupabaseKey: !!process.env.SUPABASE_ANON_KEY,
        hasSupabaseDbUrl: !!process.env.SUPABASE_DB_URL,
        hasPostgresUrl: !!process.env.POSTGRES_URL
    });

    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_DB_URL) {
        elizaLogger.info("=== Using Supabase Connection ===");
        elizaLogger.info(`URL: ${process.env.SUPABASE_URL}`);
        elizaLogger.info(`Database URL: ${process.env.SUPABASE_DB_URL.replace(/:[^:@]+@/, ':****@')}`);

        const adapter = new PostgresDatabaseAdapter({
            connectionString: process.env.SUPABASE_DB_URL,
            parseInputs: true,
            ssl: {
                rejectUnauthorized: false
            },
            max: 20,
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 30000
        });

        // Add test query
        adapter.init()
            .then(async () => {
                elizaLogger.success("Successfully connected to Supabase via PostgreSQL");
                try {
                    const result = await adapter.testConnection();
                    elizaLogger.info("Test query successful:", result);

                    // Test rooms table
                    const { data, error } = await adapter.supabase
                        .from('rooms')
                        .select('*')
                        .limit(1);

                    elizaLogger.info("Rooms table test:", { data, error });
                } catch (error) {
                    elizaLogger.error("Test query failed:", error);
                }
            })
            .catch((error) => {
                elizaLogger.error("Failed to connect to Supabase:", error);
            });

        return adapter;
    } else if (process.env.POSTGRES_URL) {
        elizaLogger.info("=== Using PostgreSQL Connection ===");
        elizaLogger.info(`URL: ${process.env.POSTGRES_URL}`);
        const db = new PostgresDatabaseAdapter({
            connectionString: process.env.POSTGRES_URL,
            parseInputs: true,
        });

        // Test the connection
        db.init()
            .then(() => {
                elizaLogger.success(
                    "Successfully connected to PostgreSQL database"
                );
            })
            .catch((error) => {
                elizaLogger.error("Failed to connect to PostgreSQL:", error);
            });

        return db;
    } else {
        elizaLogger.info("=== Using SQLite Connection ===");
        const filePath =
            process.env.SQLITE_FILE ?? path.resolve(dataDir, "db.sqlite");
        // ":memory:";
        const db = new SqliteDatabaseAdapter(new Database(filePath));
        return db;
    }
}

export async function initializeClients(
    character: Character,
    runtime: IAgentRuntime
) {
    const clients = [];
    const clientTypes =
        character.clients?.map((str) => str.toLowerCase()) || [];

    if (clientTypes.includes("auto")) {
        const autoClient = await AutoClientInterface.start(runtime);
        if (autoClient) clients.push(autoClient);
    }

    if (clientTypes.includes("discord")) {
        clients.push(await DiscordClientInterface.start(runtime));
    }

    if (clientTypes.includes("telegram")) {
        const telegramClient = await TelegramClientInterface.start(runtime);
        if (telegramClient) clients.push(telegramClient);
    }

    if (clientTypes.includes("twitter")) {
        TwitterClientInterface.enableSearch = !isFalsish(getSecret(character, "TWITTER_SEARCH_ENABLE"));
        const twitterClients = await TwitterClientInterface.start(runtime);
        clients.push(twitterClients);
    }

    if (clientTypes.includes("farcaster")) {
        const farcasterClients = new FarcasterAgentClient(runtime);
        farcasterClients.start();
        clients.push(farcasterClients);
    }

    if (character.plugins?.length > 0) {
        for (const plugin of character.plugins) {
            if (plugin.clients) {
                for (const client of plugin.clients) {
                    clients.push(await client.start(runtime));
                }
            }
        }
    }

    return clients;
}

function isFalsish(input: any): boolean {
    // If the input is exactly NaN, return true
    if (Number.isNaN(input)) {
        return true;
    }

    // Convert input to a string if it's not null or undefined
    const value = input == null ? '' : String(input);

    // List of common falsish string representations
    const falsishValues = ['false', '0', 'no', 'n', 'off', 'null', 'undefined', ''];

    // Check if the value (trimmed and lowercased) is in the falsish list
    return falsishValues.includes(value.trim().toLowerCase());
}

function getSecret(character: Character, secret: string) {
    return character.settings.secrets?.[secret] || process.env[secret];
}

let nodePlugin: any | undefined;

export async function createAgent(
    character: Character,
    db: IDatabaseAdapter,
    cache: ICacheManager,
    token: string
) {
    elizaLogger.success(
        elizaLogger.successesTitle,
        "Creating runtime for character",
        character.name
    );

    nodePlugin ??= createNodePlugin();

    const teeMode = getSecret(character, "TEE_MODE") || "OFF";
    const walletSecretSalt = getSecret(character, "WALLET_SECRET_SALT");

    // Validate TEE configuration
    if (teeMode !== TEEMode.OFF && !walletSecretSalt) {
        elizaLogger.error(
            "WALLET_SECRET_SALT required when TEE_MODE is enabled"
        );
        throw new Error("Invalid TEE configuration");
    }

    let goatPlugin: any | undefined;
    if (getSecret(character, "ALCHEMY_API_KEY")) {
        goatPlugin = await createGoatPlugin((secret) =>
            getSecret(character, secret)
        );
    }

    return new AgentRuntime({
        databaseAdapter: db,
        token,
        modelProvider: character.modelProvider,
        evaluators: [],
        character,
        plugins: [
            bootstrapPlugin,
            getSecret(character, "CONFLUX_CORE_PRIVATE_KEY")
                ? confluxPlugin
                : null,
            nodePlugin,
            getSecret(character, "SOLANA_PUBLIC_KEY") ||
            (getSecret(character, "WALLET_PUBLIC_KEY") &&
                !getSecret(character, "WALLET_PUBLIC_KEY")?.startsWith("0x"))
                ? solanaPlugin
                : null,
            getSecret(character, "EVM_PRIVATE_KEY") ||
            (getSecret(character, "WALLET_PUBLIC_KEY") &&
                getSecret(character, "WALLET_PUBLIC_KEY")?.startsWith("0x"))
                ? evmPlugin
                : null,
            getSecret(character, "ZEROG_PRIVATE_KEY") ? zgPlugin : null,
            getSecret(character, "COINBASE_COMMERCE_KEY")
                ? coinbaseCommercePlugin
                : null,
            getSecret(character, "FAL_API_KEY") ||
            getSecret(character, "OPENAI_API_KEY") ||
            getSecret(character, "HEURIST_API_KEY")
                ? imageGenerationPlugin
                : null,
            ...(getSecret(character, "COINBASE_API_KEY") &&
            getSecret(character, "COINBASE_PRIVATE_KEY")
                ? [
                      coinbaseMassPaymentsPlugin,
                      tradePlugin,
                      tokenContractPlugin,
                      advancedTradePlugin,
                  ]
                : []),
            ...(teeMode !== TEEMode.OFF && walletSecretSalt
                ? [teePlugin, solanaPlugin]
                : []),
            getSecret(character, "COINBASE_API_KEY") &&
            getSecret(character, "COINBASE_PRIVATE_KEY") &&
            getSecret(character, "COINBASE_NOTIFICATION_URI")
                ? webhookPlugin
                : null,
            getSecret(character, "ALCHEMY_API_KEY") ? goatPlugin : null,
            getSecret(character, "FLOW_ADDRESS") &&
            getSecret(character, "FLOW_PRIVATE_KEY")
                ? flowPlugin
                : null,
            getSecret(character, "APTOS_PRIVATE_KEY") ? aptosPlugin : null,
        ].filter(Boolean),
        providers: [],
        actions: [],
        services: [],
        managers: [],
        cacheManager: cache,
        fetch: logFetch,
    });
}

function initializeFsCache(baseDir: string, character: Character) {
    const cacheDir = path.resolve(baseDir, character.id, "cache");

    const cache = new CacheManager(new FsCacheAdapter(cacheDir));
    return cache;
}

function initializeDbCache(character: Character, db: IDatabaseCacheAdapter) {
    const cache = new CacheManager(new DbCacheAdapter(db, character.id));
    return cache;
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function createEmbedding(text: string) {
    const response = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text
    });
    return response.data[0].embedding;
}

async function startAgent(character: Character, directClient) {
    let db: IDatabaseAdapter & IDatabaseCacheAdapter;
    try {
        character.id ??= stringToUuid(character.name);
        character.username ??= character.name;

        const token = getTokenForProvider(character.modelProvider, character);
        const dataDir = path.join(__dirname, "../data");

        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        db = initializeDatabase(dataDir) as IDatabaseAdapter &
            IDatabaseCacheAdapter;

        await db.init();

        const cache = initializeDbCache(character, db);
        const runtime = await createAgent(character, db, cache, token);

        await runtime.initialize();

        const clients = await initializeClients(character, runtime);

        directClient.registerAgent(runtime);

        // Test document search
        try {
            const query = "Tell me about WordPress";
            elizaLogger.info("=== Testing Document Search ===");
            elizaLogger.info("Query:", query);

            // Create embedding using our local function
            const embedding = await createEmbedding(query);
            elizaLogger.info("Created embedding with length:", embedding.length);

            // Search both memories and agent_documents
            const [memories, documents] = await Promise.all([
                runtime.databaseAdapter.searchMemories({
                    tableName: "memories",
                    embedding,
                    match_threshold: 0.7,
                    match_count: 5,
                    agentId: runtime.agentId
                }),
                runtime.databaseAdapter.searchMemories({
                    tableName: "agent_documents",
                    embedding,
                    match_threshold: 0.7,
                    match_count: 5
                })
            ]);

            elizaLogger.info("Search details:", {
                tableName: "agent_documents",
                embeddingLength: embedding.length,
                threshold: 0.7,
                agentId: runtime.agentId
            });

            elizaLogger.info("Search results:", {
                memories: {
                    count: memories.length,
                    items: memories.map(m => ({
                        id: m.id,
                        text: m.content.text.substring(0, 100) + "...",
                        similarity: m.similarity
                    }))
                },
                documents: {
                    count: documents.length,
                    items: documents.map(d => ({
                        id: d.id,
                        text: d.content.text.substring(0, 100) + "...",
                        similarity: d.similarity
                    }))
                }
            });
        } catch (error) {
            elizaLogger.error("Document search test failed:", {
                name: error.name,
                message: error.message,
                stack: error.stack,
                details: error
            });
        }

        return clients;
    } catch (error) {
        elizaLogger.error(
            `Error starting agent for character ${character.name}:`,
            error
        );
        console.error(error);
        if (db) {
            await db.close();
        }
        throw error;
    }
}

const startAgents = async () => {
    const directClient = await DirectClientInterface.start();
    const args = parseArguments();

    let charactersArg = args.characters || args.character;

    let characters = [defaultCharacter];

    if (charactersArg) {
        characters = await loadCharacters(charactersArg);
    }

    try {
        for (const character of characters) {
            await startAgent(character, directClient);
        }
    } catch (error) {
        elizaLogger.error("Error starting agents:", error);
    }

    function chat() {
        const agentId = characters[0].name ?? "Agent";
        rl.question("You: ", async (input) => {
            await handleUserInput(input, agentId);
            if (input.toLowerCase() !== "exit") {
                chat(); // Loop back to ask another question
            }
        });
    }

    elizaLogger.log("Chat started. Type 'exit' to quit.");
    if (!args["non-interactive"]) {
        chat();
    }
};

startAgents().catch((error) => {
    elizaLogger.error("Unhandled error in startAgents:", error);
    process.exit(1); // Exit the process after logging
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

async function handleUserInput(input, agentId) {
    if (input.toLowerCase() === "exit") {
        gracefulExit();
    }

    try {
        const serverPort = parseInt(settings.SERVER_PORT || "3000");

        const response = await fetch(
            `http://localhost:${serverPort}/${agentId}/message`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: input,
                    userId: "user",
                    userName: "User",
                }),
            }
        );

        const data = await response.json();
        data.forEach((message) =>
            elizaLogger.log(`${"Agent"}: ${message.text}`)
        );
    } catch (error) {
        console.error("Error fetching response:", error);
    }
}

async function gracefulExit() {
    elizaLogger.log("Terminating and cleaning up resources...");
    rl.close();
    process.exit(0);
}

rl.on("SIGINT", gracefulExit);
rl.on("SIGTERM", gracefulExit);

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
);

async function uploadDocument(file: Buffer, fileName: string) {
    // Upload file to Supabase Storage
    const { data, error } = await supabase.storage
        .from('agent-documents')
        .upload(fileName, file);

    if (error) {
        throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
        .from('agent-documents')
        .getPublicUrl(fileName);

    return publicUrl;
}

async function processDocument(url: string) {
    // Download and process the document
    const response = await fetch(url);
    const text = await response.text(); // For HTML
    // or for PDFs, use a PDF parser

    // Store in agent's knowledge base
    const document = {
        id: generateUUID(),
        content: {
            text,
            source: url,
            title: fileName
        },
        type: "document"
    };

    await runtime.documentsManager.createMemory(document);
}

async function processStorageDocument(runtime: IAgentRuntime, fileName: string) {
    try {
        elizaLogger.info("Processing document:", fileName);

        // 1. Get file from Supabase Storage
        const { data: { publicUrl } } = supabase.storage
            .from('agent_documents')
            .getPublicUrl(fileName);

        // 2. Download and extract text
        const response = await fetch(publicUrl);
        const text = await response.text(); // For HTML/text files

        // 3. Create document in database with embedding
        const document = {
            id: generateUUID(),
            content: {
                text,
                source: publicUrl,
                title: fileName
            },
            roomId: runtime.agentId,
            userId: runtime.agentId,
            type: "document"
        };

        await runtime.documentsManager.createMemory(document);
        elizaLogger.success("Document processed and stored:", fileName);

    } catch (error) {
        elizaLogger.error("Error processing document:", error);
    }
}

// Subscribe to storage changes
supabase
    .channel('storage-changes')
    .on('postgres_changes', {
        event: 'INSERT',
        schema: 'storage',
        table: 'objects',
        filter: 'bucket_id=eq.agent-documents'
    }, payload => {
        processStorageDocument(runtime, payload.new.name);
    })
    .subscribe();
