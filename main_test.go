package main

import (
	"os"
	"testing"
)

func TestResolveAPIKeyPrefersEnv(t *testing.T) {
	t.Setenv("DEEPSEEK_API_KEY", " from-env ")
	prev := apiKey
	apiKey = "from-ldflags"
	t.Cleanup(func() { apiKey = prev })

	if got := resolveAPIKey(); got != "from-env" {
		t.Fatalf("resolveAPIKey() = %q, want from-env", got)
	}
}

func TestResolveAPIKeyFallsBackToLdflags(t *testing.T) {
	os.Unsetenv("DEEPSEEK_API_KEY")
	prev := apiKey
	apiKey = "baked"
	t.Cleanup(func() { apiKey = prev })

	if got := resolveAPIKey(); got != "baked" {
		t.Fatalf("resolveAPIKey() = %q, want baked", got)
	}
}

func TestResolveAPIKeyEmpty(t *testing.T) {
	os.Unsetenv("DEEPSEEK_API_KEY")
	prev := apiKey
	apiKey = ""
	t.Cleanup(func() { apiKey = prev })

	if got := resolveAPIKey(); got != "" {
		t.Fatalf("resolveAPIKey() = %q, want empty", got)
	}
}
