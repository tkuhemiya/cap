# cap - AI Commit Message Generator

A standalone native executable that generates conventional commit messages using AI.

## Quick Start

```bash
# Install dependencies
bun install

# Interactive setup (encrypts API key)
bun run setup

# Build native executable
bun run build

# Install to ~/.local/bin (or ~/bin)
bun run install:global

# Use anywhere
git add .
cap
```

## Building

### Development (with Bun runtime)
```bash
bun run src/index.ts
```

### Native Executable
```bash
# Build standalone binary
bun run build

# Result: ./cap (native executable, no runtime needed)
```

### With Encrypted Config
```bash
# Setup + build in one command
bun run build:encrypt
```

## Installation

### Option 1: Auto-install (recommended)
```bash
bun run install:global
```

This installs to:
- `$HOME/.local/bin` (preferred)
- `$HOME/bin` (fallback)

### Option 2: Manual install
```bash
bun run build
cp cap /usr/local/bin/  # or any dir in your PATH
```

### Option 3: No install (use locally)
```bash
bun run build
./cap  # Run from current directory
```

## Setup (One-time)

Run the interactive setup to encrypt your API key:

```bash
bun run setup
```

This will:
1. Show a fuzzy-searchable list of providers
2. Show models for the selected provider
3. Encrypt your API key into `src/encrypted-config.ts`
4. You can then build a binary with the key embedded

### Setup Options

| Prompt | Description |
|--------|-------------|
| Provider | Type to fuzzy search (e.g., "anth" → anthropic) |
| Model | Type to filter (e.g., "son" → claude-sonnet-4-5) |
| API Key | Your API key (encrypted, not stored as plaintext) |

## Usage

```bash
# Stage changes and generate commit
git add .
cap

# Without encrypted config (env vars)
ANTHROPIC_API_KEY=sk-xxx cap
AI_PROVIDER=openai AI_MODEL=gpt-4o OPENAI_API_KEY=sk-xxx cap
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AI_PROVIDER` | Provider (anthropic, openai, google, etc.) |
| `AI_MODEL` | Model ID |
| `{PROVIDER}_API_KEY` | API key for the provider |

Priority: **Encrypted config > Environment variables**

## How It Works

1. **Setup**: `bun run setup` → Encrypts API key using AES-256-GCM
2. **Build**: `bun run build` → Bun compiles to native executable
3. **Runtime**: Binary decrypts key in-memory using code artifacts as derivation material
4. **Commit**: Reads staged diff, generates message, executes `git commit`

## Uninstall

```bash
rm ~/.local/bin/cap  # or wherever you installed it
```

## Technical Details

- **Runtime**: Native executable (Bun's `--compile` flag)
- **Size**: ~50-80MB (includes Bun runtime + dependencies)
- **Encryption**: AES-256-GCM with PBKDF2 key derivation
- **No Node.js required** on target machine

## Troubleshooting

### "command not found: cap"
Add to your shell profile:
```bash
export PATH="$HOME/.local/bin:$PATH"
```

### "No API key found"
Run setup first: `bun run setup`

### Binary doesn't run
Make sure the binary is executable:
```bash
chmod +x cap
```
