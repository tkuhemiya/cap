# cap

C CLI. DeepSeek writes the commit message.

BAML has no C client, so it cannot parse anything here. The HTTP JSON envelope is DeepSeek’s; the commit message itself is plain text (subject, optional body). `baml_src/` is the same prompt for the playground.

```bash
DEEPSEEK_API_KEY=sk-xxx ./install.sh
git add .
cap
```

Needs `cc` and `libcurl`. Key is compiled in.
