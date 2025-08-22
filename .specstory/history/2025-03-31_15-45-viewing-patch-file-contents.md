## SpecStory

## Viewing Patch File Contents (31/03/2025, 15:45:19)

_**User**_

cat ../eliza-stashes/stash-5.patch | cat

---

_**Assistant**_

I'll help you view the contents of that patch file. Let me run that command for you.

---

_****_

```bash
cat ../eliza-stashes/stash-5.patch | cat
```

```
diff --git a/agent/src/index.ts b/agent/src/index.ts
index 53058cf4e..afbe71f1d 100644
--- a/agent/src/index.ts
+++ b/agent/src/index.ts
@@ -1,5 +1,6 @@
 import { PostgresDatabaseAdapter } from "@elizaos/adapter-postgres";
 import { SqliteDatabaseAdapter } from "@elizaos/adapter-sqlite";
+import { SupabaseDatabaseAdapter } from "@elizaos/adapter-supabase";
 import { AutoClientInterface } from "@elizaos/client-auto";
 import { DiscordClientInterface } from "@elizaos/client-discord";
 import { FarcasterAgentClient } from "@elizaos/client-farcaster";
@@ -356,8 +357,28 @@ export function getTokenForProvider(
     }
 }
 
-function initializeDatabase(dataDir: string) {
-    if (process.env.POSTGRES_URL) {
+function initializeDatabase(dataDir: string, character?: Character) {
+    if (character?.database === "supabase") {
+        elizaLogger.info("Initializing Supabase connection...");
+        if (!character.settings?.secrets?.SUPABASE_URL || !character.settings?.
secrets?.SUPABASE_SERVICE_KE
Y) {
                            +            throw new Error("Supabase URL and servi
ce key are required for Supabase adapter");
+        }
+        const db = new SupabaseDatabaseAdapter(
+            character.settings.secrets.SUPABASE_URL,
+            character.settings.secrets.SUPABASE_SERVICE_KEY
+        );
+
+        // Test the connection
+        db.init()
+            .then(() => {
+                elizaLogger.success("Successfully connected to Supabase databas
e");
+            })
+            .catch((error) => {
+                elizaLogger.error("Failed to connect to Supabase:", error);
+            });
+
+        return db;
+    } else if (process.env.POSTGRES_URL) {
         elizaLogger.info("Initializing PostgreSQL connection...");
         const db = new PostgresDatabaseAdapter({
             connectionString: process.env.POSTGRES_URL,
@@ -367,9 +388,7 @@ function initializeDatabase(dataDir: string) {
         // Test the connection
         db.init()
             .then(() => {
-                elizaLogger.success(
-                    "Successfully connected to PostgreSQL database"
-                );
+                elizaLogger.success("Successfully connected to PostgreSQL datab
ase");
             })
             .catch((error) => {
                 elizaLogger.error("Failed to connect to PostgreSQL:", error);
@@ -377,8 +396,7 @@ function initializeDatabase(dataDir: string) {
 
         return db;
     } else {
-        const filePath =
-            process.env.SQLITE_FILE ?? path.resolve(dataDir, "db.sqlite");
+        const filePath = process.env.SQLITE_FILE ?? path.resolve(dataDir, "db.s
qlite");
         // ":memory:";
         const db = new SqliteDatabaseAdapter(new Database(filePath));
         return db;
@@ -686,7 +704,7 @@ async function startAgent(
             fs.mkdirSync(dataDir, { recursive: true });
         }
 
-        db = initializeDatabase(dataDir) as IDatabaseAdapter &
+        db = initializeDatabase(dataDir, character) as IDatabaseAdapter &
             IDatabaseCacheAdapter;
 
         await db.init();
diff --git a/packages/adapter-supabase/schema.sql b/packages/adapter-supabase/sc
hema.sql
index 25eb0dcae..e5061a158 100644
--- a/packages/adapter-supabase/schema.sql
+++ b/packages/adapter-supabase/schema.sql
@@ -6,6 +6,10 @@
 -- DROP TABLE IF EXISTS participants CASCADE;
 -- DROP TABLE IF EXISTS logs CASCADE;
 -- DROP TABLE IF EXISTS goals CASCADE;
+-- DROP TABLE IF EXISTS memories_1536 CASCADE;
+-- DROP TABLE IF EXISTS memories_1024 CASCADE;
+-- DROP TABLE IF EXISTS memories_768 CASCADE;
+-- DROP TABLE IF EXISTS memories_384 CASCADE;
 -- DROP TABLE IF EXISTS memories CASCADE;
 -- DROP TABLE IF EXISTS rooms CASCADE;
 -- DROP TABLE IF EXISTS accounts CASCADE;
@@ -164,3 +168,80 @@ CREATE INDEX idx_participants_room ON participants("roomId"
);
 CREATE INDEX idx_relationships_users ON relationships("userA", "userB");
 
 COMMIT;
+
+-- Function to create a room
+CREATE OR REPLACE FUNCTION create_room(roomId UUID)
+RETURNS TABLE (id UUID) AS $$
+BEGIN
+    INSERT INTO rooms (id) VALUES (roomId)
+    RETURNING id;
+END;
+$$ LANGUAGE plpgsql;
+
+-- Function to search memories
+CREATE OR REPLACE FUNCTION search_memories(
+    query_table_name TEXT,
+    query_roomId UUID,
+    query_embedding vector,
+    query_match_threshold FLOAT DEFAULT 0.8,
+    query_match_count INT DEFAULT 10,
+    query_unique BOOLEAN DEFAULT true
+)
+RETURNS TABLE (
+    id UUID,
+    type TEXT,
+    "createdAt" TIMESTAMPTZ,
+    content JSONB,
+    embedding vector,
+    "userId" UUID,
+    "agentId" UUID,
+    "roomId" UUID,
+    "unique" BOOLEAN,
+    similarity FLOAT
+) AS $$
+DECLARE
+    query TEXT;
+BEGIN
+    query := format('
+        SELECT *, 1 - (embedding <=> $1) as similarity
+        FROM %I
+        WHERE "roomId" = $2
+        AND ($6 = false OR "unique" = true)
+        AND 1 - (embedding <=> $1) > $3
+        ORDER BY similarity DESC
+        LIMIT $4
+    ', query_table_name);
+
+    RETURN QUERY EXECUTE query
+    USING query_embedding, query_roomId, query_match_threshold, query_match_cou
nt, query_match_threshold, q
uery_unique;
                            +END;
+$$ LANGUAGE plpgsql;
+
+-- Function to get embedding list
+CREATE OR REPLACE FUNCTION get_embedding_list(
+    query_table_name TEXT,
+    query_threshold FLOAT,
+    query_input TEXT,
+    query_field_name TEXT,
+    query_field_sub_name TEXT,
+    query_match_count INT DEFAULT 10
+)
+RETURNS TABLE (
+    embedding vector,
+    levenshtein_score INT
+) AS $$
+DECLARE
+    query TEXT;
+BEGIN
+    query := format('
+        SELECT embedding, levenshtein(%L, content->>%L) as levenshtein_score
+        FROM %I
+        WHERE content->>%L IS NOT NULL
+        AND levenshtein(%L, content->>%L) < %L
+        ORDER BY levenshtein_score ASC
+        LIMIT %L
+    ', query_input, query_field_sub_name, query_table_name, query_field_name, q
uery_input, query_field_sub_
name, query_threshold, query_match_count);
                            +
+    RETURN QUERY EXECUTE query;
+END;
+$$ LANGUAGE plpgsql;
diff --git a/packages/adapter-supabase/seed.sql b/packages/adapter-supabase/seed
.sql
index 063c5fbe5..bbe4c08da 100644
--- a/packages/adapter-supabase/seed.sql
+++ b/packages/adapter-supabase/seed.sql
@@ -1,3 +1,3 @@
-INSERT INTO public.accounts (id, name, email, avatarUrl, details) VALUES ('0000
0000-0000-0000-0000-00000000
0000', 'Default Agent', 'default@agent.com', '', '{}');
                            +INSERT INTO public.accounts (id, name, email, "avat
arUrl", details) VALUES ('00000000-0000-0000-0000-000000
000000', 'Default Agent', 'default@agent.com', '', '{}');
                             INSERT INTO public.rooms (id) VALUES ('00000000-000
0-0000-0000-000000000000');
-INSERT INTO public.participants (userId, roomId) VALUES ('00000000-0000-0000-00
00-000000000000', '00000000-
0000-0000-0000-000000000000');
                            +INSERT INTO public.participants (id, "userId", "roo
mId") VALUES ('00000000-0000-0000-0000-000000000000', '0
0000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000');
                            diff --git a/packages/adapter-supabase/src/index.ts
b/packages/adapter-supabase/src/index.ts
index f6f9840f2..e1a7db12b 100644
--- a/packages/adapter-supabase/src/index.ts
+++ b/packages/adapter-supabase/src/index.ts
@@ -1,30 +1,48 @@
-import { createClient, type SupabaseClient } from "@supabase/supabase-js";
+import { createClient, SupabaseClient } from "@supabase/supabase-js";
+import { DatabaseAdapter, elizaLogger } from "@elizaos/core";
 import {
-    type Memory,
-    type Goal,
-    type Relationship,
+    UUID,
+    Memory,
+    Goal,
+    Room,
+    Participant,
+    Account,
     Actor,
     GoalStatus,
-    Account,
-    type UUID,
-    Participant,
-    Room,
+    Relationship,
 } from "@elizaos/core";
-import { DatabaseAdapter } from "@elizaos/core";
 import { v4 as uuid } from "uuid";
+
 export class SupabaseDatabaseAdapter extends DatabaseAdapter {
     async getRoom(roomId: UUID): Promise<UUID | null> {
-        const { data, error } = await this.supabase
-            .from("rooms")
-            .select("id")
-            .eq("id", roomId)
-            .single();
+        elizaLogger.debug('getRoom called with:', roomId);
 
-        if (error) {
-            throw new Error(`Error getting room: ${error.message}`);
-        }
+        try {
+            const { data, error } = await this.supabase
+                .from("rooms")
+                .select("id")
+                .eq("id", roomId)
+                .maybeSingle();
+
+            if (error) {
+                elizaLogger.error('Failed to get room:', {
+                    roomId,
+                    error: error.message,
+                    details: error.details,
+                    hint: error.hint
+                });
+                throw new Error(`Failed to get room: ${error.message}`);
+            }
 
-        return data ? (data.id as UUID) : null;
+            elizaLogger.debug('Room query result:', { roomId, exists: !!data })
;
+            return data?.id ?? null;
+        } catch (error) {
+            elizaLogger.error('Unexpected error in getRoom:', {
+                roomId,
+                error: error instanceof Error ? error.message : String(error)
+            });
+            throw error;
+        }
     }
 
     async getParticipantsForAccount(userId: UUID): Promise<Participant[]> {
@@ -549,7 +567,7 @@ export class SupabaseDatabaseAdapter extends DatabaseAdapter
 {
             throw new Error("No data returned from room creation");
         }
 
-        return data[0].id as UUID;
+        return data[0] as UUID;
     }
 
     async removeRoom(roomId: UUID): Promise<void> {
diff --git a/packages/core/src/environment.ts b/packages/core/src/environment.ts
index 0758d0d31..4bd53f9bd 100644
--- a/packages/core/src/environment.ts
+++ b/packages/core/src/environment.ts
@@ -68,6 +68,7 @@ export const CharacterSchema = z.object({
     name: z.string(),
     system: z.string().optional(),
     modelProvider: z.nativeEnum(ModelProviderName),
+    database: z.enum(["sqlite", "postgres", "supabase"]).optional(),
     modelEndpointOverride: z.string().optional(),
     templates: z.record(z.string()).optional(),
     bio: z.union([z.string(), z.array(z.string())]),
diff --git a/packages/core/src/runtime.ts b/packages/core/src/runtime.ts
index 37bab24ad..509b17086 100644
--- a/packages/core/src/runtime.ts
+++ b/packages/core/src/runtime.ts
@@ -252,18 +252,6 @@ export class AgentRuntime implements IAgentRuntime {
             stringToUuid(opts.character?.name ?? uuidv4());
         this.character = opts.character || defaultCharacter;
 
-        // By convention, we create a user and room using the agent id.
-        // Memories related to it are considered global context for the agent.
-        this.ensureRoomExists(this.agentId);
-        this.ensureUserExists(
-            this.agentId,
-            this.character.name,
-            this.character.name
-        ).then(() => {
-            // postgres needs the user to exist before you can add a participan
t
-            this.ensureParticipantExists(this.agentId, this.agentId);
-        });
-
         elizaLogger.success("Agent ID", this.agentId);
 
         this.fetch = (opts.fetch as typeof fetch) ?? this.fetch;
@@ -331,14 +319,13 @@ export class AgentRuntime implements IAgentRuntime {
         );
 
         this.imageVisionModelProvider =
-        this.character.imageVisionModelProvider ?? this.modelProvider;
+            this.character.imageVisionModelProvider ?? this.modelProvider;
 
         elizaLogger.info("Selected model provider:", this.modelProvider);
-         elizaLogger.info(
+        elizaLogger.info(
             "Selected image model provider:",
             this.imageVisionModelProvider
-         );
-
+        );
 
         // Validate model provider
         if (!Object.values(ModelProviderName).includes(this.modelProvider)) {
@@ -393,35 +380,56 @@ export class AgentRuntime implements IAgentRuntime {
     }
 
     async initialize() {
-        for (const [serviceType, service] of this.services.entries()) {
-            try {
-                await service.initialize(this);
-                this.services.set(serviceType, service);
-                elizaLogger.success(
-                    `Service ${serviceType} initialized successfully`
-                );
-            } catch (error) {
-                elizaLogger.error(
-                    `Failed to initialize service ${serviceType}:`,
-                    error
-                );
-                throw error;
+        elizaLogger.info("Initializing runtime services and room setup...");
+
+        try {
+            // Initialize room and user first
+            await this.ensureRoomExists(this.agentId);
+            await this.ensureUserExists(
+                this.agentId,
+                this.character.name,
+                this.character.name
+            );
+            await this.ensureParticipantExists(this.agentId, this.agentId);
+
+            elizaLogger.success("Room and user setup completed successfully");
+
+            // Initialize services
+            for (const [serviceType, service] of this.services.entries()) {
+                try {
+                    await service.initialize(this);
+                    this.services.set(serviceType, service);
+                    elizaLogger.success(
+                        `Service ${serviceType} initialized successfully`
+                    );
+                } catch (error) {
+                    elizaLogger.error(
+                        `Failed to initialize service ${serviceType}:`,
+                        error
+                    );
+                    throw error;
+                }
             }
-        }
 
-        for (const plugin of this.plugins) {
-            if (plugin.services)
-                await Promise.all(
-                    plugin.services?.map((service) => service.initialize(this))
-                );
-        }
+            for (const plugin of this.plugins) {
+                if (plugin.services)
+                    await Promise.all(
+                        plugin.services?.map((service) => service.initialize(th
is))
+                    );
+            }
+
+            if (
+                this.character &&
+                this.character.knowledge &&
+                this.character.knowledge.length > 0
+            ) {
+                await this.processCharacterKnowledge(this.character.knowledge);
+            }
 
-        if (
-            this.character &&
-            this.character.knowledge &&
-            this.character.knowledge.length > 0
-        ) {
-            await this.processCharacterKnowledge(this.character.knowledge);
+            elizaLogger.success("Runtime initialization completed successfully"
);
+        } catch (error) {
+            elizaLogger.error("Failed to initialize runtime:", error);
+            throw error;
         }
     }
 
diff --git a/packages/core/src/types.ts b/packages/core/src/types.ts
index 3687ded5e..a58278b60 100644
--- a/packages/core/src/types.ts
+++ b/packages/core/src/types.ts
@@ -684,6 +684,9 @@ export type Character = {
     /** Model provider to use */
     modelProvider: ModelProviderName;
 
+    /** Database type to use */
+    database?: "sqlite" | "postgres" | "supabase";
+
     /** Image model provider to use, if different from modelProvider */
     imageModelProvider?: ModelProviderName;
 
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index ad6fe3065..514a2ce9a 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -22,19 +22,19 @@ importers:
         version: 3.9.0(bufferutil@4.0.9)(encoding@0.1.13)(utf-8-validate@5.0.10
)
       '@elizaos/adapter-postgres':
         specifier: ^0.1.7
-        version: 0.1.7(@google-cloud/vertexai@1.9.2(encoding@0.1.13))(@langchai
n/core@0.3.27(openai@4.73.0(
encoding@0.1.13)(zod@3.23.8)))(axios@1.7.9)(encoding@0.1.13)(react@18.3.1)(sswr@
2.1.0(svelte@5.16.1))(svelte@5.16.1)(vue@3.5.13(typescript@5.6.3))
                                                        +        version: 0.1.7(
@google-cloud/vertexai@1.9.2(encoding@0.1.13))(@langchain/core@0.3.27(openai@4.7
3.0(
encoding@0.1.13)(zod@3.23.8)))(axios@1.7.9)(encoding@0.1.13)(react@18.3.1)(sswr@
2.1.0(svelte@5.17.1))(svelte@5.17.1)
                                                               '@elizaos/adapter
-supabase':
         specifier: ^0.1.7
-        version: 0.1.7(@google-cloud/vertexai@1.9.2(encoding@0.1.13))(@langchai
n/core@0.3.27(openai@4.73.0(
encoding@0.1.13)(zod@3.23.8)))(axios@1.7.9)(bufferutil@4.0.9)(encoding@0.1.13)(r
eact@18.3.1)(sswr@2.1.0(svelte@5.16.1))(svelte@5.16.1)(utf-8-validate@5.0.10)(vu
e@3.5.13(typescript@5.6.3))(whatwg-url@14.1.0)          +        version: 0.1.7(
@google-cloud/vertexai@1.9.2(encoding@0.1.13))(@langchain/core@0.3.27(openai@4.7
3.0(
encoding@0.1.13)(zod@3.23.8)))(axios@1.7.9)(bufferutil@4.0.9)(encoding@0.1.13)(r
eact@18.3.1)(sswr@2.1.0(svelte@5.17.1))(svelte@5.17.1)(utf-8-validate@5.0.10)(wh
atwg-url@14.1.0)                                               '@elizaos/core':
         specifier: ^0.1.7
-        version: 0.1.7(@google-cloud/vertexai@1.9.2(encoding@0.1.13))(@langchai
n/core@0.3.27(openai@4.73.0(
encoding@0.1.13)(zod@3.23.8)))(axios@1.7.9)(encoding@0.1.13)(react@18.3.1)(sswr@
2.1.0(svelte@5.16.1))(svelte@5.16.1)(vue@3.5.13(typescript@5.6.3))
                                                        +        version: 0.1.7(
@google-cloud/vertexai@1.9.2(encoding@0.1.13))(@langchain/core@0.3.27(openai@4.7
3.0(
encoding@0.1.13)(zod@3.23.8)))(axios@1.7.9)(encoding@0.1.13)(react@18.3.1)(sswr@
2.1.0(svelte@5.17.1))(svelte@5.17.1)
                                                               '@supabase/supaba
se-js':
         specifier: 2.47.12
         version: 2.47.12(bufferutil@4.0.9)(utf-8-validate@5.0.10)
       '@vitest/eslint-plugin':
         specifier: 1.0.1
-        version: 1.0.1(@typescript-eslint/utils@8.16.0(eslint@9.16.0(jiti@2.4.2
))(typescript@5.6.3))(eslint
@9.16.0(jiti@2.4.2))(typescript@5.6.3)(vitest@2.1.5(@types/node@22.10.4)(jsdom@2
5.0.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(
terser@5.37.0))                                         +        version: 1.0.1(
@typescript-eslint/utils@8.16.0(eslint@9.16.0(jiti@2.4.2))(typescript@5.6.3))(es
lint
@9.16.0(jiti@2.4.2))(typescript@5.6.3)(vitest@2.1.5(@types/node@22.10.5)(jsdom@2
5.0.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(
terser@5.37.0))                                                amqplib:
         specifier: 0.10.5
         version: 0.10.5
@@ -59,7 +59,7 @@ importers:
     devDependencies:
       '@commitlint/cli':
         specifier: 18.6.1
-        version: 18.6.1(@types/node@22.10.4)(typescript@5.6.3)
+        version: 18.6.1(@types/node@22.10.5)(typescript@5.6.3)
       '@commitlint/config-conventional':
         specifier: 18.6.3
         version: 18.6.3
@@ -107,10 +107,10 @@ importers:
         version: 2.21.58(bufferutil@4.0.9)(typescript@5.6.3)(utf-8-validate@5.0
.10)(zod@3.23.8)
       vite:
         specifier: 5.4.11
-        version: 5.4.11(@types/node@22.10.4)(terser@5.37.0)
+        version: 5.4.11(@types/node@22.10.5)(terser@5.37.0)
       vitest:
         specifier: 2.1.5
-        version: 2.1.5(@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                            +        version: 2.1.5(@types/node@22.10.5)(jsdom@2
5.0.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                             
   agent:
     dependencies:
@@ -267,7 +267,7 @@ importers:
         version: 10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@20.1
7.9)(typescript@5.6.3)
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   client:
     dependencies:
@@ -315,7 +315,7 @@ importers:
         version: 1.0.7(tailwindcss@3.4.15(ts-node@10.9.2(@swc/core@1.10.4(@swc/
helpers@0.5.15))(@types/node
@22.8.4)(typescript@5.6.3)))
                                   vite-plugin-top-level-await:
         specifier: 1.4.4
-        version: 1.4.4(@swc/helpers@0.5.15)(rollup@4.29.1)(vite@client+@tanstac
k+router-plugin+vite)
+        version: 1.4.4(@swc/helpers@0.5.15)(rollup@4.30.1)(vite@client+@tanstac
k+router-plugin+vite)
       vite-plugin-wasm:
         specifier: 3.3.0
         version: 3.3.0(vite@client+@tanstack+router-plugin+vite)
@@ -379,7 +379,7 @@ importers:
         version: 3.6.3(@mdx-js/react@3.0.1(@types/react@18.3.12)(react@18.3.1))
(@swc/core@1.10.4(@swc/helpe
rs@0.5.15))(acorn@8.14.0)(bufferutil@4.0.9)(eslint@9.16.0(jiti@2.4.2))(prop-type
s@15.8.1)(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(typescript@5.6.3)(utf-8-
validate@5.0.10)                                               '@docusaurus/pres
et-classic':
         specifier: 3.6.3
-        version: 3.6.3(@algolia/client-search@5.18.0)(@mdx-js/react@3.0.1(@type
s/react@18.3.12)(react@18.3.
1))(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/react@18.3.12)(acorn@8.14.0)(b
ufferutil@4.0.9)(eslint@9.16.0(jiti@2.4.2))(react-dom@18.3.1(react@18.3.1))(reac
t@18.3.1)(search-insights@2.17.3)(typescript@5.6.3)(utf-8-validate@5.0.10)

    +        version: 3.6.3(@algolia/client-search@5.19.0)(@mdx-js/react@3.0.1(@
types/react@18.3.12)(react@18.3.
1))(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/react@18.3.12)(acorn@8.14.0)(b
ufferutil@4.0.9)(eslint@9.16.0(jiti@2.4.2))(react-dom@18.3.1(react@18.3.1))(reac
t@18.3.1)(search-insights@2.17.3)(typescript@5.6.3)(utf-8-validate@5.0.10)

           '@docusaurus/theme-common':
         specifier: 3.6.3
         version: 3.6.3(@docusaurus/plugin-content-docs@3.6.3(@mdx-js/react@3.0.
1(@types/react@18.3.12)(reac
t@18.3.1))(@swc/core@1.10.4(@swc/helpers@0.5.15))(acorn@8.14.0)(bufferutil@4.0.9
)(eslint@9.16.0(jiti@2.4.2))(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(types
cript@5.6.3)(utf-8-validate@5.0.10))(@swc/core@1.10.4(@swc/helpers@0.5.15))(acor
n@8.14.0)(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(typescript@5.6.3)
    @@ -444,7 +444,7 @@ importers:
     devDependencies:
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/adapter-redis:
     dependencies:
@@ -463,7 +463,7 @@ importers:
         version: 5.0.0
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/adapter-sqlite:
     dependencies:
@@ -485,7 +485,7 @@ importers:
     devDependencies:
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/adapter-sqljs:
     dependencies:
@@ -507,7 +507,7 @@ importers:
     devDependencies:
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/adapter-supabase:
     dependencies:
@@ -523,7 +523,7 @@ importers:
     devDependencies:
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/client-auto:
     dependencies:
@@ -554,7 +554,7 @@ importers:
     devDependencies:
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/client-direct:
     dependencies:
@@ -597,7 +597,7 @@ importers:
         version: 1.4.12
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/client-discord:
     dependencies:
@@ -634,7 +634,7 @@ importers:
     devDependencies:
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/client-farcaster:
     dependencies:
@@ -643,11 +643,11 @@ importers:
         version: link:../core
       '@neynar/nodejs-sdk':
         specifier: ^2.0.3
-        version: 2.7.0(bufferutil@4.0.9)(class-transformer@0.5.1)(encoding@0.1.
13)(typescript@5.6.3)(utf-8-
validate@5.0.10)(zod@3.23.8)
                            +        version: 2.8.0(bufferutil@4.0.9)(class-tran
sformer@0.5.1)(encoding@0.1.13)(typescript@5.6.3)(utf-8-
validate@5.0.10)(zod@3.23.8)
                                 devDependencies:
       tsup:
         specifier: ^8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/client-github:
     dependencies:
@@ -672,7 +672,7 @@ importers:
         version: 8.1.0
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/client-lens:
     dependencies:
@@ -691,7 +691,7 @@ importers:
     devDependencies:
       tsup:
         specifier: ^8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/client-slack:
     dependencies:
@@ -734,22 +734,22 @@ importers:
         version: 29.5.14
       '@types/node':
         specifier: ^18.15.11
-        version: 18.19.69
+        version: 18.19.70
       jest:
         specifier: ^29.5.0
-        version: 29.7.0(@types/node@18.19.69)(ts-node@10.9.2(@swc/core@1.10.4(@
swc/helpers@0.5.15))(@types/
node@18.19.69)(typescript@5.6.3))
                            +        version: 29.7.0(@types/node@18.19.70)(ts-no
de@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/
node@18.19.70)(typescript@5.6.3))
                                   rimraf:
         specifier: ^5.0.0
         version: 5.0.10
       ts-jest:
         specifier: ^29.1.0
-        version: 29.2.5(@babel/core@7.26.0)(@jest/transform@29.7.0)(@jest/types
@29.6.3)(babel-jest@29.7.0(@
babel/core@7.26.0))(jest@29.7.0(@types/node@18.19.69)(ts-node@10.9.2(@swc/core@1
.10.4(@swc/helpers@0.5.15))(@types/node@18.19.69)(typescript@5.6.3)))(typescript
@5.6.3)                                                 +        version: 29.2.5
(@babel/core@7.26.0)(@jest/transform@29.7.0)(@jest/types@29.6.3)(babel-jest@29.7
.0(@
babel/core@7.26.0))(jest@29.7.0(@types/node@18.19.70)(ts-node@10.9.2(@swc/core@1
.10.4(@swc/helpers@0.5.15))(@types/node@18.19.70)(typescript@5.6.3)))(typescript
@5.6.3)                                                        ts-node:
         specifier: ^10.9.1
-        version: 10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@18.1
9.69)(typescript@5.6.3)
+        version: 10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@18.1
9.70)(typescript@5.6.3)
       tsup:
         specifier: ^8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   typescript:
         specifier: ^5.0.0
         version: 5.6.3
@@ -771,7 +771,7 @@ importers:
     devDependencies:
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/client-twitter:
     dependencies:
@@ -793,7 +793,7 @@ importers:
     devDependencies:
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/core:
     dependencies:
@@ -823,7 +823,7 @@ importers:
         version: 10.0.0
       ai:
         specifier: 3.4.33
-        version: 3.4.33(openai@4.73.0(encoding@0.1.13)(zod@3.23.8))(react@18.3.
1)(sswr@2.1.0(svelte@5.16.1)
)(svelte@5.16.1)(vue@3.5.13(typescript@5.6.3))(zod@3.23.8)
                            +        version: 3.4.33(openai@4.73.0(encoding@0.1.
13)(zod@3.23.8))(react@18.3.1)(sswr@2.1.0(svelte@5.17.1)
)(svelte@5.17.1)(vue@3.5.13(typescript@5.6.3))(zod@3.23.8)
                                   anthropic-vertex-ai:
         specifier: 1.0.2
         version: 1.0.2(encoding@0.1.13)(zod@3.23.8)
@@ -962,7 +962,7 @@ importers:
         version: 2.8.1
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   typescript:
         specifier: 5.6.3
         version: 5.6.3
@@ -999,7 +999,7 @@ importers:
         version: 6.13.4(bufferutil@4.0.9)(utf-8-validate@5.0.10)
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/plugin-3d-generation:
     dependencies:
@@ -1008,7 +1008,7 @@ importers:
         version: link:../core
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1020,7 +1020,7 @@ importers:
         version: link:../core
       tsup:
         specifier: ^8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   web3:
         specifier: ^4.15.0
         version: 4.16.0(bufferutil@4.0.9)(encoding@0.1.13)(typescript@5.6.3)(ut
f-8-validate@5.0.10)(zod@3.2
3.8)
                            @@ -1050,10 +1050,10 @@ importers:
         version: 5.1.2
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   vitest:
         specifier: 2.1.4
-        version: 2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                            +        version: 2.1.4(@types/node@22.10.5)(jsdom@2
5.0.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1069,7 +1069,7 @@ importers:
     devDependencies:
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/plugin-bootstrap:
     dependencies:
@@ -1078,7 +1078,7 @@ importers:
         version: link:../core
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1109,7 +1109,7 @@ importers:
         version: 20.17.9
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/plugin-conflux:
     dependencies:
@@ -1130,13 +1130,13 @@ importers:
         version: link:../plugin-trustdb
       tsup:
         specifier: ^8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   web3:
         specifier: ^4.15.0
         version: 4.16.0(bufferutil@4.0.9)(encoding@0.1.13)(typescript@5.6.3)(ut
f-8-validate@5.0.10)(zod@3.2
3.8)
                                   web3-plugin-zksync:
         specifier: ^1.0.8
-        version: 1.0.8(bufferutil@4.0.9)(ts-node@10.9.2(@swc/core@1.10.4(@swc/h
elpers@0.5.15))(@types/node@
22.10.4)(typescript@5.6.3))(typescript@5.6.3)(utf-8-validate@5.0.10)(web3@4.16.0
(bufferutil@4.0.9)(encoding@0.1.13)(typescript@5.6.3)(utf-8-validate@5.0.10)(zod
@3.23.8))                                               +        version: 1.0.8(
bufferutil@4.0.9)(ts-node@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/n
ode@
22.10.5)(typescript@5.6.3))(typescript@5.6.3)(utf-8-validate@5.0.10)(web3@4.16.0
(bufferutil@4.0.9)(encoding@0.1.13)(typescript@5.6.3)(utf-8-validate@5.0.10)(zod
@3.23.8))                                                      whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1169,7 +1169,7 @@ importers:
         version: 16.3.0
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1184,7 +1184,7 @@ importers:
         version: 1.5.1
       '@onflow/fcl':
         specifier: 1.13.1
-        version: 1.13.1(@types/react@18.3.12)(bufferutil@4.0.9)(encoding@0.1.13
)(google-protobuf@3.21.4)(io
redis@5.4.2)(jiti@2.4.2)(postcss@8.4.49)(react@18.3.1)(tsx@4.19.2)(utf-8-validat
e@5.0.10)                   +        version: 1.13.1(@types/react@18.3.12)(buffe
rutil@4.0.9)(encoding@0.1.13)(google-protobuf@3.21.4)(io
redis@5.4.2)(jiti@2.4.2)(postcss@8.4.49)(react@18.3.1)(utf-8-validate@5.0.10)
                                   '@onflow/typedefs':
         specifier: 1.4.0
         version: 1.4.0
@@ -1221,10 +1221,10 @@ importers:
         version: 10.0.0
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   vitest:
         specifier: 2.1.4
-        version: 2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                            +        version: 2.1.4(@types/node@22.10.5)(jsdom@2
5.0.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                             
   packages/plugin-fuel:
     dependencies:
@@ -1236,13 +1236,13 @@ importers:
         version: 4.0.1
       fuels:
         specifier: 0.97.2
-        version: 0.97.2(encoding@0.1.13)(vitest@2.1.4(@types/node@22.10.4)(jsdo
m@25.0.1(bufferutil@4.0.9)(c
anvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +        version: 0.97.2(encoding@0.1.13)(vitest@2.1
.4(@types/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(c
anvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   vitest:
         specifier: 2.1.4
-        version: 2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                            +        version: 2.1.4(@types/node@22.10.5)(jsdom@2
5.0.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1254,7 +1254,7 @@ importers:
         version: link:../core
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/plugin-goat:
     dependencies:
@@ -1263,7 +1263,7 @@ importers:
         version: link:../core
       '@goat-sdk/adapter-vercel-ai':
         specifier: 0.2.0
-        version: 0.2.0(@goat-sdk/core@0.4.0)(ai@3.4.33(openai@4.77.0(encoding@0
.1.13)(zod@3.23.8))(react@18
.3.1)(sswr@2.1.0(svelte@5.16.1))(svelte@5.16.1)(vue@3.5.13(typescript@5.6.3))(zo
d@3.23.8))                  +        version: 0.2.0(@goat-sdk/core@0.4.0)(ai@3.4
.33(openai@4.77.4(encoding@0.1.13)(zod@3.23.8))(react@18
.3.1)(sswr@2.1.0(svelte@5.17.1))(svelte@5.17.1)(vue@3.5.13(typescript@5.6.3))(zo
d@3.23.8))                         '@goat-sdk/core':
         specifier: 0.4.0
         version: 0.4.0
@@ -1281,7 +1281,7 @@ importers:
         version: 0.2.0(@goat-sdk/wallet-evm@0.2.0(@goat-sdk/core@0.4.0)(bufferu
til@4.0.9)(typescript@5.6.3)
(utf-8-validate@5.0.10))(viem@2.21.53(bufferutil@4.0.9)(typescript@5.6.3)(utf-8-
validate@5.0.10)(zod@3.23.8))
                                                               tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   viem:
         specifier: 2.21.53
         version: 2.21.53(bufferutil@4.0.9)(typescript@5.6.3)(utf-8-validate@5.0
.10)(zod@3.23.8)
@@ -1312,10 +1312,10 @@ importers:
         version: 29.5.14
       jest:
         specifier: 29.7.0
-        version: 29.7.0(@types/node@22.10.4)
+        version: 29.7.0(@types/node@22.10.5)
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   typescript:
         specifier: 5.6.3
         version: 5.6.3
@@ -1327,7 +1327,7 @@ importers:
         version: link:../core
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1345,7 +1345,7 @@ importers:
         version: 1.0.2
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1372,10 +1372,10 @@ importers:
         version: 2.1.1
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   vitest:
         specifier: 2.1.5
-        version: 2.1.5(@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                            +        version: 2.1.5(@types/node@22.10.5)(jsdom@2
5.0.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1402,7 +1402,7 @@ importers:
         version: 5.1.2
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1447,7 +1447,7 @@ importers:
         version: 5.1.2
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1456,10 +1456,10 @@ importers:
     dependencies:
       '@aws-sdk/client-s3':
         specifier: ^3.705.0
-        version: 3.721.0
+        version: 3.723.0
       '@aws-sdk/s3-request-presigner':
         specifier: ^3.705.0
-        version: 3.721.0
+        version: 3.723.0
       '@cliqz/adblocker-playwright':
         specifier: 1.34.0
         version: 1.34.0(playwright@1.48.2)
@@ -1628,7 +1628,7 @@ importers:
         version: 22.8.4
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/plugin-solana:
     dependencies:
@@ -1670,13 +1670,13 @@ importers:
         version: 5.1.2
       pumpdotfun-sdk:
         specifier: 1.3.2
-        version: 1.3.2(bufferutil@4.0.9)(encoding@0.1.13)(fastestsmallesttexten
coderdecoder@1.0.22)(rollup@
4.29.1)(typescript@5.6.3)(utf-8-validate@5.0.10)
                            +        version: 1.3.2(bufferutil@4.0.9)(encoding@0
.1.13)(fastestsmallesttextencoderdecoder@1.0.22)(rollup@
4.30.1)(typescript@5.6.3)(utf-8-validate@5.0.10)
                                   tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   vitest:
         specifier: 2.1.4
-        version: 2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                            +        version: 2.1.4(@types/node@22.10.5)(jsdom@2
5.0.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1703,13 +1703,13 @@ importers:
         version: 6.18.0(encoding@0.1.13)
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   unruggable-sdk:
         specifier: 1.4.0
         version: 1.4.0(starknet@6.18.0(encoding@0.1.13))
       vitest:
         specifier: 2.1.5
-        version: 2.1.5(@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                            +        version: 2.1.5(@types/node@22.10.5)(jsdom@2
5.0.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1730,14 +1730,14 @@ importers:
         version: 1.2.0-rc.3(bufferutil@4.0.9)(typescript@5.6.3)(utf-8-validate@
5.0.10)(zod@3.23.8)
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
     devDependencies:
       '@types/node':
         specifier: ^22.10.1
-        version: 22.10.4
+        version: 22.10.5
 
   packages/plugin-sui:
     dependencies:
@@ -1764,10 +1764,10 @@ importers:
         version: 5.1.2
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   vitest:
         specifier: 2.1.4
-        version: 2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                            +        version: 2.1.4(@types/node@22.10.5)(jsdom@2
5.0.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1800,10 +1800,10 @@ importers:
         version: 5.1.2
       pumpdotfun-sdk:
         specifier: 1.3.2
-        version: 1.3.2(bufferutil@4.0.9)(encoding@0.1.13)(fastestsmallesttexten
coderdecoder@1.0.22)(rollup@
4.29.1)(typescript@5.6.3)(utf-8-validate@5.0.10)
                            +        version: 1.3.2(bufferutil@4.0.9)(encoding@0
.1.13)(fastestsmallesttextencoderdecoder@1.0.22)(rollup@
4.30.1)(typescript@5.6.3)(utf-8-validate@5.0.10)
                                   tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1833,7 +1833,7 @@ importers:
         version: 5.1.2
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1848,13 +1848,13 @@ importers:
         version: 3.2.2
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   uuid:
         specifier: 11.0.3
         version: 11.0.3
       vitest:
         specifier: 2.1.5
-        version: 2.1.5(@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                            +        version: 2.1.5(@types/node@22.10.5)(jsdom@2
5.0.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(
utf-8-validate@5.0.10))(terser@5.37.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1873,7 +1873,7 @@ importers:
         version: 0.0.17
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                             
   packages/plugin-video-generation:
     dependencies:
@@ -1882,7 +1882,7 @@ importers:
         version: link:../core
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1894,7 +1894,7 @@ importers:
         version: link:../core
       tsup:
         specifier: 8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1940,13 +1940,13 @@ importers:
         version: link:../plugin-trustdb
       tsup:
         specifier: ^8.3.5
-        version: 8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postc
ss@8.4.49)(tsx@4.19.2)(types
cript@5.6.3)(yaml@2.7.0)
                            +        version: 8.3.5(@swc/core@1.10.4(@swc/helper
s@0.5.15))(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)
(yaml@2.7.0)
                                   web3:
         specifier: ^4.15.0
         version: 4.16.0(bufferutil@4.0.9)(encoding@0.1.13)(typescript@5.6.3)(ut
f-8-validate@5.0.10)(zod@3.2
3.8)
                                   web3-plugin-zksync:
         specifier: ^1.0.8
-        version: 1.0.8(bufferutil@4.0.9)(ts-node@10.9.2(@swc/core@1.10.4(@swc/h
elpers@0.5.15))(@types/node@
22.10.4)(typescript@5.6.3))(typescript@5.6.3)(utf-8-validate@5.0.10)(web3@4.16.0
(bufferutil@4.0.9)(encoding@0.1.13)(typescript@5.6.3)(utf-8-validate@5.0.10)(zod
@3.23.8))                                               +        version: 1.0.8(
bufferutil@4.0.9)(ts-node@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/n
ode@
22.10.5)(typescript@5.6.3))(typescript@5.6.3)(utf-8-validate@5.0.10)(web3@4.16.0
(bufferutil@4.0.9)(encoding@0.1.13)(typescript@5.6.3)(utf-8-validate@5.0.10)(zod
@3.23.8))                                                      whatwg-url:
         specifier: 7.1.0
         version: 7.1.0
@@ -1958,8 +1958,8 @@ packages:
     peerDependencies:
       ethers: 6.13.1
 
-  '@0no-co/graphql.web@1.0.12':
-    resolution: {integrity: sha512-BTDjjsV/zSPy5fqItwm+KWUfh9CSe9tTtR6rCB72ddtk
AxdcHbi4Ir4r/L1Et4lyxmL+i7Rb
3m9sjLLi9tYrzA==}
                            +  '@0no-co/graphql.web@1.0.13':
+    resolution: {integrity: sha512-jqYxOevheVTU1S36ZdzAkJIdvRp2m3OYIG5SEoKDw5NI
8eVwkoI0D/Q3DYNGmXCxkA6CQuoa
7zvMiDPTLqUNuw==}
                                 peerDependencies:
       graphql: ^14.0.0 || ^15.0.0 || ^16.0.0
     peerDependenciesMeta:
@@ -2129,8 +2129,8 @@ packages:
   '@algolia/cache-in-memory@4.24.0':
     resolution: {integrity: sha512-gDrt2so19jW26jY3/MkFg5mEypFIPbPoXsQGQWAi6TrC
PsNOSEYepBMPlucqWigsmEy/prp5
ug2jy/N3PVG/8w==}
                             
-  '@algolia/client-abtesting@5.18.0':
-    resolution: {integrity: sha512-DLIrAukjsSrdMNNDx1ZTks72o4RH/1kOn8Wx5zZm8nnq
FexG+JzY4SANnCNEjnFQPJTTvC+K
pgiNW/CP2lumng==}
                            +  '@algolia/client-abtesting@5.19.0':
+    resolution: {integrity: sha512-dMHwy2+nBL0SnIsC1iHvkBao64h4z+roGelOz11cxrDB
rAdASxLxmfVMop8gmodQ2yZSacX0
Rzevtxa+9SqxCw==}
                                 engines: {node: '>= 14.0.0'}
 
   '@algolia/client-account@4.24.0':
@@ -2139,44 +2139,44 @@ packages:
   '@algolia/client-analytics@4.24.0':
     resolution: {integrity: sha512-y8jOZt1OjwWU4N2qr8G4AxXAzaa8DBvyHTWlHzX/7Me1
LX8OayfgHexqrsL4vSBcoMmVw2Xn
VW9MhL+Y2ZDJXg==}
                             
-  '@algolia/client-analytics@5.18.0':
-    resolution: {integrity: sha512-0VpGG2uQW+h2aejxbG8VbnMCQ9ary9/ot7OASXi6OjE0
SRkYQ/+pkW+q09+IScif3pmsVVYg
gmlMPtAsmYWHng==}
                            +  '@algolia/client-analytics@5.19.0':
+    resolution: {integrity: sha512-CDW4RwnCHzU10upPJqS6N6YwDpDHno7w6/qXT9KPbPbt
8szIIzCHrva4O9KIfx1OhdsHzfGS
I5hMAiOOYl4DEQ==}
                                 engines: {node: '>= 14.0.0'}
 
   '@algolia/client-common@4.24.0':
     resolution: {integrity: sha512-bc2ROsNL6w6rqpl5jj/UywlIYC21TwSSoFHKl01lYirG
MW+9Eek6r02Tocg4gZ8HAw3iBvu6
XQiM3BEbmEMoiA==}
                             
-  '@algolia/client-common@5.18.0':
-    resolution: {integrity: sha512-X1WMSC+1ve2qlMsemyTF5bIjwipOT+m99Ng1Tyl36ZjQ
KTa54oajBKE0BrmM8LD8jGdtukAg
kUhFoYOaRbMcmQ==}
                            +  '@algolia/client-common@5.19.0':
+    resolution: {integrity: sha512-2ERRbICHXvtj5kfFpY5r8qu9pJII/NAHsdgUXnUitQFw
PdPL7wXiupcvZJC7DSntOnE8AE0l
M7oDsPhrJfj5nQ==}
                                 engines: {node: '>= 14.0.0'}
 
-  '@algolia/client-insights@5.18.0':
-    resolution: {integrity: sha512-FAJRNANUOSs/FgYOJ/Njqp+YTe4TMz2GkeZtfsw1TMiA
5mVNRS/nnMpxas9771aJz7KTEWvK
9GwqPs0K6RMYWg==}
                            +  '@algolia/client-insights@5.19.0':
+    resolution: {integrity: sha512-xPOiGjo6I9mfjdJO7Y+p035aWePcbsItizIp+qVyfkfZ
iGgD+TbNxM12g7QhFAHIkx/mlYao
cxPY/TmwPzTe+A==}
                                 engines: {node: '>= 14.0.0'}
 
   '@algolia/client-personalization@4.24.0':
     resolution: {integrity: sha512-l5FRFm/yngztweU0HdUzz1rC4yoWCFo3IF+dVIVTfEPg
906eZg5BOd1k0K6rZx5JzyyoP4Ld
mOikfkfGsKVE9w==}
                             
-  '@algolia/client-personalization@5.18.0':
-    resolution: {integrity: sha512-I2dc94Oiwic3SEbrRp8kvTZtYpJjGtg5y5XnqubgnA15
AgX59YIY8frKsFG8SOH1n2rIhUCl
cuDkxYQNXJLg+w==}
                            +  '@algolia/client-personalization@5.19.0':
+    resolution: {integrity: sha512-B9eoce/fk8NLboGje+pMr72pw+PV7c5Z01On477heTZ7
jkxoZ4X92dobeGuEQop61cJ93Gae
vd1of4mBr4hu2A==}
                                 engines: {node: '>= 14.0.0'}
 
-  '@algolia/client-query-suggestions@5.18.0':
-    resolution: {integrity: sha512-x6XKIQgKFTgK/bMasXhghoEjHhmgoP61pFPb9+TaUJ32
aKOGc65b12usiGJ9A84yS73UDkXS
452NjyP50Knh/g==}
                            +  '@algolia/client-query-suggestions@5.19.0':
+    resolution: {integrity: sha512-6fcP8d4S8XRDtVogrDvmSM6g5g6DndLc0pEm1GCKe9/Z
kAzCmM3ZmW1wFYYPxdjMeifWy1vV
EDMJK7sbE4W7MA==}
                                 engines: {node: '>= 14.0.0'}
 
   '@algolia/client-search@4.24.0':
     resolution: {integrity: sha512-uRW6EpNapmLAD0mW47OXqTP8eiIx5F6qN9/x/7HHO6ow
L3N1IXqydGwW5nhDFBrV+ldouro2
W1VX3XlcUXEFCA==}
                             
-  '@algolia/client-search@5.18.0':
-    resolution: {integrity: sha512-qI3LcFsVgtvpsBGR7aNSJYxhsR+Zl46+958ODzg8aCxI
cdxiK7QEVLMJMZAR57jGqW0Lg/vr
jtuLFDMfSE53qA==}
                            +  '@algolia/client-search@5.19.0':
+    resolution: {integrity: sha512-Ctg3xXD/1VtcwmkulR5+cKGOMj4r0wC49Y/KZdGQcqpy
dKn+e86F6l3tb3utLJQVq4lpEJud
6kdRykFgcNsp8Q==}
                                 engines: {node: '>= 14.0.0'}
 
   '@algolia/events@4.0.1':
     resolution: {integrity: sha512-FQzvOCgoFXAbf5Y6mYozw2aj5KCJoA3m4heImceldzPS
MbdyS4atVjJzXKMsfX3wnZTFYwkk
t8/z8UesLHlSBQ==}
                             
-  '@algolia/ingestion@1.18.0':
-    resolution: {integrity: sha512-bGvJg7HnGGm+XWYMDruZXWgMDPVt4yCbBqq8DM6EoaMB
K71SYC4WMfIdJaw+ABqttjBhe6aK
NRkWf/bbvYOGyw==}
                            +  '@algolia/ingestion@1.19.0':
+    resolution: {integrity: sha512-LO7w1MDV+ZLESwfPmXkp+KLeYeFrYEgtbCZG6buWjddh
YraPQ9MuQWLhLLiaMlKxZ/sZvFTc
ZYuyI6Jx4WBhcg==}
                                 engines: {node: '>= 14.0.0'}
 
   '@algolia/logger-common@4.24.0':
@@ -2185,36 +2185,36 @@ packages:
   '@algolia/logger-console@4.24.0':
     resolution: {integrity: sha512-X4C8IoHgHfiUROfoRCV+lzSy+LHMgkoEEU1BbKcsfnV0
i0S20zyy0NLww9dwVHUWNfPPxdMU
+/wKmLGYf96yTg==}
                             
-  '@algolia/monitoring@1.18.0':
-    resolution: {integrity: sha512-lBssglINIeGIR+8KyzH05NAgAmn1BCrm5D2T6pMtr/8k
bTHvvrm1Zvcltc5dKUQEFyyx3J5+
MhNc7kfi8LdjVw==}
                            +  '@algolia/monitoring@1.19.0':
+    resolution: {integrity: sha512-Mg4uoS0aIKeTpu6iv6O0Hj81s8UHagi5TLm9k2mLIib4
vmMtX7WgIAHAcFIaqIZp5D6s5EVy
1BaDOoZ7buuJHA==}
                                 engines: {node: '>= 14.0.0'}
 
   '@algolia/recommend@4.24.0':
     resolution: {integrity: sha512-P9kcgerfVBpfYHDfVZDvvdJv0lEoCvzNlOy2nykyt5bK
8TyieYyiD0lguIJdRZZYGre03WIA
Ff14pgE+V+IBlw==}
                             
-  '@algolia/recommend@5.18.0':
-    resolution: {integrity: sha512-uSnkm0cdAuFwdMp4pGT5vHVQ84T6AYpTZ3I0b3k/M3wg
4zXDhl3aCiY8NzokEyRLezz/kHLE
Ecgb/tTTobOYVw==}
                            +  '@algolia/recommend@5.19.0':
+    resolution: {integrity: sha512-PbgrMTbUPlmwfJsxjFhal4XqZO2kpBNRjemLVTkUiti4
w/+kzcYO4Hg5zaBgVqPwvFDNQ8JS
4SS3TBBem88u+g==}
                                 engines: {node: '>= 14.0.0'}
 
   '@algolia/requester-browser-xhr@4.24.0':
     resolution: {integrity: sha512-Z2NxZMb6+nVXSjF13YpjYTdvV3032YTBSGm2vnYvYPA6
mMxzM3v5rsCiSspndn9rzIW4Qp1l
PHBvuoKJV6jnAA==}
                             
-  '@algolia/requester-browser-xhr@5.18.0':
-    resolution: {integrity: sha512-1XFjW0C3pV0dS/9zXbV44cKI+QM4ZIz9cpatXpsjRlq6
SUCpLID3DZHsXyE6sTb8IhyPaUjk
78GEJT8/3hviqg==}
                            +  '@algolia/requester-browser-xhr@5.19.0':
+    resolution: {integrity: sha512-GfnhnQBT23mW/VMNs7m1qyEyZzhZz093aY2x8p0era96
MMyNv8+FxGek5pjVX0b57tmSCZPf
4EqNCpkGcGsmbw==}
                                 engines: {node: '>= 14.0.0'}
 
   '@algolia/requester-common@4.24.0':
     resolution: {integrity: sha512-k3CXJ2OVnvgE3HMwcojpvY6d9kgKMPRxs/kVohrwF5WM
r2fnqojnycZkxPoEg+bXm8fi5BBf
FmOqgYztRtHsQA==}
                             
-  '@algolia/requester-fetch@5.18.0':
-    resolution: {integrity: sha512-0uodeNdAHz1YbzJh6C5xeQ4T6x5WGiUxUq3GOaT/R4nj
h5t78dq+Rb187elr7KtnjUmETVVu
CvmEYaThfTHzNg==}
                            +  '@algolia/requester-fetch@5.19.0':
+    resolution: {integrity: sha512-oyTt8ZJ4T4fYvW5avAnuEc6Laedcme9fAFryMD9ndUTI
Ue/P0kn3BuGcCLFjN3FDmdrETHSF
kgPPf1hGy3sLCw==}
                                 engines: {node: '>= 14.0.0'}
 
   '@algolia/requester-node-http@4.24.0':
     resolution: {integrity: sha512-JF18yTjNOVYvU/L3UosRcvbPMGT9B+/GQWNWnenIImgl
zNVGpyzChkXLnrSf6uxwVNO6ESGu
6oN8MqcGQcjQJw==}
                             
-  '@algolia/requester-node-http@5.18.0':
-    resolution: {integrity: sha512-tZCqDrqJ2YE2I5ukCQrYN8oiF6u3JIdCxrtKq+eniuLk
jkO78TKRnXrVcKZTmfFJyyDK8q47
SfDcHzAA3nHi6w==}
                            +  '@algolia/requester-node-http@5.19.0':
+    resolution: {integrity: sha512-p6t8ue0XZNjcRiqNkb5QAM0qQRAKsCiebZ6n9JjWA+p8
fWf8BvnhO55y2fO28g3GW0Imj7Pr
AuyBuxq8aDVQwQ==}
                                 engines: {node: '>= 14.0.0'}
 
   '@algolia/transporter@4.24.0':
@@ -2270,6 +2270,9 @@ packages:
     resolution: {integrity: sha512-d6nWtUI//fyEN8DeLjm3+ro87Ad6+IKwR9pCqfrs/Aza
hso1xR1Llxd/O6fj/m1DDsuDj/HA
sCsy5TC/aKD6Eg==}
                                 engines: {node: '>=11.0.0'}
 
+  '@asamuzakjp/css-color@2.8.2':
+    resolution: {integrity: sha512-RtWv9jFN2/bLExuZgFFZ0I3pWWeezAHGgrmjqGGWclAT
l1aDe3yhCUaI0Ilkp6OCk9zX7+Fj
vDasEX8Q9Rxc5w==}
                            +
   '@avnu/avnu-sdk@2.1.1':
     resolution: {integrity: sha512-y/r/pVT2pU33fGHNVE7A5UIAqQhjEXYQhUh7EodY1s5H
7mhRd5U8zHOtI5z6vmpuSnUv0hSv
Ommgz8HTuwZ7ew==}
                                 engines: {node: '>=18'}
@@ -2301,177 +2304,177 @@ packages:
   '@aws-crypto/util@5.2.0':
     resolution: {integrity: sha512-4RkU9EsI6ZpBve5fseQlGNUWKMa1RLPQ1dnjnQoe07ld
fIzcsGb5hC5W0Dm7u423KWzawlrp
bjXBrXCEv9zazQ==}
                             
-  '@aws-sdk/client-polly@3.721.0':
-    resolution: {integrity: sha512-SCTx9DKOnfEKyWb6bx5J7aeowBig8QmiqOJlE0sMM/pb
pF70YGC/ugk1/yFJAJlAkoDadtRv
seFpwLvrg7N73Q==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/client-polly@3.723.0':
+    resolution: {integrity: sha512-AD4wO0RXrmrYsLZeX1ne1767IZZ3wLAnvXBl0wLuyy2g
dQ4SiIkDc0sW1SVcv8DpH+Jy03tl
SIxmZYtRjMVFaw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/client-s3@3.721.0':
-    resolution: {integrity: sha512-uCZC8elYhUFF21yq1yB5TrE/VYz8A4/VnttUHc65/jqn
HReTDvEC0XAc756tJnjfrReyM1ws
12FzBLHoW/NDjg==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/client-s3@3.723.0':
+    resolution: {integrity: sha512-uJkSBWeAbEORApCSc8ZlD8nmmJVZnklauSR+GLnG19Zi
HQl3ib6IzT4zdnMHrrIXqVttwkyC
8eT703ZUDVaacw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/client-sso-oidc@3.721.0':
-    resolution: {integrity: sha512-jwsgdUEbNJqs1O0AQtf9M6SI7hFIjxH+IKeKCMca0xVt
+Tr1UqLr/qMK/6W8LoMtRFnE0lpB
SHW6hvmLp2OCoQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/client-sso-oidc@3.723.0':
+    resolution: {integrity: sha512-9IH90m4bnHogBctVna2FnXaIGVORncfdxcqeEIovOxjI
JJyHDmEAtA7B91dAM4sruddTbVzO
YnqfPVst3odCbA==}
                            +    engines: {node: '>=18.0.0'}
     peerDependencies:
-      '@aws-sdk/client-sts': ^3.721.0
+      '@aws-sdk/client-sts': ^3.723.0
 
-  '@aws-sdk/client-sso@3.721.0':
-    resolution: {integrity: sha512-UrYAF4ilpO2cZBFddQmbETfo0xKP3CEcantcMQTc0xPY
3quHLZhYuBiRae+McWi6yZpH4Ern
FZIWeKSJ2OQgqQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/client-sso@3.723.0':
+    resolution: {integrity: sha512-r1ddZDb8yPmdofX1gQ4m8oqKozgkgVONLlAuSprGObby
My8bYt1Psxu+GjnwMmgVu3vlF069
PHyW1ndrBiL1zA==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/client-sts@3.721.0':
-    resolution: {integrity: sha512-1Pv8F02hQFmPZs7WtGfQNlnInbG1lLzyngJc/MlZ3Ld2
fIoWjaWp7bJWgYAjnzHNEuDtCabW
JvIfePdRqsbYoA==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/client-sts@3.723.0':
+    resolution: {integrity: sha512-YyN8x4MI/jMb4LpHsLf+VYqvbColMK8aZeGWVk2fTFsm
t8lpTYGaGC1yybSwGX42mZ4W8ucu
8SAYSbUraJZEjA==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/client-transcribe-streaming@3.721.0':
-    resolution: {integrity: sha512-8imB8tEHfUW597yGM6/qRmBXyRYNPp7bddBg67g6AHzj
/UG0xI1EQZzyBntUyy/sQzvMgcPo
UoYdFHdfQWQ7vw==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/client-transcribe-streaming@3.723.0':
+    resolution: {integrity: sha512-/aRRb9JwSHId/vHqqy/gu2mRrmJTYEgCKnNxhAbZSKXa
nxfK7y0IrWZFdYcczc2j8rsTXKb+
cF/Plb7qPnTmdA==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/core@3.716.0':
-    resolution: {integrity: sha512-5DkUiTrbyzO8/W4g7UFEqRFpuhgizayHI/Zbh0wtFMco
t8801nJV+MP/YMhdjimlvAr/OqYB
08FbGsPyWppMTw==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/core@3.723.0':
+    resolution: {integrity: sha512-UraXNmvqj3vScSsTkjMwQkhei30BhXlW5WxX6JacMKVt
l95c7z0qOXquTWeTalYkFfulfdir
UhvSZrl+hcyqTw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/credential-provider-env@3.716.0':
-    resolution: {integrity: sha512-JI2KQUnn2arICwP9F3CnqP1W3nAbm4+meQg/yOhp9X0D
MzQiHrHRd4HIrK2vyVgi2/6hGhON
Y5uLF26yRTA7nQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/credential-provider-env@3.723.0':
+    resolution: {integrity: sha512-OuH2yULYUHTVDUotBoP/9AEUIJPn81GQ/YBtZLoo2Qye
zRJ2QiO/1epVtbJlhNZRwXrToLED
mQGA2QfC8c7pbA==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/credential-provider-http@3.716.0':
-    resolution: {integrity: sha512-CZ04pl2z7igQPysQyH2xKZHM3fLwkemxQbKOlje3TmiS
1NwXvcKvERhp9PE/H23kOL7beTM1
9NMRog/Fka/rlw==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/credential-provider-http@3.723.0':
+    resolution: {integrity: sha512-DTsKC6xo/kz/ZSs1IcdbQMTgiYbpGTGEd83kngFc1bzm
w7AmK92DBZKNZpumf8R/UfSpTcj9
zzUUmrWz1kD0eQ==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/credential-provider-ini@3.721.0':
-    resolution: {integrity: sha512-8J/c2rI+4ZoduBCnPurfdblqs2DyRvL9ztqzzOWWEhLc
coYZzYeAMwBapEAsiVsD1iNrIGY7
LRDC4TsVmJBf6Q==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/credential-provider-ini@3.723.0':
+    resolution: {integrity: sha512-fWRLksuSG851e7Iu+ltMrQTM7C/5iI9OkxAmCYblcCet
AzjTRmMB2arku0Z83D8edIZEQtOJ
Mt5oQ9KNg43pzg==}
                            +    engines: {node: '>=18.0.0'}
     peerDependencies:
-      '@aws-sdk/client-sts': ^3.721.0
+      '@aws-sdk/client-sts': ^3.723.0
 
-  '@aws-sdk/credential-provider-node@3.721.0':
-    resolution: {integrity: sha512-D6xodzdMjVhF9xRhy9gNf0gqP0Dek9fQ6BDZzqO/i54d
7CjWHVZTADcVcxjLQq6nyUNf0QPf
8UXLaqi+w25GGQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/credential-provider-node@3.723.0':
+    resolution: {integrity: sha512-OyLHt+aY+rkuRejigcxviS5RLUBcqbxhDTSNfP8dp9I+
1SP610qRLpTIROvtKwXZssFcATpP
fgikFtVYRrihXQ==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/credential-provider-process@3.716.0':
-    resolution: {integrity: sha512-0spcu2MWVVHSTHH3WE2E//ttUJPwXRM3BCp+WyI41xLz
pNu1Fd8zjOrDpEo0SnGUzsSiRTIJ
Wgkuu/tqv9NJ2A==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/credential-provider-process@3.723.0':
+    resolution: {integrity: sha512-fgupvUjz1+jeoCBA7GMv0L6xEk92IN6VdF4YcFhsgRHl
HvNgm7ayaoKQg7pz2JAAhG/3jPX6
fp0ASNy+xOhmPA==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/credential-provider-sso@3.721.0':
-    resolution: {integrity: sha512-v7npnYqfuY1vdcb0/F4Mcz+mcFyZaYry9qXhSRCPIbLP
e2PRV4E4HXIaPKmir8PhuRLEGs0Q
JWhvIWr7u6holQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/credential-provider-sso@3.723.0':
+    resolution: {integrity: sha512-laCnxrk0pgUegU+ib6rj1/Uv51wei+cH8crvBJddybc8
EDn7Qht61tCvBwf3o33qUDC+ZWZZ
ewlpSebf+J+tBw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/credential-provider-web-identity@3.716.0':
-    resolution: {integrity: sha512-vzgpWKs2gGXZGdbMKRFrMW4PqEFWkGvwWH2T7ZwQv9m+
8lQ7P4Dk2uimqu0f37HZAbpn8HFM
qRh4CaySjU354A==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/credential-provider-web-identity@3.723.0':
+    resolution: {integrity: sha512-tl7pojbFbr3qLcOE6xWaNCf1zEfZrIdSJtOPeSXfV/th
FMMAvIjgf3YN6Zo1a6cxGee8zrV/
C8PgOH33n+Ev/A==}
                            +    engines: {node: '>=18.0.0'}
     peerDependencies:
-      '@aws-sdk/client-sts': ^3.716.0
+      '@aws-sdk/client-sts': ^3.723.0
 
-  '@aws-sdk/eventstream-handler-node@3.714.0':
-    resolution: {integrity: sha512-zCEegowS+LCrPdUgGUQPX8PBUFbyBifyOuA0VieZwKYH
0kIjthGxuM9QdAD7bf1rgW+3bBEc
hWsIJqpIp4JQkg==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/eventstream-handler-node@3.723.0':
+    resolution: {integrity: sha512-CekxhxMH1GQe/kuoZsNFE8eonvmHVifyDK1MWfePyEp8
2/XvqPFWSnKlhT+SqoC6JfsMLmhs
yCP/qqr9Du0SbQ==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/middleware-bucket-endpoint@3.721.0':
-    resolution: {integrity: sha512-5UyoDoX3z3UhmetoqqqZulq2uF55Jyj9lUKAJWgTxVhD
EG5TijTQS40LP9DqwRl0hJkoUUZK
AwE0hwnUsiGXAg==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/middleware-bucket-endpoint@3.723.0':
+    resolution: {integrity: sha512-OmKSXwSlXyW+zg+xq4hUf7V4VF5/fa4LHu1JzeBlomrK
X3/NnqhnJn7760GXoDr16AT+dP7n
vv35Ofp91umEAg==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/middleware-eventstream@3.714.0':
-    resolution: {integrity: sha512-GCuRaujcT1b3TrjwvfJqBnXUbAPMySZuB017LnR3yaaf
LjIdefeL/ktbcZkCAsmY5hgrI9lF
rJ/Cp/Y3z8qstg==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/middleware-eventstream@3.723.0':
+    resolution: {integrity: sha512-cL50YsgYSlAdAZf02iNwdHJuJHlgPyv/sePpt2PW5ZYS
iE6A9/vqqptjDrUmUbpEw+ixmLD2
15OnyrnHN/MhEg==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/middleware-expect-continue@3.714.0':
-    resolution: {integrity: sha512-rlzsXdG8Lzo4Qpl35ZnpOBAWlzvDHpP9++0AXoUwAJA0
QmMm7auIRmgxJuNj91VwT9h15ZU6
xjU4S7fJl4W0+w==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/middleware-expect-continue@3.723.0':
+    resolution: {integrity: sha512-w/O0EkIzkiqvGu7U8Ke7tue0V0HYM5dZQrz6nVU+R8T2
LddWJ+njEIHU4Wh8aHPLQXdZA5NQ
umv0xLPdEutykw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/middleware-flexible-checksums@3.717.0':
-    resolution: {integrity: sha512-a5kY5r7/7bDZZlOQQGWOR1ulQewdtNexdW1Ex5DD0FLK
lFY7RD0va24hxQ6BP7mWHol+Dx4p
j6UQ8ahk0ap1tw==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/middleware-flexible-checksums@3.723.0':
+    resolution: {integrity: sha512-JY76mrUCLa0FHeMZp8X9+KK6uEuZaRZaQrlgq6zkXX/3
udukH0T3YdFC+Y9uw5ddbiwZ5+Kw
gmlhnPpiXKfP4g==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/middleware-host-header@3.714.0':
-    resolution: {integrity: sha512-6l68kjNrh5QC8FGX3I3geBDavWN5Tg1RLHJ2HLA8ByGB
tJyCwnz3hEkKfaxn0bBx0hF9Dzbf
jEOUF6cDqy2Kjg==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/middleware-host-header@3.723.0':
+    resolution: {integrity: sha512-LLVzLvk299pd7v4jN9yOSaWDZDfH0SnBPb6q+FDPaOCM
GBY8kuwQso7e/ozIKSmZHRMGO3IZ
rflasHM+rI+2YQ==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/middleware-location-constraint@3.714.0':
-    resolution: {integrity: sha512-MX7M+V+FblujKck3fyuzePVIAy9530gY719IiSxV6uN1
qLHl7VDJxNblpF/KpXakD6rOg8Op
vtmqsXj9aBMftw==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/middleware-location-constraint@3.723.0':
+    resolution: {integrity: sha512-inp9tyrdRWjGOMu1rzli8i2gTo0P4X6L7nNRXNTKfyPN
ZcBimZ4H0H1B671JofSI5isaklVy
5r4pvv2VjjLSHw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/middleware-logger@3.714.0':
-    resolution: {integrity: sha512-RkqHlMvQWUaRklU1bMfUuBvdWwxgUtEqpADaHXlGVj3v
tEY2UgBjy+57CveC4MByqKIunNvV
HBBbjrGVtwY7Lg==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/middleware-logger@3.723.0':
+    resolution: {integrity: sha512-chASQfDG5NJ8s5smydOEnNK7N0gDMyuPbx7dYYcm1t/P
KtnVfvWF+DHCTrRC2Ej76gLJVCVi
zlAJKM8v8Kg3cg==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/middleware-recursion-detection@3.714.0':
-    resolution: {integrity: sha512-AVU5ixnh93nqtsfgNc284oXsXaadyHGPHpql/jwgaaqQ
fEXjS/1/j3j9E/vpacfTTz2Vzo7h
AOjnvrOXSEVDaA==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/middleware-recursion-detection@3.723.0':
+    resolution: {integrity: sha512-7usZMtoynT9/jxL/rkuDOFQ0C2mhXl4yCm67Rg7GNTst
l67u7w5WN1aIRImMeztaKlw8Exjo
Tyo6WTs1Kceh7A==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/middleware-sdk-s3@3.716.0':
-    resolution: {integrity: sha512-Qzz5OfRA/5brqfvq+JHTInwS1EuJ1+tC6qMtwKWJN3cz
MnVJVdnnsPTf+G5IM/1yYaGEIjY8
rC1ExQLcc8ApFQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/middleware-sdk-s3@3.723.0':
+    resolution: {integrity: sha512-wfjOvNJVp8LDWhq4wO5jtSMb8Vgf4tNlR7QTEQfoYc6A
GU3WlK5xyUQcpfcpwytEhQTN9u0c
JLQpSyXDO+qSCw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/middleware-sdk-transcribe-streaming@3.714.0':
-    resolution: {integrity: sha512-2tHRZ5vgTxmyU8/6gRghj6vpMTD9OrlZod0PUrV5dTad
+uPlNzkP8RzzTm+CgwlnEUW9oKey
JFxQeR9Hgn/lGw==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/middleware-sdk-transcribe-streaming@3.723.0':
+    resolution: {integrity: sha512-0j1iix2wthdNTGtG1oFBH3vqhBeIpw+9IRiPA0xXE8xO
sqhLBHVbLtqC8/7eMdDWJHNVQdOL
lMlGAbcFo6/4Jw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/middleware-ssec@3.714.0':
-    resolution: {integrity: sha512-RkK8REAVwNUQmYbIDRw8eYbMJ8F1Rw4C9mlME4BBMhFl
elGcD3ErU2ce24moQbDxBjNwHNES
mIqgmdQk93CDCQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/middleware-ssec@3.723.0':
+    resolution: {integrity: sha512-Bs+8RAeSMik6ZYCGSDJzJieGsDDh2fRbh1HQG94T8kpw
BXVxMYihm6e9Xp2cyl+w9fyyCnh0
IdCKChP/DvrdhA==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/middleware-user-agent@3.721.0':
-    resolution: {integrity: sha512-Z3Vksb970ArsfLlARW4KVpqO+pQ1cvvGTrTQPxWDsmOz
g1kU92t9oWXGW+1M/x6bHbMQlI/E
ulQ/D8ZE/Pu46Q==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/middleware-user-agent@3.723.0':
+    resolution: {integrity: sha512-AY5H2vD3IRElplBO4DCyRMNnOG/4/cb0tsHyLe1HJy0h
dUF6eY5z/VVjKJoKbbDk7ui9euyO
BWslXxDyLmyPWg==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/middleware-websocket@3.714.0':
-    resolution: {integrity: sha512-hzIkP5miXwqsr2KXFaxyGGEjGZ3yZVGTLcbsdA799FM6
KDhxXSExaqUnbiruENX9Uev4od61
Xx1hqXb3GNEalQ==}
                            +  '@aws-sdk/middleware-websocket@3.723.0':
+    resolution: {integrity: sha512-dmp1miRv3baZgRKRlgsfpghUMFx1bHDVPW39caKVVOQL
xMWtDt8a6JKGnYm19ew2JmSe+p9h
/khdq073bPFslw==}
                                 engines: {node: '>= 14.0.0'}
 
-  '@aws-sdk/region-config-resolver@3.714.0':
-    resolution: {integrity: sha512-HJzsQxgMOAzZrbf/YIqEx30or4tZK1oNAk6Wm6xecUQx
+23JXIaePRu1YFUOLBBERQ4QBPpI
SFurZWBMZ5ibAw==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/region-config-resolver@3.723.0':
+    resolution: {integrity: sha512-tGF/Cvch3uQjZIj34LY2mg8M2Dr4kYG8VU8Yd0dFnB1y
bOEOveIK/9ypUo9ycZpB9oO6q01K
Re5ijBaxNueUQg==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/s3-request-presigner@3.721.0':
-    resolution: {integrity: sha512-2ibKGssj2TAQyfthNihhBqWdwowlol9bDpKybIi2T6D8
l2L9g0ENGLNE50MYzSFAQ3Lcjzcv
LQ/GByRPiuK+pQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/s3-request-presigner@3.723.0':
+    resolution: {integrity: sha512-aA/Tfppwa6LzOSsvHxnY2Oc1J3tUUHlltt1HVvMWeBa0
xh5kpH/0orCsTpGREBJPDJv0Y7VN
RJrmv4rDz0gMGQ==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/signature-v4-multi-region@3.716.0':
-    resolution: {integrity: sha512-k0goWotZKKz+kV6Ln0qeAMSeSVi4NipuIIz5R8A0uCF2
zBK4CXWdZR7KeaIoLBhJwQnHj1UU
7E+2MK74KIUBzA==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/signature-v4-multi-region@3.723.0':
+    resolution: {integrity: sha512-lJlVAa5Sl589qO8lwMLVUtnlF1Q7I+6k1Iomv2goY9d1
bRl4q2N5Pit2qJVr2AMW0sceQXeh
23i2a/CKOqVAdg==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/token-providers@3.721.0':
-    resolution: {integrity: sha512-cIZmKdLeEWUzPR+2lA+JcZHPvaFf/Ih+s3LXBa/uQwRF
dK+o7WfGRf7Oqe6yLRekO2jJJl4L
BJXxDOH++M9+ag==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/token-providers@3.723.0':
+    resolution: {integrity: sha512-hniWi1x4JHVwKElANh9afKIMUhAutHVBRD8zo6usr0PA
oj+Waf220+1ULS74GXtLXAPCiNXl
5Og+PHA7xT8ElQ==}
                            +    engines: {node: '>=18.0.0'}
     peerDependencies:
-      '@aws-sdk/client-sso-oidc': ^3.721.0
+      '@aws-sdk/client-sso-oidc': ^3.723.0
 
-  '@aws-sdk/types@3.714.0':
-    resolution: {integrity: sha512-ZjpP2gYbSFlxxaUDa1Il5AVvfggvUPbjzzB/l3q0gIE5
Thd6xKW+yzEpt2mLZ5s5UaYSABZb
F94g8NUOF4CVGA==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/types@3.723.0':
+    resolution: {integrity: sha512-LmK3kwiMZG1y5g3LGihT9mNkeNOmwEyPk6HGcJqh0wOS
V4QpWoKu2epyKE4MLQNUUlz2kOVb
VbOrwmI6ZcteuA==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/util-arn-parser@3.693.0':
-    resolution: {integrity: sha512-WC8x6ca+NRrtpAH64rWu+ryDZI3HuLwlEr8EU6/dbC/p
t+r/zC0PBoC15VEygUaBA+isppCi
kQpGyEDu0Yj7gQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/util-arn-parser@3.723.0':
+    resolution: {integrity: sha512-ZhEfvUwNliOQROcAk34WJWVYTlTa4694kSVhDSjW6lE1
bMataPnIN8A0ycukEzBXmd8ZSoBc
QLn6lKGl7XIJ5w==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/util-endpoints@3.714.0':
-    resolution: {integrity: sha512-Xv+Z2lhe7w7ZZRsgBwBMZgGTVmS+dkkj2S13uNHAx9lh
B5ovM8PhK5G/j28xYf6vIibeuHkR
Abb7/ozdZIGR+A==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/util-endpoints@3.723.0':
+    resolution: {integrity: sha512-vR1ZfAUvrTtdA1Q78QxgR8TFgi2gzk+N4EmNjbyR5hHm
eOXuaKRdhbNQAzLPYVe1aNUpoiy9
cl8mWkg9SrNHBw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/util-format-url@3.714.0':
-    resolution: {integrity: sha512-PA/ES6BeKmYzFOsZ3az/8MqSLf6uzXAS7GsYONZMF6YA
Sn4ewd/AspuvQMp6+x9VreAPCq7P
ecF+XL9KXejtPg==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/util-format-url@3.723.0':
+    resolution: {integrity: sha512-70+xUrdcnencPlCdV9XkRqmgj0vLDb8vm4mcEsgabg5Q
Q3S80KM0GEuhBAIGMkBWwNQTzCgQ
y2s7xOUlJPbu+g==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/util-locate-window@3.693.0':
-    resolution: {integrity: sha512-ttrag6haJLWABhLqtg1Uf+4LgHWIMOVSYL+VYZmAp2v4
PUGOwWmWQH0Zk8RM7YuQcLfH/EoR
72/Yxz6A4FKcuw==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/util-locate-window@3.723.0':
+    resolution: {integrity: sha512-Yf2CS10BqK688DRsrKI/EO6B8ff5J86NXe4C+VCysK7U
OgN0l1zOTeTukZ3H8Q9tYYX3oaF1
961o8vRkFm7Nmw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@aws-sdk/util-user-agent-browser@3.714.0':
-    resolution: {integrity: sha512-OdJJ03cP9/MgIVToPJPCPUImbpZzTcwdIgbXC0tUQPJh
bD7b7cB4LdnkhNHko+MptpOrCq4C
PY/33EpOjRdofw==}
                            +  '@aws-sdk/util-user-agent-browser@3.723.0':
+    resolution: {integrity: sha512-Wh9I6j2jLhNFq6fmXydIpqD1WyQLyTfSxjW9B+PXSnPy
k3jtQW8AKQur7p97rO8LAUzVI0bv
8kb3ZzDEVbquIg==}
                             
-  '@aws-sdk/util-user-agent-node@3.721.0':
-    resolution: {integrity: sha512-5VsNdC3zQnjrt7KNEeFHWJl3FIamgIS0puG18BMvPsdz
cKWEbWDih+yd1kMWrcpAu1Riez9c
o/gB9y99pBghDA==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/util-user-agent-node@3.723.0':
+    resolution: {integrity: sha512-uCtW5sGq8jCwA9w57TvVRIwNnPbSDD1lJaTIgotf7Jit
2bTrYR64thgMy/drL5yU5aHOdFIQ
ljqn/5aDXLtTJw==}
                            +    engines: {node: '>=18.0.0'}
     peerDependencies:
       aws-crt: '>=1.0.0'
     peerDependenciesMeta:
       aws-crt:
         optional: true
 
-  '@aws-sdk/xml-builder@3.709.0':
-    resolution: {integrity: sha512-2GPCwlNxeHspoK/Mc8nbk9cBOkSpp3j2SJUQmFnyQK6V
/pR6II2oPRyZkMomug1Rc10hqlBH
ByMecq4zhV2uUw==}
                            -    engines: {node: '>=16.0.0'}
+  '@aws-sdk/xml-builder@3.723.0':
+    resolution: {integrity: sha512-5xK2SqGU1mzzsOeemy7cy3fGKxR1sEpUs4pEiIjaT0OI
vU+fZaDVUEYWOqsgns6wI90XZEQJ
lXtI8uAHX/do5Q==}
                            +    engines: {node: '>=18.0.0'}
 
   '@babel/code-frame@7.26.2':
     resolution: {integrity: sha512-RJlIHRueQgwWitWgF8OdFYGZX328Ax5BCemNGlqHfpln
RT9ESi8JkFlvaVYbS+UubVY6dpv8
7Fs2u5M29iNFVQ==}
                            @@ -3135,8 +3138,8 @@ packages:
   '@braintree/sanitize-url@7.1.1':
     resolution: {integrity: sha512-i1L7noDNxtFyL5DmZafWy1wRVhGehQmzZaz1HiN5e7iy
lJMSZR7ekOV7NsIqa5qBldlLrsKv
4HbgFUVlQrz8Mw==}
                             
-  '@cfworker/json-schema@4.0.3':
-    resolution: {integrity: sha512-ZykIcDTVv5UNmKWSTLAs3VukO6NDJkkSKxrgUTDPBkAl
ORVT3H9n5DbRjRl8xIotklscHdbL
Ia0b9+y3mQq73g==}
                            +  '@cfworker/json-schema@4.1.0':
+    resolution: {integrity: sha512-/vYKi/qMxwNsuIJ9WGWwM2rflY40ZenK3Kh4uR5vB9/N
z12Y7IUN/Xf4wDA7vzPfw0VNh3b/
jz4+MjcVgARKJg==}
                             
   '@chevrotain/cst-dts-gen@11.0.3':
     resolution: {integrity: sha512-BvIKpRLeS/8UbfxXxgC33xOumsacaeCKAjAeLyOn7Pcp
95HiRbrpl14S+9vaZLolnbssPIUu
iUd8IvgkRyt6NQ==}
                            @@ -3906,12 +3909,6 @@ packages:
     cpu: [ppc64]
     os: [aix]
 
-  '@esbuild/aix-ppc64@0.23.1':
-    resolution: {integrity: sha512-6VhYk1diRqrhBAqpJEdjASR/+WVRtfjpqKuNw11cLiaW
pAT/Uu+nokB+UJnevzy/P9C/ty6A
Oe0dwueMrGh/iQ==}
                            -    engines: {node: '>=18'}
-    cpu: [ppc64]
-    os: [aix]
-
   '@esbuild/aix-ppc64@0.24.2':
     resolution: {integrity: sha512-thpVCb/rhxE/BnMLQ7GReQLLN8q9qbHmI55F4489/ByV
g2aQaQ6kbcLb6FHkocZzQhxc4gx0
sCk0tJkKBFzDhA==}
                                 engines: {node: '>=18'}
@@ -3930,12 +3927,6 @@ packages:
     cpu: [arm64]
     os: [android]
 
-  '@esbuild/android-arm64@0.23.1':
-    resolution: {integrity: sha512-xw50ipykXcLstLeWH7WRdQuysJqejuAGPd30vd1i5zSy
KK3WE+ijzHmLKxdiCMtH1pHz78rO
g0BKSYOSB/2Khw==}
                            -    engines: {node: '>=18'}
-    cpu: [arm64]
-    os: [android]
-
   '@esbuild/android-arm64@0.24.2':
     resolution: {integrity: sha512-cNLgeqCqV8WxfcTIOeL4OAtSmL8JjcN6m09XIgro1Wi7
cF4t/THaWEa7eL5CMoMBdjoHOTh/
vwTO/o2TRXIyzg==}
                                 engines: {node: '>=18'}
@@ -3954,12 +3945,6 @@ packages:
     cpu: [arm]
     os: [android]
 
-  '@esbuild/android-arm@0.23.1':
-    resolution: {integrity: sha512-uz6/tEy2IFm9RYOyvKl88zdzZfwEfKZmnX9Cj1BHjeSG
NuGLuMD1kR8y5bteYmwqKm1tj8m4
cb/aKEorr6fHWQ==}
                            -    engines: {node: '>=18'}
-    cpu: [arm]
-    os: [android]
-
   '@esbuild/android-arm@0.24.2':
     resolution: {integrity: sha512-tmwl4hJkCfNHwFB3nBa8z1Uy3ypZpxqxfTQOcHX+xRBy
yYgunVbZ9MzUUfb0RxaHIMnbHagw
AxuTL+tnNM+1/Q==}
                                 engines: {node: '>=18'}
@@ -3978,12 +3963,6 @@ packages:
     cpu: [x64]
     os: [android]
 
-  '@esbuild/android-x64@0.23.1':
-    resolution: {integrity: sha512-nlN9B69St9BwUoB+jkyU090bru8L0NA3yFvAd7k8dNsV
H8bi9a8cUAUSEcEEgTp2z3dbEDGJ
GfP6VUnkQnlReg==}
                            -    engines: {node: '>=18'}
-    cpu: [x64]
-    os: [android]
-
   '@esbuild/android-x64@0.24.2':
     resolution: {integrity: sha512-B6Q0YQDqMx9D7rvIcsXfmJfvUYLoP722bgfBlO5cGvNV
b5V/+Y7nhBE3mHV9OpxBf4eAS2S6
8KZztiPaWq4XYw==}
                                 engines: {node: '>=18'}
@@ -4002,12 +3981,6 @@ packages:
     cpu: [arm64]
     os: [darwin]
 
-  '@esbuild/darwin-arm64@0.23.1':
-    resolution: {integrity: sha512-YsS2e3Wtgnw7Wq53XXBLcV6JhRsEq8hkfg91ESVadIrz
r9wO6jJDMZnCQbHm1Guc5t/CdDiF
SSfWP58FNuvT3Q==}
                            -    engines: {node: '>=18'}
-    cpu: [arm64]
-    os: [darwin]
-
   '@esbuild/darwin-arm64@0.24.2':
     resolution: {integrity: sha512-kj3AnYWc+CekmZnS5IPu9D+HWtUI49hbnyqk0FLEJDbz
CIQt7hg7ucF1SQAilhtYpIujfaHr
6O0UHlzzSPdOeA==}
                                 engines: {node: '>=18'}
@@ -4026,12 +3999,6 @@ packages:
     cpu: [x64]
     os: [darwin]
 
-  '@esbuild/darwin-x64@0.23.1':
-    resolution: {integrity: sha512-aClqdgTDVPSEGgoCS8QDG37Gu8yc9lTHNAQlsztQ6ENe
tKEO//b8y31MMu2ZaPbn4kVsIABz
VLXYLhCGekGDqw==}
                            -    engines: {node: '>=18'}
-    cpu: [x64]
-    os: [darwin]
-
   '@esbuild/darwin-x64@0.24.2':
     resolution: {integrity: sha512-WeSrmwwHaPkNR5H3yYfowhZcbriGqooyu3zI/3GGpF8A
yUdsrrP0X6KumITGA9WOyiJavnGZ
UwPGvxvwfWPHIA==}
                                 engines: {node: '>=18'}
@@ -4050,12 +4017,6 @@ packages:
     cpu: [arm64]
     os: [freebsd]
 
-  '@esbuild/freebsd-arm64@0.23.1':
-    resolution: {integrity: sha512-h1k6yS8/pN/NHlMl5+v4XPfikhJulk4G+tKGFIOwURBS
FzE8bixw1ebjluLOjfwtLqY0kewf
jLSrO6tN2MgIhA==}
                            -    engines: {node: '>=18'}
-    cpu: [arm64]
-    os: [freebsd]
-
   '@esbuild/freebsd-arm64@0.24.2':
     resolution: {integrity: sha512-UN8HXjtJ0k/Mj6a9+5u6+2eZ2ERD7Edt1Q9IZiB5UZAI
dPnVKDoG7mdTVGhHJIeEml60Jtea
mR3qhsr1r8gXvg==}
                                 engines: {node: '>=18'}
@@ -4074,12 +4035,6 @@ packages:
     cpu: [x64]
     os: [freebsd]
 
-  '@esbuild/freebsd-x64@0.23.1':
-    resolution: {integrity: sha512-lK1eJeyk1ZX8UklqFd/3A60UuZ/6UVfGT2LuGo3Wp4/z
7eRTRYY+0xOu2kpClP+vMTi9wKOf
Xi2vjUpO1Ro76g==}
                            -    engines: {node: '>=18'}
-    cpu: [x64]
-    os: [freebsd]
-
   '@esbuild/freebsd-x64@0.24.2':
     resolution: {integrity: sha512-TvW7wE/89PYW+IevEJXZ5sF6gJRDY/14hyIGFXdIucxC
sbRmLUcjseQu1SyTko+2idmCw94T
gyaEZi9HUSOe3Q==}
                                 engines: {node: '>=18'}
@@ -4098,12 +4053,6 @@ packages:
     cpu: [arm64]
     os: [linux]
 
-  '@esbuild/linux-arm64@0.23.1':
-    resolution: {integrity: sha512-/93bf2yxencYDnItMYV/v116zff6UyTjo4EtEQjUBeGi
VpMmffDNUyD9UN2zV+V3LRV3/on4
xdZ26NKzn6754g==}
                            -    engines: {node: '>=18'}
-    cpu: [arm64]
-    os: [linux]
-
   '@esbuild/linux-arm64@0.24.2':
     resolution: {integrity: sha512-7HnAD6074BW43YvvUmE/35Id9/NB7BeX5EoNkK9obndm
ZBUk8xmJJeU7DwmUeN7tkysslb2e
Sl6CTrYz6oEMQg==}
                                 engines: {node: '>=18'}
@@ -4122,12 +4071,6 @@ packages:
     cpu: [arm]
     os: [linux]
 
-  '@esbuild/linux-arm@0.23.1':
-    resolution: {integrity: sha512-CXXkzgn+dXAPs3WBwE+Kvnrf4WECwBdfjfeYHpMeVxWE
0EceB6vhWGShs6wi0IYEqMSIzdOF
1XjQ/Mkm5d7ZdQ==}
                            -    engines: {node: '>=18'}
-    cpu: [arm]
-    os: [linux]
-
   '@esbuild/linux-arm@0.24.2':
     resolution: {integrity: sha512-n0WRM/gWIdU29J57hJyUdIsk0WarGd6To0s+Y+LwvlC5
5wt+GT/OgkwoXCXvIue1i1sSNWbl
HEig00GBWiJgfA==}
                                 engines: {node: '>=18'}
@@ -4146,12 +4089,6 @@ packages:
     cpu: [ia32]
     os: [linux]
 
-  '@esbuild/linux-ia32@0.23.1':
-    resolution: {integrity: sha512-VTN4EuOHwXEkXzX5nTvVY4s7E/Krz7COC8xkftbbKRYA
l96vPiUssGkeMELQMOnLOJ8k3BY1
+ZY52tttZnHcXQ==}
                            -    engines: {node: '>=18'}
-    cpu: [ia32]
-    os: [linux]
-
   '@esbuild/linux-ia32@0.24.2':
     resolution: {integrity: sha512-sfv0tGPQhcZOgTKO3oBE9xpHuUqguHvSo4jl+wjnKwFp
apx+vUDcawbwPNuBIAYdRAvIDBfZ
VvXprIj3HA+Ugw==}
                                 engines: {node: '>=18'}
@@ -4170,12 +4107,6 @@ packages:
     cpu: [loong64]
     os: [linux]
 
-  '@esbuild/linux-loong64@0.23.1':
-    resolution: {integrity: sha512-Vx09LzEoBa5zDnieH8LSMRToj7ir/Jeq0Gu6qJ/1GcBq
9GkfoEAoXvLiW1U9J1qE/Y/Oyaq3
3w5p2ZWrNNHNEw==}
                            -    engines: {node: '>=18'}
-    cpu: [loong64]
-    os: [linux]
-
   '@esbuild/linux-loong64@0.24.2':
     resolution: {integrity: sha512-CN9AZr8kEndGooS35ntToZLTQLHEjtVB5n7dl8ZcTZMo
nJ7CCfStrYhrzF97eAecqVbVJ7AP
OEe18RPI4KLhwQ==}
                                 engines: {node: '>=18'}
@@ -4194,12 +4125,6 @@ packages:
     cpu: [mips64el]
     os: [linux]
 
-  '@esbuild/linux-mips64el@0.23.1':
-    resolution: {integrity: sha512-nrFzzMQ7W4WRLNUOU5dlWAqa6yVeI0P78WKGUo7lg2HS
hq/yx+UYkeNSE0SSfSure0Sqgnsx
PvmAUu/vu0E+3Q==}
                            -    engines: {node: '>=18'}
-    cpu: [mips64el]
-    os: [linux]
-
   '@esbuild/linux-mips64el@0.24.2':
     resolution: {integrity: sha512-iMkk7qr/wl3exJATwkISxI7kTcmHKE+BlymIAbHO8xan
q/TjHaaVThFF6ipWzPHryoFsesNQ
JPE/3wFJw4+huw==}
                                 engines: {node: '>=18'}
@@ -4218,12 +4143,6 @@ packages:
     cpu: [ppc64]
     os: [linux]
 
-  '@esbuild/linux-ppc64@0.23.1':
-    resolution: {integrity: sha512-dKN8fgVqd0vUIjxuJI6P/9SSSe/mB9rvA98CSH2sJnlZ
/OCZWO1DJvxj8jvKTfYUdGfcq2dD
xoKaC6bHuTlgcw==}
                            -    engines: {node: '>=18'}
-    cpu: [ppc64]
-    os: [linux]
-
   '@esbuild/linux-ppc64@0.24.2':
     resolution: {integrity: sha512-shsVrgCZ57Vr2L8mm39kO5PPIb+843FStGt7sGGoqiiW
YconSxwTiuswC1VJZLCjNiMLAMh3
4jg4VSEQb+iEbw==}
                                 engines: {node: '>=18'}
@@ -4242,12 +4161,6 @@ packages:
     cpu: [riscv64]
     os: [linux]
 
-  '@esbuild/linux-riscv64@0.23.1':
-    resolution: {integrity: sha512-5AV4Pzp80fhHL83JM6LoA6pTQVWgB1HovMBsLQ9OZWLD
qVY8MVobBXNSmAJi//Csh6tcY7e7
Lny2Hg1tElMjIA==}
                            -    engines: {node: '>=18'}
-    cpu: [riscv64]
-    os: [linux]
-
   '@esbuild/linux-riscv64@0.24.2':
     resolution: {integrity: sha512-4eSFWnU9Hhd68fW16GD0TINewo1L6dRrB+oLNNbYyMUA
eOD2yCK5KXGK1GH4qD/kT+bTEXjs
yTCiJGHPZ3eM9Q==}
                                 engines: {node: '>=18'}
@@ -4266,12 +4179,6 @@ packages:
     cpu: [s390x]
     os: [linux]
 
-  '@esbuild/linux-s390x@0.23.1':
-    resolution: {integrity: sha512-9ygs73tuFCe6f6m/Tb+9LtYxWR4c9yg7zjt2cYkjDbDp
V/xVn+68cQxMXCjUpYwEkze2RcU/
rMnfIXNRFmSoDw==}
                            -    engines: {node: '>=18'}
-    cpu: [s390x]
-    os: [linux]
-
   '@esbuild/linux-s390x@0.24.2':
     resolution: {integrity: sha512-S0Bh0A53b0YHL2XEXC20bHLuGMOhFDO6GN4b3YjRLK//
Ep3ql3erpNcPlEFed93hsQAjAQDN
svcK+hV90FubSw==}
                                 engines: {node: '>=18'}
@@ -4290,12 +4197,6 @@ packages:
     cpu: [x64]
     os: [linux]
 
-  '@esbuild/linux-x64@0.23.1':
-    resolution: {integrity: sha512-EV6+ovTsEXCPAp58g2dD68LxoP/wK5pRvgy0J/HxPGB0
09omFPv3Yet0HiaqvrIrgPTBuC6w
CH1LTOY91EO5hQ==}
                            -    engines: {node: '>=18'}
-    cpu: [x64]
-    os: [linux]
-
   '@esbuild/linux-x64@0.24.2':
     resolution: {integrity: sha512-8Qi4nQcCTbLnK9WoMjdC9NiTG6/E38RNICU6sUNqK0QF
xCYgoARqVqxdFmWkdonVsvGqWhmm
7MO0jyTqLqwj0Q==}
                                 engines: {node: '>=18'}
@@ -4320,24 +4221,12 @@ packages:
     cpu: [x64]
     os: [netbsd]
 
-  '@esbuild/netbsd-x64@0.23.1':
-    resolution: {integrity: sha512-aevEkCNu7KlPRpYLjwmdcuNz6bDFiE7Z8XC4CPqExjTv
rHugh28QzUXVOZtiYghciKUacNkt
qxdpymplil1beA==}
                            -    engines: {node: '>=18'}
-    cpu: [x64]
-    os: [netbsd]
-
   '@esbuild/netbsd-x64@0.24.2':
     resolution: {integrity: sha512-VefFaQUc4FMmJuAxmIHgUmfNiLXY438XrL4GDNV1Y1H/
RW3qow68xTwjZKfj/+Plp9NANmzb
H5R40Meudu8mmw==}
                                 engines: {node: '>=18'}
     cpu: [x64]
     os: [netbsd]
 
-  '@esbuild/openbsd-arm64@0.23.1':
-    resolution: {integrity: sha512-3x37szhLexNA4bXhLrCC/LImN/YtWis6WXr1VESlfVtV
eoFJBRINPJ3f0a/6LV8zpikqoUg4
hyXw0sFBt5Cr+Q==}
                            -    engines: {node: '>=18'}
-    cpu: [arm64]
-    os: [openbsd]
-
   '@esbuild/openbsd-arm64@0.24.2':
     resolution: {integrity: sha512-YQbi46SBct6iKnszhSvdluqDmxCJA+Pu280Av9WICNwQ
mMxV7nLRHZfjQzwbPs3jeWnuAhE9
Jy0NrnJ12Oz+0A==}
                                 engines: {node: '>=18'}
@@ -4356,12 +4245,6 @@ packages:
     cpu: [x64]
     os: [openbsd]
 
-  '@esbuild/openbsd-x64@0.23.1':
-    resolution: {integrity: sha512-aY2gMmKmPhxfU+0EdnN+XNtGbjfQgwZj43k8G3fyrDM/
UdZww6xrWxmDkuz2eCZchqVeABjV
5BpildOrUbBTqA==}
                            -    engines: {node: '>=18'}
-    cpu: [x64]
-    os: [openbsd]
-
   '@esbuild/openbsd-x64@0.24.2':
     resolution: {integrity: sha512-+iDS6zpNM6EnJyWv0bMGLWSWeXGN/HTaF/LXHXHwejGs
Vi+ooqDfMCCTerNFxEkM3wYVcExk
eGXNqshc9iMaOA==}
                                 engines: {node: '>=18'}
@@ -4380,12 +4263,6 @@ packages:
     cpu: [x64]
     os: [sunos]
 
-  '@esbuild/sunos-x64@0.23.1':
-    resolution: {integrity: sha512-RBRT2gqEl0IKQABT4XTj78tpk9v7ehp+mazn2HbUeZl1
YMdaGAQqhapjGTCe7uw7y0frDi4g
S0uHzhvpFuI1sA==}
                            -    engines: {node: '>=18'}
-    cpu: [x64]
-    os: [sunos]
-
   '@esbuild/sunos-x64@0.24.2':
     resolution: {integrity: sha512-hTdsW27jcktEvpwNHJU4ZwWFGkz2zRJUz8pvddmXPtXD
zVKTTINmlmga3ZzwcuMpUvLw7JkL
y9QLKyGpD2Yxig==}
                                 engines: {node: '>=18'}
@@ -4404,12 +4281,6 @@ packages:
     cpu: [arm64]
     os: [win32]
 
-  '@esbuild/win32-arm64@0.23.1':
-    resolution: {integrity: sha512-4O+gPR5rEBe2FpKOVyiJ7wNDPA8nGzDuJ6gN4okSA1gE
OYZ67N8JPk58tkWtdtPeLz7lBnY6
I5L3jdsr3S+A6A==}
                            -    engines: {node: '>=18'}
-    cpu: [arm64]
-    os: [win32]
-
   '@esbuild/win32-arm64@0.24.2':
     resolution: {integrity: sha512-LihEQ2BBKVFLOC9ZItT9iFprsE9tqjDjnbulhHoFxYQt
Qfai7qfluVODIYxt1PgdoyQkz23+
01rzwNwYfutxUQ==}
                                 engines: {node: '>=18'}
@@ -4428,12 +4299,6 @@ packages:
     cpu: [ia32]
     os: [win32]
 
-  '@esbuild/win32-ia32@0.23.1':
-    resolution: {integrity: sha512-BcaL0Vn6QwCwre3Y717nVHZbAa4UBEigzFm6VdsVdT/M
bZ38xoj1X9HPkZhbmaBGUD1W8vxA
fffbDe8bA6AKnQ==}
                            -    engines: {node: '>=18'}
-    cpu: [ia32]
-    os: [win32]
-
   '@esbuild/win32-ia32@0.24.2':
     resolution: {integrity: sha512-q+iGUwfs8tncmFC9pcnD5IvRHAzmbwQ3GPS5/ceCyHdj
XubwQWI12MKWSNSMYLJMq23/IUCv
JMS76PDqXe1fxA==}
                                 engines: {node: '>=18'}
@@ -4452,12 +4317,6 @@ packages:
     cpu: [x64]
     os: [win32]
 
-  '@esbuild/win32-x64@0.23.1':
-    resolution: {integrity: sha512-BHpFFeslkWrXWyUPnbKm+xYYVYruCinGcftSBaa8zoF9
hZO4BcSCFUvHVTtzpIY6YzUnYtuE
hZ+C9iEXjxnasg==}
                            -    engines: {node: '>=18'}
-    cpu: [x64]
-    os: [win32]
-
   '@esbuild/win32-x64@0.24.2':
     resolution: {integrity: sha512-7VTgWzgMGvup6aSqDPLiW5zHaxYJGTO4OokMjIlrCtf+
VpEL+cXKtCvg723iguPYI5oaUNdS
+/V7OU2gvXVWEg==}
                                 engines: {node: '>=18'}
@@ -4657,11 +4516,11 @@ packages:
     cpu: [x64]
     os: [win32]
 
-  '@floating-ui/core@1.6.8':
-    resolution: {integrity: sha512-7XJ9cPU+yI2QeLS+FCSlqNFZJq8arvswefkZrYI1yQBb
ftw6FyrZOxYSh+9S7z7TpeWlRt9z
J5IhM1WIL334jA==}
                            +  '@floating-ui/core@1.6.9':
+    resolution: {integrity: sha512-uMXCuQ3BItDUbAMhIXw7UPXRfAlOAvZzdK9BWpE60MCn
+Svt3aLn9jsPTi/WNGlRUu2uI0v5
S7JiIUsbsvh3fw==}
                             
-  '@floating-ui/dom@1.6.12':
-    resolution: {integrity: sha512-NP83c0HjokcGVEMeoStg317VD9W7eDlGK7457dMBANbK
A6GJZdc7rjujdgqzTaz93jkGgc5P
/jeWbaCHnMNc+w==}
                            +  '@floating-ui/dom@1.6.13':
+    resolution: {integrity: sha512-umqzocjDgNRGTuO7Q8CU32dkHkECqI8ZdMZ5Swb6QAM0
t5rnlrN3lGo1hdpscRd3WS8T6DKY
K4ephgIH9iRh3w==}
                             
   '@floating-ui/react-dom@2.1.2':
     resolution: {integrity: sha512-06okr5cgPzMNBy+Ycse2A6udMi4bqwW/zgBF/rwjcNqW
kyr82Mcg8b0vjX8OJpZFy/FKjJmw
6wV7t44kK6kW7A==}
                            @@ -4669,8 +4528,8 @@ packages:
       react: '>=16.8.0'
       react-dom: '>=16.8.0'
 
-  '@floating-ui/utils@0.2.8':
-    resolution: {integrity: sha512-kym7SodPp8/wloecOpcmSnWJsK7M0E5Wg8UcFA+uO4B9
s5d0ywXOEro/8HM9x0rW+TljRzul
/14UYz3TleT3ig==}
                            +  '@floating-ui/utils@0.2.9':
+    resolution: {integrity: sha512-MDWhGtE+eHw5JW7lq4qhc5yRLS11ERl1c7Z6Xd0a58Do
zHES6EnNNwUWbMiG4J9Cgj053Bhk
8zvlhFYKVhULwg==}
                             
   '@fuel-ts/abi-coder@0.97.2':
     resolution: {integrity: sha512-YbXFwBtQSfGNhIv+mrgr6EbbyVjzc5DwNjVJuC8DDObi
AYhow0uzn/URHFdQ8bexokrKBrdz
QKDjnAP6F7ap+w==}
                            @@ -5488,8 +5347,8 @@ packages:
       '@nestjs/websockets':
         optional: true
 
-  '@neynar/nodejs-sdk@2.7.0':
-    resolution: {integrity: sha512-V2pfo11sZNRPPu/Wbsakw81SEZYZNNJeStw2brgROXNm
Dg7eb5e83ftXOqHNRh6v3HvDmrYj
lF++PDFu94M7YA==}
                            +  '@neynar/nodejs-sdk@2.8.0':
+    resolution: {integrity: sha512-NausMdekKJH58ssY/WjxkDYctHtLPqHUt1/ffZvqVp4S
gcAH7Q5H7st782NJU+PZM85eNtcf
5YbbVHbwDJgmOA==}
                                 engines: {node: '>=19.9.0'}
 
   '@noble/curves@1.2.0':
@@ -5856,24 +5715,24 @@ packages:
     cpu: [x64]
     os: [win32]
 
-  '@octokit/app@15.1.1':
-    resolution: {integrity: sha512-fk8xrCSPTJGpyBdBNI+DcZ224dm0aApv4vi6X7/zTmAN
XlegKV2Td+dJ+fd7APPaPN7R+xtt
Usj2Fm+AFDSfMQ==}
                            +  '@octokit/app@15.1.2':
+    resolution: {integrity: sha512-6aKmKvqnJKoVK+kx0mLlBMKmQYoziPw4Rd/PWr0j65QV
QlrDXlu6hGU8fmTXt7tNkf/Dsubd
IaTT4fkoWzCh5g==}
                                 engines: {node: '>= 18'}
 
-  '@octokit/auth-app@7.1.3':
-    resolution: {integrity: sha512-GZdkOp2kZTIy5dG9oXqvzUAZiPvDx4C/lMlN6yQjtG9d
/+hYa7W8WXTJoOrXE8UdfL9A/sZM
l206dmtkl9lwVQ==}
                            +  '@octokit/auth-app@7.1.4':
+    resolution: {integrity: sha512-5F+3l/maq9JfWQ4bV28jT2G/K8eu9OJ317yzXPTGe4Kw
+lKDhFaS4dQ3Ltmb6xImKxfCQdqD
qMXODhc9YLipLw==}
                                 engines: {node: '>= 18'}
 
-  '@octokit/auth-oauth-app@8.1.1':
-    resolution: {integrity: sha512-5UtmxXAvU2wfcHIPPDWzVSAWXVJzG3NWsxb7zCFplCWE
mMCArSZV0UQu5jw5goLQXbFyOr5o
nzEH37UJB3zQQg==}
                            +  '@octokit/auth-oauth-app@8.1.2':
+    resolution: {integrity: sha512-3woNZgq5/S6RS+9ZTq+JdymxVr7E0s4EYxF20ugQvgX3
pomdPUL5r/XdTY9wALoBM2eHVy4e
ttr5fKpatyTyHw==}
                                 engines: {node: '>= 18'}
 
-  '@octokit/auth-oauth-device@7.1.1':
-    resolution: {integrity: sha512-HWl8lYueHonuyjrKKIup/1tiy0xcmQCdq5ikvMO1YwkN
Nkxb6DXfrPjrMYItNLyCP/o2H87W
uijuE+SlBTT8eg==}
                            +  '@octokit/auth-oauth-device@7.1.2':
+    resolution: {integrity: sha512-gTOIzDeV36OhVfxCl69FmvJix7tJIiU6dlxuzLVAzle7
fYfO8UDyddr9B+o4CFQVaMBLMGZ9
ak2CWMYcGeZnPw==}
                                 engines: {node: '>= 18'}
 
-  '@octokit/auth-oauth-user@5.1.1':
-    resolution: {integrity: sha512-rRkMz0ErOppdvEfnemHJXgZ9vTPhBuC6yASeFaB7I2yL
Md7QpjfrL1mnvRPlyKo+M6eeLxrK
anXJ9Qte29SRsw==}
                            +  '@octokit/auth-oauth-user@5.1.2':
+    resolution: {integrity: sha512-PgVDDPJgZYb3qSEXK4moksA23tfn68zwSAsQKZ1uH6IV
9IaNEYx35OXXI80STQaLYnmEE86A
gU0tC1YkM4WjsA==}
                                 engines: {node: '>= 18'}
 
   '@octokit/auth-token@3.0.4':
@@ -5888,8 +5747,8 @@ packages:
     resolution: {integrity: sha512-rh3G3wDO8J9wSjfI436JUKzHIxq8NaiL0tVeB2aXmG6p
/9859aUOAjA9pmSPNGGZxfwmaJ9o
zOJImuNVJdpvbA==}
                                 engines: {node: '>= 18'}
 
-  '@octokit/auth-unauthenticated@6.1.0':
-    resolution: {integrity: sha512-zPSmfrUAcspZH/lOFQnVnvjQZsIvmfApQH6GzJrkIunD
ooU1Su2qt2FfMTSVPRp7WLTQyC20
Kd55lF+mIYaohQ==}
                            +  '@octokit/auth-unauthenticated@6.1.1':
+    resolution: {integrity: sha512-bGXqdN6RhSFHvpPq46SL8sN+F3odQ6oMNLWc875Igoqc
C3qus+fOL2th6Tkl94wvdSTy8/Oe
HzWy/lZebmnhog==}
                                 engines: {node: '>= 18'}
 
   '@octokit/core@4.2.4':
@@ -5900,8 +5759,8 @@ packages:
     resolution: {integrity: sha512-1LFfa/qnMQvEOAdzlQymH0ulepxbxnCYAKJZfMci/5XJ
yIHWgEYnDmgnKakbTh7CH2tFQ5O6
0oYDvns4i9RAIg==}
                                 engines: {node: '>= 18'}
 
-  '@octokit/core@6.1.2':
-    resolution: {integrity: sha512-hEb7Ma4cGJGEUNOAVmyfdB/3WirWMg5hDuNFVejGEDFq
upeOysLc2sG6HJxY2etBp5YQu5Wt
xwi020jS9xlUwg==}
                            +  '@octokit/core@6.1.3':
+    resolution: {integrity: sha512-z+j7DixNnfpdToYsOutStDgeRzJSMnbj8T1C/oQjB6Aa
+kRfNjs/Fn7W6c8bmlt6mfy3Fkge
KBRnDjxQow5dow==}
                                 engines: {node: '>= 18'}
 
   '@octokit/endpoint@10.1.2':
@@ -5928,8 +5787,8 @@ packages:
     resolution: {integrity: sha512-bdlj/CJVjpaz06NBpfHhp4kGJaRZfz7AzC+6EwUImRtr
wIw8dIgJ63Xg0OzV9pRn3rIzrt5c
2sa++BL0JJ8GLw==}
                                 engines: {node: '>= 18'}
 
-  '@octokit/oauth-app@7.1.4':
-    resolution: {integrity: sha512-Au4zSGsWOZtShLxVUXcZ9TZJVQjpEK/OW2L1SWLE030Q
VYaZ+69TP4vHBdXakZUifvOELD1V
BYEY6eprPcY2Mg==}
                            +  '@octokit/oauth-app@7.1.5':
+    resolution: {integrity: sha512-/Y2MiwWDlGUK4blKKfjJiwjzu/FzwKTTTfTZAAQ0QbdB
IDEGJPWhOFH6muSN86zaa4tNheB4
YS3oWIR2e4ydzA==}
                                 engines: {node: '>= 18'}
 
   '@octokit/oauth-authorization-url@7.1.1':
@@ -5946,8 +5805,8 @@ packages:
   '@octokit/openapi-types@20.0.0':
     resolution: {integrity: sha512-EtqRBEjp1dL/15V7WiX5LJMIxxkdiGJnabzYx5Apx4Fk
QIFgAfKumXeYAqqJCj1s+BMX4cPF
IFC4OLCR6stlnA==}
                             
-  '@octokit/openapi-types@22.2.0':
-    resolution: {integrity: sha512-QBhVjcUa9W7Wwhm6DBFu6ZZ+1/t/oYxqc2tp81Pi41YN
uJinbFRx8B133qVOrAaBbF7D/m0E
t6f9/pZt9Rc+tg==}
                            +  '@octokit/openapi-types@23.0.1':
+    resolution: {integrity: sha512-izFjMJ1sir0jn0ldEKhZ7xegCTj/ObmEDlEfpFrx4k/J
yZSMRHbO3/rBwgE7f3m2DHt+RrNG
IVw4wSmwnm3t/g==}
                             
   '@octokit/openapi-webhooks-types@8.5.1':
     resolution: {integrity: sha512-i3h1b5zpGSB39ffBbYdSGuAd0NhBAwPyA3QV3LYi/lx4
lsbZiu7u2UHgXVUR6EpvOI8REOuV
h1DZTRfHoJDvuQ==}
                            @@ -5967,8 +5826,8 @@ packages:
     peerDependencies:
       '@octokit/core': '5'
 
-  '@octokit/plugin-paginate-rest@11.3.6':
-    resolution: {integrity: sha512-zcvqqf/+TicbTCa/Z+3w4eBJcAxCFymtc0UAIsR3dEVo
NilWld4oXdscQ3laXamTszUZdusw
97K8+DrbFiOwjw==}
                            +  '@octokit/plugin-paginate-rest@11.4.0':
+    resolution: {integrity: sha512-ttpGck5AYWkwMkMazNCZMqxKqIq1fJBNxBfsFwwfyYKT
f914jKkLF0POMS3YkPBwp5g1c2Y4
L79gDz01GhSr1g==}
                                 engines: {node: '>= 18'}
     peerDependencies:
       '@octokit/core': '>=6'
@@ -5996,8 +5855,8 @@ packages:
     peerDependencies:
       '@octokit/core': ^5
 
-  '@octokit/plugin-rest-endpoint-methods@13.2.6':
-    resolution: {integrity: sha512-wMsdyHMjSfKjGINkdGKki06VEkgdEldIGstIEyGX0wbY
HGByOwN/KiM+hAAlUwAtPkP3gvXt
VQA9L3ITdV2tVw==}
                            +  '@octokit/plugin-rest-endpoint-methods@13.3.0':
+    resolution: {integrity: sha512-LUm44shlmkp/6VC+qQgHl3W5vzUP99ZM54zH6BuqkJK4
DqfFLhegANd+fM4YRLapTvPm4049
iG7F3haANKMYvQ==}
                                 engines: {node: '>= 18'}
     peerDependencies:
       '@octokit/core': '>=6'
@@ -6008,17 +5867,17 @@ packages:
     peerDependencies:
       '@octokit/core': '>=3'
 
-  '@octokit/plugin-retry@7.1.2':
-    resolution: {integrity: sha512-XOWnPpH2kJ5VTwozsxGurw+svB2e61aWlmk5EVIYZPwF
K5F9h4cyPyj9CIKRyMXMHSwpIsI3
mPOdpMmrRhe7UQ==}
                            +  '@octokit/plugin-retry@7.1.3':
+    resolution: {integrity: sha512-8nKOXvYWnzv89gSyIvgFHmCBAxfQAOPRlkacUHL9r5oW
tp5Whxl8Skb2n3ACZd+X6cYijD6u
vmrQuPH/UCL5zQ==}
                                 engines: {node: '>= 18'}
     peerDependencies:
       '@octokit/core': '>=6'
 
-  '@octokit/plugin-throttling@9.3.2':
-    resolution: {integrity: sha512-FqpvcTpIWFpMMwIeSoypoJXysSAQ3R+ALJhXXSG1HTP3
YZOIeLmcNcimKaXxTcws+Sh6yoRl
13SJ5r8sXc1Fhw==}
                            +  '@octokit/plugin-throttling@9.4.0':
+    resolution: {integrity: sha512-IOlXxXhZA4Z3m0EEYtrrACkuHiArHLZ3CvqWwOez/pUR
NqRuwfoFlTPbN5Muf28pzFuztxPy
iUiNwz8KctdZaQ==}
                                 engines: {node: '>= 18'}
     peerDependencies:
-      '@octokit/core': ^6.0.0
+      '@octokit/core': ^6.1.3
 
   '@octokit/request-error@3.0.3':
     resolution: {integrity: sha512-crqw3V5Iy2uOU5Np+8M/YexTlT8zxCfI+qu+LxUB7SZp
je4Qmx3mub5DfEKSO8Ylyk0aogi6
TYdf6kxzh2BguQ==}
                            @@ -6061,8 +5920,8 @@ packages:
   '@octokit/types@12.6.0':
     resolution: {integrity: sha512-1rhSOfRa6H9w4YwK0yrf5faDaDTb+yLyBUKOCV4xtCDB
5VmIPqd/v9yr9o6SAzOAlRxMiRiC
ic6JVM1/kunVkw==}
                             
-  '@octokit/types@13.6.2':
-    resolution: {integrity: sha512-WpbZfZUcZU77DrSW4wbsSgTPfKcp286q3ItaIgvSbBpZ
Jlu6mnYXAkjZz6LVZPXkEvLIM8Mc
anyZejKTYUHipA==}
                            +  '@octokit/types@13.7.0':
+    resolution: {integrity: sha512-BXfRP+3P3IN6fd4uF3SniaHKOO4UXWBfkdR3vA8mIvao
O/wLjGN5qivUtW0QRitBHHMcfC41
SLhNVYIZZE+wkA==}
                             
   '@octokit/types@9.3.2':
     resolution: {integrity: sha512-D4iHGTdAnEEVsB8fl95m1hiz7D5YiRdQ9b/OEb3BYRVw
bLsGHcRVPz+u+BgRLNk0Q0/4iZCB
qDN96j2XNxfXrA==}
                            @@ -6071,8 +5930,8 @@ packages:
     resolution: {integrity: sha512-yFZa3UH11VIxYnnoOYCVoJ3q4ChuSOk2IVBBQ0O3xtKX
4x9bmKb/1t+Mxixv2iUhzMdOl1qe
WJqEhouXXzB3rQ==}
                                 engines: {node: '>= 18'}
 
-  '@octokit/webhooks@13.4.1':
-    resolution: {integrity: sha512-I5YPUtfWidh+OzyrlDahJsUpkpGK0kCTmDRbuqGmlCUz
OtxdEkX3R4d6Cd08ijQYwkVXQJan
PdbKuZBeV2NMaA==}
                            +  '@octokit/webhooks@13.4.2':
+    resolution: {integrity: sha512-fakbgkCScapQXPxyqx2jZs/Y3jGlyezwUp7ATL7oLAGJ
0+SqBKWKstoKZpiQ+REeHutKpYjY
9UtxdLSurwl2Tg==}
                                 engines: {node: '>= 18'}
 
   '@onflow/config@1.5.1':
@@ -6781,98 +6640,98 @@ packages:
       rollup:
         optional: true
 
-  '@rollup/rollup-android-arm-eabi@4.29.1':
-    resolution: {integrity: sha512-ssKhA8RNltTZLpG6/QNkCSge+7mBQGUqJRisZ2MDQcEG
aK93QESEgWK2iOpIDZ7k9zPVkG5A
S3ksvD5ZWxmItw==}
                            +  '@rollup/rollup-android-arm-eabi@4.30.1':
+    resolution: {integrity: sha512-pSWY+EVt3rJ9fQ3IqlrEUtXh3cGqGtPDH1FQlNZehO2y
YxCHEX1SPsz1M//NXwYfbTlcKr9W
ObLnJX9FsS9K1Q==}
                                 cpu: [arm]
     os: [android]
 
-  '@rollup/rollup-android-arm64@4.29.1':
-    resolution: {integrity: sha512-CaRfrV0cd+NIIcVVN/jx+hVLN+VRqnuzLRmfmlzpOzB8
7ajixsN/+9L5xNmkaUUvEbI5BmIK
S+XTwXsHEb65Ew==}
                            +  '@rollup/rollup-android-arm64@4.30.1':
+    resolution: {integrity: sha512-/NA2qXxE3D/BRjOJM8wQblmArQq1YoBVJjrjoTSBS09j
gUisq7bqxNHJ8kjCHeV21W/9WDGw
JEWSN0KQ2mtD/w==}
                                 cpu: [arm64]
     os: [android]
 
-  '@rollup/rollup-darwin-arm64@4.29.1':
-    resolution: {integrity: sha512-2ORr7T31Y0Mnk6qNuwtyNmy14MunTAMx06VAPI6/Ju52
W10zk1i7i5U3vlDRWjhOI5quBcrv
hkCHyF76bI7kEw==}
                            +  '@rollup/rollup-darwin-arm64@4.30.1':
+    resolution: {integrity: sha512-r7FQIXD7gB0WJ5mokTUgUWPl0eYIH0wnxqeSAhuIwvnn
pjdVB8cRRClyKLQr7lgzjctkbp5K
mswWszlwYln03Q==}
                                 cpu: [arm64]
     os: [darwin]
 
-  '@rollup/rollup-darwin-x64@4.29.1':
-    resolution: {integrity: sha512-j/Ej1oanzPjmN0tirRd5K2/nncAhS9W6ICzgxV+9Y5Zs
P0hiGhHJXZ2JQ53iSSjj8m6cRY6o
B1GMzNn2EUt6Ng==}
                            +  '@rollup/rollup-darwin-x64@4.30.1':
+    resolution: {integrity: sha512-x78BavIwSH6sqfP2xeI1hd1GpHL8J4W2BXcVM/5KYKoA
D3nNsfitQhvWSw+TFtQTLZ9OmlF+
FEInEHyubut2OA==}
                                 cpu: [x64]
     os: [darwin]
 
-  '@rollup/rollup-freebsd-arm64@4.29.1':
-    resolution: {integrity: sha512-91C//G6Dm/cv724tpt7nTyP+JdN12iqeXGFM1SqnljCm
i5yTXriH7B1r8AD9dAZByHpKAumq
P1Qy2vVNIdLZqw==}
                            +  '@rollup/rollup-freebsd-arm64@4.30.1':
+    resolution: {integrity: sha512-HYTlUAjbO1z8ywxsDFWADfTRfTIIy/oUlfIDmlHYmjUP
2QRDTzBuWXc9O4CXM+bo9qfiCclm
Hk1x4ogBjOUpUQ==}
                                 cpu: [arm64]
     os: [freebsd]
 
-  '@rollup/rollup-freebsd-x64@4.29.1':
-    resolution: {integrity: sha512-hEioiEQ9Dec2nIRoeHUP6hr1PSkXzQaCUyqBDQ9I9ik4
gCXQZjJMIVzoNLBRGet+hIUb3CIS
Mh9KXuCcWVW/8w==}
                            +  '@rollup/rollup-freebsd-x64@4.30.1':
+    resolution: {integrity: sha512-1MEdGqogQLccphhX5myCJqeGNYTNcmTyaic9S7CG3Jhw
uIByJ7J05vGbZxsizQthP1xpVx7k
d3o31eOogfEirw==}
                                 cpu: [x64]
     os: [freebsd]
 
-  '@rollup/rollup-linux-arm-gnueabihf@4.29.1':
-    resolution: {integrity: sha512-Py5vFd5HWYN9zxBv3WMrLAXY3yYJ6Q/aVERoeUFwiDGi
MOWsMs7FokXihSOaT/PMWUty/Pj6
0XDQndK3eAfE6A==}
                            +  '@rollup/rollup-linux-arm-gnueabihf@4.30.1':
+    resolution: {integrity: sha512-PaMRNBSqCx7K3Wc9QZkFx5+CX27WFpAMxJNiYGAXfmMI
KC7jstlr32UhTgK6T07OtqR+wYlW
m9IxzennjnvdJg==}
                                 cpu: [arm]
     os: [linux]
 
-  '@rollup/rollup-linux-arm-musleabihf@4.29.1':
-    resolution: {integrity: sha512-RiWpGgbayf7LUcuSNIbahr0ys2YnEERD4gYdISA06wa0
i8RALrnzflh9Wxii7zQJEB2/Eh74
dX4y/sHKLWp5uQ==}
                            +  '@rollup/rollup-linux-arm-musleabihf@4.30.1':
+    resolution: {integrity: sha512-B8Rcyj9AV7ZlEFqvB5BubG5iO6ANDsRKlhIxySXcF1ax
XYUyqwBok+XZPgIYGBgs7LDXfWfi
fxhw0Ik57T0Yug==}
                                 cpu: [arm]
     os: [linux]
 
-  '@rollup/rollup-linux-arm64-gnu@4.29.1':
-    resolution: {integrity: sha512-Z80O+taYxTQITWMjm/YqNoe9d10OX6kDh8X5/rFCMuPq
sKsSyDilvfg+vd3iXIqtfmp+cnfL
1UrYirkaF8SBZA==}
                            +  '@rollup/rollup-linux-arm64-gnu@4.30.1':
+    resolution: {integrity: sha512-hqVyueGxAj3cBKrAI4aFHLV+h0Lv5VgWZs9CUGqr1z0f
ZtlADVV1YPOij6AhcK5An33EXaxn
DLmJdQikcn5NEw==}
                                 cpu: [arm64]
     os: [linux]
 
-  '@rollup/rollup-linux-arm64-musl@4.29.1':
-    resolution: {integrity: sha512-fOHRtF9gahwJk3QVp01a/GqS4hBEZCV1oKglVVq13kcK
3NeVlS4BwIFzOHDbmKzt3i0OuHG4
zfRP0YoG5OF/rA==}
                            +  '@rollup/rollup-linux-arm64-musl@4.30.1':
+    resolution: {integrity: sha512-i4Ab2vnvS1AE1PyOIGp2kXni69gU2DAUVt6FSXeIqUCP
IR3ZlheMW3oP2JkukDfu3PsexYRb
OiJrY+yVNSk9oA==}
                                 cpu: [arm64]
     os: [linux]
 
-  '@rollup/rollup-linux-loongarch64-gnu@4.29.1':
-    resolution: {integrity: sha512-5a7q3tnlbcg0OodyxcAdrrCxFi0DgXJSoOuidFUzHZ2G
ixZXQs6Tc3CHmlvqKAmOs5eRde+J
JxeIf9DonkmYkw==}
                            +  '@rollup/rollup-linux-loongarch64-gnu@4.30.1':
+    resolution: {integrity: sha512-fARcF5g296snX0oLGkVxPmysetwUk2zmHcca+e9ObOov
BR++9ZPOhqFUM61UUZ2EYpXVPN1r
edgqVoBB34nTpQ==}
                                 cpu: [loong64]
     os: [linux]
 
-  '@rollup/rollup-linux-powerpc64le-gnu@4.29.1':
-    resolution: {integrity: sha512-9b4Mg5Yfz6mRnlSPIdROcfw1BU22FQxmfjlp/CShWwO3
LilKQuMISMTtAu/bxmmrE6A902W2
cZJuzx8+gJ8e9w==}
                            +  '@rollup/rollup-linux-powerpc64le-gnu@4.30.1':
+    resolution: {integrity: sha512-GLrZraoO3wVT4uFXh67ElpwQY0DIygxdv0BNW9Hkm3X3
4wu+BkqrDrkcsIapAY+N2ATEbvak
0XQ9gxZtCIA5Rw==}
                                 cpu: [ppc64]
     os: [linux]
 
-  '@rollup/rollup-linux-riscv64-gnu@4.29.1':
-    resolution: {integrity: sha512-G5pn0NChlbRM8OJWpJFMX4/i8OEU538uiSv0P6roZcbp
e/WfhEO+AT8SHVKfp8qhDQzaz7Q+
1/ixMy7hBRidnQ==}
                            +  '@rollup/rollup-linux-riscv64-gnu@4.30.1':
+    resolution: {integrity: sha512-0WKLaAUUHKBtll0wvOmh6yh3S0wSU9+yas923JIChfxO
aaBarmb/lBKPF0w/+jTVozFnOXJe
RGZ8NvOxvk/jcw==}
                                 cpu: [riscv64]
     os: [linux]
 
-  '@rollup/rollup-linux-s390x-gnu@4.29.1':
-    resolution: {integrity: sha512-WM9lIkNdkhVwiArmLxFXpWndFGuOka4oJOZh8EP3Vb8q
5lzdSCBuhjavJsw68Q9AKDGeOOIH
YzYm4ZFvmWez5g==}
                            +  '@rollup/rollup-linux-s390x-gnu@4.30.1':
+    resolution: {integrity: sha512-GWFs97Ruxo5Bt+cvVTQkOJ6TIx0xJDD/bMAOXWJg8TCS
TEK8RnFeOeiFTxKniTc4vMIaWvCp
lMAFBt9miGxgkA==}
                                 cpu: [s390x]
     os: [linux]
 
-  '@rollup/rollup-linux-x64-gnu@4.29.1':
-    resolution: {integrity: sha512-87xYCwb0cPGZFoGiErT1eDcssByaLX4fc0z2nRM6eMtV
9njAfEE6OW3UniAoDhX4Iq5xQVpE
6qO9aJbCFumKYQ==}
                            +  '@rollup/rollup-linux-x64-gnu@4.30.1':
+    resolution: {integrity: sha512-UtgGb7QGgXDIO+tqqJ5oZRGHsDLO8SlpE4MhqpY9Llpz
i5rJMvrK6ZGhsRCST2abZdBqIBeX
W6WPD5fGK5SDwg==}
                                 cpu: [x64]
     os: [linux]
 
-  '@rollup/rollup-linux-x64-musl@4.29.1':
-    resolution: {integrity: sha512-xufkSNppNOdVRCEC4WKvlR1FBDyqCSCpQeMMgv9ZyXqq
tKBfkw1yfGMTUTs9Qsl6WQbJnsGb
oWCp7pJGkeMhKA==}
                            +  '@rollup/rollup-linux-x64-musl@4.30.1':
+    resolution: {integrity: sha512-V9U8Ey2UqmQsBT+xTOeMzPzwDzyXmnAoO4edZhL7INkw
QcaW1Ckv3WJX3qrrp/VHaDkEWIBW
hRwP47r8cdrOow==}
                                 cpu: [x64]
     os: [linux]
 
-  '@rollup/rollup-win32-arm64-msvc@4.29.1':
-    resolution: {integrity: sha512-F2OiJ42m77lSkizZQLuC+jiZ2cgueWQL5YC9tjo3AgaE
w+KJmVxHGSyQfDUoYR9cci0lAywv
2Clmckzulcq6ig==}
                            +  '@rollup/rollup-win32-arm64-msvc@4.30.1':
+    resolution: {integrity: sha512-WabtHWiPaFF47W3PkHnjbmWawnX/aE57K47ZDT1BXTS5
GgrBUEpvOzq0FI0V/UYzQJgdb8Xl
hVNH8/fwV8xDjw==}
                                 cpu: [arm64]
     os: [win32]
 
-  '@rollup/rollup-win32-ia32-msvc@4.29.1':
-    resolution: {integrity: sha512-rYRe5S0FcjlOBZQHgbTKNrqxCBUmgDJem/VQTCcTnA2K
CabYSWQDrytOzX7avb79cAAweNmM
Ub/Zw18RNd4mng==}
                            +  '@rollup/rollup-win32-ia32-msvc@4.30.1':
+    resolution: {integrity: sha512-pxHAU+Zv39hLUTdQQHUVHf4P+0C47y/ZloorHpzs2SXM
RqeAWmGghzAhfOlzFHHwjvgokdFA
hC4V+6kC1lRRfw==}
                                 cpu: [ia32]
     os: [win32]
 
-  '@rollup/rollup-win32-x64-msvc@4.29.1':
-    resolution: {integrity: sha512-+10CMg9vt1MoHj6x1pxyjPSMjHTIlqs8/tBztXvPAx24
SKs9jwVnKqHJumlH/IzhaPUaj3T6
T6wfZr8okdXaIg==}
                            +  '@rollup/rollup-win32-x64-msvc@4.30.1':
+    resolution: {integrity: sha512-D6qjsXGcvhTjv0kI4fU8tUuBDF/Ueee4SVX79VfNDXZa
64TfCW1Slkb6Z7O1p7vflqZjcmOV
dZlqf8gvJxc6og==}
                                 cpu: [x64]
     os: [win32]
 
@@ -6962,26 +6821,26 @@ packages:
     resolution: {integrity: sha512-zaYmoH0NWWtvnJjC9/CBseXMtKHm/tm40sz3YfJRxeQj
yzRqNQPgivpd9R/oDJCYj999mzdW
382p/qi2ypjLww==}
                                 engines: {node: '>=6'}
 
-  '@shikijs/core@1.25.1':
-    resolution: {integrity: sha512-0j5k3ZkLTQViOuNzPVyWGoW1zgH3kiFdUT/JOCkTm7TU
74mz+dF+NID+YoiCBzHQxgsDpcGY
PjKDJRcuVLSt4A==}
                            +  '@shikijs/core@1.26.1':
+    resolution: {integrity: sha512-yeo7sG+WZQblKPclUOKRPwkv1PyoHYkJ4gP9DzhFJbTd
ueKR7wYTI1vfF/bFi1NTgc545yG/
DzvVhZgueVOXMA==}
                             
-  '@shikijs/engine-javascript@1.25.1':
-    resolution: {integrity: sha512-zQ7UWKnRCfD/Q1M+XOSyjsbhpE0qv8LUnmn82HYCeOsg
AHgUZGEDIQ63bbuK3kU5sQg+2CtI
+dPfOqD/mjSY9w==}
                            +  '@shikijs/engine-javascript@1.26.1':
+    resolution: {integrity: sha512-CRhA0b8CaSLxS0E9A4Bzcb3LKBNpykfo9F85ozlNyArx
jo2NkijtiwrJZ6eHa+NT5I9Kox2I
XVdjUsP4dilsmw==}
                             
-  '@shikijs/engine-oniguruma@1.25.1':
-    resolution: {integrity: sha512-iKPMh3H+0USHtWfZ1irfMTH6tGmIUFSnqt3E2K8BgI1V
EsqiPh0RYkG2WTwzNiM1/WHN4FzY
x/nrKR7PDHiRyw==}
                            +  '@shikijs/engine-oniguruma@1.26.1':
+    resolution: {integrity: sha512-F5XuxN1HljLuvfXv7d+mlTkV7XukC1cawdtOo+7pKgPD
83CAB1Sf8uHqP3PK0u7njFH0ZhoX
E1r+0JzEgAQ+kg==}
                             
-  '@shikijs/langs@1.25.1':
-    resolution: {integrity: sha512-hdYjq9aRJplAzGe2qF51PR9IDgEoyGb4IkXvr3Ts6lEd
g4Z8M/kdknKRo2EIuv3IR/aKkJXT
lBQRM+wr3t20Ew==}
                            +  '@shikijs/langs@1.26.1':
+    resolution: {integrity: sha512-oz/TQiIqZejEIZbGtn68hbJijAOTtYH4TMMSWkWYozwq
dpKR3EXgILneQy26WItmJjp3xVsp
HdiUxUCws4gtuw==}
                             
-  '@shikijs/themes@1.25.1':
-    resolution: {integrity: sha512-JO0lDn4LgGqg5QKvgich5ScUmC2okK+LxM9a3iLUH7YM
eI2c8UGXThuJv6sZduS7pdJbYQHP
rvWq9t/V4GhpbQ==}
                            +  '@shikijs/themes@1.26.1':
+    resolution: {integrity: sha512-JDxVn+z+wgLCiUhBGx2OQrLCkKZQGzNH3nAxFir4PjUc
YiyD8Jdms9izyxIogYmSwmoPTatF
TdzyrRKbKlSfPA==}
                             
-  '@shikijs/types@1.25.1':
-    resolution: {integrity: sha512-dceqFUoO95eY4tpOj3OGq8wE8EgJ4ey6Me1HQEu5UbwI
YszFndEll/bjlB8Kp9wl4fx3uM7n
4+y9XCYuDBmcXA==}
                            +  '@shikijs/types@1.26.1':
+    resolution: {integrity: sha512-d4B00TKKAMaHuFYgRf3L0gwtvqpW4hVdVwKcZYbBfAAQ
XspgkbWqnFfuFl3MDH6gLbsubOcr
+prcnsqah3ny7Q==}
                             
-  '@shikijs/vscode-textmate@9.3.1':
-    resolution: {integrity: sha512-79QfK1393x9Ho60QFyLti+QfdJzRQCVLFb97kOIV7Eo9
vQU/roINgk7m24uv0a7AUvN//RDH
36FLjjK48v0s9g==}
                            +  '@shikijs/vscode-textmate@10.0.1':
+    resolution: {integrity: sha512-fTIQwLF+Qhuws31iw7Ncl1R3HUDtGwIipiJ9iU+UsDUw
MhegFcQKQHd51nZjb7CArq0MvON8
rbgCGQYWHUKAdg==}
                             
   '@sideway/address@4.1.5':
     resolution: {integrity: sha512-IqO/DUQHUkPeixNQ8n0JA6102hT9CmaljNTPmQ1u8MEh
Bo/R4Q8eKLN/vGZxuebwOroDB4cb
pjheD4+/sKFK4Q==}
                            @@ -7073,208 +6932,217 @@ packages:
   '@slorber/remark-comment@1.0.0':
     resolution: {integrity: sha512-RCE24n7jsOj1M0UPvIQCHTe7fI0sFL4S2nwKVWwHyVr/
wI/H8GosgsJGyhnsZoGFnD/P2hLf
1mSbrrgSLN93NA==}
                             
-  '@smithy/abort-controller@3.1.9':
-    resolution: {integrity: sha512-yiW0WI30zj8ZKoSYNx90no7ugVn3khlyH/z5W8qtKBtV
E6awRALbhSG+2SAHA1r6bO/6M9ut
xYKVZ3PCJ1rWxw==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/abort-controller@4.0.0':
+    resolution: {integrity: sha512-xFNL1ZfluscKiVI0qlPEnu7pL1UgNNIzQdjTPkaO7JCJ
tIkbArPYNtqbxohuNaQdksJ01Tn1
wLbDA5oIp62P8w==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/chunked-blob-reader-native@3.0.1':
-    resolution: {integrity: sha512-VEYtPvh5rs/xlyqpm5NRnfYLZn+q0SRPELbvBV+C/G7I
Q+ouTuo+NKKa3ShG5OaFR8NYVMXl
s9hPYLTvIKKDrQ==}
                            +  '@smithy/chunked-blob-reader-native@4.0.0':
+    resolution: {integrity: sha512-R9wM2yPmfEMsUmlMlIgSzOyICs0x9uu7UTHoccMyt7BW
w8shcGM8HqB355+BZCPBcySvbTYM
s62EgEQkNxz2ig==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/chunked-blob-reader@4.0.0':
-    resolution: {integrity: sha512-jSqRnZvkT4egkq/7b6/QRCNXmmYVcHwnJldqJ3IhVpQE
2atObVJ137xmGeuGFhjFUr8gCEVA
OKwSY79OvpbDaQ==}
                            +  '@smithy/chunked-blob-reader@5.0.0':
+    resolution: {integrity: sha512-+sKqDBQqb036hh4NPaUiEkYFkTUGYzRsn3EuFhyfQfMy
6oGHEUJDurLP9Ufb5dasr/XiAmPN
Mr6wa9afjQB+Gw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/config-resolver@3.0.13':
-    resolution: {integrity: sha512-Gr/qwzyPaTL1tZcq8WQyHhTZREER5R1Wytmz4WnVGL4o
nA3dNk6Btll55c8Vr58pLdvWZmtG
8oZxJTw3t3q7Jg==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/config-resolver@4.0.0':
+    resolution: {integrity: sha512-29pIDlUY/a9+ChJPAarPiD9cU8fBtBh0wFnmnhj7j5Ah
gMzc+uyXdfzmziH6xx2jzw54waSP
3HfnFkTANZuPYA==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/core@2.5.7':
-    resolution: {integrity: sha512-8olpW6mKCa0v+ibCjoCzgZHQx1SQmZuW/WkrdZo73wiT
prTH6qhmskT60QLFdT9DRa5mXxjz
89kQPZ7ZSsoqqg==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/core@3.0.0':
+    resolution: {integrity: sha512-pKaas7RWvPljJ8uByCeBa10rtbVJCy4N/Fr7OSPxFezc
yG0SQuXWnESZqzXj7m2+A+kPzG6f
KyP4wrKidl2Ikg==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/credential-provider-imds@3.2.8':
-    resolution: {integrity: sha512-ZCY2yD0BY+K9iMXkkbnjo+08T2h8/34oHd0Jmh6BZUSZ
waaGlGCyBT/3wnS7u7Xl33/EEfN4
B6nQr3Gx5bYxgw==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/credential-provider-imds@4.0.0':
+    resolution: {integrity: sha512-+hTShyZHiq2AVFOxJja3k6O17DKU6TaZbwr2y1OH5HQt
Uw2a+7O3mMR+10LVmc39ef72SAj+
uFX0IW9rJGaLQQ==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/eventstream-codec@3.1.10':
-    resolution: {integrity: sha512-323B8YckSbUH0nMIpXn7HZsAVKHYHFUODa8gG9cHo0yS
vA1fr5iWaNT+iIL0UCqUzG6QPHA3
BSsBtRQou4mMqQ==}
                            +  '@smithy/eventstream-codec@4.0.0':
+    resolution: {integrity: sha512-YvKUUOo3qehqOxNrkax3YKXF1v0ff475FhDgbBmF8Bo0
oOOpsXZyltjQnwBzIeTYo446ZPV8
5KM3kY4YoxUNOg==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/eventstream-serde-browser@3.0.14':
-    resolution: {integrity: sha512-kbrt0vjOIihW3V7Cqj1SXQvAI5BR8SnyQYsandva0AOR
307cXAc+IhPngxIPslxTLfxwDpNu
0HzCAq6g42kCPg==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/eventstream-serde-browser@4.0.0':
+    resolution: {integrity: sha512-YRwsVPJU/DN1VshH8tKs4CxY66HLhmDSw6oZDM2LVIgH
ODsqpJBcRdEfcnb97ULmgyFrWxTj
L9UXpyKPuJXQRA==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/eventstream-serde-config-resolver@3.0.11':
-    resolution: {integrity: sha512-P2pnEp4n75O+QHjyO7cbw/vsw5l93K/8EWyjNCAAybYw
Umj3M+hjSQZ9P5TVdUgEG08ueMAP
5R4FkuSkElZ5tQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/eventstream-serde-config-resolver@4.0.0':
+    resolution: {integrity: sha512-OZ/aK9LHsZch0VZ6bnf+dPD80kJripnZnkc36QNymnej
49VkHJLSNJxsM0pwt53FA6+fUYYM
MT0DVDTH1Msq2g==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/eventstream-serde-node@3.0.13':
-    resolution: {integrity: sha512-zqy/9iwbj8Wysmvi7Lq7XFLeDgjRpTbCfwBhJa8Wbryl
TAHiAu6oQTwdY7iu2lxigbc9YYr9
vPv5SzYny5tCXQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/eventstream-serde-node@4.0.0':
+    resolution: {integrity: sha512-10b4F+zXbzxZHKuP+m2st/C+rEGK7FUut1dNSRw6DQCC
faTUecJGCoHPCmk2CRvuMTzunVpS
1BKLMk839318VQ==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/eventstream-serde-universal@3.0.13':
-    resolution: {integrity: sha512-L1Ib66+gg9uTnqp/18Gz4MDpJPKRE44geOjOQ2SVc0ei
aO5l255ADziATZgjQjqumC7yPtp1
XnjHlF1srcwjKw==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/eventstream-serde-universal@4.0.0':
+    resolution: {integrity: sha512-HEhZpf731J3oFYJtaKO3dnV6stIjA+lJwXuXGu/WbSgi
cDWGAOITUwTt9ynldEFsnFkNu9b/
C4ebXnJA16xSCA==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/fetch-http-handler@4.1.3':
-    resolution: {integrity: sha512-6SxNltSncI8s689nvnzZQc/dPXcpHQ34KUj6gR/HBroy
tKOd/isMG3gJF/zBE1TBmTT18TXy
zhg3O3SOOqGEhA==}
                            +  '@smithy/fetch-http-handler@5.0.0':
+    resolution: {integrity: sha512-jUEq+4056uqsDLRqQb1fm48rrSMBYcBxVvODfiP37ORc
V5n9xWJQsINWcIffyYxWTM5K0Y/G
OfhSQGDtWpAPpQ==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/hash-blob-browser@3.1.10':
-    resolution: {integrity: sha512-elwslXOoNunmfS0fh55jHggyhccobFkexLYC1ZeZ1xP2
BTSrcIBaHV2b4xUQOdctrSNOpMqO
ZH1r2XzWTEhyfA==}
                            +  '@smithy/hash-blob-browser@4.0.0':
+    resolution: {integrity: sha512-JBXNC2YCDlm9uqP/eQJbK6auahAaq4HndJC2PURxWPRU
DjbXDRJS5Npfi+7zSxKOSOWxXCG/
3dLE5D8znI9l/w==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/hash-node@3.0.11':
-    resolution: {integrity: sha512-emP23rwYyZhQBvklqTtwetkQlqbNYirDiEEwXl2v0GYW
MnCzxst7ZaRAnWuy28njp5kAH54l
vkdG37MblZzaHA==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/hash-node@4.0.0':
+    resolution: {integrity: sha512-25OxGYGnG3JPEOTk4iFE03bfmoC6GXUQ4L13z4cNdsS3
mkncH22AGSDRfKwwEqutNUxXQZWV
y9f72Fm59C9qlg==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/hash-stream-node@3.1.10':
-    resolution: {integrity: sha512-olomK/jZQ93OMayW1zfTHwcbwBdhcZOHsyWyiZ9h9IXv
c1mCD/VuvzbLb3Gy/qNJwI4MANPL
ctTp2BucV2oU/Q==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/hash-stream-node@4.0.0':
+    resolution: {integrity: sha512-MRgYnr9atik1c02mdgjjJkNK5A8IvRRlpa/zOdA8PxmQ
tBCwjODKzobyI166uamxrL20wg7v
uKoVSAjQU4IXfw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/invalid-dependency@3.0.11':
-    resolution: {integrity: sha512-NuQmVPEJjUX6c+UELyVz8kUx8Q539EDeNwbRyu4IIF8M
eV7hUtq1FB3SHVyki2u++5XLMFqn
geMKk7ccspnNyQ==}
                            +  '@smithy/invalid-dependency@4.0.0':
+    resolution: {integrity: sha512-0GTyet02HX/sPctEhOExY+3HI7hwkVwOoJg0XnItTJ+X
w7JMuL9FOxALTmKVIV6+wg0kF6ve
Leg72hVSbD9UCw==}
                            +    engines: {node: '>=18.0.0'}
 
   '@smithy/is-array-buffer@2.2.0':
     resolution: {integrity: sha512-GGP3O9QFD24uGeAXYUjwSTXARoqpZykHadOmA8G5vfJP
K0/DC67qa//0qvqrJzL1xc8WQWX7
/yc7fwudjPHPhA==}
                                 engines: {node: '>=14.0.0'}
 
-  '@smithy/is-array-buffer@3.0.0':
-    resolution: {integrity: sha512-+Fsu6Q6C4RSJiy81Y8eApjEB5gVtM+oFKTffg+jSuwtv
omJJrhUJBu2zS8wjXSgH/g1MKEWr
zyChTBe6clb5FQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/is-array-buffer@4.0.0':
+    resolution: {integrity: sha512-saYhF8ZZNoJDTvJBEWgeBccCg+yvp1CX+ed12yORU3Ni
lJScfc6gfch2oVb4QgxZrGUx3/ZJ
lb+c/dJbyupxlw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/md5-js@3.0.11':
-    resolution: {integrity: sha512-3NM0L3i2Zm4bbgG6Ymi9NBcxXhryi3uE8fIfHJZIOfZV
xOkGdjdgjR9A06SFIZCfnEIWKXZd
m6Yq5/aPXFFhsQ==}
                            +  '@smithy/md5-js@4.0.0':
+    resolution: {integrity: sha512-NUjbK+M1RNd0J/mM3eh4Yw5SfUrJBsIAea/H5dvc8tir
xWFHFDUHJ/CK40/vtY3niiYnygWj
ZZ+ISydray6Raw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/middleware-content-length@3.0.13':
-    resolution: {integrity: sha512-zfMhzojhFpIX3P5ug7jxTjfUcIPcGjcQYzB9t+rv0g1T
X7B0QdwONW+ATouaLoD7h7LOw/Zl
Xfkq4xJ/g2TrIw==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/middleware-content-length@4.0.0':
+    resolution: {integrity: sha512-nM1RJqLwkSCidumGK8WwNEZ0a0D/4LkwqdPna+QmHrdP
oAK6WGLyZFosdMpsAW1OIbDLWGa+
r37Mo4Vth4S4kQ==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/middleware-endpoint@3.2.8':
-    resolution: {integrity: sha512-OEJZKVUEhMOqMs3ktrTWp7UvvluMJEvD5XgQwRePSbDg
1VvBaL8pX8mwPltFn6wk1GySbcVw
wyldL8S+iqnrEQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/middleware-endpoint@4.0.0':
+    resolution: {integrity: sha512-/f6z5SqUurmqemhBZNhM0c+C7QW0AY/zJpic//sbdu26
q98HSPAI/xvzStjYq+UhtWeAe/ja
X6gamdL/2r3W1g==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/middleware-retry@3.0.34':
-    resolution: {integrity: sha512-yVRr/AAtPZlUvwEkrq7S3x7Z8/xCd97m2hLDaqdz6ucP
2RKHsBjEqaUA2ebNv2SsZoPEi+ZD
0dZbOB1u37tGCA==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/middleware-retry@4.0.0':
+    resolution: {integrity: sha512-K6tsFp3Ik44H3694a+LWoXLV8mqy8zn6/vTw2feU72Ma
Izi51EHMVNNxxpL6e2GI6oxw8FFR
GWgGn8+wQRrHZQ==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/middleware-serde@3.0.11':
-    resolution: {integrity: sha512-KzPAeySp/fOoQA82TpnwItvX8BBURecpx6ZMu75EZDkA
cnPtO6vf7q4aH5QHs/F1s3/snQaS
FbbUMcFFZ086Mw==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/middleware-serde@4.0.0':
+    resolution: {integrity: sha512-aW4Zo8Cm988RCvhysErzqrQ4YPKgZFhajvgPoZnsWIDa
ZfT419J17Ahr13Lul3kqGad2dCz7
YOrXd7r+UAEj/w==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/middleware-stack@3.0.11':
-    resolution: {integrity: sha512-1HGo9a6/ikgOMrTrWL/WiN9N8GSVYpuRQO5kjstAq4Cv
V59bjqnh7TbdXGQ4vxLD3xlSjfBj
q5t1SOELePsLnA==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/middleware-stack@4.0.0':
+    resolution: {integrity: sha512-4NFaX88RmgVrCyJv/3RsSdqMwxzI/EQa8nvhUDVxmLUM
RS2JUdHnliD6IwKuqIwIzz+E1aZK
3EhSHUM4HXp3ww==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/node-config-provider@3.1.12':
-    resolution: {integrity: sha512-O9LVEu5J/u/FuNlZs+L7Ikn3lz7VB9hb0GtPT9MQeiBm
tK8RSY3ULmsZgXhe6VAlgTw0YO+p
aQx4p8xdbs43vQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/node-config-provider@4.0.0':
+    resolution: {integrity: sha512-Crp9rg1ewjqgM2i7pWSpNhfbBa0usyKGDVQLEXTOpu6t
rFqq3BFLLCgbCE1S18h6mxqKnOqU
ONq3nWOxUk75XA==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/node-http-handler@3.3.3':
-    resolution: {integrity: sha512-BrpZOaZ4RCbcJ2igiSNG16S+kgAc65l/2hmxWdmhyoGW
HTLlzQzr06PXavJp9OBlPEG/sHlq
dxjWmjzV66+BSQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/node-http-handler@4.0.0':
+    resolution: {integrity: sha512-WvumtEaFyxaI95zmj6eYlF/vCFCKNyru3P/UUHCUS9Bj
vajUtNckH2cY3bBfi+qqMPX5gha4
g26lcOlE/wPz/Q==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/property-provider@3.1.11':
-    resolution: {integrity: sha512-I/+TMc4XTQ3QAjXfOcUWbSS073oOEAxgx4aZy8jHaf8J
QnRkq2SZWw8+PfDtBvLUjcGMdxl+
YwtzWe6i5uhL/A==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/property-provider@4.0.0':
+    resolution: {integrity: sha512-AJSvY1k3SdM0stGrIjL8/FIjXO7X9I7KkznXDmr76RGz
+yvaDHLsLm2hSHyzAlmwEQnHaafS
U2dwaV0JcnR/4w==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/protocol-http@4.1.8':
-    resolution: {integrity: sha512-hmgIAVyxw1LySOwkgMIUN0kjN8TG9Nc85LJeEmEE/cNE
e2rkHDUWhnJf2gxcSRFLWsyqWsrZ
Gw40ROjUogg+Iw==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/protocol-http@5.0.0':
+    resolution: {integrity: sha512-laAcIHWq9GQ5VdAS71DUrCj5HUHZ/89Ee+HRTLhFR5/E
3toBlnZfPG+kqBajwfEB5aSdRuKs
lfzl5Dzrn3pr8A==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/querystring-builder@3.0.11':
-    resolution: {integrity: sha512-u+5HV/9uJaeLj5XTb6+IEF/dokWWkEqJ0XiaRRogyREm
KGUgZnNecLucADLdauWFKUNbQful
HFEZEdjwEBjXRg==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/querystring-builder@4.0.0':
+    resolution: {integrity: sha512-kMqPDRf+/hwm+Dmk8AQCaYTJxNWWpNdJJteeMm0jwDbm
RDqSqHQ7oLEVzvOnbWJu1poVtOhv
6v7jsbyx9JASsw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/querystring-parser@3.0.11':
-    resolution: {integrity: sha512-Je3kFvCsFMnso1ilPwA7GtlbPaTixa3WwC+K21kmMZHs
BEOZYQaqxcMqeFFoU7/slFjKDIpi
iPydvdJm8Q/MCw==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/querystring-parser@4.0.0':
+    resolution: {integrity: sha512-SbogL1PNEmm28ya0eK2S0EZEbYwe0qpaqSGrODm+uYS6
dQ7pekPLVNXjBRuuLIAT26ZF2wTs
p6X7AVRBNZd8qw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/service-error-classification@3.0.11':
-    resolution: {integrity: sha512-QnYDPkyewrJzCyaeI2Rmp7pDwbUETe+hU8ADkXmgNusO
1bgHBH7ovXJiYmba8t0fNfJx75fE
8dlM6SEmZxheog==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/service-error-classification@4.0.0':
+    resolution: {integrity: sha512-hIZreT6aXSG0PK/psT1S+kfeGTnYnRRlf7rU3yDmH/cr
SVjTbS/5h5w2J7eO2ODrQb3xfhJc
YxQBREdwsZk6TA==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/shared-ini-file-loader@3.1.12':
-    resolution: {integrity: sha512-1xKSGI+U9KKdbG2qDvIR9dGrw3CNx+baqJfyr0igKEpj
bHL5stsqAesYBzHChYHlelWtb87V
nLWlhvfCz13H8Q==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/shared-ini-file-loader@4.0.0':
+    resolution: {integrity: sha512-Ktupe8msp2GPaKKVfiz3NNUNnslJiGGRoVh3BDpm/RCh
kQ5INQpqmTc2taE0XChNYumNynLf
b3keekIPaiaZeg==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/signature-v4@4.2.4':
-    resolution: {integrity: sha512-5JWeMQYg81TgU4cG+OexAWdvDTs5JDdbEZx+Qr1iPbvo
91QFGzjy0IkXAKaXUHqmKUJgSHK0
ZxnCkgZpzkeNTA==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/signature-v4@5.0.0':
+    resolution: {integrity: sha512-zqcOR1sZTuoA6K3PBNwzu4YgT1pmIwz47tYpgaJjBTfG
UIMtcjUaXKtuSKEScdv+0wx45/Pb
Xz0//hk80fky3w==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/smithy-client@3.7.0':
-    resolution: {integrity: sha512-9wYrjAZFlqWhgVo3C4y/9kpc68jgiSsKUnsFPzr/MSiR
L93+QRDafGTfhhKAb2wsr69Ru87W
TiqSfQusSmWipA==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/smithy-client@4.0.0':
+    resolution: {integrity: sha512-AgcZ6B+JuqArYioAbaYrCpTCjYsD3/1hPSXntbN2ipsf
c4hE+72RFZevUPYgsKxpy3G+QxuL
fqm11i3+oX4oSA==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/types@3.7.2':
-    resolution: {integrity: sha512-bNwBYYmN8Eh9RyjS1p2gW6MIhSO2rl7X9QeLM8iTdcGR
P+eDiIWDt66c9IysCc22gefKszZv
+ubV9qZc7hdESg==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/types@4.0.0':
+    resolution: {integrity: sha512-aNwIGSOgDOhtTRY/rrn2aeuQeKw/IFrQ998yK5l6Ah85
3WeWIEmFPs/EO4OpfADEdcK+igWn
Zytm/oUgkLgUYg==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/url-parser@3.0.11':
-    resolution: {integrity: sha512-TmlqXkSk8ZPhfc+SQutjmFr5FjC0av3GZP4B/10caK1S
bRwe/v+Wzu/R6xEKxoNqL+8nY18s
1byiy6HqPG37Aw==}
                            +  '@smithy/url-parser@4.0.0':
+    resolution: {integrity: sha512-2iPpuLoH0hCKpLtqVgilHtpPKsmHihbkwBm3h3RPuEct
dmuiOlFRZ2ZI8IHSwl0o4ff5Idyy
J0yu/2tS9KpUug==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/util-base64@3.0.0':
-    resolution: {integrity: sha512-Kxvoh5Qtt0CDsfajiZOCpJxgtPHXOKwmM+Zy4waD43Uo
EMA+qPxxa98aE/7ZhdnBFZFXMOiB
R5xbcaMhLtznQQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/util-base64@4.0.0':
+    resolution: {integrity: sha512-CvHfCmO2mchox9kjrtzoHkWHxjHZzaFojLc8quxXY7WA
AMAg43nuxwv95tATVgQFNDwd4M9S
1qFzj40Ul41Kmg==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/util-body-length-browser@3.0.0':
-    resolution: {integrity: sha512-cbjJs2A1mLYmqmyVl80uoLTJhAcfzMOyPgjwAYusWKMd
LeNtzmMz9YxNl3/jRLoxSS3wkqkf
0jwNdtXWtyEBaQ==}
                            +  '@smithy/util-body-length-browser@4.0.0':
+    resolution: {integrity: sha512-sNi3DL0/k64/LO3A256M+m3CDdG6V7WKWHdAiBBMUN8S
3hK3aMPhwnPik2A/a2ONN+9doY9U
xaLfgqsIRg69QA==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/util-body-length-node@3.0.0':
-    resolution: {integrity: sha512-Tj7pZ4bUloNUP6PzwhN7K386tmSmEET9QtQg0TgdNOnx
hZvCssHji+oZTUIuzxECRfG8rdm2
PMw2WCFs6eIYkA==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/util-body-length-node@4.0.0':
+    resolution: {integrity: sha512-q0iDP3VsZzqJyje8xJWEJCNIu3lktUGVoSy1KB0UWym2
CL1siV3artm+u1DFYTLejpsrdGyC
SWBdGNjJzfDPjg==}
                            +    engines: {node: '>=18.0.0'}
 
   '@smithy/util-buffer-from@2.2.0':
     resolution: {integrity: sha512-IJdWBbTcMQ6DA0gdNhh/BwrLkDR+ADW5Kr1aZmd4k3DI
F6ezMV4R2NIAmT08wQJ3yUK82thH
WmC/TnK/wpMMIA==}
                                 engines: {node: '>=14.0.0'}
 
-  '@smithy/util-buffer-from@3.0.0':
-    resolution: {integrity: sha512-aEOHCgq5RWFbP+UDPvPot26EJHjOC+bRgse5A8V3FSSh
qd5E5UN4qc7zkwsvJPPAVsf73QwY
cHN1/gt/rtLwQA==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/util-buffer-from@4.0.0':
+    resolution: {integrity: sha512-9TOQ7781sZvddgO8nxueKi3+yGvkY35kotA0Y6BWRajA
v8jjmigQ1sBwz0UX47pQMYXJPahS
KEKYFgt+rXdcug==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/util-config-provider@3.0.0':
-    resolution: {integrity: sha512-pbjk4s0fwq3Di/ANL+rCvJMKM5bzAQdE5S/6RL5NXgME
xFAi6UgQMPOm5yPaIWPpr+EOXKXR
onJ3FoxKf4mCJQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/util-config-provider@4.0.0':
+    resolution: {integrity: sha512-L1RBVzLyfE8OXH+1hsJ8p+acNUSirQnWQ6/EgpchV88G
6zGBTDPdXiiExei6Z1wR2RxYvxY/
XLw6AMNCCt8H3w==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/util-defaults-mode-browser@3.0.34':
-    resolution: {integrity: sha512-FumjjF631lR521cX+svMLBj3SwSDh9VdtyynTYDAiBDE
f8YPP5xORNXKQ9j0105o5+ARAGnO
OP/RqSl40uXddA==}
                            -    engines: {node: '>= 10.0.0'}
+  '@smithy/util-defaults-mode-browser@4.0.0':
+    resolution: {integrity: sha512-7wqsXkzaJkpSqV+Ca95pN9yQutXvhaKeCxGGmjWnRGXY
1fW/yR7wr1ouNnUYCJuTS8MvmB61
xp5Qdj8YMgIA2Q==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/util-defaults-mode-node@3.0.34':
-    resolution: {integrity: sha512-vN6aHfzW9dVVzkI0wcZoUXvfjkl4CSbM9nE//08lmUMy
f00S75uuCpTrqF9uD4bD9eldIXlt
53colrlwKAT8Gw==}
                            -    engines: {node: '>= 10.0.0'}
+  '@smithy/util-defaults-mode-node@4.0.0':
+    resolution: {integrity: sha512-P8VK885kiRT6TEtvcQvz+L/+xIhrDhCmM664ToUtrshF
SBhwGYaJWlQNAH9fXlMhwnNvR+tm
h1KngKJIgQP6bw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/util-endpoints@2.1.7':
-    resolution: {integrity: sha512-tSfcqKcN/Oo2STEYCABVuKgJ76nyyr6skGl9t15hs+Ya
iU06sgMkN7QYjo0BbVw+KT26zok3
IzbdSOksQ4YzVw==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/util-endpoints@3.0.0':
+    resolution: {integrity: sha512-kyOKbkg77lsIVN2jC08uEWm3s16eK1YdVDyi/nKeBDbU
njR30dmTEga79E5tiu5OEgTAdngN
swA9V+L6xa65sA==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/util-hex-encoding@3.0.0':
-    resolution: {integrity: sha512-eFndh1WEK5YMUYvy3lPlVmYY/fZcQE1D8oSf41Id2vCe
IkKJXPcYDCZD+4+xViI6b1XSd7tE
+s5AmXzz5ilabQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/util-hex-encoding@4.0.0':
+    resolution: {integrity: sha512-Yk5mLhHtfIgW2W2WQZWSg5kuMZCVbvhFmC7rV4IO2Qqn
ZdbEFPmQnCcGMAX2z/8Qj3B9hYYN
jZOhWym+RwhePw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/util-middleware@3.0.11':
-    resolution: {integrity: sha512-dWpyc1e1R6VoXrwLoLDd57U1z6CwNSdkM69Ie4+6uYh2
GC7Vg51Qtan7ITzczuVpqezdDTKJ
GJB95fFvvjU/ow==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/util-middleware@4.0.0':
+    resolution: {integrity: sha512-ncuvK6ekpDqtASHg7jx3d3nrkD2BsTzUmeVgvtepuHGx
tySY8qUlb4SiNRdxHYcv3pL2SwdX
s70RwKBU0edW5w==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/util-retry@3.0.11':
-    resolution: {integrity: sha512-hJUC6W7A3DQgaee3Hp9ZFcOxVDZzmBIRBPlUAk8/fSOE
l7pE/aX7Dci0JycNOnm9Mfr0KV2X
jIlUOcGWXQUdVQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/util-retry@4.0.0':
+    resolution: {integrity: sha512-64WFoC19NVuHh3HQO2QbGw+n6GzQ6VH/drxwXLOU3GDL
KxUUzIR9XNm9aTVqh8/7R+y+DgIT
iv5LpX5XdOy73A==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/util-stream@3.3.4':
-    resolution: {integrity: sha512-SGhGBG/KupieJvJSZp/rfHHka8BFgj56eek9px4pp7lZ
bOF+fRiVr4U7A3y3zJD8uGhxq32C
5D96HxsTC9BckQ==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/util-stream@4.0.0':
+    resolution: {integrity: sha512-ctcLq8Ogi2FQuGy2RxJXGGrozhFEb4p9FawB5SpTNAkN
QWbNHcwrGcVSVI3FtdQtkNAINLiE
dMnrx+UN/mafvw==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/util-uri-escape@3.0.0':
-    resolution: {integrity: sha512-LqR7qYLgZTD7nWLBecUi4aqolw8Mhza9ArpNEQ881MJJ
IU2sE5iHCK6TdyqqzcDLy0OPe10I
Y4T8ctVdtynubg==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/util-uri-escape@4.0.0':
+    resolution: {integrity: sha512-77yfbCbQMtgtTylO9itEAdpPXSog3ZxMe09AEhm0dU0N
LTalV70ghDZFR+Nfi1C60jnJoh/R
e4090/DuZh2Omg==}
                            +    engines: {node: '>=18.0.0'}
 
   '@smithy/util-utf8@2.3.0':
     resolution: {integrity: sha512-R8Rdn8Hy72KKcebgLiv8jQcQkXoLMOGGv5uI1/k0l+sn
qkOzQ1R0ChUBCxWMlBsFMekWjq0w
RudIweFs7sKT5A==}
                                 engines: {node: '>=14.0.0'}
 
-  '@smithy/util-utf8@3.0.0':
-    resolution: {integrity: sha512-rUeT12bxFnplYDe815GXbq/oixEGHfRFFtcTF3YdDi/J
aENIM6aSYYLJydG83UNzLXeRI5K8
abYd/8Sp/QM0kA==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/util-utf8@4.0.0':
+    resolution: {integrity: sha512-b+zebfKCfRdgNJDknHCob3O7FpeYQN6ZG6YLExMcasDH
sCXlsXCEuiPZeLnJLpwa5dvPetGl
nGCiMHuLwGvFow==}
                            +    engines: {node: '>=18.0.0'}
 
-  '@smithy/util-waiter@3.2.0':
-    resolution: {integrity: sha512-PpjSboaDUE6yl+1qlg3Si57++e84oXdWGbuFUSAciXsV
fEZJJJupR2Nb0QuXHiunt2vGR+1P
TizOMvnUPaG2Qg==}
                            -    engines: {node: '>=16.0.0'}
+  '@smithy/util-waiter@4.0.1':
+    resolution: {integrity: sha512-PiLI5OMSDOw0IyA+lB8Ta0CIgaJuIyXE97Khvrk1G1ab
71WbMTruzLKP9j3nS6QJScGirkUV
N9sTOhZHU8q3OQ==}
                            +    engines: {node: '>=18.0.0'}
 
   '@solana-developers/helpers@2.5.6':
     resolution: {integrity: sha512-NPWZblVMl4LuVVSJOZG0ZF0VYnrMUjCyMNTiGwNUXPK2
WWYJCqpuDyzs/PMqwvM4gMTjk4pE
ToBX8N2UxDvZkQ==}
                            @@ -7856,8 +7724,8 @@ packages:
   '@types/d3-selection@3.0.11':
     resolution: {integrity: sha512-bhAXu23DJWsrI45xafYpkQ4NtcKMwWnAC/vKrd2l+nxM
FuvOT3XMYTIj2opv8vq8AO5Yh7Qa
c/nSeP/3zjTK0w==}
                             
-  '@types/d3-shape@3.1.6':
-    resolution: {integrity: sha512-5KKk5aKGu2I+O6SONMYSNflgiP0WfZIQvVUMan50wHsL
G1G94JlxEVnCpQARfTtzytuY0p/9
PXXZb3I7giofIA==}
                            +  '@types/d3-shape@3.1.7':
+    resolution: {integrity: sha512-VLvUQ33C+3J+8p+Daf+nYSOsjB4GXp19/S/aGo60m9h1
v6XaxjiT82lKVWJCfzhtuZ3yD7i/
TPeC/fuKLLOSmg==}
                             
   '@types/d3-time-format@4.0.3':
     resolution: {integrity: sha512-5xg9rC+wWL8kdDj153qZcsJ0FWiFt0J5RB6LYUNZjwSn
esfblqrI/bJ1wBdJ8OQfncgbJG5+
2F+qfqnqyzYxyg==}
                            @@ -7908,8 +7776,8 @@ packages:
   '@types/express-serve-static-core@4.19.6':
     resolution: {integrity: sha512-N4LZ2xG7DatVqhCZzOGb1Yi5lMbXSZcmdLDe9EzSndPV
2HpWYWzRbaerl2n27irrm94EPppr
qa8KpskPT085+A==}
                             
-  '@types/express-serve-static-core@5.0.3':
-    resolution: {integrity: sha512-JEhMNwUJt7bw728CydvYzntD0XJeTmDnvwLlbfbAhE7T
bslm/ax6bdIiUwTgeVlZTsJQPwZw
KpAkyDtIjsvx3g==}
                            +  '@types/express-serve-static-core@5.0.4':
+    resolution: {integrity: sha512-5kz9ScmzBdzTgB/3susoCgfqNDzBjvLL4taparufgSvl
wjdLy6UyUy9T/tCpYd2GIdIilCat
C4iSQS0QSYHt0w==}
                             
   '@types/express@4.17.21':
     resolution: {integrity: sha512-ejlPM315qwLpaQlQDTjPdsUFSc6ZsP4AN6AlWnogPjQ7
CVi7PYF3YVz+CY3jE2pwYf7E/7Hl
DAN0rV2GxTG0HQ==}
                            @@ -7996,8 +7864,8 @@ packages:
   '@types/lodash.isstring@4.0.9':
     resolution: {integrity: sha512-sjGPpa15VBpMns/4s6Blm567JgxLVVu/eCYCe7h/TdQy
PCz9lIhaLSISjN7ZC9cDXmUT2IM/
4mNRw8OtYirziw==}
                             
-  '@types/lodash@4.17.13':
-    resolution: {integrity: sha512-lfx+dftrEZcdBPczf9d0Qv0x+j/rfNCMuC6OcfXmO8gk
feNAY88PgKUbvG56whcN23gc27ye
nwF6oJZXGFpYxg==}
                            +  '@types/lodash@4.17.14':
+    resolution: {integrity: sha512-jsxagdikDiDBeIRaPYtArcT8my4tN1og7MtMRquFT3XN
A6axxyHDRUemqDz/taRDdOUn0GnG
HRCuff4q48sW9A==}
                             
   '@types/lru-cache@5.1.1':
     resolution: {integrity: sha512-ssE3Vlrys7sdIzs5LOxCzTVMsU7i9oa/IaW92wF32JFb
3CVczqOkru2xspuKczHEbG3nvmPY
7IFqVmGGHdNbYw==}
                            @@ -8047,14 +7915,14 @@ packages:
   '@types/node@17.0.45':
     resolution: {integrity: sha512-w+tIMs3rq2afQdsPJlODhoUEKzFP1ayaoyl1CcnwtIls
Ve7K7bA1NGm4s3PraqTLlXnbIN84
zuBlxBWo1u9BLw==}
                             
-  '@types/node@18.19.69':
-    resolution: {integrity: sha512-ECPdY1nlaiO/Y6GUnwgtAAhLNaQ53AyIVz+eILxpEo5O
vuqE6yWkqWBIb5dU0DqhKQtMeny+
FBD3PK6lm7L5xQ==}
                            +  '@types/node@18.19.70':
+    resolution: {integrity: sha512-RE+K0+KZoEpDUbGGctnGdkrLFwi1eYKTlIHNl2Um98mU
kGsm1u2Ff6Ltd0e8DktTtC98uy7r
Sj+hO8t/QuLoVQ==}
                             
   '@types/node@20.17.9':
     resolution: {integrity: sha512-0JOXkRyLanfGPE2QRCwgxhzlBAvaRdCNMcvbd7jFfpmD
4eEXll7LRwy5ymJmyeZqk7Nh7eD2
LeUyQ68BbndmXw==}
                             
-  '@types/node@22.10.4':
-    resolution: {integrity: sha512-99l6wv4HEzBQhvaU/UGoeBoCK61SCROQaCCGyQSgX2tE
Q3rKkNZ2S7CEWnS/4s1LV+8ODdK2
1UeyR1fHP2mXug==}
                            +  '@types/node@22.10.5':
+    resolution: {integrity: sha512-F8Q+SeGimwOo86fiovQh8qiXfFEh2/ocYv7tU5pJ3EXM
SSxk1Joj5wefpFK2fHTf/N6HKGSx
IDBT9f3gCxXPkQ==}
                             
   '@types/node@22.7.5':
     resolution: {integrity: sha512-jML7s2NAzMWc//QSJ1a3prpk78cOPchGvXJsC3C6R6PS
MoooztvRVQEz89gmBTBY1SPMaqo5
teB4uNHPdetShQ==}
                            @@ -8806,8 +8674,8 @@ packages:
   algoliasearch@4.24.0:
     resolution: {integrity: sha512-bf0QV/9jVejssFBmz2HQLxUadxk574t4iwjCKp5E7NBz
wKkrDEhKPISIIjAU/p6K5qDx3qoe
h4+26zWN1jmw3g==}
                             
-  algoliasearch@5.18.0:
-    resolution: {integrity: sha512-/tfpK2A4FpS0o+S78o3YSdlqXr0MavJIDlFK3XZrlXLy
7vaRXJvW5jYg3v5e/wCaF8y0IpMj
kYLhoV6QqfpOgw==}
                            +  algoliasearch@5.19.0:
+    resolution: {integrity: sha512-zrLtGhC63z3sVLDDKGW+SlCRN9eJHFTgdEmoAOpsVh6w
gGL1GgTTDou7tpCBjevzgIvi3AIy
DAQO3Xjbg5eqZg==}
                                 engines: {node: '>= 14.0.0'}
 
   amp-message@0.1.2:
@@ -9163,8 +9031,8 @@ packages:
   balanced-match@1.0.2:
     resolution: {integrity: sha512-3oSeUO0TMV67hN1AmbXsK4yaqU7tjiHlbxRDZOpH0KW9
+CeX4bRAaX0Anxt0tx2MrpRpWwQa
PwIlISEJhYU5Pw==}
                             
-  bare-events@2.5.0:
-    resolution: {integrity: sha512-/E8dDe9dsbLyh2qrZ64PEPadOQ0F4gbl1sUJOrmph7xO
iIxfY8vwab/4bFLh4Y88/Hk/ujKc
rQKc+ps0mv873A==}
                            +  bare-events@2.5.3:
+    resolution: {integrity: sha512-pCO3aoRJ0MBiRMu8B7vUga0qL3L7gO1+SW7ku6qlSsML
wuhaawnuvZDyzJY/kyC63Un0XAB0
OPUcfF1eTO/V+Q==}
                             
   bare-fs@2.3.5:
     resolution: {integrity: sha512-SlE9eTxifPDJrT6YgemQ1WGFleevzwY+XAP1Xqgl56Ht
crisC2CHCZ2tq6dBpcH2TnNxwUEU
Ghweo+lrQtYuiw==}
                            @@ -9407,8 +9275,8 @@ packages:
     engines: {node: '>= 0.8'}
     hasBin: true
 
-  browserslist@4.24.3:
-    resolution: {integrity: sha512-1CPmv8iobE2fyRMV97dAcMVegvvWKxmq94hkLiAkUGwK
VTyDLw33K+ZxiFrREKmmps4rIw6g
rcCFCnTMSZ/YiA==}
                            +  browserslist@4.24.4:
+    resolution: {integrity: sha512-KDi1Ny1gSePi1vm0q4oxSF8b4DR44GF4BbmS2YdhPLOE
qd8pDviZOGH/GsmRwoWJ2+5Lr085
X7naowMwKHDG1A==}
                                 engines: {node: ^6 || ^7 || ^8 || ^9 || ^10 ||
^11 || ^12 || >=13.7}
     hasBin: true
 
@@ -9591,8 +9459,8 @@ packages:
   caniuse-api@3.0.0:
     resolution: {integrity: sha512-bsTwuIg/BZZK/vreVTYYbSWoe2F+71P7K5QGEX+pT250
DZbfU1MQ5prOKpPR+LL6uWKK3KMw
MCAS74QB3Um1uw==}
                             
-  caniuse-lite@1.0.30001690:
-    resolution: {integrity: sha512-5ExiE3qQN6oF8Clf8ifIDcMRCRE/dMGcETG/XGMD8/Xi
Xm6HXQgQTh1yZYLXXpSOsEUlJm1X
r7kGULZTuGtP/w==}
                            +  caniuse-lite@1.0.30001692:
+    resolution: {integrity: sha512-A95VKan0kdtrsnMubMKxEKUKImOPSuCpYgxSQBo036P5
YYgVIcOYJEgt/txJWqObiRQeISNC
fef9nvlQ0vbV7A==}
                             
   canvas@2.11.2:
     resolution: {integrity: sha512-ItanGBMrmRV7Py2Z+Xhs7cT+FNt5K0vPL4p9EZ/UX/Mu
7hFbkxSjKF2KVtPwX7UYWp7dRKnr
TvReflgrItJbdw==}
                            @@ -10139,18 +10007,18 @@ packages:
     peerDependencies:
       webpack: ^5.1.0
 
-  core-js-compat@3.39.0:
-    resolution: {integrity: sha512-VgEUx3VwlExr5no0tXlBt+silBvhTryPwCXRI2Id1PN8
WTKu7MreethvddqOubrYxkFdv/Rn
Yrqlv1sFNAUelw==}
                            +  core-js-compat@3.40.0:
+    resolution: {integrity: sha512-0XEDpr5y5mijvw8Lbc6E5AkjrHfp7eEoPlu36SWeAbcL
8fn1G1ANe8DBlo2XoNN89oVpxWwO
jYIPVzR4ZvsKCQ==}
                             
-  core-js-pure@3.39.0:
-    resolution: {integrity: sha512-7fEcWwKI4rJinnK+wLTezeg2smbFFdSBP6E2kQZNbnzM
2s1rpKQ6aaRteZSSg7FLU3P0HGGV
o/gbpfanU36urg==}
                            +  core-js-pure@3.40.0:
+    resolution: {integrity: sha512-AtDzVIgRrmRKQai62yuSIN5vNiQjcJakJb4fbhVw3ehx
x7Lohphvw9SGNWKhLFqSxC4ilD0g
/L1huAYFQU3Q6A==}
                             
   core-js@2.6.12:
     resolution: {integrity: sha512-Kb2wC0fvsWfQrgk8HU5lW6U/Lcs8+9aaYcy4ZFc6DDlo
4nZ7n70dEgE5rtR0oG6ufKDUnrwf
WL1mXR5ljDatrQ==}
                                 deprecated: core-js@<3.23.3 is no longer mainta
ined and not recommended for usage due to the number of 
issues. Because of the V8 engine whims, feature detection in old core-js version
s could cause a slowdown up to 100x even if nothing is polyfilled. Some versions
 have web compatibility issues. Please, upgrade your dependencies to the actual
version of core-js.
     
-  core-js@3.39.0:
-    resolution: {integrity: sha512-raM0ew0/jJUqkJ0E6e8UDtl+y/7ktFivgWvqw8dNSQeN
WoSDLvQ1H/RN3aPXB9tBd4/FhyR4
RDPGhsNIMsAn7g==}
                            +  core-js@3.40.0:
+    resolution: {integrity: sha512-7vsMc/Lty6AGnn7uFpYT56QesI5D2Y/UkgKounk87OP9
Z2H9Z8kj6jzcSGAxFmUtDOS0ntK6
lbQz+Nsa0Jj6mQ==}
                             
   core-util-is@1.0.2:
     resolution: {integrity: sha512-3lqz5YjWTYnW6dlDa5TLaTCcShfar1e40rmcJVwCBJC6
mWlFuj0eCHIElmG1g5kyuJ/GD+8W
n4FFCcz4gJPfaQ==}
                            @@ -10387,8 +10255,8 @@ packages:
     resolution: {integrity: sha512-0LrrStPOdJj+SPCCrGhzryycLjwcgUSHBtxNA8aIDxf0
GLsRh1cKYhB00Gd1lDOS4yGH69+S
Nn13+TWbVHETFQ==}
                                 engines: {node: ^10 || ^12.20.0 || ^14.13.0 ||
>=15.0.0, npm: '>=7.0.0'}
 
-  cssstyle@4.1.0:
-    resolution: {integrity: sha512-h66W1URKpBS5YMI/V8PyXvTMFT8SupJ1IzoIV8IeBC/j
i8WVmrO8dGlTi+2dh6whmdk6BiKJ
LD/ZBkhWbcg6nA==}
                            +  cssstyle@4.2.1:
+    resolution: {integrity: sha512-9+vem03dMXG7gDmZ62uqmRiMRNtinIZ9ZyuF6BdxzfOD
+FdN5hretzynkn0ReS2DO2GSw76R
WHs0UmJPI2zUjw==}
                                 engines: {node: '>=18'}
 
   csstype@3.1.3:
@@ -10983,8 +10851,8 @@ packages:
   domutils@2.8.0:
     resolution: {integrity: sha512-w96Cjofp72M5IIhpjgobBimYEfoPjx1Vx0BSX9P30WBd
ZW2WIKU0T1Bd0kz2eNZ9ikjKgHbE
yKx8BB6H1L3h3A==}
                             
-  domutils@3.2.1:
-    resolution: {integrity: sha512-xWXmuRnN9OMP6ptPd2+H0cCbcYBULa5YDTbMm/2lvkWv
NA3O4wcW+GvzooqBuNM8yy6pl3VI
AeJTUUWUbfI5Fw==}
                            +  domutils@3.2.2:
+    resolution: {integrity: sha512-6kZKyUajlDuqlHKVX1w7gyslj9MPIXzIFiz/rGu35uC1
wMi+kMhQwGhl4lt9unC9Vb9INnY9
Z3/ZA3+FhASLaw==}
                             
   dot-case@3.0.4:
     resolution: {integrity: sha512-Kv5nKlh6yRrdrGvxeJ2e5y2eRUpkUosIW4A2AS38zwSz
27zu7ufDwQPi5Jhs3XAlGNetl3bm
nGhQsMtkKJnj3w==}
                            @@ -11069,8 +10937,8 @@ packages:
     engines: {node: '>=0.10.0'}
     hasBin: true
 
-  electron-to-chromium@1.5.76:
-    resolution: {integrity: sha512-CjVQyG7n7Sr+eBXE86HIulnL5N8xZY1sgmOPGuq/F0Rr
0FJq63lg0kEtOIDfZBk44FnDLf6F
UJ+dsJcuiUDdDQ==}
                            +  electron-to-chromium@1.5.79:
+    resolution: {integrity: sha512-nYOxJNxQ9Om4EC88BE4pPoNI8xwSFf8pU/BAeOl4Hh/b
/i6V4biTAzwV7pXi3ARKeoYO5JZK
MIXTryXSVer5RA==}
                             
   elliptic@6.5.4:
     resolution: {integrity: sha512-iLhC6ULemrljPZb+QutR5TQGB+pdW6KGD5RSegS+8sor
OZT+rdQFbsQFJgvN3eRqNALqJer4
oQ16YvJHlU8hzQ==}
                            @@ -11237,11 +11105,6 @@ packages:
     engines: {node: '>=12'}
     hasBin: true
 
-  esbuild@0.23.1:
-    resolution: {integrity: sha512-VVNz/9Sa0bs5SELtn3f7qhJCDPCF5oMEl5cO9/SSinpE
9hbPVvxbd572HH5AKiP7WD8INO53
GgfDDhRjkylHEg==}
                            -    engines: {node: '>=18'}
-    hasBin: true
-
   esbuild@0.24.2:
     resolution: {integrity: sha512-+9egpBW8I3CD5XPe0n6BfT5fxLzxrlDzqydF3aviG+9n
i1lDC/OvMHcxqEFV0+LANZG5R1bF
MWfUrjVsdwxJvA==}
                                 engines: {node: '>=18'}
@@ -11341,8 +11204,8 @@ packages:
       jiti:
         optional: true
 
-  esm-env@1.2.1:
-    resolution: {integrity: sha512-U9JedYYjCnadUlXk7e1Kr+aENQhtUaoaV9+gZm1T8LC/
YBAPJx3NSPIAurFOC0U5vrdSevnU
JS2/wUVxGwPhng==}
                            +  esm-env@1.2.2:
+    resolution: {integrity: sha512-Epxrv+Nr/CaL4ZcFGPJIYLWFom+YeV1DqMLHJoEd9SYR
xNbaFruBwfEX/kkHUJf55j2+TUbm
DcmuilbP1TmXHA==}
                             
   esmify@2.1.1:
     resolution: {integrity: sha512-GyOVgjG7sNyYB5Mbo15Ll4aGrcXZzZ3LI22rbLOjCI7L
/wYelzQpBHRZkZkqbPNZ/QIRilca
HqzgNCLcEsi1lQ==}
                            @@ -11564,8 +11427,8 @@ packages:
     resolution: {integrity: sha512-GipyPsXO1anza0AOZdy69Im7hGFCNB7Y/NGjDlZGJ3GJ
JLtwNSb2vrzYrTYJRrRloVx7pl+b
hUaTB8yiccPvFQ==}
                                 engines: {node: '> 0.1.90'}
 
-  fast-content-type-parse@2.0.0:
-    resolution: {integrity: sha512-fCqg/6Sps8tqk8p+kqyKqYfOF0VjPNYrqpLiqNl0RBKm
D80B080AJWVV6EkSkscjToNExcXg
1+Mfzftrx6+iSA==}
                            +  fast-content-type-parse@2.0.1:
+    resolution: {integrity: sha512-nGqtvLrj5w0naR6tDPfB4cUmYCqouzyQiz6C5y/LtcDl
lJdrcc6WaWW6iXyIIOErTa/XRybj
28aasdn4LkVk6Q==}
                             
   fast-deep-equal@3.1.3:
     resolution: {integrity: sha512-f3qQ9oQy9j2AhBe/H9VC91wLmKBCCU/gDOnKNAYG5hsw
O7BLKj09Hc5HYNz9cGI++xlpDCIg
DaitVs03ATR84Q==}
                            @@ -11573,8 +11436,8 @@ packages:
   fast-fifo@1.3.2:
     resolution: {integrity: sha512-/d9sfos4yxzpwkDkuN7k2SqFKtYNmCTzgfEpz82x34IM
9/zc8KGxQoXg1liNC/izpRM/MBdt
44Nmx41ZWqk+FQ==}
                             
-  fast-glob@3.3.2:
-    resolution: {integrity: sha512-oX2ruAFQwf/Orj8m737Y5adxDQO0LAB7/S5MnxCdTNDd
4p6BsyIVsv9JQsATbTSq8KHRpLwI
HbVlUNatxd+1Ow==}
                            +  fast-glob@3.3.3:
+    resolution: {integrity: sha512-7MptL8U0cqcFdzIzwOTHoilX9x5BrNqye7Z/LuC7kCMR
io1EMSyqRK3BEAUD7sXRq4iT4AzT
VuZdhgQ2TCvYLg==}
                                 engines: {node: '>=8.6.0'}
 
   fast-json-patch@3.1.1:
@@ -11596,8 +11459,8 @@ packages:
   fast-stable-stringify@1.0.0:
     resolution: {integrity: sha512-wpYMUmFu5f00Sm0cj2pfivpmawLZ0NKdviQ4w9zJeR8J
VtOpOxHmLaJuj0vxvGqMJQWyP/CO
UkF75/57OKyRag==}
                             
-  fast-uri@3.0.3:
-    resolution: {integrity: sha512-aLrHthzCjH5He4Z2H9YZ+v6Ujb9ocRuW6ZzkJQOrTxle
EijANq4v1TsaPaVG1PZcuurEzrLc
WRyYBYXD5cEiaw==}
                            +  fast-uri@3.0.5:
+    resolution: {integrity: sha512-5JnBCWpFlMo0a3ciDy/JckMzzv1U9coZrIhedq+HXxxU
fDTAiS0LA8OKVao4G9BxmCVck/jt
A5r3KAtRWEyD8Q==}
                             
   fast-xml-parser@4.4.1:
     resolution: {integrity: sha512-xkjOecfnKGkSsOwtZ5Pz7Us/T6mrbPQrq0nh+aCO5V9n
k5NLWmasAHumTKjiPJPWANe+kAZ8
4Jc8ooJkzZ88Sw==}
                            @@ -12012,9 +11875,6 @@ packages:
     resolution: {integrity: sha512-w9UMqWwJxHNOvoNzSJ2oPF5wvYcvP7jUvYzhp67yEhTi
17ZDBBC1z9pTdGuzjD+EFIqLSYRw
eZjqfiPzQ06Ebg==}
                                 engines: {node: '>= 0.4'}
 
-  get-tsconfig@4.8.1:
-    resolution: {integrity: sha512-k9PN+cFBmaLWtVz29SkUoqU5O0slLuHJXt/2P+tMVFT+
phsSGXGkp9t3rQIqdz0e+06EHNGs
3oM6ZX1s2zHxRg==}
                            -
   get-uri@6.0.4:
     resolution: {integrity: sha512-E1b1lFFLvLgak2whF2xDBcOy6NLVGZBqqjJjsIhvopKf
WWEi64pLVTWWehV8KlLerZkfNTA9
5sTe2OdJKm1OzQ==}
                                 engines: {node: '>= 14'}
@@ -12351,8 +12211,8 @@ packages:
   hast-util-select@4.0.2:
     resolution: {integrity: sha512-8EEG2//bN5rrzboPWD2HdS3ugLijNioS1pqOTIolXNf6
7xxShYw4SQEmVXd3imiBG+U2bC2n
VTySr/iRAA7Cjg==}
                             
-  hast-util-to-estree@3.1.0:
-    resolution: {integrity: sha512-lfX5g6hqVh9kjS/B9E2gSkvHH4SZNiQFiqWS0x9fENzE
l+8W12RqdRxX6d/Cwxi30tPQs3bI
O+aolQJNp1bIyw==}
                            +  hast-util-to-estree@3.1.1:
+    resolution: {integrity: sha512-IWtwwmPskfSmma9RpzCappDUitC8t5jhAynHhc1m2+5t
rOgsrp7txscUSavc5Ic8PATyAjfr
CK1wgtxh2cICVQ==}
                             
   hast-util-to-html@9.0.4:
     resolution: {integrity: sha512-wxQzXtdbhiwGAUKrnQJXlOPmHnEehzphwkK7aluUPQ+l
Ec1xefC8pblMgpp2w5ldBTEfveRI
rADcrhGIWrlTDA==}
                            @@ -12681,9 +12541,6 @@ packages:
   inline-source-map@0.6.3:
     resolution: {integrity: sha512-1aVsPEsJWMJq/pdMU61CDlm1URcW702MTB4w9/zUjMus
6H/Py8o7g68Pr9D4I6QluWGt/Kdm
swuRhaA05xVR1w==}
                             
-  inline-style-parser@0.1.1:
-    resolution: {integrity: sha512-7NXolsK4CAS5+xvdj5OMMbI962hU/wvwoxk+LWR9Ek9b
VtyuuYScDN6eS0rUm6TxApFpw7CX
1o4uJzcd4AyD3Q==}
                            -
   inline-style-parser@0.2.4:
     resolution: {integrity: sha512-0aO8FkhNZlj/ZIbNi7Lxxr12obT7cL1moPfE4tg1LkX7
LlLfC6DeX4l2ZEud1ukP9jNQyNnf
zQVqwbwmAATY4Q==}
                             
@@ -13613,8 +13470,8 @@ packages:
     resolution: {integrity: sha512-+Ez9EoiByeoTu/2BXmEaZ06iPNXM6thWJp02KfBO/raS
MyCJ4jw7AkWWa+zBCTm0+Tw1Fj9F
OxdqSskyN5nAwg==}
                                 engines: {node: '>=16.0.0'}
 
-  langsmith@0.2.14:
-    resolution: {integrity: sha512-ClAuAgSf3m9miMYotLEaZKQyKdaWlfjhebCuYco8bc6g
72dU2VwTg31Bv4YINBq7EH2i1cMw
bOiJxbOXPqjGig==}
                            +  langsmith@0.2.15:
+    resolution: {integrity: sha512-homtJU41iitqIZVuuLW7iarCzD4f39KcfP9RTBWav9ji
fhrsDa1Ez89Ejr+4qi72iuBu8Y5x
ykchsGVgiEZ93w==}
                                 peerDependencies:
       openai: '*'
     peerDependenciesMeta:
@@ -14028,8 +13885,8 @@ packages:
   mdast-util-directive@3.0.0:
     resolution: {integrity: sha512-JUpYOqKI4mM3sZcNxmF/ox04XYFFkNwr0CFlrQIkCwbv
H0xzMCqkMqAde9wRd80VAhaUrwFw
Km2nxretdT1h7Q==}
                             
-  mdast-util-find-and-replace@3.0.1:
-    resolution: {integrity: sha512-SG21kZHGC3XRTSUhtofZkBzZTJNM5ecCi0SK2IMKmSXR
8vO3peL+kb1O0z7Zl83jKtutG4k5
Wv/W7V3/YHvzPA==}
                            +  mdast-util-find-and-replace@3.0.2:
+    resolution: {integrity: sha512-Tmd1Vg/m3Xz43afeNxDIhWRtFZgM2VLyaf4vSTYwudTy
euTneoL3qtWMA5jeLyz/O1vDJmmV
4QuScFCA2tBPwg==}
                             
   mdast-util-from-markdown@2.0.2:
     resolution: {integrity: sha512-uZhTV/8NBuw0WHkPTrCqDOl0zVe1BIng5ZtHoDk49ME1
qqcjYmmLmOf0gELgcRMxN4w2iuIe
Vso5/6QymSrgmA==}
                            @@ -14923,14 +14780,14 @@ packages:
     resolution: {integrity: sha512-nK28WOo+QIjBkDduTINE4JkF/UJJKyf2EJxvJKfblDpy
g0Q+pkOHNTL0Qwy6NP6FhE/EnzV7
3BxxqcJaXY9anw==}
                                 engines: {node: '>= 0.4'}
 
-  obliterator@2.0.4:
-    resolution: {integrity: sha512-lgHwxlxV1qIg1Eap7LgIeoBWIMFibOjbrYPIPJZcI1mm
GAI2m3lNYpK12Y+GBdPQ0U1hRwSo
rd7GIaawz962qQ==}
                            +  obliterator@2.0.5:
+    resolution: {integrity: sha512-42CPE9AhahZRsMNslczq0ctAEtqk8Eka26QofnqC346B
ZdHDySk3LWka23LI7ULIw11Nmltp
iLagIq8gBozxTw==}
                             
   obuf@1.1.2:
     resolution: {integrity: sha512-PX1wu0AmAdPqOL1mWhqmlOd8kOIZQwGZw6rh7uby9fTc
5lhaOWFLX3I6R1hrF9k3zUY40e6i
gsLGkDXK92LJNg==}
                             
-  octokit@4.0.3:
-    resolution: {integrity: sha512-kfqH80Yuuux4fLbZ4SvObjCvVu89U0eCh5+fulh6tr/h
JkDYS1inXDGnNJDOp312GANMEhWW
MLYmjQR8MvSSMQ==}
                            +  octokit@4.1.0:
+    resolution: {integrity: sha512-/UrQAOSvkc+lUUWKNzy4ByAgYU9KpFzZQt8DnC962YmQ
uDiZb1SNJ90YukCCK5aMzKqqCA+z
1kkAlmzYvdYKag==}
                                 engines: {node: '>= 18'}
 
   ofetch@1.4.1:
@@ -15013,8 +14870,8 @@ packages:
       zod:
         optional: true
 
-  openai@4.77.0:
-    resolution: {integrity: sha512-WWacavtns/7pCUkOWvQIjyOfcdr9X+9n9Vvb0zFeKVDA
qwCMDHB+iSr24SVaBAhplvSG6JrR
XFpcNM9gWhOGIw==}
                            +  openai@4.77.4:
+    resolution: {integrity: sha512-rShjKsZ/HXm1cSxXt6iFeZxiCohrVShawt0aRRQmbb+z
/EXcH4OouyQZP1ShyZMb63LJajpl
8aGw3DzEi8Wh9Q==}
                                 hasBin: true
     peerDependencies:
       zod: ^3.23.8
@@ -15575,8 +15432,8 @@ packages:
     peerDependencies:
       postcss: ^8.4
 
-  postcss-calc@10.0.2:
-    resolution: {integrity: sha512-DT/Wwm6fCKgpYVI7ZEWuPJ4az8hiEHtCUeYjZXqU7Ou4
QqYh1Df2yCQ7Ca6N7xqKPFkxN3fh
f+u9KSoOCJNAjg==}
                            +  postcss-calc@10.1.0:
+    resolution: {integrity: sha512-uQ/LDGsf3mgsSUEXmAt3VsCSHR3aKqtEIkmB+4PhzYwR
YOW5MZs/GhCCFpsOtJJkP6EC6uGi
pbrnaTjqaJZcJw==}
                                 engines: {node: ^18.12 || ^20.9 || >=22.0}
     peerDependencies:
       postcss: ^8.4.38
@@ -16961,9 +16818,6 @@ packages:
   resolve-pathname@3.0.0:
     resolution: {integrity: sha512-C7rARubxI8bXFNB/hqcp/4iUeIXJhJZvFPFPiSPRnhU5
UPxzMFIl+2E6yY6c4k9giDJAhtV+
enfA+G89N6Csng==}
                             
-  resolve-pkg-maps@1.0.0:
-    resolution: {integrity: sha512-seS2Tj26TBVOC2NIc2rOe2y2ZO7efxITtLZcGSOnHHNO
Q7CkiUBfw0Iw2ck6xkIhPwLhKNLS
8BO+hEpngQlqzw==}
                            -
   resolve.exports@2.0.3:
     resolution: {integrity: sha512-OcXjMsGdhL4XnbShKpAcSqPMzQoYkYyhbEaeSko47MjR
P9NfEQMhZkXL1DoFlt9LWQn4Yttr
dnV6X2OiyzBi+A==}
                                 engines: {node: '>=10'}
@@ -17055,8 +16909,8 @@ packages:
     engines: {node: '>=14.18.0', npm: '>=8.0.0'}
     hasBin: true
 
-  rollup@4.29.1:
-    resolution: {integrity: sha512-RaJ45M/kmJUzSWDs1Nnd5DdV4eerC98idtUOVr6FfKcg
xqvjwHmxc5upLF9qZU9EpsVzzhle
FahrT3shLuJzIw==}
                            +  rollup@4.30.1:
+    resolution: {integrity: sha512-mlJ4glW020fPuLi7DkM/lN97mYEZGWeqBnrljzN0gs7G
LctqX3lNWxKQ7Gl712UAX+6fog/L
3jh4gb7R6aVi3w==}
                                 engines: {node: '>=18.0.0', npm: '>=8.0.0'}
     hasBin: true
 
@@ -17069,6 +16923,9 @@ packages:
   rrweb-cssom@0.7.1:
     resolution: {integrity: sha512-TrEMa7JGdVm0UThDJSx7ddw5nVm3UJS9o9CCIZ72B1vS
yEZoziDqBYP3XIoi/12lKrJR8rE3
jeFHMok2F/Mnsg==}
                             
+  rrweb-cssom@0.8.0:
+    resolution: {integrity: sha512-guoltQEx+9aMf2gDZ0s62EcV8lsXR+0w8915TC3ITdn2
YueuNjdAYh/levpU9nFaoChh9RUS
5ZdQMrKfVEN9tw==}
                            +
   rtl-detect@1.1.2:
     resolution: {integrity: sha512-PGMBq03+TTG/p/cRB7HCLKJ1MgDIi07+QU1faSjiYRfm
Y5UsAttV9Hs08jDAHVwcOwmVLcSJ
kpwyfXszVjWfIQ==}
                             
@@ -17331,8 +17188,8 @@ packages:
     engines: {node: '>=4'}
     hasBin: true
 
-  shiki@1.25.1:
-    resolution: {integrity: sha512-/1boRvNYwRW3GLG9Y6dXdnZ/Ha+J5T/5y3hV7TGQUcDS
BM185D3FCbXlz2eTGNKG2iWCbWqo
+P0yhGKZ4/CUrw==}
                            +  shiki@1.26.1:
+    resolution: {integrity: sha512-Gqg6DSTk3wYqaZ5OaYtzjcdxcBvX5kCy24yvRJEgjT5U
+WHlmqCThLuBUx0juyxQBi+6ug53
IGeuQS07DWwpcw==}
                             
   shimmer@1.2.1:
     resolution: {integrity: sha512-sQTKC1Re/rM6XyFM6fIAGHRPVGvyXfgzIDvzoq608vM+
jeyVD0Tu1E6Np0Kc2zAIFWIj963V
2800iF/9LPieQw==}
                            @@ -17771,9 +17628,6 @@ packages:
     engines: {node: '>=4'}
     hasBin: true
 
-  style-to-object@0.4.4:
-    resolution: {integrity: sha512-HYNoHZa2GorYNyqiCaBgsxvcJIn7OHq6inEga+E6Ke3m
5JkoqpQbnFssk4jwe+K7AhGa2fch
a4wSOf1Kn01dMg==}
                            -
   style-to-object@1.0.8:
     resolution: {integrity: sha512-xT47I/Eo0rwJmaXC4oilDGDWLohVhR6o/xAQcPQN8q6Q
BuZVL8qMYL85kLmST5cPjAorwvqI
A4qXTRQoYHaL6g==}
                             
@@ -17834,8 +17688,8 @@ packages:
     resolution: {integrity: sha512-ot0WnXS9fgdkgIcePe6RHNk1WA8+muPa6cSjeR3V8K27
q9BB1rTE3R1p7Hv0z1ZyAc8s6Vvv
8DIyWf681MAt0w==}
                                 engines: {node: '>= 0.4'}
 
-  svelte@5.16.1:
-    resolution: {integrity: sha512-FsA1OjAKMAFSDob6j/Tv2ZV9rY4SeqPd1WXQlQkFkePA
ozSHLp6tbkU9qa1xJ+uTRzMSM2Vx
3USdsYZBXd3H3g==}
                            +  svelte@5.17.1:
+    resolution: {integrity: sha512-HitqD0XhU9OEytPuux/XYzxle4+7D8+fIb1tHbwMzOtB
zDZZO+ESEuwMbahJ/3JoklfmRPB/
Gzp74L87Qrxfpw==}
                                 engines: {node: '>=18'}
 
   svg-parser@2.0.4:
@@ -18061,14 +17915,14 @@ packages:
     resolution: {integrity: sha512-n1cw8k1k0x4pgA2+9XrOkFydTerNcJ1zWCO5Nn9scWHT
D+5tp8dghT2x1uduQePZTZgd3Tup
f+x9BxJjeJi77Q==}
                                 engines: {node: '>=14.0.0'}
 
-  tldts-core@6.1.70:
-    resolution: {integrity: sha512-RNnIXDB1FD4T9cpQRErEqw6ZpjLlGdMOitdV+0xtbsnw
r4YFka1zpc7D4KD+aAn8oSG5JyFr
dasZTE04qDE9Yg==}
                            +  tldts-core@6.1.71:
+    resolution: {integrity: sha512-LRbChn2YRpic1KxY+ldL1pGXN/oVvKfCVufwfVzEQdFY
No39uF7AJa/WXdo+gYO7PTvdfkCP
Ced6Hkvz/kR7jg==}
                             
-  tldts-experimental@6.1.70:
-    resolution: {integrity: sha512-cEhsyUBfW/elb1FpPAfnqqTa0Av9OJlcG9Nabiuqn8/1
Xggpqch7H8QfZA55SNHonj1x1uRB
/NzRETvCiQqz5Q==}
                            +  tldts-experimental@6.1.71:
+    resolution: {integrity: sha512-78lfP/3fRJ3HoCT5JSLOLj5ElHiWCAyglYNzjkFqBO7y
kLZYst2u2jM1igSHWV0J2GFfOplA
peDsfTF+XACrlA==}
                             
-  tldts@6.1.70:
-    resolution: {integrity: sha512-/W1YVgYVJd9ZDjey5NXadNh0mJXkiUMUue9Zebd0vpdo
1sU+H4zFFTaJ1RKD4N6KFoHfcXy6
l+Vu7bh+bdWCzA==}
                            +  tldts@6.1.71:
+    resolution: {integrity: sha512-LQIHmHnuzfZgZWAf2HzL83TIIrD8NhhI0DVxqo9/FdOd
4ilec+NTNZOlDZf7EwrTNoutccbs
HjvWHYXLAtvxjw==}
                                 hasBin: true
 
   tmp@0.0.33:
@@ -18276,11 +18130,6 @@ packages:
       typescript:
         optional: true
 
-  tsx@4.19.2:
-    resolution: {integrity: sha512-pOUl6Vo2LUq/bSa8S5q7b91cgNSjctn9ugq/+Mvow99q
W6x/UZYwzxy/3NmqoT66eHYfCVvF
vACC58UBPFf28g==}
                            -    engines: {node: '>=18.0.0'}
-    hasBin: true
-
   tty-browserify@0.0.1:
     resolution: {integrity: sha512-C3TaO7K81YvjCgQH9Q1S3R3P3BtN3RIM8n+OvX4il1K1
zgE8ZhI0op7kClgkxtutIE8hQrcr
HBXvIheqKUUCxw==}
                             
@@ -18391,8 +18240,8 @@ packages:
     resolution: {integrity: sha512-RAH822pAdBgcNMAfWnCBU3CFZcfZ/i1eZjwFU/dsLKum
yuuP3niueg2UAukXYF0E2AAoc82Z
SSf9J0WQBinzHA==}
                                 engines: {node: '>=12.20'}
 
-  type-fest@4.31.0:
-    resolution: {integrity: sha512-yCxltHW07Nkhv/1F6wWBr8kz+5BGMfP+RbRSYFnegVb0
qV/UMT0G0ElBloPVerqn4M2ZV80I
r1FtCcYv1cT6vQ==}
                            +  type-fest@4.32.0:
+    resolution: {integrity: sha512-rfgpoi08xagF3JSdtJlCwMq9DGNDE0IMh3Mkpc1wUypg
9vPi786AiqeBBKcqvIkq42azsBM8
5N490fyZjeUftw==}
                                 engines: {node: '>=16'}
 
   type-is@1.6.18:
@@ -18732,8 +18581,8 @@ packages:
     resolution: {integrity: sha512-1uEe95xksV1O0CYKXo8vQvN1JEbtJp7lb7C5U9HMsIp6
IVwntkH/oNUzyVNQSd4S1sYk2FpS
SW44FqMc8qee5w==}
                                 engines: {node: '>=4'}
 
-  update-browserslist-db@1.1.1:
-    resolution: {integrity: sha512-R8UzCaa9Az+38REPiJ1tXlImTJXlVfgHZsglwBD/k6nj
76ctsH1E3q4doGrukiLQd3sGQYu5
6r5+lo5r94l29A==}
                            +  update-browserslist-db@1.1.2:
+    resolution: {integrity: sha512-PPypAm5qvlD7XMZC3BujecnaOxwhrtoFR+Dqkk5Aa/6D
ssiH0ibKoketaj9w8LP7Bont1rYe
oV5plxD7RTEPRg==}
                                 hasBin: true
     peerDependencies:
       browserslist: '>= 4.21.0'
@@ -19632,7 +19481,7 @@ snapshots:
       - supports-color
       - utf-8-validate
 
-  '@0no-co/graphql.web@1.0.12(graphql@16.10.0)':
+  '@0no-co/graphql.web@1.0.13(graphql@16.10.0)':
     optionalDependencies:
       graphql: 16.10.0
 
@@ -19645,7 +19494,7 @@ snapshots:
   '@acuminous/bitsyntax@0.1.2':
     dependencies:
       buffer-more-ints: 1.0.0
-      debug: 4.4.0
+      debug: 4.4.0(supports-color@8.1.1)
       safe-buffer: 5.1.2
     transitivePeerDependencies:
       - supports-color
@@ -19741,13 +19590,13 @@ snapshots:
     transitivePeerDependencies:
       - zod
 
-  '@ai-sdk/svelte@0.0.57(svelte@5.16.1)(zod@3.23.8)':
+  '@ai-sdk/svelte@0.0.57(svelte@5.17.1)(zod@3.23.8)':
     dependencies:
       '@ai-sdk/provider-utils': 1.0.22(zod@3.23.8)
       '@ai-sdk/ui-utils': 0.0.50(zod@3.23.8)
-      sswr: 2.1.0(svelte@5.16.1)
+      sswr: 2.1.0(svelte@5.17.1)
     optionalDependencies:
-      svelte: 5.16.1
+      svelte: 5.17.1
     transitivePeerDependencies:
       - zod
 
@@ -19771,33 +19620,33 @@ snapshots:
     transitivePeerDependencies:
       - zod
 
-  '@algolia/autocomplete-core@1.17.7(@algolia/client-search@5.18.0)(algoliasear
ch@5.18.0)(search-insights@2
.17.3)':
                            +  '@algolia/autocomplete-core@1.17.7(@algolia/clien
t-search@5.19.0)(algoliasearch@5.19.0)(search-insights@2
.17.3)':
                                 dependencies:
-      '@algolia/autocomplete-plugin-algolia-insights': 1.17.7(@algolia/client-s
earch@5.18.0)(algoliasearch@
5.18.0)(search-insights@2.17.3)
                            -      '@algolia/autocomplete-shared': 1.17.7(@algol
ia/client-search@5.18.0)(algoliasearch@5.18.0)
+      '@algolia/autocomplete-plugin-algolia-insights': 1.17.7(@algolia/client-s
earch@5.19.0)(algoliasearch@
5.19.0)(search-insights@2.17.3)
                            +      '@algolia/autocomplete-shared': 1.17.7(@algol
ia/client-search@5.19.0)(algoliasearch@5.19.0)
     transitivePeerDependencies:
       - '@algolia/client-search'
       - algoliasearch
       - search-insights
 
-  '@algolia/autocomplete-plugin-algolia-insights@1.17.7(@algolia/client-search@
5.18.0)(algoliasearch@5.18.0
)(search-insights@2.17.3)':
                            +  '@algolia/autocomplete-plugin-algolia-insights@1.
17.7(@algolia/client-search@5.19.0)(algoliasearch@5.19.0
)(search-insights@2.17.3)':
                                 dependencies:
-      '@algolia/autocomplete-shared': 1.17.7(@algolia/client-search@5.18.0)(alg
oliasearch@5.18.0)
+      '@algolia/autocomplete-shared': 1.17.7(@algolia/client-search@5.19.0)(alg
oliasearch@5.19.0)
       search-insights: 2.17.3
     transitivePeerDependencies:
       - '@algolia/client-search'
       - algoliasearch
 
-  '@algolia/autocomplete-preset-algolia@1.17.7(@algolia/client-search@5.18.0)(a
lgoliasearch@5.18.0)':
+  '@algolia/autocomplete-preset-algolia@1.17.7(@algolia/client-search@5.19.0)(a
lgoliasearch@5.19.0)':
     dependencies:
-      '@algolia/autocomplete-shared': 1.17.7(@algolia/client-search@5.18.0)(alg
oliasearch@5.18.0)
-      '@algolia/client-search': 5.18.0
-      algoliasearch: 5.18.0
+      '@algolia/autocomplete-shared': 1.17.7(@algolia/client-search@5.19.0)(alg
oliasearch@5.19.0)
+      '@algolia/client-search': 5.19.0
+      algoliasearch: 5.19.0
 
-  '@algolia/autocomplete-shared@1.17.7(@algolia/client-search@5.18.0)(algoliase
arch@5.18.0)':
+  '@algolia/autocomplete-shared@1.17.7(@algolia/client-search@5.19.0)(algoliase
arch@5.19.0)':
     dependencies:
-      '@algolia/client-search': 5.18.0
-      algoliasearch: 5.18.0
+      '@algolia/client-search': 5.19.0
+      algoliasearch: 5.19.0
 
   '@algolia/cache-browser-local-storage@4.24.0':
     dependencies:
@@ -19809,12 +19658,12 @@ snapshots:
     dependencies:
       '@algolia/cache-common': 4.24.0
 
-  '@algolia/client-abtesting@5.18.0':
+  '@algolia/client-abtesting@5.19.0':
     dependencies:
-      '@algolia/client-common': 5.18.0
-      '@algolia/requester-browser-xhr': 5.18.0
-      '@algolia/requester-fetch': 5.18.0
-      '@algolia/requester-node-http': 5.18.0
+      '@algolia/client-common': 5.19.0
+      '@algolia/requester-browser-xhr': 5.19.0
+      '@algolia/requester-fetch': 5.19.0
+      '@algolia/requester-node-http': 5.19.0
 
   '@algolia/client-account@4.24.0':
     dependencies:
@@ -19829,26 +19678,26 @@ snapshots:
       '@algolia/requester-common': 4.24.0
       '@algolia/transporter': 4.24.0
 
-  '@algolia/client-analytics@5.18.0':
+  '@algolia/client-analytics@5.19.0':
     dependencies:
-      '@algolia/client-common': 5.18.0
-      '@algolia/requester-browser-xhr': 5.18.0
-      '@algolia/requester-fetch': 5.18.0
-      '@algolia/requester-node-http': 5.18.0
+      '@algolia/client-common': 5.19.0
+      '@algolia/requester-browser-xhr': 5.19.0
+      '@algolia/requester-fetch': 5.19.0
+      '@algolia/requester-node-http': 5.19.0
 
   '@algolia/client-common@4.24.0':
     dependencies:
       '@algolia/requester-common': 4.24.0
       '@algolia/transporter': 4.24.0
 
-  '@algolia/client-common@5.18.0': {}
+  '@algolia/client-common@5.19.0': {}
 
-  '@algolia/client-insights@5.18.0':
+  '@algolia/client-insights@5.19.0':
     dependencies:
-      '@algolia/client-common': 5.18.0
-      '@algolia/requester-browser-xhr': 5.18.0
-      '@algolia/requester-fetch': 5.18.0
-      '@algolia/requester-node-http': 5.18.0
+      '@algolia/client-common': 5.19.0
+      '@algolia/requester-browser-xhr': 5.19.0
+      '@algolia/requester-fetch': 5.19.0
+      '@algolia/requester-node-http': 5.19.0
 
   '@algolia/client-personalization@4.24.0':
     dependencies:
@@ -19856,19 +19705,19 @@ snapshots:
       '@algolia/requester-common': 4.24.0
       '@algolia/transporter': 4.24.0
 
-  '@algolia/client-personalization@5.18.0':
+  '@algolia/client-personalization@5.19.0':
     dependencies:
-      '@algolia/client-common': 5.18.0
-      '@algolia/requester-browser-xhr': 5.18.0
-      '@algolia/requester-fetch': 5.18.0
-      '@algolia/requester-node-http': 5.18.0
+      '@algolia/client-common': 5.19.0
+      '@algolia/requester-browser-xhr': 5.19.0
+      '@algolia/requester-fetch': 5.19.0
+      '@algolia/requester-node-http': 5.19.0
 
-  '@algolia/client-query-suggestions@5.18.0':
+  '@algolia/client-query-suggestions@5.19.0':
     dependencies:
-      '@algolia/client-common': 5.18.0
-      '@algolia/requester-browser-xhr': 5.18.0
-      '@algolia/requester-fetch': 5.18.0
-      '@algolia/requester-node-http': 5.18.0
+      '@algolia/client-common': 5.19.0
+      '@algolia/requester-browser-xhr': 5.19.0
+      '@algolia/requester-fetch': 5.19.0
+      '@algolia/requester-node-http': 5.19.0
 
   '@algolia/client-search@4.24.0':
     dependencies:
@@ -19876,21 +19725,21 @@ snapshots:
       '@algolia/requester-common': 4.24.0
       '@algolia/transporter': 4.24.0
 
-  '@algolia/client-search@5.18.0':
+  '@algolia/client-search@5.19.0':
     dependencies:
-      '@algolia/client-common': 5.18.0
-      '@algolia/requester-browser-xhr': 5.18.0
-      '@algolia/requester-fetch': 5.18.0
-      '@algolia/requester-node-http': 5.18.0
+      '@algolia/client-common': 5.19.0
+      '@algolia/requester-browser-xhr': 5.19.0
+      '@algolia/requester-fetch': 5.19.0
+      '@algolia/requester-node-http': 5.19.0
 
   '@algolia/events@4.0.1': {}
 
-  '@algolia/ingestion@1.18.0':
+  '@algolia/ingestion@1.19.0':
     dependencies:
-      '@algolia/client-common': 5.18.0
-      '@algolia/requester-browser-xhr': 5.18.0
-      '@algolia/requester-fetch': 5.18.0
-      '@algolia/requester-node-http': 5.18.0
+      '@algolia/client-common': 5.19.0
+      '@algolia/requester-browser-xhr': 5.19.0
+      '@algolia/requester-fetch': 5.19.0
+      '@algolia/requester-node-http': 5.19.0
 
   '@algolia/logger-common@4.24.0': {}
 
@@ -19898,12 +19747,12 @@ snapshots:
     dependencies:
       '@algolia/logger-common': 4.24.0
 
-  '@algolia/monitoring@1.18.0':
+  '@algolia/monitoring@1.19.0':
     dependencies:
-      '@algolia/client-common': 5.18.0
-      '@algolia/requester-browser-xhr': 5.18.0
-      '@algolia/requester-fetch': 5.18.0
-      '@algolia/requester-node-http': 5.18.0
+      '@algolia/client-common': 5.19.0
+      '@algolia/requester-browser-xhr': 5.19.0
+      '@algolia/requester-fetch': 5.19.0
+      '@algolia/requester-node-http': 5.19.0
 
   '@algolia/recommend@4.24.0':
     dependencies:
@@ -19919,34 +19768,34 @@ snapshots:
       '@algolia/requester-node-http': 4.24.0
       '@algolia/transporter': 4.24.0
 
-  '@algolia/recommend@5.18.0':
+  '@algolia/recommend@5.19.0':
     dependencies:
-      '@algolia/client-common': 5.18.0
-      '@algolia/requester-browser-xhr': 5.18.0
-      '@algolia/requester-fetch': 5.18.0
-      '@algolia/requester-node-http': 5.18.0
+      '@algolia/client-common': 5.19.0
+      '@algolia/requester-browser-xhr': 5.19.0
+      '@algolia/requester-fetch': 5.19.0
+      '@algolia/requester-node-http': 5.19.0
 
   '@algolia/requester-browser-xhr@4.24.0':
     dependencies:
       '@algolia/requester-common': 4.24.0
 
-  '@algolia/requester-browser-xhr@5.18.0':
+  '@algolia/requester-browser-xhr@5.19.0':
     dependencies:
-      '@algolia/client-common': 5.18.0
+      '@algolia/client-common': 5.19.0
 
   '@algolia/requester-common@4.24.0': {}
 
-  '@algolia/requester-fetch@5.18.0':
+  '@algolia/requester-fetch@5.19.0':
     dependencies:
-      '@algolia/client-common': 5.18.0
+      '@algolia/client-common': 5.19.0
 
   '@algolia/requester-node-http@4.24.0':
     dependencies:
       '@algolia/requester-common': 4.24.0
 
-  '@algolia/requester-node-http@5.18.0':
+  '@algolia/requester-node-http@5.19.0':
     dependencies:
-      '@algolia/client-common': 5.18.0
+      '@algolia/client-common': 5.19.0
 
   '@algolia/transporter@4.24.0':
     dependencies:
@@ -19970,7 +19819,7 @@ snapshots:
 
   '@anthropic-ai/sdk@0.30.1(encoding@0.1.13)':
     dependencies:
-      '@types/node': 18.19.69
+      '@types/node': 18.19.70
       '@types/node-fetch': 2.6.12
       abort-controller: 3.0.0
       agentkeepalive: 4.6.0
@@ -20022,6 +19871,14 @@ snapshots:
     transitivePeerDependencies:
       - debug
 
+  '@asamuzakjp/css-color@2.8.2':
+    dependencies:
+      '@csstools/css-calc': 2.1.1(@csstools/css-parser-algorithms@3.0.4(@csstoo
ls/css-tokenizer@3.0.3))(@cs
stools/css-tokenizer@3.0.3)
                            +      '@csstools/css-color-parser': 3.0.7(@csstools
/css-parser-algorithms@3.0.4(@csstools/css-tokenizer@3.0
.3))(@csstools/css-tokenizer@3.0.3)
                            +      '@csstools/css-parser-algorithms': 3.0.4(@css
tools/css-tokenizer@3.0.3)
+      '@csstools/css-tokenizer': 3.0.3
+      lru-cache: 11.0.2
+
   '@avnu/avnu-sdk@2.1.1(ethers@6.13.4(bufferutil@4.0.9)(utf-8-validate@5.0.10))
(qs@6.13.1)(starknet@6.18.0(
encoding@0.1.13))':
                                 dependencies:
       ethers: 6.13.4(bufferutil@4.0.9)(utf-8-validate@5.0.10)
@@ -20031,21 +19888,21 @@ snapshots:
   '@aws-crypto/crc32@5.2.0':
     dependencies:
       '@aws-crypto/util': 5.2.0
-      '@aws-sdk/types': 3.714.0
+      '@aws-sdk/types': 3.723.0
       tslib: 2.8.1
 
   '@aws-crypto/crc32c@5.2.0':
     dependencies:
       '@aws-crypto/util': 5.2.0
-      '@aws-sdk/types': 3.714.0
+      '@aws-sdk/types': 3.723.0
       tslib: 2.8.1
 
   '@aws-crypto/sha1-browser@5.2.0':
     dependencies:
       '@aws-crypto/supports-web-crypto': 5.2.0
       '@aws-crypto/util': 5.2.0
-      '@aws-sdk/types': 3.714.0
-      '@aws-sdk/util-locate-window': 3.693.0
+      '@aws-sdk/types': 3.723.0
+      '@aws-sdk/util-locate-window': 3.723.0
       '@smithy/util-utf8': 2.3.0
       tslib: 2.8.1
 
@@ -20054,15 +19911,15 @@ snapshots:
       '@aws-crypto/sha256-js': 5.2.0
       '@aws-crypto/supports-web-crypto': 5.2.0
       '@aws-crypto/util': 5.2.0
-      '@aws-sdk/types': 3.714.0
-      '@aws-sdk/util-locate-window': 3.693.0
+      '@aws-sdk/types': 3.723.0
+      '@aws-sdk/util-locate-window': 3.723.0
       '@smithy/util-utf8': 2.3.0
       tslib: 2.8.1
 
   '@aws-crypto/sha256-js@5.2.0':
     dependencies:
       '@aws-crypto/util': 5.2.0
-      '@aws-sdk/types': 3.714.0
+      '@aws-sdk/types': 3.723.0
       tslib: 2.8.1
 
   '@aws-crypto/supports-web-crypto@5.2.0':
@@ -20071,624 +19928,624 @@ snapshots:
 
   '@aws-crypto/util@5.2.0':
     dependencies:
-      '@aws-sdk/types': 3.714.0
+      '@aws-sdk/types': 3.723.0
       '@smithy/util-utf8': 2.3.0
       tslib: 2.8.1
 
-  '@aws-sdk/client-polly@3.721.0':
+  '@aws-sdk/client-polly@3.723.0':
     dependencies:
       '@aws-crypto/sha256-browser': 5.2.0
       '@aws-crypto/sha256-js': 5.2.0
-      '@aws-sdk/client-sso-oidc': 3.721.0(@aws-sdk/client-sts@3.721.0)
-      '@aws-sdk/client-sts': 3.721.0
-      '@aws-sdk/core': 3.716.0
-      '@aws-sdk/credential-provider-node': 3.721.0(@aws-sdk/client-sso-oidc@3.7
21.0(@aws-sdk/client-sts@3.7
21.0))(@aws-sdk/client-sts@3.721.0)
                            -      '@aws-sdk/middleware-host-header': 3.714.0
-      '@aws-sdk/middleware-logger': 3.714.0
-      '@aws-sdk/middleware-recursion-detection': 3.714.0
-      '@aws-sdk/middleware-user-agent': 3.721.0
-      '@aws-sdk/region-config-resolver': 3.714.0
-      '@aws-sdk/types': 3.714.0
-      '@aws-sdk/util-endpoints': 3.714.0
-      '@aws-sdk/util-user-agent-browser': 3.714.0
-      '@aws-sdk/util-user-agent-node': 3.721.0
-      '@smithy/config-resolver': 3.0.13
-      '@smithy/core': 2.5.7
-      '@smithy/fetch-http-handler': 4.1.3
-      '@smithy/hash-node': 3.0.11
-      '@smithy/invalid-dependency': 3.0.11
-      '@smithy/middleware-content-length': 3.0.13
-      '@smithy/middleware-endpoint': 3.2.8
-      '@smithy/middleware-retry': 3.0.34
-      '@smithy/middleware-serde': 3.0.11
-      '@smithy/middleware-stack': 3.0.11
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/node-http-handler': 3.3.3
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/smithy-client': 3.7.0
-      '@smithy/types': 3.7.2
-      '@smithy/url-parser': 3.0.11
-      '@smithy/util-base64': 3.0.0
-      '@smithy/util-body-length-browser': 3.0.0
-      '@smithy/util-body-length-node': 3.0.0
-      '@smithy/util-defaults-mode-browser': 3.0.34
-      '@smithy/util-defaults-mode-node': 3.0.34
-      '@smithy/util-endpoints': 2.1.7
-      '@smithy/util-middleware': 3.0.11
-      '@smithy/util-retry': 3.0.11
-      '@smithy/util-stream': 3.3.4
-      '@smithy/util-utf8': 3.0.0
+      '@aws-sdk/client-sso-oidc': 3.723.0(@aws-sdk/client-sts@3.723.0)
+      '@aws-sdk/client-sts': 3.723.0
+      '@aws-sdk/core': 3.723.0
+      '@aws-sdk/credential-provider-node': 3.723.0(@aws-sdk/client-sso-oidc@3.7
23.0(@aws-sdk/client-sts@3.7
23.0))(@aws-sdk/client-sts@3.723.0)
                            +      '@aws-sdk/middleware-host-header': 3.723.0
+      '@aws-sdk/middleware-logger': 3.723.0
+      '@aws-sdk/middleware-recursion-detection': 3.723.0
+      '@aws-sdk/middleware-user-agent': 3.723.0
+      '@aws-sdk/region-config-resolver': 3.723.0
+      '@aws-sdk/types': 3.723.0
+      '@aws-sdk/util-endpoints': 3.723.0
+      '@aws-sdk/util-user-agent-browser': 3.723.0
+      '@aws-sdk/util-user-agent-node': 3.723.0
+      '@smithy/config-resolver': 4.0.0
+      '@smithy/core': 3.0.0
+      '@smithy/fetch-http-handler': 5.0.0
+      '@smithy/hash-node': 4.0.0
+      '@smithy/invalid-dependency': 4.0.0
+      '@smithy/middleware-content-length': 4.0.0
+      '@smithy/middleware-endpoint': 4.0.0
+      '@smithy/middleware-retry': 4.0.0
+      '@smithy/middleware-serde': 4.0.0
+      '@smithy/middleware-stack': 4.0.0
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/node-http-handler': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/smithy-client': 4.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/url-parser': 4.0.0
+      '@smithy/util-base64': 4.0.0
+      '@smithy/util-body-length-browser': 4.0.0
+      '@smithy/util-body-length-node': 4.0.0
+      '@smithy/util-defaults-mode-browser': 4.0.0
+      '@smithy/util-defaults-mode-node': 4.0.0
+      '@smithy/util-endpoints': 3.0.0
+      '@smithy/util-middleware': 4.0.0
+      '@smithy/util-retry': 4.0.0
+      '@smithy/util-stream': 4.0.0
+      '@smithy/util-utf8': 4.0.0
       tslib: 2.8.1
     transitivePeerDependencies:
       - aws-crt
 
-  '@aws-sdk/client-s3@3.721.0':
+  '@aws-sdk/client-s3@3.723.0':
     dependencies:
       '@aws-crypto/sha1-browser': 5.2.0
       '@aws-crypto/sha256-browser': 5.2.0
       '@aws-crypto/sha256-js': 5.2.0
-      '@aws-sdk/client-sso-oidc': 3.721.0(@aws-sdk/client-sts@3.721.0)
-      '@aws-sdk/client-sts': 3.721.0
-      '@aws-sdk/core': 3.716.0
-      '@aws-sdk/credential-provider-node': 3.721.0(@aws-sdk/client-sso-oidc@3.7
21.0(@aws-sdk/client-sts@3.7
21.0))(@aws-sdk/client-sts@3.721.0)
                            -      '@aws-sdk/middleware-bucket-endpoint': 3.721.
0
-      '@aws-sdk/middleware-expect-continue': 3.714.0
-      '@aws-sdk/middleware-flexible-checksums': 3.717.0
-      '@aws-sdk/middleware-host-header': 3.714.0
-      '@aws-sdk/middleware-location-constraint': 3.714.0
-      '@aws-sdk/middleware-logger': 3.714.0
-      '@aws-sdk/middleware-recursion-detection': 3.714.0
-      '@aws-sdk/middleware-sdk-s3': 3.716.0
-      '@aws-sdk/middleware-ssec': 3.714.0
-      '@aws-sdk/middleware-user-agent': 3.721.0
-      '@aws-sdk/region-config-resolver': 3.714.0
-      '@aws-sdk/signature-v4-multi-region': 3.716.0
-      '@aws-sdk/types': 3.714.0
-      '@aws-sdk/util-endpoints': 3.714.0
-      '@aws-sdk/util-user-agent-browser': 3.714.0
-      '@aws-sdk/util-user-agent-node': 3.721.0
-      '@aws-sdk/xml-builder': 3.709.0
-      '@smithy/config-resolver': 3.0.13
-      '@smithy/core': 2.5.7
-      '@smithy/eventstream-serde-browser': 3.0.14
-      '@smithy/eventstream-serde-config-resolver': 3.0.11
-      '@smithy/eventstream-serde-node': 3.0.13
-      '@smithy/fetch-http-handler': 4.1.3
-      '@smithy/hash-blob-browser': 3.1.10
-      '@smithy/hash-node': 3.0.11
-      '@smithy/hash-stream-node': 3.1.10
-      '@smithy/invalid-dependency': 3.0.11
-      '@smithy/md5-js': 3.0.11
-      '@smithy/middleware-content-length': 3.0.13
-      '@smithy/middleware-endpoint': 3.2.8
-      '@smithy/middleware-retry': 3.0.34
-      '@smithy/middleware-serde': 3.0.11
-      '@smithy/middleware-stack': 3.0.11
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/node-http-handler': 3.3.3
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/smithy-client': 3.7.0
-      '@smithy/types': 3.7.2
-      '@smithy/url-parser': 3.0.11
-      '@smithy/util-base64': 3.0.0
-      '@smithy/util-body-length-browser': 3.0.0
-      '@smithy/util-body-length-node': 3.0.0
-      '@smithy/util-defaults-mode-browser': 3.0.34
-      '@smithy/util-defaults-mode-node': 3.0.34
-      '@smithy/util-endpoints': 2.1.7
-      '@smithy/util-middleware': 3.0.11
-      '@smithy/util-retry': 3.0.11
-      '@smithy/util-stream': 3.3.4
-      '@smithy/util-utf8': 3.0.0
-      '@smithy/util-waiter': 3.2.0
+      '@aws-sdk/client-sso-oidc': 3.723.0(@aws-sdk/client-sts@3.723.0)
+      '@aws-sdk/client-sts': 3.723.0
+      '@aws-sdk/core': 3.723.0
+      '@aws-sdk/credential-provider-node': 3.723.0(@aws-sdk/client-sso-oidc@3.7
23.0(@aws-sdk/client-sts@3.7
23.0))(@aws-sdk/client-sts@3.723.0)
                            +      '@aws-sdk/middleware-bucket-endpoint': 3.723.
0
+      '@aws-sdk/middleware-expect-continue': 3.723.0
+      '@aws-sdk/middleware-flexible-checksums': 3.723.0
+      '@aws-sdk/middleware-host-header': 3.723.0
+      '@aws-sdk/middleware-location-constraint': 3.723.0
+      '@aws-sdk/middleware-logger': 3.723.0
+      '@aws-sdk/middleware-recursion-detection': 3.723.0
+      '@aws-sdk/middleware-sdk-s3': 3.723.0
+      '@aws-sdk/middleware-ssec': 3.723.0
+      '@aws-sdk/middleware-user-agent': 3.723.0
+      '@aws-sdk/region-config-resolver': 3.723.0
+      '@aws-sdk/signature-v4-multi-region': 3.723.0
+      '@aws-sdk/types': 3.723.0
+      '@aws-sdk/util-endpoints': 3.723.0
+      '@aws-sdk/util-user-agent-browser': 3.723.0
+      '@aws-sdk/util-user-agent-node': 3.723.0
+      '@aws-sdk/xml-builder': 3.723.0
+      '@smithy/config-resolver': 4.0.0
+      '@smithy/core': 3.0.0
+      '@smithy/eventstream-serde-browser': 4.0.0
+      '@smithy/eventstream-serde-config-resolver': 4.0.0
+      '@smithy/eventstream-serde-node': 4.0.0
+      '@smithy/fetch-http-handler': 5.0.0
+      '@smithy/hash-blob-browser': 4.0.0
+      '@smithy/hash-node': 4.0.0
+      '@smithy/hash-stream-node': 4.0.0
+      '@smithy/invalid-dependency': 4.0.0
+      '@smithy/md5-js': 4.0.0
+      '@smithy/middleware-content-length': 4.0.0
+      '@smithy/middleware-endpoint': 4.0.0
+      '@smithy/middleware-retry': 4.0.0
+      '@smithy/middleware-serde': 4.0.0
+      '@smithy/middleware-stack': 4.0.0
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/node-http-handler': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/smithy-client': 4.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/url-parser': 4.0.0
+      '@smithy/util-base64': 4.0.0
+      '@smithy/util-body-length-browser': 4.0.0
+      '@smithy/util-body-length-node': 4.0.0
+      '@smithy/util-defaults-mode-browser': 4.0.0
+      '@smithy/util-defaults-mode-node': 4.0.0
+      '@smithy/util-endpoints': 3.0.0
+      '@smithy/util-middleware': 4.0.0
+      '@smithy/util-retry': 4.0.0
+      '@smithy/util-stream': 4.0.0
+      '@smithy/util-utf8': 4.0.0
+      '@smithy/util-waiter': 4.0.1
       tslib: 2.8.1
     transitivePeerDependencies:
       - aws-crt
 
-  '@aws-sdk/client-sso-oidc@3.721.0(@aws-sdk/client-sts@3.721.0)':
+  '@aws-sdk/client-sso-oidc@3.723.0(@aws-sdk/client-sts@3.723.0)':
     dependencies:
       '@aws-crypto/sha256-browser': 5.2.0
       '@aws-crypto/sha256-js': 5.2.0
-      '@aws-sdk/client-sts': 3.721.0
-      '@aws-sdk/core': 3.716.0
-      '@aws-sdk/credential-provider-node': 3.721.0(@aws-sdk/client-sso-oidc@3.7
21.0(@aws-sdk/client-sts@3.7
21.0))(@aws-sdk/client-sts@3.721.0)
                            -      '@aws-sdk/middleware-host-header': 3.714.0
-      '@aws-sdk/middleware-logger': 3.714.0
-      '@aws-sdk/middleware-recursion-detection': 3.714.0
-      '@aws-sdk/middleware-user-agent': 3.721.0
-      '@aws-sdk/region-config-resolver': 3.714.0
-      '@aws-sdk/types': 3.714.0
-      '@aws-sdk/util-endpoints': 3.714.0
-      '@aws-sdk/util-user-agent-browser': 3.714.0
-      '@aws-sdk/util-user-agent-node': 3.721.0
-      '@smithy/config-resolver': 3.0.13
-      '@smithy/core': 2.5.7
-      '@smithy/fetch-http-handler': 4.1.3
-      '@smithy/hash-node': 3.0.11
-      '@smithy/invalid-dependency': 3.0.11
-      '@smithy/middleware-content-length': 3.0.13
-      '@smithy/middleware-endpoint': 3.2.8
-      '@smithy/middleware-retry': 3.0.34
-      '@smithy/middleware-serde': 3.0.11
-      '@smithy/middleware-stack': 3.0.11
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/node-http-handler': 3.3.3
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/smithy-client': 3.7.0
-      '@smithy/types': 3.7.2
-      '@smithy/url-parser': 3.0.11
-      '@smithy/util-base64': 3.0.0
-      '@smithy/util-body-length-browser': 3.0.0
-      '@smithy/util-body-length-node': 3.0.0
-      '@smithy/util-defaults-mode-browser': 3.0.34
-      '@smithy/util-defaults-mode-node': 3.0.34
-      '@smithy/util-endpoints': 2.1.7
-      '@smithy/util-middleware': 3.0.11
-      '@smithy/util-retry': 3.0.11
-      '@smithy/util-utf8': 3.0.0
+      '@aws-sdk/client-sts': 3.723.0
+      '@aws-sdk/core': 3.723.0
+      '@aws-sdk/credential-provider-node': 3.723.0(@aws-sdk/client-sso-oidc@3.7
23.0(@aws-sdk/client-sts@3.7
23.0))(@aws-sdk/client-sts@3.723.0)
                            +      '@aws-sdk/middleware-host-header': 3.723.0
+      '@aws-sdk/middleware-logger': 3.723.0
+      '@aws-sdk/middleware-recursion-detection': 3.723.0
+      '@aws-sdk/middleware-user-agent': 3.723.0
+      '@aws-sdk/region-config-resolver': 3.723.0
+      '@aws-sdk/types': 3.723.0
+      '@aws-sdk/util-endpoints': 3.723.0
+      '@aws-sdk/util-user-agent-browser': 3.723.0
+      '@aws-sdk/util-user-agent-node': 3.723.0
+      '@smithy/config-resolver': 4.0.0
+      '@smithy/core': 3.0.0
+      '@smithy/fetch-http-handler': 5.0.0
+      '@smithy/hash-node': 4.0.0
+      '@smithy/invalid-dependency': 4.0.0
+      '@smithy/middleware-content-length': 4.0.0
+      '@smithy/middleware-endpoint': 4.0.0
+      '@smithy/middleware-retry': 4.0.0
+      '@smithy/middleware-serde': 4.0.0
+      '@smithy/middleware-stack': 4.0.0
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/node-http-handler': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/smithy-client': 4.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/url-parser': 4.0.0
+      '@smithy/util-base64': 4.0.0
+      '@smithy/util-body-length-browser': 4.0.0
+      '@smithy/util-body-length-node': 4.0.0
+      '@smithy/util-defaults-mode-browser': 4.0.0
+      '@smithy/util-defaults-mode-node': 4.0.0
+      '@smithy/util-endpoints': 3.0.0
+      '@smithy/util-middleware': 4.0.0
+      '@smithy/util-retry': 4.0.0
+      '@smithy/util-utf8': 4.0.0
       tslib: 2.8.1
     transitivePeerDependencies:
       - aws-crt
 
-  '@aws-sdk/client-sso@3.721.0':
+  '@aws-sdk/client-sso@3.723.0':
     dependencies:
       '@aws-crypto/sha256-browser': 5.2.0
       '@aws-crypto/sha256-js': 5.2.0
-      '@aws-sdk/core': 3.716.0
-      '@aws-sdk/middleware-host-header': 3.714.0
-      '@aws-sdk/middleware-logger': 3.714.0
-      '@aws-sdk/middleware-recursion-detection': 3.714.0
-      '@aws-sdk/middleware-user-agent': 3.721.0
-      '@aws-sdk/region-config-resolver': 3.714.0
-      '@aws-sdk/types': 3.714.0
-      '@aws-sdk/util-endpoints': 3.714.0
-      '@aws-sdk/util-user-agent-browser': 3.714.0
-      '@aws-sdk/util-user-agent-node': 3.721.0
-      '@smithy/config-resolver': 3.0.13
-      '@smithy/core': 2.5.7
-      '@smithy/fetch-http-handler': 4.1.3
-      '@smithy/hash-node': 3.0.11
-      '@smithy/invalid-dependency': 3.0.11
-      '@smithy/middleware-content-length': 3.0.13
-      '@smithy/middleware-endpoint': 3.2.8
-      '@smithy/middleware-retry': 3.0.34
-      '@smithy/middleware-serde': 3.0.11
-      '@smithy/middleware-stack': 3.0.11
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/node-http-handler': 3.3.3
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/smithy-client': 3.7.0
-      '@smithy/types': 3.7.2
-      '@smithy/url-parser': 3.0.11
-      '@smithy/util-base64': 3.0.0
-      '@smithy/util-body-length-browser': 3.0.0
-      '@smithy/util-body-length-node': 3.0.0
-      '@smithy/util-defaults-mode-browser': 3.0.34
-      '@smithy/util-defaults-mode-node': 3.0.34
-      '@smithy/util-endpoints': 2.1.7
-      '@smithy/util-middleware': 3.0.11
-      '@smithy/util-retry': 3.0.11
-      '@smithy/util-utf8': 3.0.0
+      '@aws-sdk/core': 3.723.0
+      '@aws-sdk/middleware-host-header': 3.723.0
+      '@aws-sdk/middleware-logger': 3.723.0
+      '@aws-sdk/middleware-recursion-detection': 3.723.0
+      '@aws-sdk/middleware-user-agent': 3.723.0
+      '@aws-sdk/region-config-resolver': 3.723.0
+      '@aws-sdk/types': 3.723.0
+      '@aws-sdk/util-endpoints': 3.723.0
+      '@aws-sdk/util-user-agent-browser': 3.723.0
+      '@aws-sdk/util-user-agent-node': 3.723.0
+      '@smithy/config-resolver': 4.0.0
+      '@smithy/core': 3.0.0
+      '@smithy/fetch-http-handler': 5.0.0
+      '@smithy/hash-node': 4.0.0
+      '@smithy/invalid-dependency': 4.0.0
+      '@smithy/middleware-content-length': 4.0.0
+      '@smithy/middleware-endpoint': 4.0.0
+      '@smithy/middleware-retry': 4.0.0
+      '@smithy/middleware-serde': 4.0.0
+      '@smithy/middleware-stack': 4.0.0
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/node-http-handler': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/smithy-client': 4.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/url-parser': 4.0.0
+      '@smithy/util-base64': 4.0.0
+      '@smithy/util-body-length-browser': 4.0.0
+      '@smithy/util-body-length-node': 4.0.0
+      '@smithy/util-defaults-mode-browser': 4.0.0
+      '@smithy/util-defaults-mode-node': 4.0.0
+      '@smithy/util-endpoints': 3.0.0
+      '@smithy/util-middleware': 4.0.0
+      '@smithy/util-retry': 4.0.0
+      '@smithy/util-utf8': 4.0.0
       tslib: 2.8.1
     transitivePeerDependencies:
       - aws-crt
 
-  '@aws-sdk/client-sts@3.721.0':
+  '@aws-sdk/client-sts@3.723.0':
     dependencies:
       '@aws-crypto/sha256-browser': 5.2.0
       '@aws-crypto/sha256-js': 5.2.0
-      '@aws-sdk/client-sso-oidc': 3.721.0(@aws-sdk/client-sts@3.721.0)
-      '@aws-sdk/core': 3.716.0
-      '@aws-sdk/credential-provider-node': 3.721.0(@aws-sdk/client-sso-oidc@3.7
21.0(@aws-sdk/client-sts@3.7
21.0))(@aws-sdk/client-sts@3.721.0)
                            -      '@aws-sdk/middleware-host-header': 3.714.0
-      '@aws-sdk/middleware-logger': 3.714.0
-      '@aws-sdk/middleware-recursion-detection': 3.714.0
-      '@aws-sdk/middleware-user-agent': 3.721.0
-      '@aws-sdk/region-config-resolver': 3.714.0
-      '@aws-sdk/types': 3.714.0
-      '@aws-sdk/util-endpoints': 3.714.0
-      '@aws-sdk/util-user-agent-browser': 3.714.0
-      '@aws-sdk/util-user-agent-node': 3.721.0
-      '@smithy/config-resolver': 3.0.13
-      '@smithy/core': 2.5.7
-      '@smithy/fetch-http-handler': 4.1.3
-      '@smithy/hash-node': 3.0.11
-      '@smithy/invalid-dependency': 3.0.11
-      '@smithy/middleware-content-length': 3.0.13
-      '@smithy/middleware-endpoint': 3.2.8
-      '@smithy/middleware-retry': 3.0.34
-      '@smithy/middleware-serde': 3.0.11
-      '@smithy/middleware-stack': 3.0.11
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/node-http-handler': 3.3.3
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/smithy-client': 3.7.0
-      '@smithy/types': 3.7.2
-      '@smithy/url-parser': 3.0.11
-      '@smithy/util-base64': 3.0.0
-      '@smithy/util-body-length-browser': 3.0.0
-      '@smithy/util-body-length-node': 3.0.0
-      '@smithy/util-defaults-mode-browser': 3.0.34
-      '@smithy/util-defaults-mode-node': 3.0.34
-      '@smithy/util-endpoints': 2.1.7
-      '@smithy/util-middleware': 3.0.11
-      '@smithy/util-retry': 3.0.11
-      '@smithy/util-utf8': 3.0.0
+      '@aws-sdk/client-sso-oidc': 3.723.0(@aws-sdk/client-sts@3.723.0)
+      '@aws-sdk/core': 3.723.0
+      '@aws-sdk/credential-provider-node': 3.723.0(@aws-sdk/client-sso-oidc@3.7
23.0(@aws-sdk/client-sts@3.7
23.0))(@aws-sdk/client-sts@3.723.0)
                            +      '@aws-sdk/middleware-host-header': 3.723.0
+      '@aws-sdk/middleware-logger': 3.723.0
+      '@aws-sdk/middleware-recursion-detection': 3.723.0
+      '@aws-sdk/middleware-user-agent': 3.723.0
+      '@aws-sdk/region-config-resolver': 3.723.0
+      '@aws-sdk/types': 3.723.0
+      '@aws-sdk/util-endpoints': 3.723.0
+      '@aws-sdk/util-user-agent-browser': 3.723.0
+      '@aws-sdk/util-user-agent-node': 3.723.0
+      '@smithy/config-resolver': 4.0.0
+      '@smithy/core': 3.0.0
+      '@smithy/fetch-http-handler': 5.0.0
+      '@smithy/hash-node': 4.0.0
+      '@smithy/invalid-dependency': 4.0.0
+      '@smithy/middleware-content-length': 4.0.0
+      '@smithy/middleware-endpoint': 4.0.0
+      '@smithy/middleware-retry': 4.0.0
+      '@smithy/middleware-serde': 4.0.0
+      '@smithy/middleware-stack': 4.0.0
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/node-http-handler': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/smithy-client': 4.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/url-parser': 4.0.0
+      '@smithy/util-base64': 4.0.0
+      '@smithy/util-body-length-browser': 4.0.0
+      '@smithy/util-body-length-node': 4.0.0
+      '@smithy/util-defaults-mode-browser': 4.0.0
+      '@smithy/util-defaults-mode-node': 4.0.0
+      '@smithy/util-endpoints': 3.0.0
+      '@smithy/util-middleware': 4.0.0
+      '@smithy/util-retry': 4.0.0
+      '@smithy/util-utf8': 4.0.0
       tslib: 2.8.1
     transitivePeerDependencies:
       - aws-crt
 
-  '@aws-sdk/client-transcribe-streaming@3.721.0':
+  '@aws-sdk/client-transcribe-streaming@3.723.0':
     dependencies:
       '@aws-crypto/sha256-browser': 5.2.0
       '@aws-crypto/sha256-js': 5.2.0
-      '@aws-sdk/client-sso-oidc': 3.721.0(@aws-sdk/client-sts@3.721.0)
-      '@aws-sdk/client-sts': 3.721.0
-      '@aws-sdk/core': 3.716.0
-      '@aws-sdk/credential-provider-node': 3.721.0(@aws-sdk/client-sso-oidc@3.7
21.0(@aws-sdk/client-sts@3.7
21.0))(@aws-sdk/client-sts@3.721.0)
                            -      '@aws-sdk/eventstream-handler-node': 3.714.0
-      '@aws-sdk/middleware-eventstream': 3.714.0
-      '@aws-sdk/middleware-host-header': 3.714.0
-      '@aws-sdk/middleware-logger': 3.714.0
-      '@aws-sdk/middleware-recursion-detection': 3.714.0
-      '@aws-sdk/middleware-sdk-transcribe-streaming': 3.714.0
-      '@aws-sdk/middleware-user-agent': 3.721.0
-      '@aws-sdk/middleware-websocket': 3.714.0
-      '@aws-sdk/region-config-resolver': 3.714.0
-      '@aws-sdk/types': 3.714.0
-      '@aws-sdk/util-endpoints': 3.714.0
-      '@aws-sdk/util-user-agent-browser': 3.714.0
-      '@aws-sdk/util-user-agent-node': 3.721.0
-      '@smithy/config-resolver': 3.0.13
-      '@smithy/core': 2.5.7
-      '@smithy/eventstream-serde-browser': 3.0.14
-      '@smithy/eventstream-serde-config-resolver': 3.0.11
-      '@smithy/eventstream-serde-node': 3.0.13
-      '@smithy/fetch-http-handler': 4.1.3
-      '@smithy/hash-node': 3.0.11
-      '@smithy/invalid-dependency': 3.0.11
-      '@smithy/middleware-content-length': 3.0.13
-      '@smithy/middleware-endpoint': 3.2.8
-      '@smithy/middleware-retry': 3.0.34
-      '@smithy/middleware-serde': 3.0.11
-      '@smithy/middleware-stack': 3.0.11
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/node-http-handler': 3.3.3
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/smithy-client': 3.7.0
-      '@smithy/types': 3.7.2
-      '@smithy/url-parser': 3.0.11
-      '@smithy/util-base64': 3.0.0
-      '@smithy/util-body-length-browser': 3.0.0
-      '@smithy/util-body-length-node': 3.0.0
-      '@smithy/util-defaults-mode-browser': 3.0.34
-      '@smithy/util-defaults-mode-node': 3.0.34
-      '@smithy/util-endpoints': 2.1.7
-      '@smithy/util-middleware': 3.0.11
-      '@smithy/util-retry': 3.0.11
-      '@smithy/util-utf8': 3.0.0
+      '@aws-sdk/client-sso-oidc': 3.723.0(@aws-sdk/client-sts@3.723.0)
+      '@aws-sdk/client-sts': 3.723.0
+      '@aws-sdk/core': 3.723.0
+      '@aws-sdk/credential-provider-node': 3.723.0(@aws-sdk/client-sso-oidc@3.7
23.0(@aws-sdk/client-sts@3.7
23.0))(@aws-sdk/client-sts@3.723.0)
                            +      '@aws-sdk/eventstream-handler-node': 3.723.0
+      '@aws-sdk/middleware-eventstream': 3.723.0
+      '@aws-sdk/middleware-host-header': 3.723.0
+      '@aws-sdk/middleware-logger': 3.723.0
+      '@aws-sdk/middleware-recursion-detection': 3.723.0
+      '@aws-sdk/middleware-sdk-transcribe-streaming': 3.723.0
+      '@aws-sdk/middleware-user-agent': 3.723.0
+      '@aws-sdk/middleware-websocket': 3.723.0
+      '@aws-sdk/region-config-resolver': 3.723.0
+      '@aws-sdk/types': 3.723.0
+      '@aws-sdk/util-endpoints': 3.723.0
+      '@aws-sdk/util-user-agent-browser': 3.723.0
+      '@aws-sdk/util-user-agent-node': 3.723.0
+      '@smithy/config-resolver': 4.0.0
+      '@smithy/core': 3.0.0
+      '@smithy/eventstream-serde-browser': 4.0.0
+      '@smithy/eventstream-serde-config-resolver': 4.0.0
+      '@smithy/eventstream-serde-node': 4.0.0
+      '@smithy/fetch-http-handler': 5.0.0
+      '@smithy/hash-node': 4.0.0
+      '@smithy/invalid-dependency': 4.0.0
+      '@smithy/middleware-content-length': 4.0.0
+      '@smithy/middleware-endpoint': 4.0.0
+      '@smithy/middleware-retry': 4.0.0
+      '@smithy/middleware-serde': 4.0.0
+      '@smithy/middleware-stack': 4.0.0
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/node-http-handler': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/smithy-client': 4.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/url-parser': 4.0.0
+      '@smithy/util-base64': 4.0.0
+      '@smithy/util-body-length-browser': 4.0.0
+      '@smithy/util-body-length-node': 4.0.0
+      '@smithy/util-defaults-mode-browser': 4.0.0
+      '@smithy/util-defaults-mode-node': 4.0.0
+      '@smithy/util-endpoints': 3.0.0
+      '@smithy/util-middleware': 4.0.0
+      '@smithy/util-retry': 4.0.0
+      '@smithy/util-utf8': 4.0.0
       tslib: 2.8.1
     transitivePeerDependencies:
       - aws-crt
 
-  '@aws-sdk/core@3.716.0':
-    dependencies:
-      '@aws-sdk/types': 3.714.0
-      '@smithy/core': 2.5.7
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/property-provider': 3.1.11
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/signature-v4': 4.2.4
-      '@smithy/smithy-client': 3.7.0
-      '@smithy/types': 3.7.2
-      '@smithy/util-middleware': 3.0.11
+  '@aws-sdk/core@3.723.0':
+    dependencies:
+      '@aws-sdk/types': 3.723.0
+      '@smithy/core': 3.0.0
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/property-provider': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/signature-v4': 5.0.0
+      '@smithy/smithy-client': 4.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-middleware': 4.0.0
       fast-xml-parser: 4.4.1
       tslib: 2.8.1
 
-  '@aws-sdk/credential-provider-env@3.716.0':
+  '@aws-sdk/credential-provider-env@3.723.0':
     dependencies:
-      '@aws-sdk/core': 3.716.0
-      '@aws-sdk/types': 3.714.0
-      '@smithy/property-provider': 3.1.11
-      '@smithy/types': 3.7.2
+      '@aws-sdk/core': 3.723.0
+      '@aws-sdk/types': 3.723.0
+      '@smithy/property-provider': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/credential-provider-http@3.716.0':
-    dependencies:
-      '@aws-sdk/core': 3.716.0
-      '@aws-sdk/types': 3.714.0
-      '@smithy/fetch-http-handler': 4.1.3
-      '@smithy/node-http-handler': 3.3.3
-      '@smithy/property-provider': 3.1.11
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/smithy-client': 3.7.0
-      '@smithy/types': 3.7.2
-      '@smithy/util-stream': 3.3.4
+  '@aws-sdk/credential-provider-http@3.723.0':
+    dependencies:
+      '@aws-sdk/core': 3.723.0
+      '@aws-sdk/types': 3.723.0
+      '@smithy/fetch-http-handler': 5.0.0
+      '@smithy/node-http-handler': 4.0.0
+      '@smithy/property-provider': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/smithy-client': 4.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-stream': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/credential-provider-ini@3.721.0(@aws-sdk/client-sso-oidc@3.721.0(@a
ws-sdk/client-sts@3.721.0))(
@aws-sdk/client-sts@3.721.0)':
                            -    dependencies:
-      '@aws-sdk/client-sts': 3.721.0
-      '@aws-sdk/core': 3.716.0
-      '@aws-sdk/credential-provider-env': 3.716.0
-      '@aws-sdk/credential-provider-http': 3.716.0
-      '@aws-sdk/credential-provider-process': 3.716.0
-      '@aws-sdk/credential-provider-sso': 3.721.0(@aws-sdk/client-sso-oidc@3.72
1.0(@aws-sdk/client-sts@3.72
1.0))
                            -      '@aws-sdk/credential-provider-web-identity':
3.716.0(@aws-sdk/client-sts@3.721.0)
-      '@aws-sdk/types': 3.714.0
-      '@smithy/credential-provider-imds': 3.2.8
-      '@smithy/property-provider': 3.1.11
-      '@smithy/shared-ini-file-loader': 3.1.12
-      '@smithy/types': 3.7.2
+  '@aws-sdk/credential-provider-ini@3.723.0(@aws-sdk/client-sso-oidc@3.723.0(@a
ws-sdk/client-sts@3.723.0))(
@aws-sdk/client-sts@3.723.0)':
                            +    dependencies:
+      '@aws-sdk/client-sts': 3.723.0
+      '@aws-sdk/core': 3.723.0
+      '@aws-sdk/credential-provider-env': 3.723.0
+      '@aws-sdk/credential-provider-http': 3.723.0
+      '@aws-sdk/credential-provider-process': 3.723.0
+      '@aws-sdk/credential-provider-sso': 3.723.0(@aws-sdk/client-sso-oidc@3.72
3.0(@aws-sdk/client-sts@3.72
3.0))
                            +      '@aws-sdk/credential-provider-web-identity':
3.723.0(@aws-sdk/client-sts@3.723.0)
+      '@aws-sdk/types': 3.723.0
+      '@smithy/credential-provider-imds': 4.0.0
+      '@smithy/property-provider': 4.0.0
+      '@smithy/shared-ini-file-loader': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
     transitivePeerDependencies:
       - '@aws-sdk/client-sso-oidc'
       - aws-crt
 
-  '@aws-sdk/credential-provider-node@3.721.0(@aws-sdk/client-sso-oidc@3.721.0(@
aws-sdk/client-sts@3.721.0))
(@aws-sdk/client-sts@3.721.0)':
                            -    dependencies:
-      '@aws-sdk/credential-provider-env': 3.716.0
-      '@aws-sdk/credential-provider-http': 3.716.0
-      '@aws-sdk/credential-provider-ini': 3.721.0(@aws-sdk/client-sso-oidc@3.72
1.0(@aws-sdk/client-sts@3.72
1.0))(@aws-sdk/client-sts@3.721.0)
                            -      '@aws-sdk/credential-provider-process': 3.716
.0
-      '@aws-sdk/credential-provider-sso': 3.721.0(@aws-sdk/client-sso-oidc@3.72
1.0(@aws-sdk/client-sts@3.72
1.0))
                            -      '@aws-sdk/credential-provider-web-identity':
3.716.0(@aws-sdk/client-sts@3.721.0)
-      '@aws-sdk/types': 3.714.0
-      '@smithy/credential-provider-imds': 3.2.8
-      '@smithy/property-provider': 3.1.11
-      '@smithy/shared-ini-file-loader': 3.1.12
-      '@smithy/types': 3.7.2
+  '@aws-sdk/credential-provider-node@3.723.0(@aws-sdk/client-sso-oidc@3.723.0(@
aws-sdk/client-sts@3.723.0))
(@aws-sdk/client-sts@3.723.0)':
                            +    dependencies:
+      '@aws-sdk/credential-provider-env': 3.723.0
+      '@aws-sdk/credential-provider-http': 3.723.0
+      '@aws-sdk/credential-provider-ini': 3.723.0(@aws-sdk/client-sso-oidc@3.72
3.0(@aws-sdk/client-sts@3.72
3.0))(@aws-sdk/client-sts@3.723.0)
                            +      '@aws-sdk/credential-provider-process': 3.723
.0
+      '@aws-sdk/credential-provider-sso': 3.723.0(@aws-sdk/client-sso-oidc@3.72
3.0(@aws-sdk/client-sts@3.72
3.0))
                            +      '@aws-sdk/credential-provider-web-identity':
3.723.0(@aws-sdk/client-sts@3.723.0)
+      '@aws-sdk/types': 3.723.0
+      '@smithy/credential-provider-imds': 4.0.0
+      '@smithy/property-provider': 4.0.0
+      '@smithy/shared-ini-file-loader': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
     transitivePeerDependencies:
       - '@aws-sdk/client-sso-oidc'
       - '@aws-sdk/client-sts'
       - aws-crt
 
-  '@aws-sdk/credential-provider-process@3.716.0':
+  '@aws-sdk/credential-provider-process@3.723.0':
     dependencies:
-      '@aws-sdk/core': 3.716.0
-      '@aws-sdk/types': 3.714.0
-      '@smithy/property-provider': 3.1.11
-      '@smithy/shared-ini-file-loader': 3.1.12
-      '@smithy/types': 3.7.2
+      '@aws-sdk/core': 3.723.0
+      '@aws-sdk/types': 3.723.0
+      '@smithy/property-provider': 4.0.0
+      '@smithy/shared-ini-file-loader': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/credential-provider-sso@3.721.0(@aws-sdk/client-sso-oidc@3.721.0(@a
ws-sdk/client-sts@3.721.0))'
:
                            +  '@aws-sdk/credential-provider-sso@3.723.0(@aws-sd
k/client-sso-oidc@3.723.0(@aws-sdk/client-sts@3.723.0))'
:
                                 dependencies:
-      '@aws-sdk/client-sso': 3.721.0
-      '@aws-sdk/core': 3.716.0
-      '@aws-sdk/token-providers': 3.721.0(@aws-sdk/client-sso-oidc@3.721.0(@aws
-sdk/client-sts@3.721.0))
-      '@aws-sdk/types': 3.714.0
-      '@smithy/property-provider': 3.1.11
-      '@smithy/shared-ini-file-loader': 3.1.12
-      '@smithy/types': 3.7.2
+      '@aws-sdk/client-sso': 3.723.0
+      '@aws-sdk/core': 3.723.0
+      '@aws-sdk/token-providers': 3.723.0(@aws-sdk/client-sso-oidc@3.723.0(@aws
-sdk/client-sts@3.723.0))
+      '@aws-sdk/types': 3.723.0
+      '@smithy/property-provider': 4.0.0
+      '@smithy/shared-ini-file-loader': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
     transitivePeerDependencies:
       - '@aws-sdk/client-sso-oidc'
       - aws-crt
 
-  '@aws-sdk/credential-provider-web-identity@3.716.0(@aws-sdk/client-sts@3.721.
0)':
+  '@aws-sdk/credential-provider-web-identity@3.723.0(@aws-sdk/client-sts@3.723.
0)':
     dependencies:
-      '@aws-sdk/client-sts': 3.721.0
-      '@aws-sdk/core': 3.716.0
-      '@aws-sdk/types': 3.714.0
-      '@smithy/property-provider': 3.1.11
-      '@smithy/types': 3.7.2
+      '@aws-sdk/client-sts': 3.723.0
+      '@aws-sdk/core': 3.723.0
+      '@aws-sdk/types': 3.723.0
+      '@smithy/property-provider': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/eventstream-handler-node@3.714.0':
+  '@aws-sdk/eventstream-handler-node@3.723.0':
     dependencies:
-      '@aws-sdk/types': 3.714.0
-      '@smithy/eventstream-codec': 3.1.10
-      '@smithy/types': 3.7.2
+      '@aws-sdk/types': 3.723.0
+      '@smithy/eventstream-codec': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/middleware-bucket-endpoint@3.721.0':
+  '@aws-sdk/middleware-bucket-endpoint@3.723.0':
     dependencies:
-      '@aws-sdk/types': 3.714.0
-      '@aws-sdk/util-arn-parser': 3.693.0
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/types': 3.7.2
-      '@smithy/util-config-provider': 3.0.0
+      '@aws-sdk/types': 3.723.0
+      '@aws-sdk/util-arn-parser': 3.723.0
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-config-provider': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/middleware-eventstream@3.714.0':
+  '@aws-sdk/middleware-eventstream@3.723.0':
     dependencies:
-      '@aws-sdk/types': 3.714.0
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/types': 3.7.2
+      '@aws-sdk/types': 3.723.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/middleware-expect-continue@3.714.0':
+  '@aws-sdk/middleware-expect-continue@3.723.0':
     dependencies:
-      '@aws-sdk/types': 3.714.0
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/types': 3.7.2
+      '@aws-sdk/types': 3.723.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/middleware-flexible-checksums@3.717.0':
+  '@aws-sdk/middleware-flexible-checksums@3.723.0':
     dependencies:
       '@aws-crypto/crc32': 5.2.0
       '@aws-crypto/crc32c': 5.2.0
       '@aws-crypto/util': 5.2.0
-      '@aws-sdk/core': 3.716.0
-      '@aws-sdk/types': 3.714.0
-      '@smithy/is-array-buffer': 3.0.0
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/types': 3.7.2
-      '@smithy/util-middleware': 3.0.11
-      '@smithy/util-stream': 3.3.4
-      '@smithy/util-utf8': 3.0.0
+      '@aws-sdk/core': 3.723.0
+      '@aws-sdk/types': 3.723.0
+      '@smithy/is-array-buffer': 4.0.0
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-middleware': 4.0.0
+      '@smithy/util-stream': 4.0.0
+      '@smithy/util-utf8': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/middleware-host-header@3.714.0':
+  '@aws-sdk/middleware-host-header@3.723.0':
     dependencies:
-      '@aws-sdk/types': 3.714.0
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/types': 3.7.2
+      '@aws-sdk/types': 3.723.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/middleware-location-constraint@3.714.0':
+  '@aws-sdk/middleware-location-constraint@3.723.0':
     dependencies:
-      '@aws-sdk/types': 3.714.0
-      '@smithy/types': 3.7.2
+      '@aws-sdk/types': 3.723.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/middleware-logger@3.714.0':
+  '@aws-sdk/middleware-logger@3.723.0':
     dependencies:
-      '@aws-sdk/types': 3.714.0
-      '@smithy/types': 3.7.2
+      '@aws-sdk/types': 3.723.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/middleware-recursion-detection@3.714.0':
+  '@aws-sdk/middleware-recursion-detection@3.723.0':
     dependencies:
-      '@aws-sdk/types': 3.714.0
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/types': 3.7.2
+      '@aws-sdk/types': 3.723.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/middleware-sdk-s3@3.716.0':
-    dependencies:
-      '@aws-sdk/core': 3.716.0
-      '@aws-sdk/types': 3.714.0
-      '@aws-sdk/util-arn-parser': 3.693.0
-      '@smithy/core': 2.5.7
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/signature-v4': 4.2.4
-      '@smithy/smithy-client': 3.7.0
-      '@smithy/types': 3.7.2
-      '@smithy/util-config-provider': 3.0.0
-      '@smithy/util-middleware': 3.0.11
-      '@smithy/util-stream': 3.3.4
-      '@smithy/util-utf8': 3.0.0
+  '@aws-sdk/middleware-sdk-s3@3.723.0':
+    dependencies:
+      '@aws-sdk/core': 3.723.0
+      '@aws-sdk/types': 3.723.0
+      '@aws-sdk/util-arn-parser': 3.723.0
+      '@smithy/core': 3.0.0
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/signature-v4': 5.0.0
+      '@smithy/smithy-client': 4.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-config-provider': 4.0.0
+      '@smithy/util-middleware': 4.0.0
+      '@smithy/util-stream': 4.0.0
+      '@smithy/util-utf8': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/middleware-sdk-transcribe-streaming@3.714.0':
+  '@aws-sdk/middleware-sdk-transcribe-streaming@3.723.0':
     dependencies:
-      '@aws-sdk/types': 3.714.0
-      '@aws-sdk/util-format-url': 3.714.0
-      '@smithy/eventstream-serde-browser': 3.0.14
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/signature-v4': 4.2.4
-      '@smithy/types': 3.7.2
+      '@aws-sdk/types': 3.723.0
+      '@aws-sdk/util-format-url': 3.723.0
+      '@smithy/eventstream-serde-browser': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/signature-v4': 5.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
       uuid: 9.0.1
 
-  '@aws-sdk/middleware-ssec@3.714.0':
+  '@aws-sdk/middleware-ssec@3.723.0':
     dependencies:
-      '@aws-sdk/types': 3.714.0
-      '@smithy/types': 3.7.2
+      '@aws-sdk/types': 3.723.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/middleware-user-agent@3.721.0':
+  '@aws-sdk/middleware-user-agent@3.723.0':
     dependencies:
-      '@aws-sdk/core': 3.716.0
-      '@aws-sdk/types': 3.714.0
-      '@aws-sdk/util-endpoints': 3.714.0
-      '@smithy/core': 2.5.7
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/types': 3.7.2
+      '@aws-sdk/core': 3.723.0
+      '@aws-sdk/types': 3.723.0
+      '@aws-sdk/util-endpoints': 3.723.0
+      '@smithy/core': 3.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/middleware-websocket@3.714.0':
-    dependencies:
-      '@aws-sdk/types': 3.714.0
-      '@aws-sdk/util-format-url': 3.714.0
-      '@smithy/eventstream-codec': 3.1.10
-      '@smithy/eventstream-serde-browser': 3.0.14
-      '@smithy/fetch-http-handler': 4.1.3
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/signature-v4': 4.2.4
-      '@smithy/types': 3.7.2
-      '@smithy/util-hex-encoding': 3.0.0
+  '@aws-sdk/middleware-websocket@3.723.0':
+    dependencies:
+      '@aws-sdk/types': 3.723.0
+      '@aws-sdk/util-format-url': 3.723.0
+      '@smithy/eventstream-codec': 4.0.0
+      '@smithy/eventstream-serde-browser': 4.0.0
+      '@smithy/fetch-http-handler': 5.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/signature-v4': 5.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-hex-encoding': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/region-config-resolver@3.714.0':
+  '@aws-sdk/region-config-resolver@3.723.0':
     dependencies:
-      '@aws-sdk/types': 3.714.0
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/types': 3.7.2
-      '@smithy/util-config-provider': 3.0.0
-      '@smithy/util-middleware': 3.0.11
+      '@aws-sdk/types': 3.723.0
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-config-provider': 4.0.0
+      '@smithy/util-middleware': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/s3-request-presigner@3.721.0':
+  '@aws-sdk/s3-request-presigner@3.723.0':
     dependencies:
-      '@aws-sdk/signature-v4-multi-region': 3.716.0
-      '@aws-sdk/types': 3.714.0
-      '@aws-sdk/util-format-url': 3.714.0
-      '@smithy/middleware-endpoint': 3.2.8
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/smithy-client': 3.7.0
-      '@smithy/types': 3.7.2
+      '@aws-sdk/signature-v4-multi-region': 3.723.0
+      '@aws-sdk/types': 3.723.0
+      '@aws-sdk/util-format-url': 3.723.0
+      '@smithy/middleware-endpoint': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/smithy-client': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/signature-v4-multi-region@3.716.0':
+  '@aws-sdk/signature-v4-multi-region@3.723.0':
     dependencies:
-      '@aws-sdk/middleware-sdk-s3': 3.716.0
-      '@aws-sdk/types': 3.714.0
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/signature-v4': 4.2.4
-      '@smithy/types': 3.7.2
+      '@aws-sdk/middleware-sdk-s3': 3.723.0
+      '@aws-sdk/types': 3.723.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/signature-v4': 5.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/token-providers@3.721.0(@aws-sdk/client-sso-oidc@3.721.0(@aws-sdk/c
lient-sts@3.721.0))':
+  '@aws-sdk/token-providers@3.723.0(@aws-sdk/client-sso-oidc@3.723.0(@aws-sdk/c
lient-sts@3.723.0))':
     dependencies:
-      '@aws-sdk/client-sso-oidc': 3.721.0(@aws-sdk/client-sts@3.721.0)
-      '@aws-sdk/types': 3.714.0
-      '@smithy/property-provider': 3.1.11
-      '@smithy/shared-ini-file-loader': 3.1.12
-      '@smithy/types': 3.7.2
+      '@aws-sdk/client-sso-oidc': 3.723.0(@aws-sdk/client-sts@3.723.0)
+      '@aws-sdk/types': 3.723.0
+      '@smithy/property-provider': 4.0.0
+      '@smithy/shared-ini-file-loader': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/types@3.714.0':
+  '@aws-sdk/types@3.723.0':
     dependencies:
-      '@smithy/types': 3.7.2
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/util-arn-parser@3.693.0':
+  '@aws-sdk/util-arn-parser@3.723.0':
     dependencies:
       tslib: 2.8.1
 
-  '@aws-sdk/util-endpoints@3.714.0':
+  '@aws-sdk/util-endpoints@3.723.0':
     dependencies:
-      '@aws-sdk/types': 3.714.0
-      '@smithy/types': 3.7.2
-      '@smithy/util-endpoints': 2.1.7
+      '@aws-sdk/types': 3.723.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-endpoints': 3.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/util-format-url@3.714.0':
+  '@aws-sdk/util-format-url@3.723.0':
     dependencies:
-      '@aws-sdk/types': 3.714.0
-      '@smithy/querystring-builder': 3.0.11
-      '@smithy/types': 3.7.2
+      '@aws-sdk/types': 3.723.0
+      '@smithy/querystring-builder': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/util-locate-window@3.693.0':
+  '@aws-sdk/util-locate-window@3.723.0':
     dependencies:
       tslib: 2.8.1
 
-  '@aws-sdk/util-user-agent-browser@3.714.0':
+  '@aws-sdk/util-user-agent-browser@3.723.0':
     dependencies:
-      '@aws-sdk/types': 3.714.0
-      '@smithy/types': 3.7.2
+      '@aws-sdk/types': 3.723.0
+      '@smithy/types': 4.0.0
       bowser: 2.11.0
       tslib: 2.8.1
 
-  '@aws-sdk/util-user-agent-node@3.721.0':
+  '@aws-sdk/util-user-agent-node@3.723.0':
     dependencies:
-      '@aws-sdk/middleware-user-agent': 3.721.0
-      '@aws-sdk/types': 3.714.0
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/types': 3.7.2
+      '@aws-sdk/middleware-user-agent': 3.723.0
+      '@aws-sdk/types': 3.723.0
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@aws-sdk/xml-builder@3.709.0':
+  '@aws-sdk/xml-builder@3.723.0':
     dependencies:
-      '@smithy/types': 3.7.2
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
   '@babel/code-frame@7.26.2':
@@ -20735,7 +20592,7 @@ snapshots:
     dependencies:
       '@babel/compat-data': 7.26.3
       '@babel/helper-validator-option': 7.25.9
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       lru-cache: 5.1.1
       semver: 6.3.1
 
@@ -21443,7 +21300,7 @@ snapshots:
       babel-plugin-polyfill-corejs2: 0.4.12(@babel/core@7.26.0)
       babel-plugin-polyfill-corejs3: 0.10.6(@babel/core@7.26.0)
       babel-plugin-polyfill-regenerator: 0.6.3(@babel/core@7.26.0)
-      core-js-compat: 3.39.0
+      core-js-compat: 3.40.0
       semver: 6.3.1
     transitivePeerDependencies:
       - supports-color
@@ -21480,7 +21337,7 @@ snapshots:
 
   '@babel/runtime-corejs3@7.26.0':
     dependencies:
-      core-js-pure: 3.39.0
+      core-js-pure: 3.40.0
       regenerator-runtime: 0.14.1
 
   '@babel/runtime@7.26.0':
@@ -21524,7 +21381,7 @@ snapshots:
 
   '@braintree/sanitize-url@7.1.1': {}
 
-  '@cfworker/json-schema@4.0.3': {}
+  '@cfworker/json-schema@4.1.0': {}
 
   '@chevrotain/cst-dts-gen@11.0.3':
     dependencies:
@@ -21554,7 +21411,7 @@ snapshots:
       '@cliqz/adblocker': 1.34.0
       '@cliqz/adblocker-content': 1.34.0
       playwright: 1.48.2
-      tldts-experimental: 6.1.70
+      tldts-experimental: 6.1.71
 
   '@cliqz/adblocker@1.34.0':
     dependencies:
@@ -21565,7 +21422,7 @@ snapshots:
       '@remusao/smaz': 1.10.0
       '@types/chrome': 0.0.278
       '@types/firefox-webext-browser': 120.0.4
-      tldts-experimental: 6.1.70
+      tldts-experimental: 6.1.71
 
   '@coinbase-samples/advanced-sdk-ts@file:packages/plugin-coinbase/advanced-sdk
-ts(encoding@0.1.13)':
     dependencies:
@@ -21578,7 +21435,7 @@ snapshots:
     dependencies:
       '@scure/bip32': 1.6.1
       abitype: 1.0.8(typescript@5.6.3)(zod@3.23.8)
-      axios: 1.7.9
+      axios: 1.7.9(debug@4.4.0)
       axios-mock-adapter: 1.22.0(axios@1.7.9)
       axios-retry: 4.5.0(axios@1.7.9)
       bip32: 4.0.0
@@ -21599,11 +21456,11 @@ snapshots:
   '@colors/colors@1.5.0':
     optional: true
 
-  '@commitlint/cli@18.6.1(@types/node@22.10.4)(typescript@5.6.3)':
+  '@commitlint/cli@18.6.1(@types/node@22.10.5)(typescript@5.6.3)':
     dependencies:
       '@commitlint/format': 18.6.1
       '@commitlint/lint': 18.6.1
-      '@commitlint/load': 18.6.1(@types/node@22.10.4)(typescript@5.6.3)
+      '@commitlint/load': 18.6.1(@types/node@22.10.5)(typescript@5.6.3)
       '@commitlint/read': 18.6.1
       '@commitlint/types': 18.6.1
       execa: 5.1.1
@@ -21653,7 +21510,7 @@ snapshots:
       '@commitlint/rules': 18.6.1
       '@commitlint/types': 18.6.1
 
-  '@commitlint/load@18.6.1(@types/node@22.10.4)(typescript@5.6.3)':
+  '@commitlint/load@18.6.1(@types/node@22.10.5)(typescript@5.6.3)':
     dependencies:
       '@commitlint/config-validator': 18.6.1
       '@commitlint/execute-rule': 18.6.1
@@ -21661,7 +21518,7 @@ snapshots:
       '@commitlint/types': 18.6.1
       chalk: 4.1.2
       cosmiconfig: 8.3.6(typescript@5.6.3)
-      cosmiconfig-typescript-loader: 5.1.0(@types/node@22.10.4)(cosmiconfig@8.3
.6(typescript@5.6.3))(typesc
ript@5.6.3)
                            +      cosmiconfig-typescript-loader: 5.1.0(@types/n
ode@22.10.5)(cosmiconfig@8.3.6(typescript@5.6.3))(typesc
ript@5.6.3)
                                   lodash.isplainobject: 4.0.6
       lodash.merge: 4.6.2
       lodash.uniq: 4.5.0
@@ -22032,7 +21889,7 @@ snapshots:
   '@deepgram/sdk@3.9.0(bufferutil@4.0.9)(encoding@0.1.13)(utf-8-validate@5.0.10
)':
     dependencies:
       '@deepgram/captions': 1.2.0
-      '@types/node': 18.19.69
+      '@types/node': 18.19.70
       cross-fetch: 3.2.0(encoding@0.1.13)
       deepmerge: 4.3.1
       events: 3.3.0
@@ -22170,12 +22027,12 @@ snapshots:
 
   '@docsearch/css@3.8.2': {}
 
-  '@docsearch/react@3.8.2(@algolia/client-search@5.18.0)(@types/react@18.3.12)(
react-dom@18.3.1(react@18.3.
1))(react@18.3.1)(search-insights@2.17.3)':
                            +  '@docsearch/react@3.8.2(@algolia/client-search@5.
19.0)(@types/react@18.3.12)(react-dom@18.3.1(react@18.3.
1))(react@18.3.1)(search-insights@2.17.3)':
                                 dependencies:
-      '@algolia/autocomplete-core': 1.17.7(@algolia/client-search@5.18.0)(algol
iasearch@5.18.0)(search-insi
ghts@2.17.3)
                            -      '@algolia/autocomplete-preset-algolia': 1.17.
7(@algolia/client-search@5.18.0)(algoliasearch@5.18.0)
+      '@algolia/autocomplete-core': 1.17.7(@algolia/client-search@5.19.0)(algol
iasearch@5.19.0)(search-insi
ghts@2.17.3)
                            +      '@algolia/autocomplete-preset-algolia': 1.17.
7(@algolia/client-search@5.19.0)(algoliasearch@5.19.0)
       '@docsearch/css': 3.8.2
-      algoliasearch: 5.18.0
+      algoliasearch: 5.19.0
     optionalDependencies:
       '@types/react': 18.3.12
       react: 18.3.1
@@ -22273,7 +22130,7 @@ snapshots:
       cli-table3: 0.6.5
       combine-promises: 1.2.0
       commander: 5.1.0
-      core-js: 3.39.0
+      core-js: 3.40.0
       del: 6.1.1
       detect-port: 1.6.1
       escape-html: 1.0.3
@@ -22712,7 +22569,7 @@ snapshots:
       - vue-template-compiler
       - webpack-cli
 
-  '@docusaurus/preset-classic@3.6.3(@algolia/client-search@5.18.0)(@mdx-js/reac
t@3.0.1(@types/react@18.3.12
)(react@18.3.1))(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/react@18.3.12)(ac
orn@8.14.0)(bufferutil@4.0.9)(eslint@9.16.0(jiti@2.4.2))(react-dom@18.3.1(react@
18.3.1))(react@18.3.1)(search-insights@2.17.3)(typescript@5.6.3)(utf-8-validate@
5.0.10)':
    +  '@docusaurus/preset-classic@3.6.3(@algolia/client-search@5.19.0)(@mdx-js/
react@3.0.1(@types/react@18.3.12
)(react@18.3.1))(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/react@18.3.12)(ac
orn@8.14.0)(bufferutil@4.0.9)(eslint@9.16.0(jiti@2.4.2))(react-dom@18.3.1(react@
18.3.1))(react@18.3.1)(search-insights@2.17.3)(typescript@5.6.3)(utf-8-validate@
5.0.10)':
         dependencies:
       '@docusaurus/core': 3.6.3(@mdx-js/react@3.0.1(@types/react@18.3.12)(react
@18.3.1))(@swc/core@1.10.4(@
swc/helpers@0.5.15))(acorn@8.14.0)(bufferutil@4.0.9)(eslint@9.16.0(jiti@2.4.2))(
react-dom@18.3.1(react@18.3.1))(react@18.3.1)(typescript@5.6.3)(utf-8-validate@5
.0.10)                                                         '@docusaurus/plug
in-content-blog': 3.6.3(@docusaurus/plugin-content-docs@3.6.3(@mdx-js/react@3.0.
1(@t
ypes/react@18.3.12)(react@18.3.1))(@swc/core@1.10.4(@swc/helpers@0.5.15))(acorn@
8.14.0)(bufferutil@4.0.9)(eslint@9.16.0(jiti@2.4.2))(react-dom@18.3.1(react@18.3
.1))(react@18.3.1)(typescript@5.6.3)(utf-8-validate@5.0.10))(@mdx-js/react@3.0.1
(@types/react@18.3.12)(react@18.3.1))(@swc/core@1.10.4(@swc/helpers@0.5.15))(aco
rn@8.14.0)(bufferutil@4.0.9)(eslint@9.16.0(jiti@2.4.2))(react-dom@18.3.1(react@1
8.3.1))(react@18.3.1)(typescript@5.6.3)(utf-8-validate@5.0.10)
                                                            @@ -22725,7 +22582,7
 @@ snapshots:
       '@docusaurus/plugin-sitemap': 3.6.3(@mdx-js/react@3.0.1(@types/react@18.3
.12)(react@18.3.1))(@swc/cor
e@1.10.4(@swc/helpers@0.5.15))(acorn@8.14.0)(bufferutil@4.0.9)(eslint@9.16.0(jit
i@2.4.2))(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(typescript@5.6.3)(utf-8-
validate@5.0.10)                                               '@docusaurus/them
e-classic': 3.6.3(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/react@18.3.12)(a
corn
@8.14.0)(bufferutil@4.0.9)(eslint@9.16.0(jiti@2.4.2))(react-dom@18.3.1(react@18.
3.1))(react@18.3.1)(typescript@5.6.3)(utf-8-validate@5.0.10)
                                                               '@docusaurus/them
e-common': 3.6.3(@docusaurus/plugin-content-docs@3.6.3(@mdx-js/react@3.0.1(@type
s/re
act@18.3.12)(react@18.3.1))(@swc/core@1.10.4(@swc/helpers@0.5.15))(acorn@8.14.0)
(bufferutil@4.0.9)(eslint@9.16.0(jiti@2.4.2))(react-dom@18.3.1(react@18.3.1))(re
act@18.3.1)(typescript@5.6.3)(utf-8-validate@5.0.10))(@swc/core@1.10.4(@swc/help
ers@0.5.15))(acorn@8.14.0)(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(typescr
ipt@5.6.3)
                                -      '@docusaurus/theme-search-algolia': 3.6.3
(@algolia/client-search@5.18.0)(@mdx-js/react@3.0.1(@types/r
eact@18.3.12)(react@18.3.1))(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/react
@18.3.12)(acorn@8.14.0)(bufferutil@4.0.9)(eslint@9.16.0(jiti@2.4.2))(react-dom@1
8.3.1(react@18.3.1))(react@18.3.1)(search-insights@2.17.3)(typescript@5.6.3)(utf
-8-validate@5.0.10)
    +      '@docusaurus/theme-search-algolia': 3.6.3(@algolia/client-search@5.19
.0)(@mdx-js/react@3.0.1(@types/r
eact@18.3.12)(react@18.3.1))(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/react
@18.3.12)(acorn@8.14.0)(bufferutil@4.0.9)(eslint@9.16.0(jiti@2.4.2))(react-dom@1
8.3.1(react@18.3.1))(react@18.3.1)(search-insights@2.17.3)(typescript@5.6.3)(utf
-8-validate@5.0.10)
           '@docusaurus/types': 3.6.3(@swc/core@1.10.4(@swc/helpers@0.5.15))(aco
rn@8.14.0)(react-dom@18.3.1(reac
t@18.3.1))(react@18.3.1)
                                   react: 18.3.1
       react-dom: 18.3.1(react@18.3.1)
@@ -22874,9 +22731,9 @@ snapshots:
       - vue-template-compiler
       - webpack-cli
 
-  '@docusaurus/theme-search-algolia@3.6.3(@algolia/client-search@5.18.0)(@mdx-j
s/react@3.0.1(@types/react@1
8.3.12)(react@18.3.1))(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/react@18.3.
12)(acorn@8.14.0)(bufferutil@4.0.9)(eslint@9.16.0(jiti@2.4.2))(react-dom@18.3.1(
react@18.3.1))(react@18.3.1)(search-insights@2.17.3)(typescript@5.6.3)(utf-8-val
idate@5.0.10)':
    +  '@docusaurus/theme-search-algolia@3.6.3(@algolia/client-search@5.19.0)(@m
dx-js/react@3.0.1(@types/react@1
8.3.12)(react@18.3.1))(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/react@18.3.
12)(acorn@8.14.0)(bufferutil@4.0.9)(eslint@9.16.0(jiti@2.4.2))(react-dom@18.3.1(
react@18.3.1))(react@18.3.1)(search-insights@2.17.3)(typescript@5.6.3)(utf-8-val
idate@5.0.10)':
         dependencies:
-      '@docsearch/react': 3.8.2(@algolia/client-search@5.18.0)(@types/react@18.
3.12)(react-dom@18.3.1(react
@18.3.1))(react@18.3.1)(search-insights@2.17.3)
                            +      '@docsearch/react': 3.8.2(@algolia/client-sea
rch@5.19.0)(@types/react@18.3.12)(react-dom@18.3.1(react
@18.3.1))(react@18.3.1)(search-insights@2.17.3)
                                   '@docusaurus/core': 3.6.3(@mdx-js/react@3.0.1
(@types/react@18.3.12)(react@18.3.1))(@swc/core@1.10.4(@
swc/helpers@0.5.15))(acorn@8.14.0)(bufferutil@4.0.9)(eslint@9.16.0(jiti@2.4.2))(
react-dom@18.3.1(react@18.3.1))(react@18.3.1)(typescript@5.6.3)(utf-8-validate@5
.0.10)                                                         '@docusaurus/logg
er': 3.6.3
       '@docusaurus/plugin-content-docs': 3.6.3(@mdx-js/react@3.0.1(@types/react
@18.3.12)(react@18.3.1))(@sw
c/core@1.10.4(@swc/helpers@0.5.15))(acorn@8.14.0)(bufferutil@4.0.9)(eslint@9.16.
0(jiti@2.4.2))(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(typescript@5.6.3)(u
tf-8-validate@5.0.10)                                   @@ -23044,9 +22901,9 @@
snapshots:
       '@huggingface/jinja': 0.2.2
       onnxruntime-node: 1.20.1
 
-  '@elizaos/adapter-postgres@0.1.7(@google-cloud/vertexai@1.9.2(encoding@0.1.13
))(@langchain/core@0.3.27(op
enai@4.73.0(encoding@0.1.13)(zod@3.23.8)))(axios@1.7.9)(encoding@0.1.13)(react@1
8.3.1)(sswr@2.1.0(svelte@5.16.1))(svelte@5.16.1)(vue@3.5.13(typescript@5.6.3))':
                                                        +  '@elizaos/adapter-pos
tgres@0.1.7(@google-cloud/vertexai@1.9.2(encoding@0.1.13))(@langchain/core@0.3.2
7(op
enai@4.73.0(encoding@0.1.13)(zod@3.23.8)))(axios@1.7.9)(encoding@0.1.13)(react@1
8.3.1)(sswr@2.1.0(svelte@5.17.1))(svelte@5.17.1)':
                                                             dependencies:
-      '@elizaos/core': 0.1.7(@google-cloud/vertexai@1.9.2(encoding@0.1.13))(@la
ngchain/core@0.3.27(openai@4
.73.0(encoding@0.1.13)(zod@3.23.8)))(axios@1.7.9)(encoding@0.1.13)(react@18.3.1)
(sswr@2.1.0(svelte@5.16.1))(svelte@5.16.1)(vue@3.5.13(typescript@5.6.3))
                                                        +      '@elizaos/core':
0.1.7(@google-cloud/vertexai@1.9.2(encoding@0.1.13))(@langchain/core@0.3.27(open
ai@4
.73.0(encoding@0.1.13)(zod@3.23.8)))(axios@1.7.9)(encoding@0.1.13)(react@18.3.1)
(sswr@2.1.0(svelte@5.17.1))(svelte@5.17.1)
                                                               '@types/pg': 8.11
.10
       pg: 8.13.1
     transitivePeerDependencies:
@@ -23073,9 +22930,9 @@ snapshots:
       - typeorm
       - vue
 
-  '@elizaos/adapter-supabase@0.1.7(@google-cloud/vertexai@1.9.2(encoding@0.1.13
))(@langchain/core@0.3.27(op
enai@4.73.0(encoding@0.1.13)(zod@3.23.8)))(axios@1.7.9)(bufferutil@4.0.9)(encodi
ng@0.1.13)(react@18.3.1)(sswr@2.1.0(svelte@5.16.1))(svelte@5.16.1)(utf-8-validat
e@5.0.10)(vue@3.5.13(typescript@5.6.3))(whatwg-url@14.1.0)':

    +  '@elizaos/adapter-supabase@0.1.7(@google-cloud/vertexai@1.9.2(encoding@0.
1.13))(@langchain/core@0.3.27(op
enai@4.73.0(encoding@0.1.13)(zod@3.23.8)))(axios@1.7.9)(bufferutil@4.0.9)(encodi
ng@0.1.13)(react@18.3.1)(sswr@2.1.0(svelte@5.17.1))(svelte@5.17.1)(utf-8-validat
e@5.0.10)(whatwg-url@14.1.0)':                               dependencies:
-      '@elizaos/core': 0.1.7(@google-cloud/vertexai@1.9.2(encoding@0.1.13))(@la
ngchain/core@0.3.27(openai@4
.73.0(encoding@0.1.13)(zod@3.23.8)))(axios@1.7.9)(encoding@0.1.13)(react@18.3.1)
(sswr@2.1.0(svelte@5.16.1))(svelte@5.16.1)(vue@3.5.13(typescript@5.6.3))
                                                        +      '@elizaos/core':
0.1.7(@google-cloud/vertexai@1.9.2(encoding@0.1.13))(@langchain/core@0.3.27(open
ai@4
.73.0(encoding@0.1.13)(zod@3.23.8)))(axios@1.7.9)(encoding@0.1.13)(react@18.3.1)
(sswr@2.1.0(svelte@5.17.1))(svelte@5.17.1)
                                                               '@supabase/supaba
se-js': 2.46.2(bufferutil@4.0.9)(utf-8-validate@5.0.10)
       whatwg-url: 14.1.0
     transitivePeerDependencies:
@@ -23103,7 +22960,7 @@ snapshots:
       - utf-8-validate
       - vue
 
-  '@elizaos/core@0.1.7(@google-cloud/vertexai@1.9.2(encoding@0.1.13))(@langchai
n/core@0.3.27(openai@4.73.0(
encoding@0.1.13)(zod@3.23.8)))(axios@1.7.9)(encoding@0.1.13)(react@18.3.1)(sswr@
2.1.0(svelte@5.16.1))(svelte@5.16.1)(vue@3.5.13(typescript@5.6.3))':
                                                        +  '@elizaos/core@0.1.7(
@google-cloud/vertexai@1.9.2(encoding@0.1.13))(@langchain/core@0.3.27(openai@4.7
3.0(
encoding@0.1.13)(zod@3.23.8)))(axios@1.7.9)(encoding@0.1.13)(react@18.3.1)(sswr@
2.1.0(svelte@5.17.1))(svelte@5.17.1)':
                                                             dependencies:
       '@ai-sdk/anthropic': 0.0.56(zod@3.23.8)
       '@ai-sdk/google': 0.0.55(zod@3.23.8)
@@ -23113,7 +22970,7 @@ snapshots:
       '@anthropic-ai/sdk': 0.30.1(encoding@0.1.13)
       '@fal-ai/client': 1.2.0
       '@types/uuid': 10.0.0
-      ai: 3.4.33(openai@4.73.0(encoding@0.1.13)(zod@3.23.8))(react@18.3.1)(sswr
@2.1.0(svelte@5.16.1))(svelt
e@5.16.1)(vue@3.5.13(typescript@5.6.3))(zod@3.23.8)
                            +      ai: 3.4.33(openai@4.73.0(encoding@0.1.13)(zod
@3.23.8))(react@18.3.1)(sswr@2.1.0(svelte@5.17.1))(svelt
e@5.17.1)(vue@3.5.13(typescript@5.6.3))(zod@3.23.8)
                                   anthropic-vertex-ai: 1.0.2(encoding@0.1.13)(z
od@3.23.8)
       fastembed: 1.14.1
       fastestsmallesttextencoderdecoder: 1.0.22
@@ -23178,9 +23035,6 @@ snapshots:
   '@esbuild/aix-ppc64@0.21.5':
     optional: true
 
-  '@esbuild/aix-ppc64@0.23.1':
-    optional: true
-
   '@esbuild/aix-ppc64@0.24.2':
     optional: true
 
@@ -23190,9 +23044,6 @@ snapshots:
   '@esbuild/android-arm64@0.21.5':
     optional: true
 
-  '@esbuild/android-arm64@0.23.1':
-    optional: true
-
   '@esbuild/android-arm64@0.24.2':
     optional: true
 
@@ -23202,9 +23053,6 @@ snapshots:
   '@esbuild/android-arm@0.21.5':
     optional: true
 
-  '@esbuild/android-arm@0.23.1':
-    optional: true
-
   '@esbuild/android-arm@0.24.2':
     optional: true
 
@@ -23214,9 +23062,6 @@ snapshots:
   '@esbuild/android-x64@0.21.5':
     optional: true
 
-  '@esbuild/android-x64@0.23.1':
-    optional: true
-
   '@esbuild/android-x64@0.24.2':
     optional: true
 
@@ -23226,9 +23071,6 @@ snapshots:
   '@esbuild/darwin-arm64@0.21.5':
     optional: true
 
-  '@esbuild/darwin-arm64@0.23.1':
-    optional: true
-
   '@esbuild/darwin-arm64@0.24.2':
     optional: true
 
@@ -23238,9 +23080,6 @@ snapshots:
   '@esbuild/darwin-x64@0.21.5':
     optional: true
 
-  '@esbuild/darwin-x64@0.23.1':
-    optional: true
-
   '@esbuild/darwin-x64@0.24.2':
     optional: true
 
@@ -23250,9 +23089,6 @@ snapshots:
   '@esbuild/freebsd-arm64@0.21.5':
     optional: true
 
-  '@esbuild/freebsd-arm64@0.23.1':
-    optional: true
-
   '@esbuild/freebsd-arm64@0.24.2':
     optional: true
 
@@ -23262,9 +23098,6 @@ snapshots:
   '@esbuild/freebsd-x64@0.21.5':
     optional: true
 
-  '@esbuild/freebsd-x64@0.23.1':
-    optional: true
-
   '@esbuild/freebsd-x64@0.24.2':
     optional: true
 
@@ -23274,9 +23107,6 @@ snapshots:
   '@esbuild/linux-arm64@0.21.5':
     optional: true
 
-  '@esbuild/linux-arm64@0.23.1':
-    optional: true
-
   '@esbuild/linux-arm64@0.24.2':
     optional: true
 
@@ -23286,9 +23116,6 @@ snapshots:
   '@esbuild/linux-arm@0.21.5':
     optional: true
 
-  '@esbuild/linux-arm@0.23.1':
-    optional: true
-
   '@esbuild/linux-arm@0.24.2':
     optional: true
 
@@ -23298,9 +23125,6 @@ snapshots:
   '@esbuild/linux-ia32@0.21.5':
     optional: true
 
-  '@esbuild/linux-ia32@0.23.1':
-    optional: true
-
   '@esbuild/linux-ia32@0.24.2':
     optional: true
 
@@ -23310,9 +23134,6 @@ snapshots:
   '@esbuild/linux-loong64@0.21.5':
     optional: true
 
-  '@esbuild/linux-loong64@0.23.1':
-    optional: true
-
   '@esbuild/linux-loong64@0.24.2':
     optional: true
 
@@ -23322,9 +23143,6 @@ snapshots:
   '@esbuild/linux-mips64el@0.21.5':
     optional: true
 
-  '@esbuild/linux-mips64el@0.23.1':
-    optional: true
-
   '@esbuild/linux-mips64el@0.24.2':
     optional: true
 
@@ -23334,9 +23152,6 @@ snapshots:
   '@esbuild/linux-ppc64@0.21.5':
     optional: true
 
-  '@esbuild/linux-ppc64@0.23.1':
-    optional: true
-
   '@esbuild/linux-ppc64@0.24.2':
     optional: true
 
@@ -23346,9 +23161,6 @@ snapshots:
   '@esbuild/linux-riscv64@0.21.5':
     optional: true
 
-  '@esbuild/linux-riscv64@0.23.1':
-    optional: true
-
   '@esbuild/linux-riscv64@0.24.2':
     optional: true
 
@@ -23358,9 +23170,6 @@ snapshots:
   '@esbuild/linux-s390x@0.21.5':
     optional: true
 
-  '@esbuild/linux-s390x@0.23.1':
-    optional: true
-
   '@esbuild/linux-s390x@0.24.2':
     optional: true
 
@@ -23370,9 +23179,6 @@ snapshots:
   '@esbuild/linux-x64@0.21.5':
     optional: true
 
-  '@esbuild/linux-x64@0.23.1':
-    optional: true
-
   '@esbuild/linux-x64@0.24.2':
     optional: true
 
@@ -23385,15 +23191,9 @@ snapshots:
   '@esbuild/netbsd-x64@0.21.5':
     optional: true
 
-  '@esbuild/netbsd-x64@0.23.1':
-    optional: true
-
   '@esbuild/netbsd-x64@0.24.2':
     optional: true
 
-  '@esbuild/openbsd-arm64@0.23.1':
-    optional: true
-
   '@esbuild/openbsd-arm64@0.24.2':
     optional: true
 
@@ -23403,9 +23203,6 @@ snapshots:
   '@esbuild/openbsd-x64@0.21.5':
     optional: true
 
-  '@esbuild/openbsd-x64@0.23.1':
-    optional: true
-
   '@esbuild/openbsd-x64@0.24.2':
     optional: true
 
@@ -23415,9 +23212,6 @@ snapshots:
   '@esbuild/sunos-x64@0.21.5':
     optional: true
 
-  '@esbuild/sunos-x64@0.23.1':
-    optional: true
-
   '@esbuild/sunos-x64@0.24.2':
     optional: true
 
@@ -23427,9 +23221,6 @@ snapshots:
   '@esbuild/win32-arm64@0.21.5':
     optional: true
 
-  '@esbuild/win32-arm64@0.23.1':
-    optional: true
-
   '@esbuild/win32-arm64@0.24.2':
     optional: true
 
@@ -23439,9 +23230,6 @@ snapshots:
   '@esbuild/win32-ia32@0.21.5':
     optional: true
 
-  '@esbuild/win32-ia32@0.23.1':
-    optional: true
-
   '@esbuild/win32-ia32@0.24.2':
     optional: true
 
@@ -23451,9 +23239,6 @@ snapshots:
   '@esbuild/win32-x64@0.21.5':
     optional: true
 
-  '@esbuild/win32-x64@0.23.1':
-    optional: true
-
   '@esbuild/win32-x64@0.24.2':
     optional: true
 
@@ -23472,7 +23257,7 @@ snapshots:
   '@eslint/config-array@0.19.1':
     dependencies:
       '@eslint/object-schema': 2.1.5
-      debug: 4.4.0
+      debug: 4.4.0(supports-color@8.1.1)
       minimatch: 3.1.2
     transitivePeerDependencies:
       - supports-color
@@ -23498,7 +23283,7 @@ snapshots:
   '@eslint/eslintrc@3.2.0':
     dependencies:
       ajv: 6.12.6
-      debug: 4.4.0
+      debug: 4.4.0(supports-color@8.1.1)
       espree: 10.3.0
       globals: 14.0.0
       ignore: 5.3.2
@@ -23821,40 +23606,40 @@ snapshots:
   '@ffmpeg-installer/win32-x64@4.1.0':
     optional: true
 
-  '@floating-ui/core@1.6.8':
+  '@floating-ui/core@1.6.9':
     dependencies:
-      '@floating-ui/utils': 0.2.8
+      '@floating-ui/utils': 0.2.9
 
-  '@floating-ui/dom@1.6.12':
+  '@floating-ui/dom@1.6.13':
     dependencies:
-      '@floating-ui/core': 1.6.8
-      '@floating-ui/utils': 0.2.8
+      '@floating-ui/core': 1.6.9
+      '@floating-ui/utils': 0.2.9
 
   '@floating-ui/react-dom@2.1.2(react-dom@18.3.1(react@18.3.1))(react@18.3.1)':
     dependencies:
-      '@floating-ui/dom': 1.6.12
+      '@floating-ui/dom': 1.6.13
       react: 18.3.1
       react-dom: 18.3.1(react@18.3.1)
 
-  '@floating-ui/utils@0.2.8': {}
+  '@floating-ui/utils@0.2.9': {}
 
-  '@fuel-ts/abi-coder@0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(buf
ferutil@4.0.9)(canvas@2.11.2
(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                            +  '@fuel-ts/abi-coder@0.97.2(vitest@2.1.4(@types/no
de@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11.2
(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                                 dependencies:
-      '@fuel-ts/crypto': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(
bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/crypto': 0.97.2(vitest@2.1.4(@types
/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/errors': 0.97.2
-      '@fuel-ts/hasher': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(
bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/hasher': 0.97.2(vitest@2.1.4(@types
/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/interfaces': 0.97.2
       '@fuel-ts/math': 0.97.2
-      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(b
ufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      type-fest: 4.31.0
+      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/node@22.10.5)(jsdom@25.0.1(b
ufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      type-fest: 4.32.0
     transitivePeerDependencies:
       - vitest
 
-  '@fuel-ts/abi-typegen@0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(b
ufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                            +  '@fuel-ts/abi-typegen@0.97.2(vitest@2.1.4(@types/
node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                                 dependencies:
       '@fuel-ts/errors': 0.97.2
       '@fuel-ts/interfaces': 0.97.2
-      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(b
ufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/
node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/versions': 0.97.2
       commander: 12.1.0
       glob: 10.4.5
@@ -23865,18 +23650,18 @@ snapshots:
     transitivePeerDependencies:
       - vitest
 
-  '@fuel-ts/account@0.97.2(encoding@0.1.13)(vitest@2.1.4(@types/node@22.10.4)(j
sdom@25.0.1(bufferutil@4.0.9
)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                            +  '@fuel-ts/account@0.97.2(encoding@0.1.13)(vitest@
2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9
)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                                 dependencies:
-      '@fuel-ts/abi-coder': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0
.1(bufferutil@4.0.9)(canvas@
2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/address': 0.97.2(vitest@2.1.4(@type
s/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.
11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/crypto': 0.97.2(vitest@2.1.4(@types
/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/abi-coder': 0.97.2(vitest@2.1.4(@ty
pes/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@
2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/address': 0.97.2(vitest@2.1.4(@type
s/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.
11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/crypto': 0.97.2(vitest@2.1.4(@types
/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/errors': 0.97.2
-      '@fuel-ts/hasher': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(
bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/hasher': 0.97.2(vitest@2.1.4(@types
/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/interfaces': 0.97.2
       '@fuel-ts/math': 0.97.2
-      '@fuel-ts/merkle': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(
bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/transactions': 0.97.2(vitest@2.1.4(
@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/
node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/merkle': 0.97.2(vitest@2.1.4(@types
/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/transactions': 0.97.2(vitest@2.1.4(
@types/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/
node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/versions': 0.97.2
       '@fuels/vm-asm': 0.58.2
       '@noble/curves': 1.8.0
@@ -23889,30 +23674,30 @@ snapshots:
       - encoding
       - vitest
 
-  '@fuel-ts/address@0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(buffe
rutil@4.0.9)(canvas@2.11.2(e
ncoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                            +  '@fuel-ts/address@0.97.2(vitest@2.1.4(@types/node
@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11.2(e
ncoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                                 dependencies:
-      '@fuel-ts/crypto': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(
bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/crypto': 0.97.2(vitest@2.1.4(@types
/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/errors': 0.97.2
       '@fuel-ts/interfaces': 0.97.2
-      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(b
ufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/
node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@noble/hashes': 1.7.0
       bech32: 2.0.0
     transitivePeerDependencies:
       - vitest
 
-  '@fuel-ts/contract@0.97.2(encoding@0.1.13)(vitest@2.1.4(@types/node@22.10.4)(
jsdom@25.0.1(bufferutil@4.0.
9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                            +  '@fuel-ts/contract@0.97.2(encoding@0.1.13)(vitest
@2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.
9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                                 dependencies:
-      '@fuel-ts/abi-coder': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0
.1(bufferutil@4.0.9)(canvas@
2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/account': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/crypto': 0.97.2(vitest@2.1.4(@types
/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/abi-coder': 0.97.2(vitest@2.1.4(@ty
pes/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@
2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/account': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/crypto': 0.97.2(vitest@2.1.4(@types
/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/errors': 0.97.2
-      '@fuel-ts/hasher': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(
bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/hasher': 0.97.2(vitest@2.1.4(@types
/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/interfaces': 0.97.2
       '@fuel-ts/math': 0.97.2
-      '@fuel-ts/merkle': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(
bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/program': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/transactions': 0.97.2(vitest@2.1.4(
@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/
node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/merkle': 0.97.2(vitest@2.1.4(@types
/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/program': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/transactions': 0.97.2(vitest@2.1.4(
@types/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/
node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/versions': 0.97.2
       '@fuels/vm-asm': 0.58.2
       ramda: 0.30.1
@@ -23920,12 +23705,12 @@ snapshots:
       - encoding
       - vitest
 
-  '@fuel-ts/crypto@0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(buffer
util@4.0.9)(canvas@2.11.2(en
coding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                            +  '@fuel-ts/crypto@0.97.2(vitest@2.1.4(@types/node@
22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11.2(en
coding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                                 dependencies:
       '@fuel-ts/errors': 0.97.2
       '@fuel-ts/interfaces': 0.97.2
       '@fuel-ts/math': 0.97.2
-      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(b
ufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/
node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@noble/hashes': 1.7.0
     transitivePeerDependencies:
       - vitest
@@ -23934,11 +23719,11 @@ snapshots:
     dependencies:
       '@fuel-ts/versions': 0.97.2
 
-  '@fuel-ts/hasher@0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(buffer
util@4.0.9)(canvas@2.11.2(en
coding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                            +  '@fuel-ts/hasher@0.97.2(vitest@2.1.4(@types/node@
22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11.2(en
coding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                                 dependencies:
-      '@fuel-ts/crypto': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(
bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/crypto': 0.97.2(vitest@2.1.4(@types
/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/interfaces': 0.97.2
-      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(b
ufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/
node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@noble/hashes': 1.7.0
     transitivePeerDependencies:
       - vitest
@@ -23951,78 +23736,78 @@ snapshots:
       '@types/bn.js': 5.1.6
       bn.js: 5.2.1
 
-  '@fuel-ts/merkle@0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(buffer
util@4.0.9)(canvas@2.11.2(en
coding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                            +  '@fuel-ts/merkle@0.97.2(vitest@2.1.4(@types/node@
22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11.2(en
coding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                                 dependencies:
-      '@fuel-ts/hasher': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(
bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/hasher': 0.97.2(vitest@2.1.4(@types
/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/math': 0.97.2
     transitivePeerDependencies:
       - vitest
 
-  '@fuel-ts/program@0.97.2(encoding@0.1.13)(vitest@2.1.4(@types/node@22.10.4)(j
sdom@25.0.1(bufferutil@4.0.9
)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                            +  '@fuel-ts/program@0.97.2(encoding@0.1.13)(vitest@
2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9
)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                                 dependencies:
-      '@fuel-ts/abi-coder': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0
.1(bufferutil@4.0.9)(canvas@
2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/account': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/address': 0.97.2(vitest@2.1.4(@type
s/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.
11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/abi-coder': 0.97.2(vitest@2.1.4(@ty
pes/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@
2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/account': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/address': 0.97.2(vitest@2.1.4(@type
s/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.
11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/errors': 0.97.2
       '@fuel-ts/interfaces': 0.97.2
       '@fuel-ts/math': 0.97.2
-      '@fuel-ts/transactions': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@2
5.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/
node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/transactions': 0.97.2(vitest@2.1.4(
@types/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/
node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuels/vm-asm': 0.58.2
       ramda: 0.30.1
     transitivePeerDependencies:
       - encoding
       - vitest
 
-  '@fuel-ts/recipes@0.97.2(encoding@0.1.13)(vitest@2.1.4(@types/node@22.10.4)(j
sdom@25.0.1(bufferutil@4.0.9
)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                            +  '@fuel-ts/recipes@0.97.2(encoding@0.1.13)(vitest@
2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9
)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                                 dependencies:
-      '@fuel-ts/abi-coder': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0
.1(bufferutil@4.0.9)(canvas@
2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/abi-typegen': 0.97.2(vitest@2.1.4(@
types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canva
s@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/account': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/contract': 0.97.2(encoding@0.1.13)(
vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferuti
l@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/abi-coder': 0.97.2(vitest@2.1.4(@ty
pes/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@
2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/abi-typegen': 0.97.2(vitest@2.1.4(@
types/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canva
s@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/account': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/contract': 0.97.2(encoding@0.1.13)(
vitest@2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferuti
l@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/interfaces': 0.97.2
-      '@fuel-ts/program': 0.97.2(encoding@0.1.13)(vitest@2.1.4(@types/node@22.1
0.4)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/transactions': 0.97.2(vitest@2.1.4(
@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/
node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/program': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/transactions': 0.97.2(vitest@2.1.4(
@types/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/
node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                 transitivePeerDependencies:
       - encoding
       - vitest
 
-  '@fuel-ts/script@0.97.2(encoding@0.1.13)(vitest@2.1.4(@types/node@22.10.4)(js
dom@25.0.1(bufferutil@4.0.9)
(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                            +  '@fuel-ts/script@0.97.2(encoding@0.1.13)(vitest@2
.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)
(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                                 dependencies:
-      '@fuel-ts/abi-coder': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0
.1(bufferutil@4.0.9)(canvas@
2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/account': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/address': 0.97.2(vitest@2.1.4(@type
s/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.
11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/abi-coder': 0.97.2(vitest@2.1.4(@ty
pes/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@
2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/account': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/address': 0.97.2(vitest@2.1.4(@type
s/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.
11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/errors': 0.97.2
       '@fuel-ts/interfaces': 0.97.2
       '@fuel-ts/math': 0.97.2
-      '@fuel-ts/program': 0.97.2(encoding@0.1.13)(vitest@2.1.4(@types/node@22.1
0.4)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/transactions': 0.97.2(vitest@2.1.4(
@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/
node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/program': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/transactions': 0.97.2(vitest@2.1.4(
@types/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/
node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                 transitivePeerDependencies:
       - encoding
       - vitest
 
-  '@fuel-ts/transactions@0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(
bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                            +  '@fuel-ts/transactions@0.97.2(vitest@2.1.4(@types
/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                                 dependencies:
-      '@fuel-ts/abi-coder': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0
.1(bufferutil@4.0.9)(canvas@
2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/address': 0.97.2(vitest@2.1.4(@type
s/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.
11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/abi-coder': 0.97.2(vitest@2.1.4(@ty
pes/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@
2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/address': 0.97.2(vitest@2.1.4(@type
s/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.
11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/errors': 0.97.2
-      '@fuel-ts/hasher': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(
bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/hasher': 0.97.2(vitest@2.1.4(@types
/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/interfaces': 0.97.2
       '@fuel-ts/math': 0.97.2
-      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(b
ufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/
node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                 transitivePeerDependencies:
       - vitest
 
-  '@fuel-ts/utils@0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferu
til@4.0.9)(canvas@2.11.2(enc
oding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                            +  '@fuel-ts/utils@0.97.2(vitest@2.1.4(@types/node@2
2.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11.2(enc
oding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))':
                                 dependencies:
       '@fuel-ts/errors': 0.97.2
       '@fuel-ts/interfaces': 0.97.2
       '@fuel-ts/math': 0.97.2
       '@fuel-ts/versions': 0.97.2
       fflate: 0.8.2
-      vitest: 2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@
2.11.2(encoding@0.1.13))(utf
-8-validate@5.0.10))(terser@5.37.0)
                            +      vitest: 2.1.4(@types/node@22.10.5)(jsdom@25.0
.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf
-8-validate@5.0.10))(terser@5.37.0)
                             
   '@fuel-ts/versions@0.97.2':
     dependencies:
@@ -24031,10 +23816,10 @@ snapshots:
 
   '@fuels/vm-asm@0.58.2': {}
 
-  '@goat-sdk/adapter-vercel-ai@0.2.0(@goat-sdk/core@0.4.0)(ai@3.4.33(openai@4.7
7.0(encoding@0.1.13)(zod@3.2
3.8))(react@18.3.1)(sswr@2.1.0(svelte@5.16.1))(svelte@5.16.1)(vue@3.5.13(typescr
ipt@5.6.3))(zod@3.23.8))':  +  '@goat-sdk/adapter-vercel-ai@0.2.0(@goat-sdk/core
@0.4.0)(ai@3.4.33(openai@4.77.4(encoding@0.1.13)(zod@3.2
3.8))(react@18.3.1)(sswr@2.1.0(svelte@5.17.1))(svelte@5.17.1)(vue@3.5.13(typescr
ipt@5.6.3))(zod@3.23.8))':       dependencies:
       '@goat-sdk/core': 0.4.0
-      ai: 3.4.33(openai@4.77.0(encoding@0.1.13)(zod@3.23.8))(react@18.3.1)(sswr
@2.1.0(svelte@5.16.1))(svelt
e@5.16.1)(vue@3.5.13(typescript@5.6.3))(zod@3.23.8)
                            +      ai: 3.4.33(openai@4.77.4(encoding@0.1.13)(zod
@3.23.8))(react@18.3.1)(sswr@2.1.0(svelte@5.17.1))(svelt
e@5.17.1)(vue@3.5.13(typescript@5.6.3))(zod@3.23.8)
                                   zod: 3.23.8
 
   '@goat-sdk/core@0.4.0':
@@ -24096,7 +23881,7 @@ snapshots:
 
   '@gql.tada/internal@1.0.8(graphql@16.10.0)(typescript@5.6.3)':
     dependencies:
-      '@0no-co/graphql.web': 1.0.12(graphql@16.10.0)
+      '@0no-co/graphql.web': 1.0.13(graphql@16.10.0)
       graphql: 16.10.0
       typescript: 5.6.3
 
@@ -24279,7 +24064,7 @@ snapshots:
       jest-util: 29.7.0
       slash: 3.0.0
 
-  '@jest/core@29.7.0(ts-node@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@typ
es/node@18.19.69)(typescript
@5.6.3))':
                            +  '@jest/core@29.7.0(ts-node@10.9.2(@swc/core@1.10.
4(@swc/helpers@0.5.15))(@types/node@18.19.70)(typescript
@5.6.3))':
                                 dependencies:
       '@jest/console': 29.7.0
       '@jest/reporters': 29.7.0
@@ -24293,7 +24078,7 @@ snapshots:
       exit: 0.1.2
       graceful-fs: 4.2.11
       jest-changed-files: 29.7.0
-      jest-config: 29.7.0(@types/node@20.17.9)(ts-node@10.9.2(@swc/core@1.10.4(
@swc/helpers@0.5.15))(@types
/node@18.19.69)(typescript@5.6.3))
                            +      jest-config: 29.7.0(@types/node@20.17.9)(ts-n
ode@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types
/node@18.19.70)(typescript@5.6.3))
                                   jest-haste-map: 29.7.0
       jest-message-util: 29.7.0
       jest-regex-util: 29.6.3
@@ -24543,12 +24328,12 @@ snapshots:
 
   '@langchain/core@0.3.27(openai@4.73.0(encoding@0.1.13)(zod@3.23.8))':
     dependencies:
-      '@cfworker/json-schema': 4.0.3
+      '@cfworker/json-schema': 4.1.0
       ansi-styles: 5.2.0
       camelcase: 6.3.0
       decamelize: 1.2.0
       js-tiktoken: 1.0.15
-      langsmith: 0.2.14(openai@4.73.0(encoding@0.1.13)(zod@3.23.8))
+      langsmith: 0.2.15(openai@4.73.0(encoding@0.1.13)(zod@3.23.8))
       mustache: 4.2.0
       p-queue: 6.6.2
       p-retry: 4.6.2
@@ -24562,7 +24347,7 @@ snapshots:
     dependencies:
       '@langchain/core': 0.3.27(openai@4.73.0(encoding@0.1.13)(zod@3.23.8))
       js-tiktoken: 1.0.15
-      openai: 4.77.0(encoding@0.1.13)(zod@3.23.8)
+      openai: 4.77.4(encoding@0.1.13)(zod@3.23.8)
       zod: 3.23.8
       zod-to-json-schema: 3.24.1(zod@3.23.8)
     transitivePeerDependencies:
@@ -25413,7 +25198,7 @@ snapshots:
     transitivePeerDependencies:
       - encoding
 
-  '@neynar/nodejs-sdk@2.7.0(bufferutil@4.0.9)(class-transformer@0.5.1)(encoding
@0.1.13)(typescript@5.6.3)(u
tf-8-validate@5.0.10)(zod@3.23.8)':
                            +  '@neynar/nodejs-sdk@2.8.0(bufferutil@4.0.9)(class
-transformer@0.5.1)(encoding@0.1.13)(typescript@5.6.3)(u
tf-8-validate@5.0.10)(zod@3.23.8)':
                                 dependencies:
       '@openapitools/openapi-generator-cli': 2.15.3(class-transformer@0.5.1)(en
coding@0.1.13)
       semver: 7.6.3
@@ -25794,48 +25579,48 @@ snapshots:
   '@nx/nx-win32-x64-msvc@19.8.14':
     optional: true
 
-  '@octokit/app@15.1.1':
+  '@octokit/app@15.1.2':
     dependencies:
-      '@octokit/auth-app': 7.1.3
-      '@octokit/auth-unauthenticated': 6.1.0
-      '@octokit/core': 6.1.2
-      '@octokit/oauth-app': 7.1.4
-      '@octokit/plugin-paginate-rest': 11.3.6(@octokit/core@6.1.2)
-      '@octokit/types': 13.6.2
-      '@octokit/webhooks': 13.4.1
+      '@octokit/auth-app': 7.1.4
+      '@octokit/auth-unauthenticated': 6.1.1
+      '@octokit/core': 6.1.3
+      '@octokit/oauth-app': 7.1.5
+      '@octokit/plugin-paginate-rest': 11.4.0(@octokit/core@6.1.3)
+      '@octokit/types': 13.7.0
+      '@octokit/webhooks': 13.4.2
 
-  '@octokit/auth-app@7.1.3':
+  '@octokit/auth-app@7.1.4':
     dependencies:
-      '@octokit/auth-oauth-app': 8.1.1
-      '@octokit/auth-oauth-user': 5.1.1
+      '@octokit/auth-oauth-app': 8.1.2
+      '@octokit/auth-oauth-user': 5.1.2
       '@octokit/request': 9.1.4
       '@octokit/request-error': 6.1.6
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
       toad-cache: 3.7.0
       universal-github-app-jwt: 2.2.0
       universal-user-agent: 7.0.2
 
-  '@octokit/auth-oauth-app@8.1.1':
+  '@octokit/auth-oauth-app@8.1.2':
     dependencies:
-      '@octokit/auth-oauth-device': 7.1.1
-      '@octokit/auth-oauth-user': 5.1.1
+      '@octokit/auth-oauth-device': 7.1.2
+      '@octokit/auth-oauth-user': 5.1.2
       '@octokit/request': 9.1.4
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
       universal-user-agent: 7.0.2
 
-  '@octokit/auth-oauth-device@7.1.1':
+  '@octokit/auth-oauth-device@7.1.2':
     dependencies:
       '@octokit/oauth-methods': 5.1.3
       '@octokit/request': 9.1.4
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
       universal-user-agent: 7.0.2
 
-  '@octokit/auth-oauth-user@5.1.1':
+  '@octokit/auth-oauth-user@5.1.2':
     dependencies:
-      '@octokit/auth-oauth-device': 7.1.1
+      '@octokit/auth-oauth-device': 7.1.2
       '@octokit/oauth-methods': 5.1.3
       '@octokit/request': 9.1.4
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
       universal-user-agent: 7.0.2
 
   '@octokit/auth-token@3.0.4': {}
@@ -25844,10 +25629,10 @@ snapshots:
 
   '@octokit/auth-token@5.1.1': {}
 
-  '@octokit/auth-unauthenticated@6.1.0':
+  '@octokit/auth-unauthenticated@6.1.1':
     dependencies:
       '@octokit/request-error': 6.1.6
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
 
   '@octokit/core@4.2.4(encoding@0.1.13)':
     dependencies:
@@ -25867,23 +25652,23 @@ snapshots:
       '@octokit/graphql': 7.1.0
       '@octokit/request': 8.4.0
       '@octokit/request-error': 5.1.0
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
       before-after-hook: 2.2.3
       universal-user-agent: 6.0.1
 
-  '@octokit/core@6.1.2':
+  '@octokit/core@6.1.3':
     dependencies:
       '@octokit/auth-token': 5.1.1
       '@octokit/graphql': 8.1.2
       '@octokit/request': 9.1.4
       '@octokit/request-error': 6.1.6
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
       before-after-hook: 3.0.2
       universal-user-agent: 7.0.2
 
   '@octokit/endpoint@10.1.2':
     dependencies:
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
       universal-user-agent: 7.0.2
 
   '@octokit/endpoint@7.0.6':
@@ -25894,7 +25679,7 @@ snapshots:
 
   '@octokit/endpoint@9.0.5':
     dependencies:
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
       universal-user-agent: 6.0.1
 
   '@octokit/graphql@5.0.6(encoding@0.1.13)':
@@ -25908,21 +25693,21 @@ snapshots:
   '@octokit/graphql@7.1.0':
     dependencies:
       '@octokit/request': 8.4.0
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
       universal-user-agent: 6.0.1
 
   '@octokit/graphql@8.1.2':
     dependencies:
       '@octokit/request': 9.1.4
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
       universal-user-agent: 7.0.2
 
-  '@octokit/oauth-app@7.1.4':
+  '@octokit/oauth-app@7.1.5':
     dependencies:
-      '@octokit/auth-oauth-app': 8.1.1
-      '@octokit/auth-oauth-user': 5.1.1
-      '@octokit/auth-unauthenticated': 6.1.0
-      '@octokit/core': 6.1.2
+      '@octokit/auth-oauth-app': 8.1.2
+      '@octokit/auth-oauth-user': 5.1.2
+      '@octokit/auth-unauthenticated': 6.1.1
+      '@octokit/core': 6.1.3
       '@octokit/oauth-authorization-url': 7.1.1
       '@octokit/oauth-methods': 5.1.3
       '@types/aws-lambda': 8.10.147
@@ -25935,31 +25720,31 @@ snapshots:
       '@octokit/oauth-authorization-url': 7.1.1
       '@octokit/request': 9.1.4
       '@octokit/request-error': 6.1.6
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
 
   '@octokit/openapi-types@18.1.1': {}
 
   '@octokit/openapi-types@20.0.0': {}
 
-  '@octokit/openapi-types@22.2.0': {}
+  '@octokit/openapi-types@23.0.1': {}
 
   '@octokit/openapi-webhooks-types@8.5.1': {}
 
   '@octokit/plugin-enterprise-rest@6.0.1': {}
 
-  '@octokit/plugin-paginate-graphql@5.2.4(@octokit/core@6.1.2)':
+  '@octokit/plugin-paginate-graphql@5.2.4(@octokit/core@6.1.3)':
     dependencies:
-      '@octokit/core': 6.1.2
+      '@octokit/core': 6.1.3
 
   '@octokit/plugin-paginate-rest@11.3.1(@octokit/core@5.2.0)':
     dependencies:
       '@octokit/core': 5.2.0
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
 
-  '@octokit/plugin-paginate-rest@11.3.6(@octokit/core@6.1.2)':
+  '@octokit/plugin-paginate-rest@11.4.0(@octokit/core@6.1.3)':
     dependencies:
-      '@octokit/core': 6.1.2
-      '@octokit/types': 13.6.2
+      '@octokit/core': 6.1.3
+      '@octokit/types': 13.7.0
 
   '@octokit/plugin-paginate-rest@6.1.2(@octokit/core@4.2.4(encoding@0.1.13))':
     dependencies:
@@ -25978,29 +25763,29 @@ snapshots:
   '@octokit/plugin-rest-endpoint-methods@13.2.2(@octokit/core@5.2.0)':
     dependencies:
       '@octokit/core': 5.2.0
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
 
-  '@octokit/plugin-rest-endpoint-methods@13.2.6(@octokit/core@6.1.2)':
+  '@octokit/plugin-rest-endpoint-methods@13.3.0(@octokit/core@6.1.3)':
     dependencies:
-      '@octokit/core': 6.1.2
-      '@octokit/types': 13.6.2
+      '@octokit/core': 6.1.3
+      '@octokit/types': 13.7.0
 
   '@octokit/plugin-rest-endpoint-methods@7.2.3(@octokit/core@4.2.4(encoding@0.1
.13))':
     dependencies:
       '@octokit/core': 4.2.4(encoding@0.1.13)
       '@octokit/types': 10.0.0
 
-  '@octokit/plugin-retry@7.1.2(@octokit/core@6.1.2)':
+  '@octokit/plugin-retry@7.1.3(@octokit/core@6.1.3)':
     dependencies:
-      '@octokit/core': 6.1.2
+      '@octokit/core': 6.1.3
       '@octokit/request-error': 6.1.6
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
       bottleneck: 2.19.5
 
-  '@octokit/plugin-throttling@9.3.2(@octokit/core@6.1.2)':
+  '@octokit/plugin-throttling@9.4.0(@octokit/core@6.1.3)':
     dependencies:
-      '@octokit/core': 6.1.2
-      '@octokit/types': 13.6.2
+      '@octokit/core': 6.1.3
+      '@octokit/types': 13.7.0
       bottleneck: 2.19.5
 
   '@octokit/request-error@3.0.3':
@@ -26011,13 +25796,13 @@ snapshots:
 
   '@octokit/request-error@5.1.0':
     dependencies:
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
       deprecation: 2.3.1
       once: 1.4.0
 
   '@octokit/request-error@6.1.6':
     dependencies:
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
 
   '@octokit/request@6.2.8(encoding@0.1.13)':
     dependencies:
@@ -26034,15 +25819,15 @@ snapshots:
     dependencies:
       '@octokit/endpoint': 9.0.5
       '@octokit/request-error': 5.1.0
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
       universal-user-agent: 6.0.1
 
   '@octokit/request@9.1.4':
     dependencies:
       '@octokit/endpoint': 10.1.2
       '@octokit/request-error': 6.1.6
-      '@octokit/types': 13.6.2
-      fast-content-type-parse: 2.0.0
+      '@octokit/types': 13.7.0
+      fast-content-type-parse: 2.0.1
       universal-user-agent: 7.0.2
 
   '@octokit/rest@19.0.11(encoding@0.1.13)':
@@ -26071,9 +25856,9 @@ snapshots:
     dependencies:
       '@octokit/openapi-types': 20.0.0
 
-  '@octokit/types@13.6.2':
+  '@octokit/types@13.7.0':
     dependencies:
-      '@octokit/openapi-types': 22.2.0
+      '@octokit/openapi-types': 23.0.1
 
   '@octokit/types@9.3.2':
     dependencies:
@@ -26081,7 +25866,7 @@ snapshots:
 
   '@octokit/webhooks-methods@5.1.0': {}
 
-  '@octokit/webhooks@13.4.1':
+  '@octokit/webhooks@13.4.2':
     dependencies:
       '@octokit/openapi-webhooks-types': 8.5.1
       '@octokit/request-error': 6.1.6
@@ -26126,7 +25911,7 @@ snapshots:
       - supports-color
       - utf-8-validate
 
-  '@onflow/fcl-wc@5.5.1(@onflow/fcl-core@1.13.1(bufferutil@4.0.9)(encoding@0.1.
13)(google-protobuf@3.21.4)(
utf-8-validate@5.0.10))(@types/react@18.3.12)(bufferutil@4.0.9)(ioredis@5.4.2)(j
iti@2.4.2)(postcss@8.4.49)(react@18.3.1)(tsx@4.19.2)(utf-8-validate@5.0.10)':
                                                        +  '@onflow/fcl-wc@5.5.1
(@onflow/fcl-core@1.13.1(bufferutil@4.0.9)(encoding@0.1.13)(google-protobuf@3.21
.4)(
utf-8-validate@5.0.10))(@types/react@18.3.12)(bufferutil@4.0.9)(ioredis@5.4.2)(j
iti@2.4.2)(postcss@8.4.49)(react@18.3.1)(utf-8-validate@5.0.10)':
                                                             dependencies:
       '@babel/runtime': 7.26.0
       '@onflow/config': 1.5.1
@@ -26138,7 +25923,7 @@ snapshots:
       '@walletconnect/sign-client': 2.17.3(bufferutil@4.0.9)(ioredis@5.4.2)(utf
-8-validate@5.0.10)
       '@walletconnect/types': 2.17.3(ioredis@5.4.2)
       '@walletconnect/utils': 2.17.3(ioredis@5.4.2)
-      postcss-cli: 11.0.0(jiti@2.4.2)(postcss@8.4.49)(tsx@4.19.2)
+      postcss-cli: 11.0.0(jiti@2.4.2)(postcss@8.4.49)
       preact: 10.25.4
       tailwindcss: 3.4.15(ts-node@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))
(@types/node@22.8.4)(typescr
ipt@5.6.3))
                                 transitivePeerDependencies:
@@ -26171,12 +25956,12 @@ snapshots:
       - uploadthing
       - utf-8-validate
 
-  '@onflow/fcl@1.13.1(@types/react@18.3.12)(bufferutil@4.0.9)(encoding@0.1.13)(
google-protobuf@3.21.4)(iore
dis@5.4.2)(jiti@2.4.2)(postcss@8.4.49)(react@18.3.1)(tsx@4.19.2)(utf-8-validate@
5.0.10)':                   +  '@onflow/fcl@1.13.1(@types/react@18.3.12)(bufferu
til@4.0.9)(encoding@0.1.13)(google-protobuf@3.21.4)(iore
dis@5.4.2)(jiti@2.4.2)(postcss@8.4.49)(react@18.3.1)(utf-8-validate@5.0.10)':
                                 dependencies:
       '@babel/runtime': 7.26.0
       '@onflow/config': 1.5.1
       '@onflow/fcl-core': 1.13.1(bufferutil@4.0.9)(encoding@0.1.13)(google-prot
obuf@3.21.4)(utf-8-validate@
5.0.10)
                            -      '@onflow/fcl-wc': 5.5.1(@onflow/fcl-core@1.13
.1(bufferutil@4.0.9)(encoding@0.1.13)(google-protobuf@3.
21.4)(utf-8-validate@5.0.10))(@types/react@18.3.12)(bufferutil@4.0.9)(ioredis@5.
4.2)(jiti@2.4.2)(postcss@8.4.49)(react@18.3.1)(tsx@4.19.2)(utf-8-validate@5.0.10
)                                                       +      '@onflow/fcl-wc':
 5.5.1(@onflow/fcl-core@1.13.1(bufferutil@4.0.9)(encoding@0.1.13)(google-protobu
f@3.
21.4)(utf-8-validate@5.0.10))(@types/react@18.3.12)(bufferutil@4.0.9)(ioredis@5.
4.2)(jiti@2.4.2)(postcss@8.4.49)(react@18.3.1)(utf-8-validate@5.0.10)
                                                               '@onflow/interact
ion': 0.0.11
       '@onflow/rlp': 1.2.3
       '@onflow/sdk': 1.5.5(bufferutil@4.0.9)(encoding@0.1.13)(utf-8-validate@5.
0.10)
@@ -26817,7 +26602,7 @@ snapshots:
       '@react-icons/all-files': 4.1.0(react@18.3.1)
       '@types/big.js': 6.2.2
       '@types/bn.js': 5.1.6
-      '@types/lodash': 4.17.13
+      '@types/lodash': 4.17.14
       big.js: 6.2.2
       bn.js: 5.2.1
       lodash: 4.17.21
@@ -26945,11 +26730,11 @@ snapshots:
     optionalDependencies:
       rollup: 3.29.5
 
-  '@rollup/plugin-json@6.1.0(rollup@4.29.1)':
+  '@rollup/plugin-json@6.1.0(rollup@4.30.1)':
     dependencies:
-      '@rollup/pluginutils': 5.1.4(rollup@4.29.1)
+      '@rollup/pluginutils': 5.1.4(rollup@4.30.1)
     optionalDependencies:
-      rollup: 4.29.1
+      rollup: 4.30.1
 
   '@rollup/plugin-node-resolve@15.3.0(rollup@2.79.2)':
     dependencies:
@@ -27000,9 +26785,9 @@ snapshots:
       rollup: 2.79.2
       tslib: 2.8.1
 
-  '@rollup/plugin-virtual@3.0.2(rollup@4.29.1)':
+  '@rollup/plugin-virtual@3.0.2(rollup@4.30.1)':
     optionalDependencies:
-      rollup: 4.29.1
+      rollup: 4.30.1
 
   '@rollup/pluginutils@5.1.4(rollup@2.79.2)':
     dependencies:
@@ -27020,69 +26805,69 @@ snapshots:
     optionalDependencies:
       rollup: 3.29.5
 
-  '@rollup/pluginutils@5.1.4(rollup@4.29.1)':
+  '@rollup/pluginutils@5.1.4(rollup@4.30.1)':
     dependencies:
       '@types/estree': 1.0.6
       estree-walker: 2.0.2
       picomatch: 4.0.2
     optionalDependencies:
-      rollup: 4.29.1
+      rollup: 4.30.1
 
-  '@rollup/rollup-android-arm-eabi@4.29.1':
+  '@rollup/rollup-android-arm-eabi@4.30.1':
     optional: true
 
-  '@rollup/rollup-android-arm64@4.29.1':
+  '@rollup/rollup-android-arm64@4.30.1':
     optional: true
 
-  '@rollup/rollup-darwin-arm64@4.29.1':
+  '@rollup/rollup-darwin-arm64@4.30.1':
     optional: true
 
-  '@rollup/rollup-darwin-x64@4.29.1':
+  '@rollup/rollup-darwin-x64@4.30.1':
     optional: true
 
-  '@rollup/rollup-freebsd-arm64@4.29.1':
+  '@rollup/rollup-freebsd-arm64@4.30.1':
     optional: true
 
-  '@rollup/rollup-freebsd-x64@4.29.1':
+  '@rollup/rollup-freebsd-x64@4.30.1':
     optional: true
 
-  '@rollup/rollup-linux-arm-gnueabihf@4.29.1':
+  '@rollup/rollup-linux-arm-gnueabihf@4.30.1':
     optional: true
 
-  '@rollup/rollup-linux-arm-musleabihf@4.29.1':
+  '@rollup/rollup-linux-arm-musleabihf@4.30.1':
     optional: true
 
-  '@rollup/rollup-linux-arm64-gnu@4.29.1':
+  '@rollup/rollup-linux-arm64-gnu@4.30.1':
     optional: true
 
-  '@rollup/rollup-linux-arm64-musl@4.29.1':
+  '@rollup/rollup-linux-arm64-musl@4.30.1':
     optional: true
 
-  '@rollup/rollup-linux-loongarch64-gnu@4.29.1':
+  '@rollup/rollup-linux-loongarch64-gnu@4.30.1':
     optional: true
 
-  '@rollup/rollup-linux-powerpc64le-gnu@4.29.1':
+  '@rollup/rollup-linux-powerpc64le-gnu@4.30.1':
     optional: true
 
-  '@rollup/rollup-linux-riscv64-gnu@4.29.1':
+  '@rollup/rollup-linux-riscv64-gnu@4.30.1':
     optional: true
 
-  '@rollup/rollup-linux-s390x-gnu@4.29.1':
+  '@rollup/rollup-linux-s390x-gnu@4.30.1':
     optional: true
 
-  '@rollup/rollup-linux-x64-gnu@4.29.1':
+  '@rollup/rollup-linux-x64-gnu@4.30.1':
     optional: true
 
-  '@rollup/rollup-linux-x64-musl@4.29.1':
+  '@rollup/rollup-linux-x64-musl@4.30.1':
     optional: true
 
-  '@rollup/rollup-win32-arm64-msvc@4.29.1':
+  '@rollup/rollup-win32-arm64-msvc@4.30.1':
     optional: true
 
-  '@rollup/rollup-win32-ia32-msvc@4.29.1':
+  '@rollup/rollup-win32-ia32-msvc@4.30.1':
     optional: true
 
-  '@rollup/rollup-win32-x64-msvc@4.29.1':
+  '@rollup/rollup-win32-x64-msvc@4.30.1':
     optional: true
 
   '@sapphire/async-queue@1.5.5': {}
@@ -27214,40 +26999,40 @@ snapshots:
       '@sentry/types': 5.30.0
       tslib: 1.14.1
 
-  '@shikijs/core@1.25.1':
+  '@shikijs/core@1.26.1':
     dependencies:
-      '@shikijs/engine-javascript': 1.25.1
-      '@shikijs/engine-oniguruma': 1.25.1
-      '@shikijs/types': 1.25.1
-      '@shikijs/vscode-textmate': 9.3.1
+      '@shikijs/engine-javascript': 1.26.1
+      '@shikijs/engine-oniguruma': 1.26.1
+      '@shikijs/types': 1.26.1
+      '@shikijs/vscode-textmate': 10.0.1
       '@types/hast': 3.0.4
       hast-util-to-html: 9.0.4
 
-  '@shikijs/engine-javascript@1.25.1':
+  '@shikijs/engine-javascript@1.26.1':
     dependencies:
-      '@shikijs/types': 1.25.1
-      '@shikijs/vscode-textmate': 9.3.1
+      '@shikijs/types': 1.26.1
+      '@shikijs/vscode-textmate': 10.0.1
       oniguruma-to-es: 0.10.0
 
-  '@shikijs/engine-oniguruma@1.25.1':
+  '@shikijs/engine-oniguruma@1.26.1':
     dependencies:
-      '@shikijs/types': 1.25.1
-      '@shikijs/vscode-textmate': 9.3.1
+      '@shikijs/types': 1.26.1
+      '@shikijs/vscode-textmate': 10.0.1
 
-  '@shikijs/langs@1.25.1':
+  '@shikijs/langs@1.26.1':
     dependencies:
-      '@shikijs/types': 1.25.1
+      '@shikijs/types': 1.26.1
 
-  '@shikijs/themes@1.25.1':
+  '@shikijs/themes@1.26.1':
     dependencies:
-      '@shikijs/types': 1.25.1
+      '@shikijs/types': 1.26.1
 
-  '@shikijs/types@1.25.1':
+  '@shikijs/types@1.26.1':
     dependencies:
-      '@shikijs/vscode-textmate': 9.3.1
+      '@shikijs/vscode-textmate': 10.0.1
       '@types/hast': 3.0.4
 
-  '@shikijs/vscode-textmate@9.3.1': {}
+  '@shikijs/vscode-textmate@10.0.1': {}
 
   '@sideway/address@4.1.5':
     dependencies:
@@ -27360,250 +27145,250 @@ snapshots:
       micromark-util-character: 1.2.0
       micromark-util-symbol: 1.1.0
 
-  '@smithy/abort-controller@3.1.9':
+  '@smithy/abort-controller@4.0.0':
     dependencies:
-      '@smithy/types': 3.7.2
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/chunked-blob-reader-native@3.0.1':
+  '@smithy/chunked-blob-reader-native@4.0.0':
     dependencies:
-      '@smithy/util-base64': 3.0.0
+      '@smithy/util-base64': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/chunked-blob-reader@4.0.0':
+  '@smithy/chunked-blob-reader@5.0.0':
     dependencies:
       tslib: 2.8.1
 
-  '@smithy/config-resolver@3.0.13':
+  '@smithy/config-resolver@4.0.0':
     dependencies:
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/types': 3.7.2
-      '@smithy/util-config-provider': 3.0.0
-      '@smithy/util-middleware': 3.0.11
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-config-provider': 4.0.0
+      '@smithy/util-middleware': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/core@2.5.7':
+  '@smithy/core@3.0.0':
     dependencies:
-      '@smithy/middleware-serde': 3.0.11
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/types': 3.7.2
-      '@smithy/util-body-length-browser': 3.0.0
-      '@smithy/util-middleware': 3.0.11
-      '@smithy/util-stream': 3.3.4
-      '@smithy/util-utf8': 3.0.0
+      '@smithy/middleware-serde': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-body-length-browser': 4.0.0
+      '@smithy/util-middleware': 4.0.0
+      '@smithy/util-stream': 4.0.0
+      '@smithy/util-utf8': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/credential-provider-imds@3.2.8':
+  '@smithy/credential-provider-imds@4.0.0':
     dependencies:
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/property-provider': 3.1.11
-      '@smithy/types': 3.7.2
-      '@smithy/url-parser': 3.0.11
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/property-provider': 4.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/url-parser': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/eventstream-codec@3.1.10':
+  '@smithy/eventstream-codec@4.0.0':
     dependencies:
       '@aws-crypto/crc32': 5.2.0
-      '@smithy/types': 3.7.2
-      '@smithy/util-hex-encoding': 3.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-hex-encoding': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/eventstream-serde-browser@3.0.14':
+  '@smithy/eventstream-serde-browser@4.0.0':
     dependencies:
-      '@smithy/eventstream-serde-universal': 3.0.13
-      '@smithy/types': 3.7.2
+      '@smithy/eventstream-serde-universal': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/eventstream-serde-config-resolver@3.0.11':
+  '@smithy/eventstream-serde-config-resolver@4.0.0':
     dependencies:
-      '@smithy/types': 3.7.2
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/eventstream-serde-node@3.0.13':
+  '@smithy/eventstream-serde-node@4.0.0':
     dependencies:
-      '@smithy/eventstream-serde-universal': 3.0.13
-      '@smithy/types': 3.7.2
+      '@smithy/eventstream-serde-universal': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/eventstream-serde-universal@3.0.13':
+  '@smithy/eventstream-serde-universal@4.0.0':
     dependencies:
-      '@smithy/eventstream-codec': 3.1.10
-      '@smithy/types': 3.7.2
+      '@smithy/eventstream-codec': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/fetch-http-handler@4.1.3':
+  '@smithy/fetch-http-handler@5.0.0':
     dependencies:
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/querystring-builder': 3.0.11
-      '@smithy/types': 3.7.2
-      '@smithy/util-base64': 3.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/querystring-builder': 4.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-base64': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/hash-blob-browser@3.1.10':
+  '@smithy/hash-blob-browser@4.0.0':
     dependencies:
-      '@smithy/chunked-blob-reader': 4.0.0
-      '@smithy/chunked-blob-reader-native': 3.0.1
-      '@smithy/types': 3.7.2
+      '@smithy/chunked-blob-reader': 5.0.0
+      '@smithy/chunked-blob-reader-native': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/hash-node@3.0.11':
+  '@smithy/hash-node@4.0.0':
     dependencies:
-      '@smithy/types': 3.7.2
-      '@smithy/util-buffer-from': 3.0.0
-      '@smithy/util-utf8': 3.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-buffer-from': 4.0.0
+      '@smithy/util-utf8': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/hash-stream-node@3.1.10':
+  '@smithy/hash-stream-node@4.0.0':
     dependencies:
-      '@smithy/types': 3.7.2
-      '@smithy/util-utf8': 3.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-utf8': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/invalid-dependency@3.0.11':
+  '@smithy/invalid-dependency@4.0.0':
     dependencies:
-      '@smithy/types': 3.7.2
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
   '@smithy/is-array-buffer@2.2.0':
     dependencies:
       tslib: 2.8.1
 
-  '@smithy/is-array-buffer@3.0.0':
+  '@smithy/is-array-buffer@4.0.0':
     dependencies:
       tslib: 2.8.1
 
-  '@smithy/md5-js@3.0.11':
+  '@smithy/md5-js@4.0.0':
     dependencies:
-      '@smithy/types': 3.7.2
-      '@smithy/util-utf8': 3.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-utf8': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/middleware-content-length@3.0.13':
+  '@smithy/middleware-content-length@4.0.0':
     dependencies:
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/types': 3.7.2
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/middleware-endpoint@3.2.8':
+  '@smithy/middleware-endpoint@4.0.0':
     dependencies:
-      '@smithy/core': 2.5.7
-      '@smithy/middleware-serde': 3.0.11
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/shared-ini-file-loader': 3.1.12
-      '@smithy/types': 3.7.2
-      '@smithy/url-parser': 3.0.11
-      '@smithy/util-middleware': 3.0.11
+      '@smithy/core': 3.0.0
+      '@smithy/middleware-serde': 4.0.0
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/shared-ini-file-loader': 4.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/url-parser': 4.0.0
+      '@smithy/util-middleware': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/middleware-retry@3.0.34':
+  '@smithy/middleware-retry@4.0.0':
     dependencies:
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/service-error-classification': 3.0.11
-      '@smithy/smithy-client': 3.7.0
-      '@smithy/types': 3.7.2
-      '@smithy/util-middleware': 3.0.11
-      '@smithy/util-retry': 3.0.11
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/service-error-classification': 4.0.0
+      '@smithy/smithy-client': 4.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-middleware': 4.0.0
+      '@smithy/util-retry': 4.0.0
       tslib: 2.8.1
       uuid: 9.0.1
 
-  '@smithy/middleware-serde@3.0.11':
+  '@smithy/middleware-serde@4.0.0':
     dependencies:
-      '@smithy/types': 3.7.2
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/middleware-stack@3.0.11':
+  '@smithy/middleware-stack@4.0.0':
     dependencies:
-      '@smithy/types': 3.7.2
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/node-config-provider@3.1.12':
+  '@smithy/node-config-provider@4.0.0':
     dependencies:
-      '@smithy/property-provider': 3.1.11
-      '@smithy/shared-ini-file-loader': 3.1.12
-      '@smithy/types': 3.7.2
+      '@smithy/property-provider': 4.0.0
+      '@smithy/shared-ini-file-loader': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/node-http-handler@3.3.3':
+  '@smithy/node-http-handler@4.0.0':
     dependencies:
-      '@smithy/abort-controller': 3.1.9
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/querystring-builder': 3.0.11
-      '@smithy/types': 3.7.2
+      '@smithy/abort-controller': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/querystring-builder': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/property-provider@3.1.11':
+  '@smithy/property-provider@4.0.0':
     dependencies:
-      '@smithy/types': 3.7.2
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/protocol-http@4.1.8':
+  '@smithy/protocol-http@5.0.0':
     dependencies:
-      '@smithy/types': 3.7.2
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/querystring-builder@3.0.11':
+  '@smithy/querystring-builder@4.0.0':
     dependencies:
-      '@smithy/types': 3.7.2
-      '@smithy/util-uri-escape': 3.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-uri-escape': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/querystring-parser@3.0.11':
+  '@smithy/querystring-parser@4.0.0':
     dependencies:
-      '@smithy/types': 3.7.2
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/service-error-classification@3.0.11':
+  '@smithy/service-error-classification@4.0.0':
     dependencies:
-      '@smithy/types': 3.7.2
+      '@smithy/types': 4.0.0
 
-  '@smithy/shared-ini-file-loader@3.1.12':
+  '@smithy/shared-ini-file-loader@4.0.0':
     dependencies:
-      '@smithy/types': 3.7.2
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/signature-v4@4.2.4':
+  '@smithy/signature-v4@5.0.0':
     dependencies:
-      '@smithy/is-array-buffer': 3.0.0
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/types': 3.7.2
-      '@smithy/util-hex-encoding': 3.0.0
-      '@smithy/util-middleware': 3.0.11
-      '@smithy/util-uri-escape': 3.0.0
-      '@smithy/util-utf8': 3.0.0
+      '@smithy/is-array-buffer': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-hex-encoding': 4.0.0
+      '@smithy/util-middleware': 4.0.0
+      '@smithy/util-uri-escape': 4.0.0
+      '@smithy/util-utf8': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/smithy-client@3.7.0':
+  '@smithy/smithy-client@4.0.0':
     dependencies:
-      '@smithy/core': 2.5.7
-      '@smithy/middleware-endpoint': 3.2.8
-      '@smithy/middleware-stack': 3.0.11
-      '@smithy/protocol-http': 4.1.8
-      '@smithy/types': 3.7.2
-      '@smithy/util-stream': 3.3.4
+      '@smithy/core': 3.0.0
+      '@smithy/middleware-endpoint': 4.0.0
+      '@smithy/middleware-stack': 4.0.0
+      '@smithy/protocol-http': 5.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-stream': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/types@3.7.2':
+  '@smithy/types@4.0.0':
     dependencies:
       tslib: 2.8.1
 
-  '@smithy/url-parser@3.0.11':
+  '@smithy/url-parser@4.0.0':
     dependencies:
-      '@smithy/querystring-parser': 3.0.11
-      '@smithy/types': 3.7.2
+      '@smithy/querystring-parser': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/util-base64@3.0.0':
+  '@smithy/util-base64@4.0.0':
     dependencies:
-      '@smithy/util-buffer-from': 3.0.0
-      '@smithy/util-utf8': 3.0.0
+      '@smithy/util-buffer-from': 4.0.0
+      '@smithy/util-utf8': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/util-body-length-browser@3.0.0':
+  '@smithy/util-body-length-browser@4.0.0':
     dependencies:
       tslib: 2.8.1
 
-  '@smithy/util-body-length-node@3.0.0':
+  '@smithy/util-body-length-node@4.0.0':
     dependencies:
       tslib: 2.8.1
 
@@ -27612,66 +27397,66 @@ snapshots:
       '@smithy/is-array-buffer': 2.2.0
       tslib: 2.8.1
 
-  '@smithy/util-buffer-from@3.0.0':
+  '@smithy/util-buffer-from@4.0.0':
     dependencies:
-      '@smithy/is-array-buffer': 3.0.0
+      '@smithy/is-array-buffer': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/util-config-provider@3.0.0':
+  '@smithy/util-config-provider@4.0.0':
     dependencies:
       tslib: 2.8.1
 
-  '@smithy/util-defaults-mode-browser@3.0.34':
+  '@smithy/util-defaults-mode-browser@4.0.0':
     dependencies:
-      '@smithy/property-provider': 3.1.11
-      '@smithy/smithy-client': 3.7.0
-      '@smithy/types': 3.7.2
+      '@smithy/property-provider': 4.0.0
+      '@smithy/smithy-client': 4.0.0
+      '@smithy/types': 4.0.0
       bowser: 2.11.0
       tslib: 2.8.1
 
-  '@smithy/util-defaults-mode-node@3.0.34':
+  '@smithy/util-defaults-mode-node@4.0.0':
     dependencies:
-      '@smithy/config-resolver': 3.0.13
-      '@smithy/credential-provider-imds': 3.2.8
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/property-provider': 3.1.11
-      '@smithy/smithy-client': 3.7.0
-      '@smithy/types': 3.7.2
+      '@smithy/config-resolver': 4.0.0
+      '@smithy/credential-provider-imds': 4.0.0
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/property-provider': 4.0.0
+      '@smithy/smithy-client': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/util-endpoints@2.1.7':
+  '@smithy/util-endpoints@3.0.0':
     dependencies:
-      '@smithy/node-config-provider': 3.1.12
-      '@smithy/types': 3.7.2
+      '@smithy/node-config-provider': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/util-hex-encoding@3.0.0':
+  '@smithy/util-hex-encoding@4.0.0':
     dependencies:
       tslib: 2.8.1
 
-  '@smithy/util-middleware@3.0.11':
+  '@smithy/util-middleware@4.0.0':
     dependencies:
-      '@smithy/types': 3.7.2
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/util-retry@3.0.11':
+  '@smithy/util-retry@4.0.0':
     dependencies:
-      '@smithy/service-error-classification': 3.0.11
-      '@smithy/types': 3.7.2
+      '@smithy/service-error-classification': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/util-stream@3.3.4':
+  '@smithy/util-stream@4.0.0':
     dependencies:
-      '@smithy/fetch-http-handler': 4.1.3
-      '@smithy/node-http-handler': 3.3.3
-      '@smithy/types': 3.7.2
-      '@smithy/util-base64': 3.0.0
-      '@smithy/util-buffer-from': 3.0.0
-      '@smithy/util-hex-encoding': 3.0.0
-      '@smithy/util-utf8': 3.0.0
+      '@smithy/fetch-http-handler': 5.0.0
+      '@smithy/node-http-handler': 4.0.0
+      '@smithy/types': 4.0.0
+      '@smithy/util-base64': 4.0.0
+      '@smithy/util-buffer-from': 4.0.0
+      '@smithy/util-hex-encoding': 4.0.0
+      '@smithy/util-utf8': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/util-uri-escape@3.0.0':
+  '@smithy/util-uri-escape@4.0.0':
     dependencies:
       tslib: 2.8.1
 
@@ -27680,15 +27465,15 @@ snapshots:
       '@smithy/util-buffer-from': 2.2.0
       tslib: 2.8.1
 
-  '@smithy/util-utf8@3.0.0':
+  '@smithy/util-utf8@4.0.0':
     dependencies:
-      '@smithy/util-buffer-from': 3.0.0
+      '@smithy/util-buffer-from': 4.0.0
       tslib: 2.8.1
 
-  '@smithy/util-waiter@3.2.0':
+  '@smithy/util-waiter@4.0.1':
     dependencies:
-      '@smithy/abort-controller': 3.1.9
-      '@smithy/types': 3.7.2
+      '@smithy/abort-controller': 4.0.0
+      '@smithy/types': 4.0.0
       tslib: 2.8.1
 
   '@solana-developers/helpers@2.5.6(bufferutil@4.0.9)(encoding@0.1.13)(fastests
mallesttextencoderdecoder@1.
0.22)(typescript@5.6.3)(utf-8-validate@5.0.10)':
                            @@ -28407,7 +28192,7 @@ snapshots:
 
   '@types/connect-history-api-fallback@1.5.4':
     dependencies:
-      '@types/express-serve-static-core': 5.0.3
+      '@types/express-serve-static-core': 5.0.4
       '@types/node': 20.17.9
 
   '@types/connect@3.4.38':
@@ -28483,7 +28268,7 @@ snapshots:
 
   '@types/d3-selection@3.0.11': {}
 
-  '@types/d3-shape@3.1.6':
+  '@types/d3-shape@3.1.7':
     dependencies:
       '@types/d3-path': 3.1.0
 
@@ -28528,7 +28313,7 @@ snapshots:
       '@types/d3-scale': 4.0.8
       '@types/d3-scale-chromatic': 3.1.0
       '@types/d3-selection': 3.0.11
-      '@types/d3-shape': 3.1.6
+      '@types/d3-shape': 3.1.7
       '@types/d3-time': 3.0.4
       '@types/d3-time-format': 4.0.3
       '@types/d3-timer': 3.0.2
@@ -28574,7 +28359,7 @@ snapshots:
       '@types/range-parser': 1.2.7
       '@types/send': 0.17.4
 
-  '@types/express-serve-static-core@5.0.3':
+  '@types/express-serve-static-core@5.0.4':
     dependencies:
       '@types/node': 20.17.9
       '@types/qs': 6.9.17
@@ -28591,7 +28376,7 @@ snapshots:
   '@types/express@5.0.0':
     dependencies:
       '@types/body-parser': 1.19.5
-      '@types/express-serve-static-core': 5.0.3
+      '@types/express-serve-static-core': 5.0.4
       '@types/qs': 6.9.17
       '@types/serve-static': 1.15.7
 
@@ -28679,9 +28464,9 @@ snapshots:
 
   '@types/lodash.isstring@4.0.9':
     dependencies:
-      '@types/lodash': 4.17.13
+      '@types/lodash': 4.17.14
 
-  '@types/lodash@4.17.13': {}
+  '@types/lodash@4.17.14': {}
 
   '@types/lru-cache@5.1.1': {}
 
@@ -28724,7 +28509,7 @@ snapshots:
 
   '@types/node@17.0.45': {}
 
-  '@types/node@18.19.69':
+  '@types/node@18.19.70':
     dependencies:
       undici-types: 5.26.5
 
@@ -28732,7 +28517,7 @@ snapshots:
     dependencies:
       undici-types: 6.19.8
 
-  '@types/node@22.10.4':
+  '@types/node@22.10.5':
     dependencies:
       undici-types: 6.20.0
 
@@ -28946,7 +28731,7 @@ snapshots:
       '@typescript-eslint/types': 8.16.0
       '@typescript-eslint/typescript-estree': 8.16.0(typescript@5.6.3)
       '@typescript-eslint/visitor-keys': 8.16.0
-      debug: 4.4.0
+      debug: 4.4.0(supports-color@8.1.1)
       eslint: 9.16.0(jiti@2.4.2)
     optionalDependencies:
       typescript: 5.6.3
@@ -28979,7 +28764,7 @@ snapshots:
     dependencies:
       '@typescript-eslint/typescript-estree': 8.16.0(typescript@5.6.3)
       '@typescript-eslint/utils': 8.16.0(eslint@9.16.0(jiti@2.4.2))(typescript@
5.6.3)
-      debug: 4.4.0
+      debug: 4.4.0(supports-color@8.1.1)
       eslint: 9.16.0(jiti@2.4.2)
       ts-api-utils: 1.4.3(typescript@5.6.3)
     optionalDependencies:
@@ -28996,7 +28781,7 @@ snapshots:
       '@typescript-eslint/types': 8.11.0
       '@typescript-eslint/visitor-keys': 8.11.0
       debug: 4.4.0(supports-color@8.1.1)
-      fast-glob: 3.3.2
+      fast-glob: 3.3.3
       is-glob: 4.0.3
       minimatch: 9.0.5
       semver: 7.6.3
@@ -29010,8 +28795,8 @@ snapshots:
     dependencies:
       '@typescript-eslint/types': 8.16.0
       '@typescript-eslint/visitor-keys': 8.16.0
-      debug: 4.4.0
-      fast-glob: 3.3.2
+      debug: 4.4.0(supports-color@8.1.1)
+      fast-glob: 3.3.3
       is-glob: 4.0.3
       minimatch: 9.0.5
       semver: 7.6.3
@@ -29112,13 +28897,13 @@ snapshots:
     transitivePeerDependencies:
       - supports-color
 
-  '@vitest/eslint-plugin@1.0.1(@typescript-eslint/utils@8.16.0(eslint@9.16.0(ji
ti@2.4.2))(typescript@5.6.3)
)(eslint@9.16.0(jiti@2.4.2))(typescript@5.6.3)(vitest@2.1.5(@types/node@22.10.4)
(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5
.0.10))(terser@5.37.0))':                               +  '@vitest/eslint-plugi
n@1.0.1(@typescript-eslint/utils@8.16.0(eslint@9.16.0(jiti@2.4.2))(typescript@5.
6.3)
)(eslint@9.16.0(jiti@2.4.2))(typescript@5.6.3)(vitest@2.1.5(@types/node@22.10.5)
(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5
.0.10))(terser@5.37.0))':                                    dependencies:
       eslint: 9.16.0(jiti@2.4.2)
     optionalDependencies:
       '@typescript-eslint/utils': 8.16.0(eslint@9.16.0(jiti@2.4.2))(typescript@
5.6.3)
       typescript: 5.6.3
-      vitest: 2.1.5(@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@
2.11.2(encoding@0.1.13))(utf
-8-validate@5.0.10))(terser@5.37.0)
                            +      vitest: 2.1.5(@types/node@22.10.5)(jsdom@25.0
.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf
-8-validate@5.0.10))(terser@5.37.0)
                             
   '@vitest/expect@2.1.4':
     dependencies:
@@ -29134,21 +28919,21 @@ snapshots:
       chai: 5.1.2
       tinyrainbow: 1.2.0
 
-  '@vitest/mocker@2.1.4(vite@5.4.11(@types/node@22.10.4)(terser@5.37.0))':
+  '@vitest/mocker@2.1.4(vite@5.4.11(@types/node@22.10.5)(terser@5.37.0))':
     dependencies:
       '@vitest/spy': 2.1.4
       estree-walker: 3.0.3
       magic-string: 0.30.17
     optionalDependencies:
-      vite: 5.4.11(@types/node@22.10.4)(terser@5.37.0)
+      vite: 5.4.11(@types/node@22.10.5)(terser@5.37.0)
 
-  '@vitest/mocker@2.1.5(vite@5.4.11(@types/node@22.10.4)(terser@5.37.0))':
+  '@vitest/mocker@2.1.5(vite@5.4.11(@types/node@22.10.5)(terser@5.37.0))':
     dependencies:
       '@vitest/spy': 2.1.5
       estree-walker: 3.0.3
       magic-string: 0.30.17
     optionalDependencies:
-      vite: 5.4.11(@types/node@22.10.4)(terser@5.37.0)
+      vite: 5.4.11(@types/node@22.10.5)(terser@5.37.0)
 
   '@vitest/pretty-format@2.1.4':
     dependencies:
@@ -29800,7 +29585,7 @@ snapshots:
 
   agent-base@6.0.2:
     dependencies:
-      debug: 4.4.0
+      debug: 4.4.0(supports-color@8.1.1)
     transitivePeerDependencies:
       - supports-color
 
@@ -29846,13 +29631,13 @@ snapshots:
       clean-stack: 2.2.0
       indent-string: 4.0.0
 
-  ai@3.4.33(openai@4.73.0(encoding@0.1.13)(zod@3.23.8))(react@18.3.1)(sswr@2.1.
0(svelte@5.16.1))(svelte@5.1
6.1)(vue@3.5.13(typescript@5.6.3))(zod@3.23.8):
                            +  ai@3.4.33(openai@4.73.0(encoding@0.1.13)(zod@3.23
.8))(react@18.3.1)(sswr@2.1.0(svelte@5.17.1))(svelte@5.1
7.1)(vue@3.5.13(typescript@5.6.3))(zod@3.23.8):
                                 dependencies:
       '@ai-sdk/provider': 0.0.26
       '@ai-sdk/provider-utils': 1.0.22(zod@3.23.8)
       '@ai-sdk/react': 0.0.70(react@18.3.1)(zod@3.23.8)
       '@ai-sdk/solid': 0.0.54(zod@3.23.8)
-      '@ai-sdk/svelte': 0.0.57(svelte@5.16.1)(zod@3.23.8)
+      '@ai-sdk/svelte': 0.0.57(svelte@5.17.1)(zod@3.23.8)
       '@ai-sdk/ui-utils': 0.0.50(zod@3.23.8)
       '@ai-sdk/vue': 0.0.59(vue@3.5.13(typescript@5.6.3))(zod@3.23.8)
       '@opentelemetry/api': 1.9.0
@@ -29864,20 +29649,20 @@ snapshots:
     optionalDependencies:
       openai: 4.73.0(encoding@0.1.13)(zod@3.23.8)
       react: 18.3.1
-      sswr: 2.1.0(svelte@5.16.1)
-      svelte: 5.16.1
+      sswr: 2.1.0(svelte@5.17.1)
+      svelte: 5.17.1
       zod: 3.23.8
     transitivePeerDependencies:
       - solid-js
       - vue
 
-  ai@3.4.33(openai@4.77.0(encoding@0.1.13)(zod@3.23.8))(react@18.3.1)(sswr@2.1.
0(svelte@5.16.1))(svelte@5.1
6.1)(vue@3.5.13(typescript@5.6.3))(zod@3.23.8):
                            +  ai@3.4.33(openai@4.77.4(encoding@0.1.13)(zod@3.23
.8))(react@18.3.1)(sswr@2.1.0(svelte@5.17.1))(svelte@5.1
7.1)(vue@3.5.13(typescript@5.6.3))(zod@3.23.8):
                                 dependencies:
       '@ai-sdk/provider': 0.0.26
       '@ai-sdk/provider-utils': 1.0.22(zod@3.23.8)
       '@ai-sdk/react': 0.0.70(react@18.3.1)(zod@3.23.8)
       '@ai-sdk/solid': 0.0.54(zod@3.23.8)
-      '@ai-sdk/svelte': 0.0.57(svelte@5.16.1)(zod@3.23.8)
+      '@ai-sdk/svelte': 0.0.57(svelte@5.17.1)(zod@3.23.8)
       '@ai-sdk/ui-utils': 0.0.50(zod@3.23.8)
       '@ai-sdk/vue': 0.0.59(vue@3.5.13(typescript@5.6.3))(zod@3.23.8)
       '@opentelemetry/api': 1.9.0
@@ -29887,10 +29672,10 @@ snapshots:
       secure-json-parse: 2.7.0
       zod-to-json-schema: 3.24.1(zod@3.23.8)
     optionalDependencies:
-      openai: 4.77.0(encoding@0.1.13)(zod@3.23.8)
+      openai: 4.77.4(encoding@0.1.13)(zod@3.23.8)
       react: 18.3.1
-      sswr: 2.1.0(svelte@5.16.1)
-      svelte: 5.16.1
+      sswr: 2.1.0(svelte@5.17.1)
+      svelte: 5.17.1
       zod: 3.23.8
     transitivePeerDependencies:
       - solid-js
@@ -29919,7 +29704,7 @@ snapshots:
   ajv@8.17.1:
     dependencies:
       fast-deep-equal: 3.1.3
-      fast-uri: 3.0.3
+      fast-uri: 3.0.5
       json-schema-traverse: 1.0.0
       require-from-string: 2.0.2
 
@@ -29948,21 +29733,21 @@ snapshots:
       '@algolia/requester-node-http': 4.24.0
       '@algolia/transporter': 4.24.0
 
-  algoliasearch@5.18.0:
-    dependencies:
-      '@algolia/client-abtesting': 5.18.0
-      '@algolia/client-analytics': 5.18.0
-      '@algolia/client-common': 5.18.0
-      '@algolia/client-insights': 5.18.0
-      '@algolia/client-personalization': 5.18.0
-      '@algolia/client-query-suggestions': 5.18.0
-      '@algolia/client-search': 5.18.0
-      '@algolia/ingestion': 1.18.0
-      '@algolia/monitoring': 1.18.0
-      '@algolia/recommend': 5.18.0
-      '@algolia/requester-browser-xhr': 5.18.0
-      '@algolia/requester-fetch': 5.18.0
-      '@algolia/requester-node-http': 5.18.0
+  algoliasearch@5.19.0:
+    dependencies:
+      '@algolia/client-abtesting': 5.19.0
+      '@algolia/client-analytics': 5.19.0
+      '@algolia/client-common': 5.19.0
+      '@algolia/client-insights': 5.19.0
+      '@algolia/client-personalization': 5.19.0
+      '@algolia/client-query-suggestions': 5.19.0
+      '@algolia/client-search': 5.19.0
+      '@algolia/ingestion': 1.19.0
+      '@algolia/monitoring': 1.19.0
+      '@algolia/recommend': 5.19.0
+      '@algolia/requester-browser-xhr': 5.19.0
+      '@algolia/requester-fetch': 5.19.0
+      '@algolia/requester-node-http': 5.19.0
 
   amp-message@0.1.2:
     dependencies:
@@ -30174,8 +29959,8 @@ snapshots:
 
   autoprefixer@10.4.20(postcss@8.4.49):
     dependencies:
-      browserslist: 4.24.3
-      caniuse-lite: 1.0.30001690
+      browserslist: 4.24.4
+      caniuse-lite: 1.0.30001692
       fraction.js: 4.3.7
       normalize-range: 0.1.2
       picocolors: 1.1.1
@@ -30192,13 +29977,13 @@ snapshots:
 
   axios-mock-adapter@1.22.0(axios@1.7.9):
     dependencies:
-      axios: 1.7.9
+      axios: 1.7.9(debug@4.4.0)
       fast-deep-equal: 3.1.3
       is-buffer: 2.0.5
 
   axios-retry@4.5.0(axios@1.7.9):
     dependencies:
-      axios: 1.7.9
+      axios: 1.7.9(debug@4.4.0)
       is-retry-allowed: 2.2.0
 
   axios@0.21.4:
@@ -30209,7 +29994,7 @@ snapshots:
 
   axios@0.27.2:
     dependencies:
-      follow-redirects: 1.15.9
+      follow-redirects: 1.15.9(debug@4.4.0)
       form-data: 4.0.1
     transitivePeerDependencies:
       - debug
@@ -30238,14 +30023,6 @@ snapshots:
     transitivePeerDependencies:
       - debug
 
-  axios@1.7.9:
-    dependencies:
-      follow-redirects: 1.15.9
-      form-data: 4.0.1
-      proxy-from-env: 1.1.0
-    transitivePeerDependencies:
-      - debug
-
   axios@1.7.9(debug@4.4.0):
     dependencies:
       follow-redirects: 1.15.9(debug@4.4.0)
@@ -30328,7 +30105,7 @@ snapshots:
     dependencies:
       '@babel/core': 7.26.0
       '@babel/helper-define-polyfill-provider': 0.6.3(@babel/core@7.26.0)
-      core-js-compat: 3.39.0
+      core-js-compat: 3.40.0
     transitivePeerDependencies:
       - supports-color
 
@@ -30408,12 +30185,12 @@ snapshots:
 
   balanced-match@1.0.2: {}
 
-  bare-events@2.5.0:
+  bare-events@2.5.3:
     optional: true
 
   bare-fs@2.3.5:
     dependencies:
-      bare-events: 2.5.0
+      bare-events: 2.5.3
       bare-path: 2.1.3
       bare-stream: 2.6.1
     optional: true
@@ -30787,12 +30564,12 @@ snapshots:
       vm-browserify: 1.1.2
       xtend: 4.0.2
 
-  browserslist@4.24.3:
+  browserslist@4.24.4:
     dependencies:
-      caniuse-lite: 1.0.30001690
-      electron-to-chromium: 1.5.76
+      caniuse-lite: 1.0.30001692
+      electron-to-chromium: 1.5.79
       node-releases: 2.0.19
-      update-browserslist-db: 1.1.1(browserslist@4.24.3)
+      update-browserslist-db: 1.1.2(browserslist@4.24.4)
 
   bs-logger@0.2.6:
     dependencies:
@@ -31003,12 +30780,12 @@ snapshots:
 
   caniuse-api@3.0.0:
     dependencies:
-      browserslist: 4.24.3
-      caniuse-lite: 1.0.30001690
+      browserslist: 4.24.4
+      caniuse-lite: 1.0.30001692
       lodash.memoize: 4.1.2
       lodash.uniq: 4.5.0
 
-  caniuse-lite@1.0.30001690: {}
+  caniuse-lite@1.0.30001692: {}
 
   canvas@2.11.2(encoding@0.1.13):
     dependencies:
@@ -31096,14 +30873,14 @@ snapshots:
       css-what: 6.1.0
       domelementtype: 2.3.0
       domhandler: 5.0.3
-      domutils: 3.2.1
+      domutils: 3.2.2
 
   cheerio@1.0.0-rc.12:
     dependencies:
       cheerio-select: 2.1.0
       dom-serializer: 2.0.0
       domhandler: 5.0.3
-      domutils: 3.2.1
+      domutils: 3.2.2
       htmlparser2: 8.0.2
       parse5: 7.2.1
       parse5-htmlparser2-tree-adapter: 7.1.0
@@ -31604,7 +31381,7 @@ snapshots:
 
   copy-webpack-plugin@11.0.0(webpack@5.97.1(@swc/core@1.10.4(@swc/helpers@0.5.1
5))):
     dependencies:
-      fast-glob: 3.3.2
+      fast-glob: 3.3.3
       glob-parent: 6.0.2
       globby: 13.2.2
       normalize-path: 3.0.0
@@ -31612,15 +31389,15 @@ snapshots:
       serialize-javascript: 6.0.2
       webpack: 5.97.1(@swc/core@1.10.4(@swc/helpers@0.5.15))
 
-  core-js-compat@3.39.0:
+  core-js-compat@3.40.0:
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
 
-  core-js-pure@3.39.0: {}
+  core-js-pure@3.40.0: {}
 
   core-js@2.6.12: {}
 
-  core-js@3.39.0: {}
+  core-js@3.40.0: {}
 
   core-util-is@1.0.2: {}
 
@@ -31639,9 +31416,9 @@ snapshots:
     dependencies:
       layout-base: 2.0.1
 
-  cosmiconfig-typescript-loader@5.1.0(@types/node@22.10.4)(cosmiconfig@8.3.6(ty
pescript@5.6.3))(typescript@
5.6.3):
                            +  cosmiconfig-typescript-loader@5.1.0(@types/node@2
2.10.5)(cosmiconfig@8.3.6(typescript@5.6.3))(typescript@
5.6.3):
                                 dependencies:
-      '@types/node': 22.10.4
+      '@types/node': 22.10.5
       cosmiconfig: 8.3.6(typescript@5.6.3)
       jiti: 1.21.7
       typescript: 5.6.3
@@ -31694,13 +31471,13 @@ snapshots:
       safe-buffer: 5.2.1
       sha.js: 2.4.11
 
-  create-jest@29.7.0(@types/node@18.19.69)(ts-node@10.9.2(@swc/core@1.10.4(@swc
/helpers@0.5.15))(@types/nod
e@18.19.69)(typescript@5.6.3)):
                            +  create-jest@29.7.0(@types/node@18.19.70)(ts-node@
10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/nod
e@18.19.70)(typescript@5.6.3)):
                                 dependencies:
       '@jest/types': 29.6.3
       chalk: 4.1.2
       exit: 0.1.2
       graceful-fs: 4.2.11
-      jest-config: 29.7.0(@types/node@18.19.69)(ts-node@10.9.2(@swc/core@1.10.4
(@swc/helpers@0.5.15))(@type
s/node@18.19.69)(typescript@5.6.3))
                            +      jest-config: 29.7.0(@types/node@18.19.70)(ts-
node@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@type
s/node@18.19.70)(typescript@5.6.3))
                                   jest-util: 29.7.0
       prompts: 2.4.2
     transitivePeerDependencies:
@@ -31724,13 +31501,13 @@ snapshots:
       - supports-color
       - ts-node
 
-  create-jest@29.7.0(@types/node@22.10.4):
+  create-jest@29.7.0(@types/node@22.10.5):
     dependencies:
       '@jest/types': 29.6.3
       chalk: 4.1.2
       exit: 0.1.2
       graceful-fs: 4.2.11
-      jest-config: 29.7.0(@types/node@22.10.4)
+      jest-config: 29.7.0(@types/node@22.10.5)
       jest-util: 29.7.0
       prompts: 2.4.2
     transitivePeerDependencies:
@@ -31869,7 +31646,7 @@ snapshots:
       boolbase: 1.0.0
       css-what: 6.1.0
       domhandler: 5.0.3
-      domutils: 3.2.1
+      domutils: 3.2.2
       nth-check: 2.1.1
 
   css-selector-parser@1.4.1: {}
@@ -31893,7 +31670,7 @@ snapshots:
   cssnano-preset-advanced@6.1.2(postcss@8.4.49):
     dependencies:
       autoprefixer: 10.4.20(postcss@8.4.49)
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       cssnano-preset-default: 6.1.2(postcss@8.4.49)
       postcss: 8.4.49
       postcss-discard-unused: 6.0.5(postcss@8.4.49)
@@ -31903,7 +31680,7 @@ snapshots:
 
   cssnano-preset-default@6.1.2(postcss@8.4.49):
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       css-declaration-sorter: 7.2.0(postcss@8.4.49)
       cssnano-utils: 4.0.2(postcss@8.4.49)
       postcss: 8.4.49
@@ -31937,11 +31714,11 @@ snapshots:
 
   cssnano-preset-default@7.0.6(postcss@8.4.49):
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       css-declaration-sorter: 7.2.0(postcss@8.4.49)
       cssnano-utils: 5.0.0(postcss@8.4.49)
       postcss: 8.4.49
-      postcss-calc: 10.0.2(postcss@8.4.49)
+      postcss-calc: 10.1.0(postcss@8.4.49)
       postcss-colormin: 7.0.2(postcss@8.4.49)
       postcss-convert-values: 7.0.4(postcss@8.4.49)
       postcss-discard-comments: 7.0.3(postcss@8.4.49)
@@ -31993,9 +31770,10 @@ snapshots:
     dependencies:
       css-tree: 2.2.1
 
-  cssstyle@4.1.0:
+  cssstyle@4.2.1:
     dependencies:
-      rrweb-cssom: 0.7.1
+      '@asamuzakjp/css-color': 2.8.2
+      rrweb-cssom: 0.8.0
 
   csstype@3.1.3: {}
 
@@ -32281,10 +32059,6 @@ snapshots:
     dependencies:
       ms: 2.1.3
 
-  debug@4.4.0:
-    dependencies:
-      ms: 2.1.3
-
   debug@4.4.0(supports-color@5.5.0):
     dependencies:
       ms: 2.1.3
@@ -32595,7 +32369,7 @@ snapshots:
       domelementtype: 2.3.0
       domhandler: 4.3.1
 
-  domutils@3.2.1:
+  domutils@3.2.2:
     dependencies:
       dom-serializer: 2.0.0
       domelementtype: 2.3.0
@@ -32660,8 +32434,8 @@ snapshots:
 
   echogarden@2.0.7(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(encoding@0
.1.13)(utf-8-validate@5.0.10
)(zod@3.23.8):
                                 dependencies:
-      '@aws-sdk/client-polly': 3.721.0
-      '@aws-sdk/client-transcribe-streaming': 3.721.0
+      '@aws-sdk/client-polly': 3.723.0
+      '@aws-sdk/client-transcribe-streaming': 3.723.0
       '@echogarden/audio-io': 0.2.3
       '@echogarden/espeak-ng-emscripten': 0.3.3
       '@echogarden/fasttext-wasm': 0.1.0
@@ -32728,7 +32502,7 @@ snapshots:
     dependencies:
       jake: 10.9.2
 
-  electron-to-chromium@1.5.76: {}
+  electron-to-chromium@1.5.79: {}
 
   elliptic@6.5.4:
     dependencies:
@@ -33001,34 +32775,6 @@ snapshots:
       '@esbuild/win32-ia32': 0.21.5
       '@esbuild/win32-x64': 0.21.5
 
-  esbuild@0.23.1:
-    optionalDependencies:
-      '@esbuild/aix-ppc64': 0.23.1
-      '@esbuild/android-arm': 0.23.1
-      '@esbuild/android-arm64': 0.23.1
-      '@esbuild/android-x64': 0.23.1
-      '@esbuild/darwin-arm64': 0.23.1
-      '@esbuild/darwin-x64': 0.23.1
-      '@esbuild/freebsd-arm64': 0.23.1
-      '@esbuild/freebsd-x64': 0.23.1
-      '@esbuild/linux-arm': 0.23.1
-      '@esbuild/linux-arm64': 0.23.1
-      '@esbuild/linux-ia32': 0.23.1
-      '@esbuild/linux-loong64': 0.23.1
-      '@esbuild/linux-mips64el': 0.23.1
-      '@esbuild/linux-ppc64': 0.23.1
-      '@esbuild/linux-riscv64': 0.23.1
-      '@esbuild/linux-s390x': 0.23.1
-      '@esbuild/linux-x64': 0.23.1
-      '@esbuild/netbsd-x64': 0.23.1
-      '@esbuild/openbsd-arm64': 0.23.1
-      '@esbuild/openbsd-x64': 0.23.1
-      '@esbuild/sunos-x64': 0.23.1
-      '@esbuild/win32-arm64': 0.23.1
-      '@esbuild/win32-ia32': 0.23.1
-      '@esbuild/win32-x64': 0.23.1
-    optional: true
-
   esbuild@0.24.2:
     optionalDependencies:
       '@esbuild/aix-ppc64': 0.24.2
@@ -33187,7 +32933,7 @@ snapshots:
       ajv: 6.12.6
       chalk: 4.1.2
       cross-spawn: 7.0.6
-      debug: 4.4.0
+      debug: 4.4.0(supports-color@8.1.1)
       escape-string-regexp: 4.0.0
       eslint-scope: 8.2.0
       eslint-visitor-keys: 4.2.0
@@ -33211,7 +32957,7 @@ snapshots:
     transitivePeerDependencies:
       - supports-color
 
-  esm-env@1.2.1: {}
+  esm-env@1.2.2: {}
 
   esmify@2.1.1:
     dependencies:
@@ -33556,7 +33302,7 @@ snapshots:
 
   extract-zip@2.0.1:
     dependencies:
-      debug: 4.4.0(supports-color@8.1.1)
+      debug: 4.3.4
       get-stream: 5.2.0
       yauzl: 2.10.0
     optionalDependencies:
@@ -33574,13 +33320,13 @@ snapshots:
 
   eyes@0.1.8: {}
 
-  fast-content-type-parse@2.0.0: {}
+  fast-content-type-parse@2.0.1: {}
 
   fast-deep-equal@3.1.3: {}
 
   fast-fifo@1.3.2: {}
 
-  fast-glob@3.3.2:
+  fast-glob@3.3.3:
     dependencies:
       '@nodelib/fs.stat': 2.0.5
       '@nodelib/fs.walk': 1.2.8
@@ -33600,7 +33346,7 @@ snapshots:
 
   fast-stable-stringify@1.0.0: {}
 
-  fast-uri@3.0.3: {}
+  fast-uri@3.0.5: {}
 
   fast-xml-parser@4.4.1:
     dependencies:
@@ -33773,8 +33519,6 @@ snapshots:
       async: 0.2.10
       which: 1.3.1
 
-  follow-redirects@1.15.9: {}
-
   follow-redirects@1.15.9(debug@4.3.7):
     optionalDependencies:
       debug: 4.3.7
@@ -33931,24 +33675,24 @@ snapshots:
   fsevents@2.3.3:
     optional: true
 
-  fuels@0.97.2(encoding@0.1.13)(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(
bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0)):
                            +  fuels@0.97.2(encoding@0.1.13)(vitest@2.1.4(@types
/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0)):
                                 dependencies:
-      '@fuel-ts/abi-coder': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0
.1(bufferutil@4.0.9)(canvas@
2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/abi-typegen': 0.97.2(vitest@2.1.4(@
types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canva
s@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/account': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/address': 0.97.2(vitest@2.1.4(@type
s/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.
11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/contract': 0.97.2(encoding@0.1.13)(
vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferuti
l@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/crypto': 0.97.2(vitest@2.1.4(@types
/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/abi-coder': 0.97.2(vitest@2.1.4(@ty
pes/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@
2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/abi-typegen': 0.97.2(vitest@2.1.4(@
types/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canva
s@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/account': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/address': 0.97.2(vitest@2.1.4(@type
s/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.
11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/contract': 0.97.2(encoding@0.1.13)(
vitest@2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferuti
l@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/crypto': 0.97.2(vitest@2.1.4(@types
/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/errors': 0.97.2
-      '@fuel-ts/hasher': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(
bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/hasher': 0.97.2(vitest@2.1.4(@types
/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/interfaces': 0.97.2
       '@fuel-ts/math': 0.97.2
-      '@fuel-ts/merkle': 0.97.2(vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(
bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/program': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/recipes': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/script': 0.97.2(encoding@0.1.13)(vi
test@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferutil@
4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/transactions': 0.97.2(vitest@2.1.4(
@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            -      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/
node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/merkle': 0.97.2(vitest@2.1.4(@types
/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.1
1.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/program': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/recipes': 0.97.2(encoding@0.1.13)(v
itest@2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferutil
@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/script': 0.97.2(encoding@0.1.13)(vi
test@2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bufferutil@
4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/transactions': 0.97.2(vitest@2.1.4(
@types/node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canv
as@2.11.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                            +      '@fuel-ts/utils': 0.97.2(vitest@2.1.4(@types/
node@22.10.5)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11
.2(encoding@0.1.13))(utf-8-validate@5.0.10))(terser@5.37.0))
                                   '@fuel-ts/versions': 0.97.2
       bundle-require: 5.1.0(esbuild@0.24.2)
       chalk: 4.1.2
@@ -34106,11 +33850,6 @@ snapshots:
       es-errors: 1.3.0
       get-intrinsic: 1.2.7
 
-  get-tsconfig@4.8.1:
-    dependencies:
-      resolve-pkg-maps: 1.0.0
-    optional: true
-
   get-uri@6.0.4:
     dependencies:
       basic-ftp: 5.0.5
@@ -34284,7 +34023,7 @@ snapshots:
     dependencies:
       array-union: 2.1.0
       dir-glob: 3.0.1
-      fast-glob: 3.3.2
+      fast-glob: 3.3.3
       ignore: 5.3.2
       merge2: 1.4.1
       slash: 3.0.0
@@ -34292,7 +34031,7 @@ snapshots:
   globby@13.2.2:
     dependencies:
       dir-glob: 3.0.1
-      fast-glob: 3.3.2
+      fast-glob: 3.3.3
       ignore: 5.3.2
       merge2: 1.4.1
       slash: 4.0.0
@@ -34300,7 +34039,7 @@ snapshots:
   globby@14.0.2:
     dependencies:
       '@sindresorhus/merge-streams': 2.3.0
-      fast-glob: 3.3.2
+      fast-glob: 3.3.3
       ignore: 5.3.2
       path-type: 5.0.0
       slash: 5.1.0
@@ -34352,7 +34091,7 @@ snapshots:
 
   gql.tada@1.8.10(graphql@16.10.0)(typescript@5.6.3):
     dependencies:
-      '@0no-co/graphql.web': 1.0.12(graphql@16.10.0)
+      '@0no-co/graphql.web': 1.0.13(graphql@16.10.0)
       '@0no-co/graphqlsp': 1.12.16(graphql@16.10.0)(typescript@5.6.3)
       '@gql.tada/cli-utils': 1.6.3(@0no-co/graphqlsp@1.12.16(graphql@16.10.0)(t
ypescript@5.6.3))(graphql@16
.10.0)(typescript@5.6.3)
                                   '@gql.tada/internal': 1.0.8(graphql@16.10.0)(
typescript@5.6.3)
@@ -34441,7 +34180,7 @@ snapshots:
 
   hard-rejection@2.1.0: {}
 
-  hardhat@2.22.17(bufferutil@4.0.9)(ts-node@10.9.2(@swc/core@1.10.4(@swc/helper
s@0.5.15))(@types/node@22.10
.4)(typescript@5.6.3))(typescript@5.6.3)(utf-8-validate@5.0.10):
                            +  hardhat@2.22.17(bufferutil@4.0.9)(ts-node@10.9.2(
@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@22.10
.5)(typescript@5.6.3))(typescript@5.6.3)(utf-8-validate@5.0.10):
                                 dependencies:
       '@ethersproject/abi': 5.7.0
       '@metamask/eth-sig-util': 4.0.1
@@ -34488,7 +34227,7 @@ snapshots:
       uuid: 8.3.2
       ws: 7.5.10(bufferutil@4.0.9)(utf-8-validate@5.0.10)
     optionalDependencies:
-      ts-node: 10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@22.10.
4)(typescript@5.6.3)
+      ts-node: 10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@22.10.
5)(typescript@5.6.3)
       typescript: 5.6.3
     transitivePeerDependencies:
       - bufferutil
@@ -34607,7 +34346,7 @@ snapshots:
       unist-util-visit: 2.0.3
       zwitch: 1.0.5
 
-  hast-util-to-estree@3.1.0:
+  hast-util-to-estree@3.1.1:
     dependencies:
       '@types/estree': 1.0.6
       '@types/estree-jsx': 1.0.5
@@ -34622,7 +34361,7 @@ snapshots:
       mdast-util-mdxjs-esm: 2.0.1
       property-information: 6.5.0
       space-separated-tokens: 2.0.2
-      style-to-object: 0.4.4
+      style-to-object: 1.0.8
       unist-util-position: 5.0.0
       zwitch: 2.0.4
     transitivePeerDependencies:
@@ -34816,7 +34555,7 @@ snapshots:
     dependencies:
       domelementtype: 2.3.0
       domhandler: 5.0.3
-      domutils: 3.2.1
+      domutils: 3.2.2
       entities: 4.5.0
 
   http-cache-semantics@4.1.1: {}
@@ -34859,7 +34598,7 @@ snapshots:
   http-proxy-agent@7.0.2:
     dependencies:
       agent-base: 7.1.3
-      debug: 4.4.0
+      debug: 4.4.0(supports-color@8.1.1)
     transitivePeerDependencies:
       - supports-color
 
@@ -34915,14 +34654,14 @@ snapshots:
   https-proxy-agent@5.0.1:
     dependencies:
       agent-base: 6.0.2
-      debug: 4.4.0
+      debug: 4.4.0(supports-color@8.1.1)
     transitivePeerDependencies:
       - supports-color
 
   https-proxy-agent@7.0.6:
     dependencies:
       agent-base: 7.1.3
-      debug: 4.4.0
+      debug: 4.4.0(supports-color@8.1.1)
     transitivePeerDependencies:
       - supports-color
 
@@ -35032,8 +34771,6 @@ snapshots:
     dependencies:
       source-map: 0.5.7
 
-  inline-style-parser@0.1.1: {}
-
   inline-style-parser@0.2.4: {}
 
   inquirer@8.2.6:
@@ -35578,16 +35315,16 @@ snapshots:
       - babel-plugin-macros
       - supports-color
 
-  jest-cli@29.7.0(@types/node@18.19.69)(ts-node@10.9.2(@swc/core@1.10.4(@swc/he
lpers@0.5.15))(@types/node@1
8.19.69)(typescript@5.6.3)):
                            +  jest-cli@29.7.0(@types/node@18.19.70)(ts-node@10.
9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@1
8.19.70)(typescript@5.6.3)):
                                 dependencies:
-      '@jest/core': 29.7.0(ts-node@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15)
)(@types/node@18.19.69)(type
script@5.6.3))
                            +      '@jest/core': 29.7.0(ts-node@10.9.2(@swc/core
@1.10.4(@swc/helpers@0.5.15))(@types/node@18.19.70)(type
script@5.6.3))
                                   '@jest/test-result': 29.7.0
       '@jest/types': 29.6.3
       chalk: 4.1.2
-      create-jest: 29.7.0(@types/node@18.19.69)(ts-node@10.9.2(@swc/core@1.10.4
(@swc/helpers@0.5.15))(@type
s/node@18.19.69)(typescript@5.6.3))
                            +      create-jest: 29.7.0(@types/node@18.19.70)(ts-
node@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@type
s/node@18.19.70)(typescript@5.6.3))
                                   exit: 0.1.2
       import-local: 3.2.0
-      jest-config: 29.7.0(@types/node@18.19.69)(ts-node@10.9.2(@swc/core@1.10.4
(@swc/helpers@0.5.15))(@type
s/node@18.19.69)(typescript@5.6.3))
                            +      jest-config: 29.7.0(@types/node@18.19.70)(ts-
node@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@type
s/node@18.19.70)(typescript@5.6.3))
                                   jest-util: 29.7.0
       jest-validate: 29.7.0
       yargs: 17.7.2
@@ -35616,16 +35353,16 @@ snapshots:
       - supports-color
       - ts-node
 
-  jest-cli@29.7.0(@types/node@22.10.4):
+  jest-cli@29.7.0(@types/node@22.10.5):
     dependencies:
       '@jest/core': 29.7.0(ts-node@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15)
)(@types/node@20.17.9)(types
cript@5.6.3))
                                   '@jest/test-result': 29.7.0
       '@jest/types': 29.6.3
       chalk: 4.1.2
-      create-jest: 29.7.0(@types/node@22.10.4)
+      create-jest: 29.7.0(@types/node@22.10.5)
       exit: 0.1.2
       import-local: 3.2.0
-      jest-config: 29.7.0(@types/node@22.10.4)
+      jest-config: 29.7.0(@types/node@22.10.5)
       jest-util: 29.7.0
       jest-validate: 29.7.0
       yargs: 17.7.2
@@ -35654,7 +35391,7 @@ snapshots:
       - supports-color
       - ts-node
 
-  jest-config@29.7.0(@types/node@18.19.69)(ts-node@10.9.2(@swc/core@1.10.4(@swc
/helpers@0.5.15))(@types/nod
e@18.19.69)(typescript@5.6.3)):
                            +  jest-config@29.7.0(@types/node@18.19.70)(ts-node@
10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/nod
e@18.19.70)(typescript@5.6.3)):
                                 dependencies:
       '@babel/core': 7.26.0
       '@jest/test-sequencer': 29.7.0
@@ -35679,13 +35416,13 @@ snapshots:
       slash: 3.0.0
       strip-json-comments: 3.1.1
     optionalDependencies:
-      '@types/node': 18.19.69
-      ts-node: 10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@18.19.
69)(typescript@5.6.3)
+      '@types/node': 18.19.70
+      ts-node: 10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@18.19.
70)(typescript@5.6.3)
     transitivePeerDependencies:
       - babel-plugin-macros
       - supports-color
 
-  jest-config@29.7.0(@types/node@20.17.9)(ts-node@10.9.2(@swc/core@1.10.4(@swc/
helpers@0.5.15))(@types/node
@18.19.69)(typescript@5.6.3)):
                            +  jest-config@29.7.0(@types/node@20.17.9)(ts-node@1
0.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node
@18.19.70)(typescript@5.6.3)):
                                 dependencies:
       '@babel/core': 7.26.0
       '@jest/test-sequencer': 29.7.0
@@ -35711,7 +35448,7 @@ snapshots:
       strip-json-comments: 3.1.1
     optionalDependencies:
       '@types/node': 20.17.9
-      ts-node: 10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@18.19.
69)(typescript@5.6.3)
+      ts-node: 10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@18.19.
70)(typescript@5.6.3)
     transitivePeerDependencies:
       - babel-plugin-macros
       - supports-color
@@ -35778,7 +35515,7 @@ snapshots:
       - babel-plugin-macros
       - supports-color
 
-  jest-config@29.7.0(@types/node@22.10.4):
+  jest-config@29.7.0(@types/node@22.10.5):
     dependencies:
       '@babel/core': 7.26.0
       '@jest/test-sequencer': 29.7.0
@@ -35803,7 +35540,7 @@ snapshots:
       slash: 3.0.0
       strip-json-comments: 3.1.1
     optionalDependencies:
-      '@types/node': 22.10.4
+      '@types/node': 22.10.5
     transitivePeerDependencies:
       - babel-plugin-macros
       - supports-color
@@ -36060,12 +35797,12 @@ snapshots:
       merge-stream: 2.0.0
       supports-color: 8.1.1
 
-  jest@29.7.0(@types/node@18.19.69)(ts-node@10.9.2(@swc/core@1.10.4(@swc/helper
s@0.5.15))(@types/node@18.19
.69)(typescript@5.6.3)):
                            +  jest@29.7.0(@types/node@18.19.70)(ts-node@10.9.2(
@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@18.19
.70)(typescript@5.6.3)):
                                 dependencies:
-      '@jest/core': 29.7.0(ts-node@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15)
)(@types/node@18.19.69)(type
script@5.6.3))
                            +      '@jest/core': 29.7.0(ts-node@10.9.2(@swc/core
@1.10.4(@swc/helpers@0.5.15))(@types/node@18.19.70)(type
script@5.6.3))
                                   '@jest/types': 29.6.3
       import-local: 3.2.0
-      jest-cli: 29.7.0(@types/node@18.19.69)(ts-node@10.9.2(@swc/core@1.10.4(@s
wc/helpers@0.5.15))(@types/n
ode@18.19.69)(typescript@5.6.3))
                            +      jest-cli: 29.7.0(@types/node@18.19.70)(ts-nod
e@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/n
ode@18.19.70)(typescript@5.6.3))
                                 transitivePeerDependencies:
       - '@types/node'
       - babel-plugin-macros
@@ -36084,12 +35821,12 @@ snapshots:
       - supports-color
       - ts-node
 
-  jest@29.7.0(@types/node@22.10.4):
+  jest@29.7.0(@types/node@22.10.5):
     dependencies:
       '@jest/core': 29.7.0(ts-node@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15)
)(@types/node@20.17.9)(types
cript@5.6.3))
                                   '@jest/types': 29.6.3
       import-local: 3.2.0
-      jest-cli: 29.7.0(@types/node@22.10.4)
+      jest-cli: 29.7.0(@types/node@22.10.5)
     transitivePeerDependencies:
       - '@types/node'
       - babel-plugin-macros
@@ -36172,7 +35909,7 @@ snapshots:
 
   jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-validate
@5.0.10):
     dependencies:
-      cssstyle: 4.1.0
+      cssstyle: 4.2.1
       data-urls: 5.0.0
       decimal.js: 10.4.3
       form-data: 4.0.1
@@ -36386,7 +36123,7 @@ snapshots:
       js-tiktoken: 1.0.15
       js-yaml: 4.1.0
       jsonpointer: 5.0.1
-      langsmith: 0.2.14(openai@4.73.0(encoding@0.1.13)(zod@3.23.8))
+      langsmith: 0.2.15(openai@4.73.0(encoding@0.1.13)(zod@3.23.8))
       openapi-types: 12.1.3
       p-retry: 4.6.2
       uuid: 10.0.0
@@ -36394,7 +36131,7 @@ snapshots:
       zod: 3.23.8
       zod-to-json-schema: 3.24.1(zod@3.23.8)
     optionalDependencies:
-      axios: 1.7.9
+      axios: 1.7.9(debug@4.4.0)
       handlebars: 4.7.8
     transitivePeerDependencies:
       - encoding
@@ -36408,7 +36145,7 @@ snapshots:
       vscode-languageserver-textdocument: 1.0.12
       vscode-uri: 3.0.8
 
-  langsmith@0.2.14(openai@4.73.0(encoding@0.1.13)(zod@3.23.8)):
+  langsmith@0.2.15(openai@4.73.0(encoding@0.1.13)(zod@3.23.8)):
     dependencies:
       '@types/uuid': 10.0.0
       commander: 10.0.1
@@ -36933,7 +36670,7 @@ snapshots:
     transitivePeerDependencies:
       - supports-color
 
-  mdast-util-find-and-replace@3.0.1:
+  mdast-util-find-and-replace@3.0.2:
     dependencies:
       '@types/mdast': 4.0.4
       escape-string-regexp: 5.0.0
@@ -36973,7 +36710,7 @@ snapshots:
       '@types/mdast': 4.0.4
       ccount: 2.0.1
       devlop: 1.1.0
-      mdast-util-find-and-replace: 3.0.1
+      mdast-util-find-and-replace: 3.0.2
       micromark-util-character: 2.1.1
 
   mdast-util-gfm-footnote@2.0.0:
@@ -37703,7 +37440,7 @@ snapshots:
 
   mnemonist@0.38.5:
     dependencies:
-      obliterator: 2.0.4
+      obliterator: 2.0.5
 
   mocha@10.8.2:
     dependencies:
@@ -38060,7 +37797,7 @@ snapshots:
       log-symbols: 7.0.0
       nanoid: 5.0.9
       node-addon-api: 8.3.0
-      octokit: 4.0.3
+      octokit: 4.1.0
       ora: 8.1.1
       pretty-ms: 9.2.0
       proper-lockfile: 4.1.2
@@ -38241,7 +37978,7 @@ snapshots:
       '@yarnpkg/lockfile': 1.1.0
       '@yarnpkg/parsers': 3.0.0-rc.46
       '@zkochan/js-yaml': 0.0.7
-      axios: 1.7.9
+      axios: 1.7.9(debug@4.4.0)
       chalk: 4.1.0
       cli-cursor: 3.1.0
       cli-spinners: 2.6.1
@@ -38317,22 +38054,22 @@ snapshots:
       has-symbols: 1.1.0
       object-keys: 1.1.1
 
-  obliterator@2.0.4: {}
+  obliterator@2.0.5: {}
 
   obuf@1.1.2: {}
 
-  octokit@4.0.3:
+  octokit@4.1.0:
     dependencies:
-      '@octokit/app': 15.1.1
-      '@octokit/core': 6.1.2
-      '@octokit/oauth-app': 7.1.4
-      '@octokit/plugin-paginate-graphql': 5.2.4(@octokit/core@6.1.2)
-      '@octokit/plugin-paginate-rest': 11.3.6(@octokit/core@6.1.2)
-      '@octokit/plugin-rest-endpoint-methods': 13.2.6(@octokit/core@6.1.2)
-      '@octokit/plugin-retry': 7.1.2(@octokit/core@6.1.2)
-      '@octokit/plugin-throttling': 9.3.2(@octokit/core@6.1.2)
+      '@octokit/app': 15.1.2
+      '@octokit/core': 6.1.3
+      '@octokit/oauth-app': 7.1.5
+      '@octokit/plugin-paginate-graphql': 5.2.4(@octokit/core@6.1.3)
+      '@octokit/plugin-paginate-rest': 11.4.0(@octokit/core@6.1.3)
+      '@octokit/plugin-rest-endpoint-methods': 13.3.0(@octokit/core@6.1.3)
+      '@octokit/plugin-retry': 7.1.3(@octokit/core@6.1.3)
+      '@octokit/plugin-throttling': 9.4.0(@octokit/core@6.1.3)
       '@octokit/request-error': 6.1.6
-      '@octokit/types': 13.6.2
+      '@octokit/types': 13.7.0
 
   ofetch@1.4.1:
     dependencies:
@@ -38424,7 +38161,7 @@ snapshots:
 
   openai@4.73.0(encoding@0.1.13)(zod@3.23.8):
     dependencies:
-      '@types/node': 18.19.69
+      '@types/node': 18.19.70
       '@types/node-fetch': 2.6.12
       abort-controller: 3.0.0
       agentkeepalive: 4.6.0
@@ -38436,9 +38173,9 @@ snapshots:
     transitivePeerDependencies:
       - encoding
 
-  openai@4.77.0(encoding@0.1.13)(zod@3.23.8):
+  openai@4.77.4(encoding@0.1.13)(zod@3.23.8):
     dependencies:
-      '@types/node': 18.19.69
+      '@types/node': 18.19.70
       '@types/node-fetch': 2.6.12
       abort-controller: 3.0.0
       agentkeepalive: 4.6.0
@@ -39090,10 +38827,10 @@ snapshots:
       postcss: 8.4.49
       postcss-selector-parser: 7.0.0
 
-  postcss-calc@10.0.2(postcss@8.4.49):
+  postcss-calc@10.1.0(postcss@8.4.49):
     dependencies:
       postcss: 8.4.49
-      postcss-selector-parser: 6.1.2
+      postcss-selector-parser: 7.0.0
       postcss-value-parser: 4.2.0
 
   postcss-calc@9.0.1(postcss@8.4.49):
@@ -39107,7 +38844,7 @@ snapshots:
       postcss: 8.4.49
       postcss-value-parser: 4.2.0
 
-  postcss-cli@11.0.0(jiti@2.4.2)(postcss@8.4.49)(tsx@4.19.2):
+  postcss-cli@11.0.0(jiti@2.4.2)(postcss@8.4.49):
     dependencies:
       chokidar: 3.6.0
       dependency-graph: 0.11.0
@@ -39116,7 +38853,7 @@ snapshots:
       globby: 14.0.2
       picocolors: 1.1.1
       postcss: 8.4.49
-      postcss-load-config: 5.1.0(jiti@2.4.2)(postcss@8.4.49)(tsx@4.19.2)
+      postcss-load-config: 5.1.0(jiti@2.4.2)(postcss@8.4.49)
       postcss-reporter: 7.1.0(postcss@8.4.49)
       pretty-hrtime: 1.0.3
       read-cache: 1.0.0
@@ -39149,7 +38886,7 @@ snapshots:
 
   postcss-colormin@6.1.0(postcss@8.4.49):
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       caniuse-api: 3.0.0
       colord: 2.9.3
       postcss: 8.4.49
@@ -39157,7 +38894,7 @@ snapshots:
 
   postcss-colormin@7.0.2(postcss@8.4.49):
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       caniuse-api: 3.0.0
       colord: 2.9.3
       postcss: 8.4.49
@@ -39165,13 +38902,13 @@ snapshots:
 
   postcss-convert-values@6.1.0(postcss@8.4.49):
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       postcss: 8.4.49
       postcss-value-parser: 4.2.0
 
   postcss-convert-values@7.0.4(postcss@8.4.49):
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       postcss: 8.4.49
       postcss-value-parser: 4.2.0
 
@@ -39303,22 +39040,20 @@ snapshots:
       postcss: 8.4.49
       ts-node: 10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@22.8.4
)(typescript@5.6.3)
 
-  postcss-load-config@5.1.0(jiti@2.4.2)(postcss@8.4.49)(tsx@4.19.2):
+  postcss-load-config@5.1.0(jiti@2.4.2)(postcss@8.4.49):
     dependencies:
       lilconfig: 3.1.3
       yaml: 2.7.0
     optionalDependencies:
       jiti: 2.4.2
       postcss: 8.4.49
-      tsx: 4.19.2
 
-  postcss-load-config@6.0.1(jiti@2.4.2)(postcss@8.4.49)(tsx@4.19.2)(yaml@2.7.0)
:
+  postcss-load-config@6.0.1(jiti@2.4.2)(postcss@8.4.49)(yaml@2.7.0):
     dependencies:
       lilconfig: 3.1.3
     optionalDependencies:
       jiti: 2.4.2
       postcss: 8.4.49
-      tsx: 4.19.2
       yaml: 2.7.0
 
   postcss-loader@7.3.4(postcss@8.4.49)(typescript@5.6.3)(webpack@5.97.1(@swc/co
re@1.10.4(@swc/helpers@0.5.1
5))):
                            @@ -39356,7 +39091,7 @@ snapshots:
 
   postcss-merge-rules@6.1.1(postcss@8.4.49):
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       caniuse-api: 3.0.0
       cssnano-utils: 4.0.2(postcss@8.4.49)
       postcss: 8.4.49
@@ -39364,7 +39099,7 @@ snapshots:
 
   postcss-merge-rules@7.0.4(postcss@8.4.49):
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       caniuse-api: 3.0.0
       cssnano-utils: 5.0.0(postcss@8.4.49)
       postcss: 8.4.49
@@ -39396,14 +39131,14 @@ snapshots:
 
   postcss-minify-params@6.1.0(postcss@8.4.49):
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       cssnano-utils: 4.0.2(postcss@8.4.49)
       postcss: 8.4.49
       postcss-value-parser: 4.2.0
 
   postcss-minify-params@7.0.2(postcss@8.4.49):
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       cssnano-utils: 5.0.0(postcss@8.4.49)
       postcss: 8.4.49
       postcss-value-parser: 4.2.0
@@ -39512,13 +39247,13 @@ snapshots:
 
   postcss-normalize-unicode@6.1.0(postcss@8.4.49):
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       postcss: 8.4.49
       postcss-value-parser: 4.2.0
 
   postcss-normalize-unicode@7.0.2(postcss@8.4.49):
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       postcss: 8.4.49
       postcss-value-parser: 4.2.0
 
@@ -39607,7 +39342,7 @@ snapshots:
       '@csstools/postcss-trigonometric-functions': 4.0.6(postcss@8.4.49)
       '@csstools/postcss-unset-value': 4.0.0(postcss@8.4.49)
       autoprefixer: 10.4.20(postcss@8.4.49)
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       css-blank-pseudo: 7.0.1(postcss@8.4.49)
       css-has-pseudo: 7.0.2(postcss@8.4.49)
       css-prefers-color-scheme: 10.0.0(postcss@8.4.49)
@@ -39651,13 +39386,13 @@ snapshots:
 
   postcss-reduce-initial@6.1.0(postcss@8.4.49):
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       caniuse-api: 3.0.0
       postcss: 8.4.49
 
   postcss-reduce-initial@7.0.2(postcss@8.4.49):
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       caniuse-api: 3.0.0
       postcss: 8.4.49
 
@@ -39950,10 +39685,10 @@ snapshots:
       end-of-stream: 1.4.4
       once: 1.4.0
 
-  pumpdotfun-sdk@1.3.2(bufferutil@4.0.9)(encoding@0.1.13)(fastestsmallesttexten
coderdecoder@1.0.22)(rollup@
4.29.1)(typescript@5.6.3)(utf-8-validate@5.0.10):
                            +  pumpdotfun-sdk@1.3.2(bufferutil@4.0.9)(encoding@0
.1.13)(fastestsmallesttextencoderdecoder@1.0.22)(rollup@
4.30.1)(typescript@5.6.3)(utf-8-validate@5.0.10):
                                 dependencies:
       '@coral-xyz/anchor': 0.30.1(bufferutil@4.0.9)(encoding@0.1.13)(utf-8-vali
date@5.0.10)
-      '@rollup/plugin-json': 6.1.0(rollup@4.29.1)
+      '@rollup/plugin-json': 6.1.0(rollup@4.30.1)
       '@solana/spl-token': 0.4.6(@solana/web3.js@1.95.8(bufferutil@4.0.9)(encod
ing@0.1.13)(utf-8-validate@5
.0.10))(bufferutil@4.0.9)(encoding@0.1.13)(fastestsmallesttextencoderdecoder@1.0
.22)(typescript@5.6.3)(utf-8-validate@5.0.10)
                                                               '@solana/web3.js'
: 1.95.8(bufferutil@4.0.9)(encoding@0.1.13)(utf-8-validate@5.0.10)
     transitivePeerDependencies:
@@ -40139,7 +39874,7 @@ snapshots:
     dependencies:
       '@babel/code-frame': 7.26.2
       address: 1.2.2
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       chalk: 4.1.2
       cross-spawn: 7.0.6
       detect-port-alt: 1.1.6
@@ -40544,7 +40279,7 @@ snapshots:
     dependencies:
       '@types/estree': 1.0.6
       '@types/hast': 3.0.4
-      hast-util-to-estree: 3.1.0
+      hast-util-to-estree: 3.1.1
     transitivePeerDependencies:
       - supports-color
 
@@ -40563,7 +40298,7 @@ snapshots:
     dependencies:
       '@types/mdast': 4.0.4
       emoticon: 4.1.0
-      mdast-util-find-and-replace: 3.0.1
+      mdast-util-find-and-replace: 3.0.2
       node-emoji: 2.2.0
       unified: 11.0.5
 
@@ -40684,9 +40419,6 @@ snapshots:
 
   resolve-pathname@3.0.0: {}
 
-  resolve-pkg-maps@1.0.0:
-    optional: true
-
   resolve.exports@2.0.3: {}
 
   resolve@1.17.0:
@@ -40771,29 +40503,29 @@ snapshots:
     optionalDependencies:
       fsevents: 2.3.3
 
-  rollup@4.29.1:
+  rollup@4.30.1:
     dependencies:
       '@types/estree': 1.0.6
     optionalDependencies:
-      '@rollup/rollup-android-arm-eabi': 4.29.1
-      '@rollup/rollup-android-arm64': 4.29.1
-      '@rollup/rollup-darwin-arm64': 4.29.1
-      '@rollup/rollup-darwin-x64': 4.29.1
-      '@rollup/rollup-freebsd-arm64': 4.29.1
-      '@rollup/rollup-freebsd-x64': 4.29.1
-      '@rollup/rollup-linux-arm-gnueabihf': 4.29.1
-      '@rollup/rollup-linux-arm-musleabihf': 4.29.1
-      '@rollup/rollup-linux-arm64-gnu': 4.29.1
-      '@rollup/rollup-linux-arm64-musl': 4.29.1
-      '@rollup/rollup-linux-loongarch64-gnu': 4.29.1
-      '@rollup/rollup-linux-powerpc64le-gnu': 4.29.1
-      '@rollup/rollup-linux-riscv64-gnu': 4.29.1
-      '@rollup/rollup-linux-s390x-gnu': 4.29.1
-      '@rollup/rollup-linux-x64-gnu': 4.29.1
-      '@rollup/rollup-linux-x64-musl': 4.29.1
-      '@rollup/rollup-win32-arm64-msvc': 4.29.1
-      '@rollup/rollup-win32-ia32-msvc': 4.29.1
-      '@rollup/rollup-win32-x64-msvc': 4.29.1
+      '@rollup/rollup-android-arm-eabi': 4.30.1
+      '@rollup/rollup-android-arm64': 4.30.1
+      '@rollup/rollup-darwin-arm64': 4.30.1
+      '@rollup/rollup-darwin-x64': 4.30.1
+      '@rollup/rollup-freebsd-arm64': 4.30.1
+      '@rollup/rollup-freebsd-x64': 4.30.1
+      '@rollup/rollup-linux-arm-gnueabihf': 4.30.1
+      '@rollup/rollup-linux-arm-musleabihf': 4.30.1
+      '@rollup/rollup-linux-arm64-gnu': 4.30.1
+      '@rollup/rollup-linux-arm64-musl': 4.30.1
+      '@rollup/rollup-linux-loongarch64-gnu': 4.30.1
+      '@rollup/rollup-linux-powerpc64le-gnu': 4.30.1
+      '@rollup/rollup-linux-riscv64-gnu': 4.30.1
+      '@rollup/rollup-linux-s390x-gnu': 4.30.1
+      '@rollup/rollup-linux-x64-gnu': 4.30.1
+      '@rollup/rollup-linux-x64-musl': 4.30.1
+      '@rollup/rollup-win32-arm64-msvc': 4.30.1
+      '@rollup/rollup-win32-ia32-msvc': 4.30.1
+      '@rollup/rollup-win32-x64-msvc': 4.30.1
       fsevents: 2.3.3
 
   roughjs@4.6.6:
@@ -40818,6 +40550,8 @@ snapshots:
 
   rrweb-cssom@0.7.1: {}
 
+  rrweb-cssom@0.8.0: {}
+
   rtl-detect@1.1.2: {}
 
   rtlcss@4.3.0:
@@ -41153,15 +40887,15 @@ snapshots:
       interpret: 1.4.0
       rechoir: 0.6.2
 
-  shiki@1.25.1:
+  shiki@1.26.1:
     dependencies:
-      '@shikijs/core': 1.25.1
-      '@shikijs/engine-javascript': 1.25.1
-      '@shikijs/engine-oniguruma': 1.25.1
-      '@shikijs/langs': 1.25.1
-      '@shikijs/themes': 1.25.1
-      '@shikijs/types': 1.25.1
-      '@shikijs/vscode-textmate': 9.3.1
+      '@shikijs/core': 1.26.1
+      '@shikijs/engine-javascript': 1.26.1
+      '@shikijs/engine-oniguruma': 1.26.1
+      '@shikijs/langs': 1.26.1
+      '@shikijs/themes': 1.26.1
+      '@shikijs/types': 1.26.1
+      '@shikijs/vscode-textmate': 10.0.1
       '@types/hast': 3.0.4
 
   shimmer@1.2.1: {}
@@ -41305,7 +41039,7 @@ snapshots:
   socks-proxy-agent@8.0.5:
     dependencies:
       agent-base: 7.1.3
-      debug: 4.4.0
+      debug: 4.4.0(supports-color@8.1.1)
       socks: 2.8.3
     transitivePeerDependencies:
       - supports-color
@@ -41466,9 +41200,9 @@ snapshots:
     dependencies:
       minipass: 7.1.2
 
-  sswr@2.1.0(svelte@5.16.1):
+  sswr@2.1.0(svelte@5.17.1):
     dependencies:
-      svelte: 5.16.1
+      svelte: 5.17.1
       swrev: 4.0.0
 
   stack-utils@2.0.6:
@@ -41554,7 +41288,7 @@ snapshots:
       queue-tick: 1.0.1
       text-decoder: 1.2.3
     optionalDependencies:
-      bare-events: 2.5.0
+      bare-events: 2.5.3
 
   strict-uri-encode@2.0.0: {}
 
@@ -41673,23 +41407,19 @@ snapshots:
       minimist: 1.2.8
       through: 2.3.8
 
-  style-to-object@0.4.4:
-    dependencies:
-      inline-style-parser: 0.1.1
-
   style-to-object@1.0.8:
     dependencies:
       inline-style-parser: 0.2.4
 
   stylehacks@6.1.1(postcss@8.4.49):
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       postcss: 8.4.49
       postcss-selector-parser: 6.1.2
 
   stylehacks@7.0.4(postcss@8.4.49):
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       postcss: 8.4.49
       postcss-selector-parser: 6.1.2
 
@@ -41736,7 +41466,7 @@ snapshots:
 
   supports-preserve-symlinks-flag@1.0.0: {}
 
-  svelte@5.16.1:
+  svelte@5.17.1:
     dependencies:
       '@ampproject/remapping': 2.3.0
       '@jridgewell/sourcemap-codec': 1.5.0
@@ -41746,7 +41476,7 @@ snapshots:
       aria-query: 5.3.2
       axobject-query: 4.1.0
       clsx: 2.1.1
-      esm-env: 1.2.1
+      esm-env: 1.2.2
       esrap: 1.3.2
       is-reference: 3.0.3
       locate-character: 3.0.0
@@ -41800,7 +41530,7 @@ snapshots:
       chokidar: 3.6.0
       didyoumean: 1.2.2
       dlv: 1.1.3
-      fast-glob: 3.3.2
+      fast-glob: 3.3.3
       glob-parent: 6.0.2
       is-glob: 4.0.3
       jiti: 1.21.7
@@ -42002,15 +41732,15 @@ snapshots:
 
   tinyspy@3.0.2: {}
 
-  tldts-core@6.1.70: {}
+  tldts-core@6.1.71: {}
 
-  tldts-experimental@6.1.70:
+  tldts-experimental@6.1.71:
     dependencies:
-      tldts-core: 6.1.70
+      tldts-core: 6.1.71
 
-  tldts@6.1.70:
+  tldts@6.1.71:
     dependencies:
-      tldts-core: 6.1.70
+      tldts-core: 6.1.71
 
   tmp@0.0.33:
     dependencies:
@@ -42037,7 +41767,7 @@ snapshots:
 
   together-ai@0.7.0(encoding@0.1.13):
     dependencies:
-      '@types/node': 18.19.69
+      '@types/node': 18.19.70
       '@types/node-fetch': 2.6.12
       abort-controller: 3.0.0
       agentkeepalive: 4.6.0
@@ -42073,7 +41803,7 @@ snapshots:
 
   tough-cookie@5.0.0:
     dependencies:
-      tldts: 6.1.70
+      tldts: 6.1.71
 
   tr46@0.0.3: {}
 
@@ -42133,12 +41863,12 @@ snapshots:
       babel-jest: 29.7.0(@babel/core@7.26.0)
       esbuild: 0.24.2
 
-  ts-jest@29.2.5(@babel/core@7.26.0)(@jest/transform@29.7.0)(@jest/types@29.6.3
)(babel-jest@29.7.0(@babel/c
ore@7.26.0))(jest@29.7.0(@types/node@18.19.69)(ts-node@10.9.2(@swc/core@1.10.4(@
swc/helpers@0.5.15))(@types/node@18.19.69)(typescript@5.6.3)))(typescript@5.6.3)
:                                                       +  ts-jest@29.2.5(@babel
/core@7.26.0)(@jest/transform@29.7.0)(@jest/types@29.6.3)(babel-jest@29.7.0(@bab
el/c
ore@7.26.0))(jest@29.7.0(@types/node@18.19.70)(ts-node@10.9.2(@swc/core@1.10.4(@
swc/helpers@0.5.15))(@types/node@18.19.70)(typescript@5.6.3)))(typescript@5.6.3)
:                                                            dependencies:
       bs-logger: 0.2.6
       ejs: 3.1.10
       fast-json-stable-stringify: 2.1.0
-      jest: 29.7.0(@types/node@18.19.69)(ts-node@10.9.2(@swc/core@1.10.4(@swc/h
elpers@0.5.15))(@types/node@
18.19.69)(typescript@5.6.3))
                            +      jest: 29.7.0(@types/node@18.19.70)(ts-node@10
.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@
18.19.70)(typescript@5.6.3))
                                   jest-util: 29.7.0
       json5: 2.2.3
       lodash.memoize: 4.1.2
@@ -42173,14 +41903,14 @@ snapshots:
 
   ts-mixer@6.0.4: {}
 
-  ts-node@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@18.19.69)(t
ypescript@5.6.3):
+  ts-node@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@18.19.70)(t
ypescript@5.6.3):
     dependencies:
       '@cspotcode/source-map-support': 0.8.1
       '@tsconfig/node10': 1.0.11
       '@tsconfig/node12': 1.0.11
       '@tsconfig/node14': 1.0.3
       '@tsconfig/node16': 1.0.4
-      '@types/node': 18.19.69
+      '@types/node': 18.19.70
       acorn: 8.14.0
       acorn-walk: 8.3.4
       arg: 4.1.3
@@ -42213,14 +41943,14 @@ snapshots:
     optionalDependencies:
       '@swc/core': 1.10.4(@swc/helpers@0.5.15)
 
-  ts-node@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@22.10.4)(ty
pescript@5.6.3):
+  ts-node@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@22.10.5)(ty
pescript@5.6.3):
     dependencies:
       '@cspotcode/source-map-support': 0.8.1
       '@tsconfig/node10': 1.0.11
       '@tsconfig/node12': 1.0.11
       '@tsconfig/node14': 1.0.3
       '@tsconfig/node16': 1.0.4
-      '@types/node': 22.10.4
+      '@types/node': 22.10.5
       acorn: 8.14.0
       acorn-walk: 8.3.4
       arg: 4.1.3
@@ -42274,7 +42004,7 @@ snapshots:
 
   tsscmp@1.0.6: {}
 
-  tsup@8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))(jiti@2.4.2)(postcss@8.4.49)
(tsx@4.19.2)(typescript@5.6.
3)(yaml@2.7.0):
                            +  tsup@8.3.5(@swc/core@1.10.4(@swc/helpers@0.5.15))
(jiti@2.4.2)(postcss@8.4.49)(typescript@5.6.3)(yaml@2.7.
0):
                                 dependencies:
       bundle-require: 5.1.0(esbuild@0.24.2)
       cac: 6.7.14
@@ -42284,9 +42014,9 @@ snapshots:
       esbuild: 0.24.2
       joycon: 3.1.1
       picocolors: 1.1.1
-      postcss-load-config: 6.0.1(jiti@2.4.2)(postcss@8.4.49)(tsx@4.19.2)(yaml@2
.7.0)
+      postcss-load-config: 6.0.1(jiti@2.4.2)(postcss@8.4.49)(yaml@2.7.0)
       resolve-from: 5.0.0
-      rollup: 4.29.1
+      rollup: 4.30.1
       source-map: 0.8.0-beta.0
       sucrase: 3.35.0
       tinyexec: 0.3.2
@@ -42302,20 +42032,12 @@ snapshots:
       - tsx
       - yaml
 
-  tsx@4.19.2:
-    dependencies:
-      esbuild: 0.23.1
-      get-tsconfig: 4.8.1
-    optionalDependencies:
-      fsevents: 2.3.3
-    optional: true
-
   tty-browserify@0.0.1: {}
 
   tuf-js@2.2.1:
     dependencies:
       '@tufjs/models': 2.0.1
-      debug: 4.4.0
+      debug: 4.4.0(supports-color@8.1.1)
       make-fetch-happen: 13.0.1
     transitivePeerDependencies:
       - supports-color
@@ -42392,7 +42114,7 @@ snapshots:
 
   type-fest@2.19.0: {}
 
-  type-fest@4.31.0: {}
+  type-fest@4.32.0: {}
 
   type-is@1.6.18:
     dependencies:
@@ -42462,7 +42184,7 @@ snapshots:
       lunr: 2.3.9
       markdown-it: 14.1.0
       minimatch: 9.0.5
-      shiki: 1.25.1
+      shiki: 1.26.1
       typescript: 5.6.3
       yaml: 2.7.0
 
@@ -42739,9 +42461,9 @@ snapshots:
 
   upath@2.0.1: {}
 
-  update-browserslist-db@1.1.1(browserslist@4.24.3):
+  update-browserslist-db@1.1.2(browserslist@4.24.4):
     dependencies:
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       escalade: 3.2.0
       picocolors: 1.1.1
 
@@ -42976,12 +42698,12 @@ snapshots:
       - utf-8-validate
       - zod
 
-  vite-node@2.1.4(@types/node@22.10.4)(terser@5.37.0):
+  vite-node@2.1.4(@types/node@22.10.5)(terser@5.37.0):
     dependencies:
       cac: 6.7.14
       debug: 4.4.0(supports-color@8.1.1)
       pathe: 1.1.2
-      vite: 5.4.11(@types/node@22.10.4)(terser@5.37.0)
+      vite: 5.4.11(@types/node@22.10.5)(terser@5.37.0)
     transitivePeerDependencies:
       - '@types/node'
       - less
@@ -42993,13 +42715,13 @@ snapshots:
       - supports-color
       - terser
 
-  vite-node@2.1.5(@types/node@22.10.4)(terser@5.37.0):
+  vite-node@2.1.5(@types/node@22.10.5)(terser@5.37.0):
     dependencies:
       cac: 6.7.14
-      debug: 4.4.0
+      debug: 4.4.0(supports-color@8.1.1)
       es-module-lexer: 1.6.0
       pathe: 1.1.2
-      vite: 5.4.11(@types/node@22.10.4)(terser@5.37.0)
+      vite: 5.4.11(@types/node@22.10.5)(terser@5.37.0)
     transitivePeerDependencies:
       - '@types/node'
       - less
@@ -43029,9 +42751,9 @@ snapshots:
       - supports-color
       - terser
 
-  vite-plugin-top-level-await@1.4.4(@swc/helpers@0.5.15)(rollup@4.29.1)(vite@cl
ient+@tanstack+router-plugin
+vite):
                            +  vite-plugin-top-level-await@1.4.4(@swc/helpers@0.
5.15)(rollup@4.30.1)(vite@client+@tanstack+router-plugin
+vite):
                                 dependencies:
-      '@rollup/plugin-virtual': 3.0.2(rollup@4.29.1)
+      '@rollup/plugin-virtual': 3.0.2(rollup@4.30.1)
       '@swc/core': 1.10.4(@swc/helpers@0.5.15)
       uuid: 10.0.0
       vite: link:client/@tanstack/router-plugin/vite
@@ -43043,13 +42765,13 @@ snapshots:
     dependencies:
       vite: link:client/@tanstack/router-plugin/vite
 
-  vite@5.4.11(@types/node@22.10.4)(terser@5.37.0):
+  vite@5.4.11(@types/node@22.10.5)(terser@5.37.0):
     dependencies:
       esbuild: 0.21.5
       postcss: 8.4.49
-      rollup: 4.29.1
+      rollup: 4.30.1
     optionalDependencies:
-      '@types/node': 22.10.4
+      '@types/node': 22.10.5
       fsevents: 2.3.3
       terser: 5.37.0
 
@@ -43057,16 +42779,16 @@ snapshots:
     dependencies:
       esbuild: 0.21.5
       postcss: 8.4.49
-      rollup: 4.29.1
+      rollup: 4.30.1
     optionalDependencies:
       '@types/node': 22.8.4
       fsevents: 2.3.3
       terser: 5.37.0
 
-  vitest@2.1.4(@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11.
2(encoding@0.1.13))(utf-8-va
lidate@5.0.10))(terser@5.37.0):
                            +  vitest@2.1.4(@types/node@22.10.5)(jsdom@25.0.1(bu
fferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-va
lidate@5.0.10))(terser@5.37.0):
                                 dependencies:
       '@vitest/expect': 2.1.4
-      '@vitest/mocker': 2.1.4(vite@5.4.11(@types/node@22.10.4)(terser@5.37.0))
+      '@vitest/mocker': 2.1.4(vite@5.4.11(@types/node@22.10.5)(terser@5.37.0))
       '@vitest/pretty-format': 2.1.8
       '@vitest/runner': 2.1.4
       '@vitest/snapshot': 2.1.4
@@ -43082,11 +42804,11 @@ snapshots:
       tinyexec: 0.3.2
       tinypool: 1.0.2
       tinyrainbow: 1.2.0
-      vite: 5.4.11(@types/node@22.10.4)(terser@5.37.0)
-      vite-node: 2.1.4(@types/node@22.10.4)(terser@5.37.0)
+      vite: 5.4.11(@types/node@22.10.5)(terser@5.37.0)
+      vite-node: 2.1.4(@types/node@22.10.5)(terser@5.37.0)
       why-is-node-running: 2.3.0
     optionalDependencies:
-      '@types/node': 22.10.4
+      '@types/node': 22.10.5
       jsdom: 25.0.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-val
idate@5.0.10)
     transitivePeerDependencies:
       - less
@@ -43099,17 +42821,17 @@ snapshots:
       - supports-color
       - terser
 
-  vitest@2.1.5(@types/node@22.10.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11.
2(encoding@0.1.13))(utf-8-va
lidate@5.0.10))(terser@5.37.0):
                            +  vitest@2.1.5(@types/node@22.10.5)(jsdom@25.0.1(bu
fferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-va
lidate@5.0.10))(terser@5.37.0):
                                 dependencies:
       '@vitest/expect': 2.1.5
-      '@vitest/mocker': 2.1.5(vite@5.4.11(@types/node@22.10.4)(terser@5.37.0))
+      '@vitest/mocker': 2.1.5(vite@5.4.11(@types/node@22.10.5)(terser@5.37.0))
       '@vitest/pretty-format': 2.1.8
       '@vitest/runner': 2.1.5
       '@vitest/snapshot': 2.1.5
       '@vitest/spy': 2.1.5
       '@vitest/utils': 2.1.5
       chai: 5.1.2
-      debug: 4.4.0
+      debug: 4.4.0(supports-color@8.1.1)
       expect-type: 1.1.0
       magic-string: 0.30.17
       pathe: 1.1.2
@@ -43118,11 +42840,11 @@ snapshots:
       tinyexec: 0.3.2
       tinypool: 1.0.2
       tinyrainbow: 1.2.0
-      vite: 5.4.11(@types/node@22.10.4)(terser@5.37.0)
-      vite-node: 2.1.5(@types/node@22.10.4)(terser@5.37.0)
+      vite: 5.4.11(@types/node@22.10.5)(terser@5.37.0)
+      vite-node: 2.1.5(@types/node@22.10.5)(terser@5.37.0)
       why-is-node-running: 2.3.0
     optionalDependencies:
-      '@types/node': 22.10.4
+      '@types/node': 22.10.5
       jsdom: 25.0.1(bufferutil@4.0.9)(canvas@2.11.2(encoding@0.1.13))(utf-8-val
idate@5.0.10)
     transitivePeerDependencies:
       - less
@@ -43138,7 +42860,7 @@ snapshots:
   vitest@2.1.5(@types/node@22.8.4)(jsdom@25.0.1(bufferutil@4.0.9)(canvas@2.11.2
(encoding@0.1.13))(utf-8-val
idate@5.0.10))(terser@5.37.0):
                                 dependencies:
       '@vitest/expect': 2.1.5
-      '@vitest/mocker': 2.1.5(vite@5.4.11(@types/node@22.10.4)(terser@5.37.0))
+      '@vitest/mocker': 2.1.5(vite@5.4.11(@types/node@22.10.5)(terser@5.37.0))
       '@vitest/pretty-format': 2.1.8
       '@vitest/runner': 2.1.5
       '@vitest/snapshot': 2.1.5
@@ -43386,10 +43108,10 @@ snapshots:
       - encoding
       - utf-8-validate
 
-  web3-plugin-zksync@1.0.8(bufferutil@4.0.9)(ts-node@10.9.2(@swc/core@1.10.4(@s
wc/helpers@0.5.15))(@types/n
ode@22.10.4)(typescript@5.6.3))(typescript@5.6.3)(utf-8-validate@5.0.10)(web3@4.
16.0(bufferutil@4.0.9)(encoding@0.1.13)(typescript@5.6.3)(utf-8-validate@5.0.10)
(zod@3.23.8)):                                          +  web3-plugin-zksync@1.
0.8(bufferutil@4.0.9)(ts-node@10.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@typ
es/n
ode@22.10.5)(typescript@5.6.3))(typescript@5.6.3)(utf-8-validate@5.0.10)(web3@4.
16.0(bufferutil@4.0.9)(encoding@0.1.13)(typescript@5.6.3)(utf-8-validate@5.0.10)
(zod@3.23.8)):                                               dependencies:
       ethereum-cryptography: 2.2.1
-      hardhat: 2.22.17(bufferutil@4.0.9)(ts-node@10.9.2(@swc/core@1.10.4(@swc/h
elpers@0.5.15))(@types/node@
22.10.4)(typescript@5.6.3))(typescript@5.6.3)(utf-8-validate@5.0.10)
                            +      hardhat: 2.22.17(bufferutil@4.0.9)(ts-node@10
.9.2(@swc/core@1.10.4(@swc/helpers@0.5.15))(@types/node@
22.10.5)(typescript@5.6.3))(typescript@5.6.3)(utf-8-validate@5.0.10)
                                   web3: 4.16.0(bufferutil@4.0.9)(encoding@0.1.1
3)(typescript@5.6.3)(utf-8-validate@5.0.10)(zod@3.23.8)
     transitivePeerDependencies:
       - bufferutil
@@ -43602,7 +43324,7 @@ snapshots:
       '@webassemblyjs/wasm-edit': 1.14.1
       '@webassemblyjs/wasm-parser': 1.14.1
       acorn: 8.14.0
-      browserslist: 4.24.3
+      browserslist: 4.24.4
       chrome-trace-event: 1.0.4
       enhanced-resolve: 5.18.0
       es-module-lexer: 1.6.0
diff --git a/scripts/update-memories.ts b/scripts/update-memories.ts
index ec786d517..3c3412495 100644
--- a/scripts/update-memories.ts
+++ b/scripts/update-memories.ts
@@ -81,42 +81,6 @@ settings.MEDIUM_OPENAI_MODEL = "gpt-4";
 settings.LARGE_OPENAI_MODEL = "gpt-4";
 
 async function main() {
-  // Set OpenAI embedding configuration and recreate memories table
-  await pool.query("SET app.use_openai_embedding = 'true'");
-  await pool.query("DROP TABLE IF EXISTS memories CASCADE");
-  await pool.query(`
-    DO $$
-    DECLARE
-      vector_dim INTEGER;
-    BEGIN
-      vector_dim := get_embedding_dimension();
-      EXECUTE format('
-        CREATE TABLE memories (
-          "id" UUID PRIMARY KEY,
-          "type" TEXT NOT NULL,
-          "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
-          "content" JSONB NOT NULL,
-          "embedding" vector(%s),
-          "userId" UUID REFERENCES accounts("id"),
-          "agentId" UUID REFERENCES accounts("id"),
-          "roomId" UUID REFERENCES rooms("id"),
-          "unique" BOOLEAN DEFAULT true NOT NULL,
-          CONSTRAINT fk_room FOREIGN KEY ("roomId") REFERENCES rooms("id") ON D
ELETE CASCADE,
-          CONSTRAINT fk_user FOREIGN KEY ("userId") REFERENCES accounts("id") O
N DELETE CASCADE,
-          CONSTRAINT fk_agent FOREIGN KEY ("agentId") REFERENCES accounts("id")
 ON DELETE CASCADE
-        )', vector_dim);
-    END $$;
-  `);
-  await pool.query('CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memori
es USING hnsw ("embedding" v
ector_cosine_ops)');
                            -  await pool.query('CREATE INDEX IF NOT EXISTS idx_
memories_type_room ON memories("type", "roomId")');
-
-  // Create documents room if it doesn't exist
-  const documentsRoomId = stringToUuid('documents') as UUID;
-  const { rows: existingRoom } = await pool.query('SELECT id FROM rooms WHERE i
d = $1', [documentsRoomId]);
-  if (existingRoom.length === 0) {
-    await pool.query('INSERT INTO rooms (id) VALUES ($1)', [documentsRoomId]);
-  }
-
   const agentId = await getAgentId();
   console.log('Using agent ID:', agentId);
 
@@ -157,18 +121,7 @@ async function main() {
   })
 
   // Create Supabase client
-  const supabase = createClient(secrets.SUPABASE_URL, secrets.SUPABASE_SERVICE_
KEY, {
-    auth: {
-      autoRefreshToken: false,
-      persistSession: false
-    },
-    global: {
-      headers: {
-        'Authorization': `Bearer ${secrets.SUPABASE_SERVICE_KEY}`,
-        'apikey': secrets.SUPABASE_SERVICE_KEY
-      }
-    }
-  });
+  const supabase = createClient(secrets.SUPABASE_URL, secrets.SUPABASE_SERVICE_
KEY);
 
   // List files in the Supabase storage bucket
   try {
@@ -187,8 +140,16 @@ async function main() {
     }
 
     // Process each file
+    let processedFiles = [];
     for (const file of files) {
       console.log('Processing file:', file.name);
+
+      // Check if file was already processed
+      if (await isProcessed(file.name)) {
+        console.log('File already processed, skipping:', file.name);
+        continue;
+      }
+
       const { data: fileData, error: downloadError } = await supabase.storage
         .from('agent_documents')
         .download(file.name);
@@ -203,6 +164,41 @@ async function main() {
 
       // Process the file content
       await processFile(text, file.name, agentId, runtime, documentsManager);
+      processedFiles.push(file.name);
+    }
+
+    // Only notify if we actually processed new files
+    if (processedFiles.length > 0) {
+      // Ensure agent is in their own room
+      await pool.query(`
+        INSERT INTO rooms (id)
+        VALUES ($1)
+        ON CONFLICT (id) DO NOTHING
+      `, [agentId]);
+
+      await pool.query(`
+        INSERT INTO participants (id, "userId", "roomId")
+        VALUES ($1, $2, $3)
+        ON CONFLICT ("userId", "roomId") DO NOTHING
+      `, [stringToUuid(Date.now().toString()), agentId, agentId]);
+
+      const message = {
+        id: stringToUuid(Date.now().toString()) as UUID,
+        type: 'messages' as const,
+        content: {
+          text: `I've just processed some new documents that I can now referenc
e in our conversations. The 
documents include: ${processedFiles.join(', ')}`
                            +        },
+        embedding: await embed(runtime, `New documents processed notification`)
,
+        agentId,
+        roomId: agentId,
+        userId: agentId,
+        unique: true
+      };
+
+      await messageManager.createMemory(message);
+      console.log('Notification sent to room:', agentId);
+    } else {
+      console.log('No new files were processed');
     }
   } catch (error) {
     console.error('Error accessing storage:', error);
@@ -332,7 +328,11 @@ async function processFile(content: string, filename: strin
g, agentId: UUID, run
     const memory = {
       id: stringToUuid(Buffer.from(chunk).toString('hex').slice(0, 32)) as UUID
,
       type: 'documents' as const,
-      content: { text: chunk },
+      content: {
+        text: chunk,
+        fileId: filename,
+        type: 'text'
+      },
       embedding,
       agentId,
       roomId: agentId,
@@ -345,14 +345,14 @@ async function processFile(content: string, filename: stri
ng, agentId: UUID, run
   }
 }
 
-async function isProcessed(fileId: string): Promise<boolean> {
+async function isProcessed(filename: string): Promise<boolean> {
   const client = await pool.connect()
   try {
     const result = await client.query(`
       SELECT id FROM memories
       WHERE type = 'documents' AND content->>'fileId' = $1
       LIMIT 1
-    `, [fileId])
+    `, [filename])
     return (result.rowCount ?? 0) > 0
   } finally {
     client.release()

```

---

_****_



---



---

