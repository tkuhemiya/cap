// LLM client for cap. This is the BAML v0 (structured-output DSL) spec
// for the only place BAML should land: GenerateCommitMessage.
//
// Not wired into the Go binary yet. The Go runtime uses CFFI/native libs
// (github.com/boundaryml/baml, Go 1.24+) which would replace the current
// static `go build -o cap` install. Keep git collection and `git commit`
// in Go; swap callDeepSeek/generateCommitMessage for baml_client.

client DeepSeekFlash {
  provider openai
  retry_policy Exponential
  options {
    base_url "https://api.deepseek.com"
    // When the Go client is generated, pass the baked-in key with
    // b.WithEnv(map[string]string{"DEEPSEEK_API_KEY": apiKey}).
    // cap itself never reads this from the process environment.
    api_key env.DEEPSEEK_API_KEY
    model "deepseek-v4-flash"
  }
}

retry_policy Exponential {
  max_retries 2
  strategy {
    type exponential_backoff
    delay_ms 300
    multiplier 1.5
    max_delay_ms 10000
  }
}
