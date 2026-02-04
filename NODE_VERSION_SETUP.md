# Node Version Management for Eliza Project

## 🎯 Problem Solved
This project requires Node v23.3.0 (for better-sqlite3 compatibility), but you have other projects using different Node versions.

## ✅ Solution Implemented

### 1. `.nvmrc` File (Already Exists)
```
v23.3.0
```

This file tells nvm which Node version to use for this project.

### 2. Lazy-Loading Integration (Fixed in ~/.zshrc)
Your zsh uses **lazy-loading** for nvm (loads only when needed, for faster shell startup).
The `load_nvm()` function now checks for `.nvmrc` and auto-switches when nvm loads.

**How it works**:
- You have lazy-loading nvm (fast shell startup)
- When you run `node`, `npm`, or `nvm` → nvm loads
- If `.nvmrc` exists → automatically uses that version
- If no `.nvmrc` → uses your default version

### 3. Simple Usage

```bash
# In Eliza directory - just run any node command:
node --version
# First time: loads nvm + switches to v23.3.0
# After that: already on v23.3.0

# In other directories:
cd ~/some-other-project
node --version
# Uses that project's .nvmrc (if exists) or your default

# No manual 'nvm use' needed! ✨
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

### "nvm: command not found" when opening terminal
**This is normal!** You have lazy-loading nvm.
- nvm loads when you first run: `node`, `npm`, `npx`, or `nvm`
- This keeps shell startup fast
- Just run any node command and nvm will load

### Still on wrong Node version?
```bash
# In Eliza directory:
node --version  # Triggers load + auto-switch to v23.3.0

# If still wrong, manually switch:
nvm use

# Or reinstall version from .nvmrc:
nvm install
```

### Node version mismatch in running services
```bash
# Restart services from project root
cd /Users/davidlockie/Documents/Projects/Eliza
killall node  # Kill all Node processes
node --version  # Verify correct version loaded
node packages/plugin-dashboard/src/services/broadcast-api.js
```

### Want to check without running node?
```bash
cat .nvmrc  # See what version this project wants
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
