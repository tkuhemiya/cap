# cap

Generate commit messages with AI using DeepSeek.

## Build

```bash
# Runtime key (preferred)
export DEEPSEEK_API_KEY=sk-xxx
go build -o cap .

# Or bake the key into the binary
DEEPSEEK_API_KEY=sk-xxx go build -ldflags="-X main.apiKey=$DEEPSEEK_API_KEY" -o cap .

./install.sh
```

Requires Go 1.22+.

## Usage

```bash
git add .
cap
```

## How It Works

- Reads staged git changes (diff, files, commit history) in Go
- Sends them to DeepSeek V4 Flash as a typed `{subject, body}` JSON object
- Runs `git commit` with the generated message

Git collection and committing stay in Go. The LLM call is isolated in
`generateCommitMessage` so it can be swapped for a [BAML](https://boundaryml.com/)
client later (`baml_src/`). BAML is not linked into the binary yet: its Go
runtime needs Go 1.24+ and a native CFFI library, which would change the
current static `go build -o cap` install.

## Uninstall

```bash
rm ~/.local/bin/cap
```

Built with Go. Powered by DeepSeek V4 Flash.
