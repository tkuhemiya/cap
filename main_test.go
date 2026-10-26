package main

import "testing"

func TestUnbakedBinaryHasNoAPIKey(t *testing.T) {
	t.Setenv("DEEPSEEK_API_KEY", "from-env")
	if apiKey != "" {
		t.Fatalf("apiKey is build-injected only, tests have no -X main.apiKey, got %q", apiKey)
	}
}
