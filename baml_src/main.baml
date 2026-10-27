class CommitMessage {
  subject: string
  body: string
}

client DeepSeek = openai.GenericClient.new(
  model = "deepseek-v4-flash",
  base_url = "https://api.deepseek.com/v1",
  api_key = env.DEEPSEEK_API_KEY,
  max_tokens = 500,
)

function generate_commit_message(
  branch: string,
  files: string,
  diff: string,
  history: string,
) -> CommitMessage {
  client: DeepSeek
  prompt: `
    ${role("system")}
    You write concise git commit messages.
    ${role("user")}
    Generate a single commit message.

    Branch: ${branch}
    Files: ${files}
    Recent commits:
    ${history}
    Diff:
    ${diff}

    Be chill and descriptive. Keep the subject short.
    Optional body: what and why, not how. Empty string if not needed.
  `
}
