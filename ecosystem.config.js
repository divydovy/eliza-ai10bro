module.exports = {
  apps: [
    {
      name: 'eliza-agent',
      script: 'pnpm',
      args: 'start --character="./characters/ai10bro.character.json"',
      cwd: '/Users/davidlockie/Documents/Projects/Eliza',
      cron_restart: '0 */6 * * *',  // Restart every 6 hours to prevent memory leaks
      max_memory_restart: '2G',
      error_file: './logs/eliza-error.log',
      out_file: './logs/eliza-out.log',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'production',
        TELEGRAM_ENABLED: 'true',
        TWITTER_ENABLED: 'false',  // Disabled for now
        DIRECT_CLIENT_ENABLED: 'true',
        OBSIDIAN_VAULT_PATH: '/Users/davidlockie/Documents/Projects/obsidian-quotes/quotes'
      }
    },
    {
      name: 'broadcast-api',
      script: './broadcast-api-simple.js',
      cwd: '/Users/davidlockie/Documents/Projects/Eliza',
      instances: 1,
      error_file: './logs/broadcast-error.log',
      out_file: './logs/broadcast-out.log',
      merge_logs: true,
      time: true,
      env: {
        BROADCAST_API_PORT: 3002,
        DB_PATH: './agent/data/db.sqlite'
      }
    },
    {
      name: 'scheduler',
      script: './scheduler-service.js',
      cwd: '/Users/davidlockie/Documents/Projects/Eliza',
      instances: 1,
      error_file: './logs/scheduler-error.log',
      out_file: './logs/scheduler-out.log',
      merge_logs: true,
      time: true
    },
    {
      name: 'web-client',
      script: 'pnpm',
      args: 'start:client',
      cwd: '/Users/davidlockie/Documents/Projects/Eliza',
      instances: 1,
      error_file: './logs/client-error.log',
      out_file: './logs/client-out.log',
      merge_logs: true,
      time: true,
      env: {
        SERVER_PORT: 3000
      }
    },
    {
      name: 'action-api',
      script: './action-api.js',
      cwd: '/Users/davidlockie/Documents/Projects/Eliza',
      instances: 1,
      error_file: './logs/action-api-error.log',
      out_file: './logs/action-api-out.log',
      merge_logs: true,
      time: true,
      env: {
        ACTION_API_PORT: 3003
      }
    }
  ]
};