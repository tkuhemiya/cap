package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestStripCodeFences(t *testing.T) {
	tests := []struct {
		name, in, want string
	}{
		{"plain json", `{"subject":"x"}`, `{"subject":"x"}`},
		{"fenced", "```json\n{\"subject\":\"x\"}\n```", `{"subject":"x"}`},
		{"fenced no lang", "```\n{\"subject\":\"x\"}\n```", `{"subject":"x"}`},
		{"whitespace", "  {\"subject\":\"x\"}  ", `{"subject":"x"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := stripCodeFences(tt.in); got != tt.want {
				t.Fatalf("stripCodeFences() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestParseCommitMessage(t *testing.T) {
	msg, err := parseCommitMessage("```json\n{\"subject\":\"fix the parser\",\"body\":\"it ate fences\"}\n```")
	if err != nil {
		t.Fatal(err)
	}
	if msg.Subject != "fix the parser" {
		t.Fatalf("subject = %q", msg.Subject)
	}
	if msg.Body != "it ate fences" {
		t.Fatalf("body = %q", msg.Body)
	}

	if _, err := parseCommitMessage(`{"subject":""}`); err == nil {
		t.Fatal("expected error for empty subject")
	}
	if _, err := parseCommitMessage("not json"); err == nil {
		t.Fatal("expected error for invalid json")
	}
}

func TestBuildPromptIncludesContext(t *testing.T) {
	prompt := buildPrompt(&gitContext{
		branch:  "feat/x",
		files:   []string{"a.go", "b.go"},
		diff:    "diff --git a/a.go",
		history: []string{"old commit"},
	})
	for _, want := range []string{"feat/x", "a.go, b.go", "diff --git a/a.go", "old commit", `"subject"`} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("prompt missing %q\n%s", want, prompt)
		}
	}
}

func TestCallDeepSeek(t *testing.T) {
	var gotAuth, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]string{"content": `{"subject":"ok","body":""}`}},
			},
		})
	}))
	t.Cleanup(srv.Close)

	origClient := httpClient
	t.Cleanup(func() { httpClient = origClient })
	httpClient = &http.Client{
		Timeout: 5 * time.Second,
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			u := *req.URL
			target, _ := req.URL.Parse(srv.URL)
			req = req.Clone(req.Context())
			req.URL = target
			req.URL.Path = u.Path
			req.Host = target.Host
			return srv.Client().Transport.RoundTrip(req)
		}),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	gitCtx := &gitContext{
		systemPrompt: "sys",
		branch:       "main",
		files:        []string{"f.go"},
		diff:         "+hello",
		history:      []string{"init"},
	}
	msg, err := generateCommitMessage(ctx, "sk-test", gitCtx)
	if err != nil {
		t.Fatal(err)
	}
	if msg.Subject != "ok" {
		t.Fatalf("subject = %q", msg.Subject)
	}
	if gotAuth != "Bearer sk-test" {
		t.Fatalf("auth = %q", gotAuth)
	}
	if !strings.Contains(gotBody, "deepseek-v4-flash") {
		t.Fatalf("body missing model: %s", gotBody)
	}
	if !strings.Contains(gotBody, "json_object") {
		t.Fatalf("body missing json_object: %s", gotBody)
	}
}

func TestCallDeepSeekAPIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": map[string]string{"message": "bad key"},
		})
	}))
	t.Cleanup(srv.Close)

	httpClient = &http.Client{
		Timeout: 5 * time.Second,
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			req.URL, _ = req.URL.Parse(srv.URL)
			req.Host = ""
			return srv.Client().Transport.RoundTrip(req)
		}),
	}
	t.Cleanup(func() { httpClient = &http.Client{Timeout: 60 * time.Second} })

	_, err := callDeepSeek(context.Background(), "nope", "sys", "user")
	if err == nil || !strings.Contains(err.Error(), "bad key") {
		t.Fatalf("err = %v", err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
