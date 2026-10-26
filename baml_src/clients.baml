// DeepSeek has no first-party BAML provider. It is OpenAI-compatible,
// so BAML's openai-generic client is the one to use.
// base_url must include /v1 — BAML appends /chat/completions.

client DeepSeekFlash {
  provider "openai-generic"
  options {
    base_url "https://api.deepseek.com/v1"
    api_key env.DEEPSEEK_API_KEY
    model "deepseek-v4-flash"
  }
}
