# Node Version Management for Eliza Project

## 🎯 Problem Solved
This project requires Node v23.3.0 (for better-sqlite3 compatibility), but you have other projects using different Node versions.

## ✅ Solution Implemented

### 1. `.nvmrc` File (Already Exists)
```
v23.3.0
```

This file tells nvm which Node version to use for this project.

### 2. Automatic Switching (Just Added to ~/.zshrc)
When you `cd` into this directory, Node v23.3.0 will be automatically activated.
When you `cd` out, it reverts to your default Node version.

**How it works**:
- Uses zsh `chpwd` hook (runs on every directory change)
- Checks for `.nvmrc` file
- Automatically runs `nvm use` if needed
- Installs the version if not present

### 3. Test It Now

```bash
# Reload your shell config
source ~/.zshrc

# Leave and re-enter the Eliza directory
cd ..
cd Eliza

# You should see: "Now using node v23.3.0"
node --version  # Should show v23.3.0
```

### 4. For Background Services & Cron Jobs

Use explicit Node 23 path (already configured):
```bash
~/.nvm/versions/node/v23.3.0/bin/node script.js
```

**Already configured in**:
- Cron jobs (LLM scoring, broadcast creation)
- Dashboard service (`broadcast-api.js`)
- All automation scripts

## 🔍 How to Verify

```bash
# Enter project directory
cd /Users/davidlockie/Documents/Projects/Eliza

# Check Node version (should be v23.3.0)
node --version

# Leave directory
cd ~

# Check Node version (should be your default, e.g., v20.x)
node --version
```

## 📝 For Other Projects

Each project can have its own `.nvmrc` file:

```bash
# In any project directory
echo "v20.19.2" > .nvmrc
```

When you `cd` into that project, it will auto-switch to v20.19.2.

## 🚨 Troubleshooting

### "nvm: command not found"
```bash
# Add to ~/.zshrc (should already be there)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

### Auto-switching not working
```bash
# Reload shell config
source ~/.zshrc

# Or restart terminal
```

### Node version mismatch in running services
```bash
# Restart services from project root
cd /Users/davidlockie/Documents/Projects/Eliza
killall node  # Kill all Node processes
nvm use       # Activate correct version
node script.js  # Restart with correct version
```

## 📊 Current Configuration

| Component | Node Version | Method |
|-----------|--------------|--------|
| Interactive shell | v23.3.0 | Auto-switch via `.nvmrc` ✅ |
| Cron jobs | v23.3.0 | Explicit path ✅ |
| Dashboard service | v23.3.0 | Explicit path ✅ |
| Other projects | Per-project | Auto-switch via their `.nvmrc` ✅ |

## ✨ Benefits

1. **No manual switching** - Happens automatically when you `cd`
2. **Per-project isolation** - Each project uses its required version
3. **Cron-safe** - Background jobs use explicit paths
4. **Version pinning** - `.nvmrc` committed to git ensures team consistency

---

**Status**: ✅ Fully configured. Restart your terminal or run `source ~/.zshrc` to activate.
