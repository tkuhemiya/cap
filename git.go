package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

type gitContext struct {
	systemPrompt string
	files        []string
	diff         string
	history      []string
	branch       string
}

func runGitCmd(args ...string) error {
	cmd := exec.Command("git", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func runGitOutput(args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	out, err := cmd.Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			return "", fmt.Errorf("git %s failed: %s", strings.Join(args, " "), strings.TrimSpace(string(ee.Stderr)))
		}
		return "", fmt.Errorf("git %s failed: %w", strings.Join(args, " "), err)
	}
	return strings.TrimRight(string(out), "\n"), nil
}

func getGitContext() (*gitContext, error) {
	staged, err := runGitOutput("diff", "--cached")
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(staged) == "" {
		return nil, fmt.Errorf("No staged changes. Run 'git add' first.")
	}

	filesRaw, err := runGitOutput("diff", "--cached", "--name-only")
	if err != nil {
		return nil, err
	}
	var files []string
	for _, f := range strings.Split(filesRaw, "\n") {
		if f = strings.TrimSpace(f); f != "" {
			files = append(files, f)
		}
	}

	var diffParts []string
	totalChars := 0
	tooLarge := false
	truncatedFiles := 0

	for _, file := range files {
		if tooLarge {
			diffParts = append(diffParts,
				fmt.Sprintf("--- a/%s\n+++ b/%s\n@@ ... @@\n[omitted — total diff too large]", file, file))
			truncatedFiles++
			continue
		}

		fileDiff, err := runGitOutput("diff", "--cached", "--", file)
		if err != nil {
			continue
		}
		remaining := maxDiffChars - totalChars

		if len(fileDiff) <= remaining {
			diffParts = append(diffParts, fileDiff)
			totalChars += len(fileDiff)
		} else {
			stat, err := runGitOutput("diff", "--cached", "--stat", "--", file)
			if err != nil {
				stat = file
			}
			summary := fmt.Sprintf("--- a/%s\n+++ b/%s\n@@ ... @@\n%s", file, file, strings.TrimSpace(stat))
			diffParts = append(diffParts, summary)
			totalChars += len(summary)
			truncatedFiles++
			if totalChars >= maxDiffChars {
				tooLarge = true
			}
		}
	}

	diff := strings.Join(diffParts, "\n")

	if truncatedFiles > 0 {
		note := fmt.Sprintf(
			"\n# Note: The diff was truncated to %d tokens. %d file(s) have stats-only summaries above. Use the file list and stats to infer the scope of the change.",
			maxPromptTokens, truncatedFiles)
		diff += note
	}

	var history []string
	histRaw, err := runGitOutput("log", "--pretty=format:%s", "-n", "10")
	if err == nil {
		for _, h := range strings.Split(histRaw, "\n") {
			if h = strings.TrimSpace(h); h != "" {
				history = append(history, h)
			}
		}
	}
	if len(history) == 0 {
		history = []string{"Initial commit"}
	}

	branch := "(detached)"
	b, err := runGitOutput("rev-parse", "--abbrev-ref", "HEAD")
	if err == nil && b != "" {
		branch = b
	}

	return &gitContext{
		systemPrompt: "You write concise git commit messages. Respond in JSON format.",
		files:        files,
		diff:         diff,
		history:      history,
		branch:       branch,
	}, nil
}
