# cap

Generate commit messages with AI using DeepSeek.

## Build

```bash
DEEPSEEK_API_KEY=sk-xxx go build -ldflags="-X main.apiKey=$DEEPSEEK_API_KEY" -o cap .
./install.sh
```

## Usage

```bash
git add .
cap
```

## How It Works

- Reads staged git changes (diff, files, commit history)
- Sends to DeepSeek V4 Flash via OpenAI-compatible API
- Parses JSON response into subject + body
- Runs `git commit` with generated message

## Uninstall

```bash
rm ~/.local/bin/cap
```

Built with Go. Powered by DeepSeek V4 Flash.
