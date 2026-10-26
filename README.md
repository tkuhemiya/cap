# cap

Generate commit messages with DeepSeek. One C file.

BAML has no C SDK (the “C” layer is an internal protobuf FFI used by Python/Go/Ruby). There is also no native DeepSeek provider — DeepSeek is OpenAI-compatible, so BAML’s `openai-generic` client is the match. `cap.c` talks to that same endpoint; `baml_src/` is the typed schema if you later generate a client.

## Build

Needs `gcc` and `libcurl`.

```bash
make DEEPSEEK_API_KEY=sk-xxx
./install.sh
```

The key is compiled in. Runtime env is ignored.

## Usage

```bash
git add .
cap
```

## Uninstall

```bash
rm ~/.local/bin/cap
```
