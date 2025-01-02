import { Plugin, elizaLogger, Service, IAgentRuntime } from "@ai16z/eliza";
import { SupabaseDatabaseAdapter } from "./index";

class SupabaseService extends Service {
  name = "supabase";
  type = "database";

  constructor(private supabaseUrl: string, private supabaseKey: string) {
    super();
  }

  async initialize(runtime: IAgentRuntime) {
    elizaLogger.info("Initializing Supabase connection...");
    const url = runtime.getSetting("SUPABASE_URL") || this.supabaseUrl;
    const key = runtime.getSetting("SUPABASE_SERVICE_API_KEY") || this.supabaseKey;

    if (url && key) {
      runtime.databaseAdapter = new SupabaseDatabaseAdapter(url, key);
    }
  }
}

const supabasePlugin: Plugin = {
  name: "@ai16z/adapter-supabase",
  description: "Supabase database adapter for Eliza",
  actions: [],
  evaluators: [],
  providers: [],
  services: [
    new SupabaseService(
      process.env.SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_API_KEY || ""
    )
  ]
};

export default supabasePlugin;