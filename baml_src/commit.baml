// Playground copy of the prompt. cap.c cannot call BAML (no C SDK).

function GenerateCommitMessage(
  branch: string,
  files: string,
  diff: string,
  history: string
) -> string {
  client DeepSeekFlash
  prompt #"
    {{ _.role("user") }}
    Write a git commit message for branch {{ branch }} files:
    {{ files }}
    Recent:
    {{ history }}
    Diff:
    {{ diff }}
    First line = subject. Optional body after a blank line. No extras.
  "#
}
