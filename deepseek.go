package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const deepSeekBaseURL = "https://api.deepseek.com/v1/chat/completions"
const model = "deepseek-v4-flash"

var httpClient = &http.Client{Timeout: 60 * time.Second}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model          string          `json:"model"`
	Messages       []chatMessage   `json:"messages"`
	ResponseFormat *responseFormat `json:"response_format,omitempty"`
	Stream         bool            `json:"stream"`
	MaxTokens      int             `json:"max_tokens,omitempty"`
}

type responseFormat struct {
	Type string `json:"type"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func buildPrompt(ctx *gitContext) string {
	var b strings.Builder

	b.WriteString("Generate a single commit message based on the provided context.\n\n")

	fmt.Fprintf(&b, "## Branch\n%s\n\n", ctx.branch)
	fmt.Fprintf(&b, "## Files Changed\n%s\n\n", strings.Join(ctx.files, ", "))

	b.WriteString("## Diff\n```diff\n")
	b.WriteString(ctx.diff)
	b.WriteString("\n```\n\n")

	b.WriteString("## Recent Commits\n```\n")
	b.WriteString(strings.Join(ctx.history, "\n"))
	b.WriteString("\n```\n\n")

	b.WriteString(`## Requirements

- **Format**: No need to Follow Conventional Commits formats, Be chill and descriptive, keep it short, You don't need to mention accurately the exact changes we did. Just mention what is different from the project now after we did the commit message.
- **Scope**: Should reflect the affected area (or be omitted if unclear)
- **Style**: Capture the primary user-visible or developer-visible change in the subject

## Body (optional)

Include only if necessary to explain non-obvious changes.

- Explain **what** changed and **why** (not how)
- Use bullet points if multiple changes exist
- Wrap lines at 72 characters

## Output Format

Respond with a JSON object only:
{
  "subject": "A short descriptive commit message",
  "body": "Optional body text explaining what changed and why. Use empty string if not needed."
}
`)

	return b.String()
}

// generateCommitMessage is the BAML integration seam: a typed
// (git context) -> CommitMessage LLM call. Today it uses the DeepSeek
// HTTP client plus json_object mode. Replacing this function with a
// generated BAML client (see baml_src/) is the intended next step.
func generateCommitMessage(ctx context.Context, key string, gitCtx *gitContext) (*commitMessage, error) {
	text, err := callDeepSeek(ctx, key, gitCtx.systemPrompt, buildPrompt(gitCtx))
	if err != nil {
		return nil, err
	}
	if text == "" {
		return nil, fmt.Errorf("Empty response from API. Try again.")
	}
	return parseCommitMessage(text)
}

func parseCommitMessage(text string) (*commitMessage, error) {
	text = stripCodeFences(text)
	var msg commitMessage
	if err := json.Unmarshal([]byte(text), &msg); err != nil {
		return nil, fmt.Errorf("Failed to parse response: %v\n  Response: %s", err, text)
	}
	if strings.TrimSpace(msg.Subject) == "" {
		return nil, fmt.Errorf("Empty subject in response. Try again.")
	}
	msg.Subject = strings.TrimSpace(msg.Subject)
	msg.Body = strings.TrimSpace(msg.Body)
	return &msg, nil
}

func callDeepSeek(ctx context.Context, key, systemPrompt, userPrompt string) (string, error) {
	body := chatRequest{
		Model: model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		ResponseFormat: &responseFormat{Type: "json_object"},
		Stream:         false,
		MaxTokens:      500,
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("Failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, deepSeekBaseURL, bytes.NewReader(payload))
	if err != nil {
		return "", fmt.Errorf("Failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("Failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		var errResp chatResponse
		if json.Unmarshal(raw, &errResp) == nil && errResp.Error != nil {
			return "", fmt.Errorf("API error (%d): %s", resp.StatusCode, errResp.Error.Message)
		}
		return "", fmt.Errorf("API error (%d): %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var chatResp chatResponse
	if err := json.Unmarshal(raw, &chatResp); err != nil {
		return "", fmt.Errorf("Failed to parse response: %w", err)
	}

	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("No choices in response")
	}

	return strings.TrimSpace(chatResp.Choices[0].Message.Content), nil
}

func stripCodeFences(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		lines := strings.SplitN(s, "\n", 2)
		if len(lines) == 2 {
			s = lines[1]
		} else {
			s = strings.TrimPrefix(s, "```")
		}
	}
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}
