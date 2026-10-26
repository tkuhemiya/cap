package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestGetGitContextRequiresStaged(t *testing.T) {
	dir := initTempRepo(t)
	chdir(t, dir)

	_, err := getGitContext()
	if err == nil || !strings.Contains(err.Error(), "No staged changes") {
		t.Fatalf("err = %v", err)
	}
}

func TestGetGitContextReadsStagedDiff(t *testing.T) {
	dir := initTempRepo(t)
	chdir(t, dir)

	if err := os.WriteFile("hello.txt", []byte("hello\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	run(t, dir, "git", "add", "hello.txt")

	ctx, err := getGitContext()
	if err != nil {
		t.Fatal(err)
	}
	if len(ctx.files) != 1 || ctx.files[0] != "hello.txt" {
		t.Fatalf("files = %#v", ctx.files)
	}
	if !strings.Contains(ctx.diff, "hello") {
		t.Fatalf("diff missing content: %s", ctx.diff)
	}
	if ctx.branch != "main" && ctx.branch != "master" {
		t.Fatalf("branch = %q", ctx.branch)
	}
	if len(ctx.history) == 0 {
		t.Fatal("expected history")
	}
}

func TestDiffTruncationNote(t *testing.T) {
	dir := initTempRepo(t)
	chdir(t, dir)

	// Force the budget down by writing a file larger than maxDiffChars.
	// maxDiffChars is a package const, so we instead rely on the per-file
	// remaining budget only when the staged diff is huge. Use a 600k file.
	big := strings.Repeat("x", maxDiffChars+100)
	if err := os.WriteFile("big.txt", []byte(big+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile("small.txt", []byte("tiny\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	run(t, dir, "git", "add", ".")

	ctx, err := getGitContext()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(ctx.diff, "truncated") && !strings.Contains(ctx.diff, "omitted") && !strings.Contains(ctx.diff, "@@ ... @@") {
		t.Fatalf("expected truncation markers, got:\n%s", ctx.diff[:min(len(ctx.diff), 500)])
	}
}

func initTempRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	run(t, dir, "git", "init", "-b", "main")
	run(t, dir, "git", "config", "user.email", "cap@example.com")
	run(t, dir, "git", "config", "user.name", "cap")
	if err := os.WriteFile(filepath.Join(dir, "README"), []byte("init\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	run(t, dir, "git", "add", "README")
	run(t, dir, "git", "commit", "-m", "initial")
	return dir
}

func chdir(t *testing.T, dir string) {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(wd) })
}

func run(t *testing.T, dir string, name string, args ...string) {
	t.Helper()
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%s %s: %v\n%s", name, strings.Join(args, " "), err, out)
	}
}
