package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"
)

const maxPromptTokens = 100_000
const charsPerToken = 5.5
const maxDiffChars = int(maxPromptTokens * charsPerToken)

// apiKey can be injected at build time:
//
//	go build -ldflags="-X main.apiKey=$DEEPSEEK_API_KEY" -o cap .
//
// Runtime DEEPSEEK_API_KEY takes precedence so the binary can be rebuilt
// without baking a key in.
var apiKey string

type commitMessage struct {
	Subject string `json:"subject"`
	Body    string `json:"body,omitempty"`
}

func main() {
	key := resolveAPIKey()
	if key == "" {
		fmt.Fprintln(os.Stderr, "No API key configured.")
		fmt.Fprintln(os.Stderr, "  Set DEEPSEEK_API_KEY, or build with:")
		fmt.Fprintln(os.Stderr, "  DEEPSEEK_API_KEY=sk-xxx go build -ldflags=\"-X main.apiKey=$DEEPSEEK_API_KEY\" -o cap .")
		os.Exit(1)
	}

	fmt.Println("Reading staged changes...")
	ctx, err := getGitContext()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Printf("   %d files\n", len(ctx.files))
	fmt.Printf("   model: deepseek/%s\n", model)

	prompt := buildPrompt(ctx)
	tokens := int(float64(len(prompt)) / charsPerToken)
	fmt.Printf("   token estimate: %d\n", tokens)

	fmt.Println("Generating commit message...")
	reqCtx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	msg, err := generateCommitMessage(reqCtx, key, ctx)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	bold := "\033[1m"
	cyan := "\033[36m"
	green := "\033[32m"
	reset := "\033[0m"
	dim := "\033[2m"

	fmt.Println()
	fmt.Print(bold + cyan + msg.Subject + reset)
	if msg.Body != "" {
		fmt.Println()
		fmt.Println()
		fmt.Print(dim + msg.Body + reset)
	}
	fmt.Println()

	args := []string{"commit"}
	if msg.Body != "" {
		args = append(args, "-m", msg.Subject, "-m", msg.Body)
	} else {
		args = append(args, "-m", msg.Subject)
	}

	fmt.Print(green + "cap" + reset + " -> git " + strings.Join(args, " ") + "\n")
	if err := runGitCmd(args...); err != nil {
		fmt.Fprintf(os.Stderr, "Commit failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Committed!")
}

func resolveAPIKey() string {
	if k := strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")); k != "" {
		return k
	}
	return strings.TrimSpace(apiKey)
}
