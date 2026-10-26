class CommitMessage {
  subject string
  body string
}

function GenerateCommitMessage(
  branch: string,
  files: string[],
  diff: string,
  history: string[]
) -> CommitMessage {
  client DeepSeekFlash
  prompt #"
    {{ _.role("system") }}
    You write concise git commit messages. Respond in JSON format.

    {{ _.role("user") }}
    Generate a single commit message based on the provided context.

    ## Branch
    {{ branch }}

    ## Files Changed
    {{ files | join(", ") }}

    ## Diff
    ```diff
    {{ diff }}
    ```

    ## Recent Commits
    ```
    {% for h in history %}{{ h }}
    {% endfor %}
    ```

    ## Requirements

    - **Format**: No need to Follow Conventional Commits formats, Be chill and descriptive, keep it short, You don't need to mention accurately the exact changes we did. Just mention what is different from the project now after we did the commit message.
    - **Scope**: Should reflect the affected area (or be omitted if unclear)
    - **Style**: Capture the primary user-visible or developer-visible change in the subject

    ## Body (optional)

    Include only if necessary to explain non-obvious changes.

    - Explain **what** changed and **why** (not how)
    - Use bullet points if multiple changes exist
    - Wrap lines at 72 characters

    {{ ctx.output_format }}
  "#
}
