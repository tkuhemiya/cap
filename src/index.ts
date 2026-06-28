#!/usr/bin/env bun

import { $ } from "bun";
import { getModel, complete, type Context, type UserMessage } from "@earendil-works/pi-ai/compat";
import { decryptApiKey, PROVIDER, MODEL } from "./encrypted-config.js";

// Token budget: stop sending diffs to the LLM once we exceed this
// At ~5.5 chars/token, 100K tokens = ~550K characters
const MAX_PROMPT_TOKENS = 100_000;
const CHARS_PER_TOKEN = 5.5;
const MAX_DIFF_CHARS = Math.floor(MAX_PROMPT_TOKENS * CHARS_PER_TOKEN);

function getConfig() {
  if (!PROVIDER || !MODEL) {
    console.error("No encrypted API key found in binary.");
    console.error("   Run: bun run setup");
    console.error("   Then: bun run build && bun run install:global");
    process.exit(1);
  }

  return {
    provider: PROVIDER,
    modelId: MODEL,
    apiKey: decryptApiKey(),
  };
}

async function runGit(args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  
  if (exitCode !== 0) {
    throw new Error(err || `git ${args.join(" ")} failed`);
  }
  return output;
}

async function getGitContext() {
  // Validate early: check for any staged changes at all
  const indexDiff = await runGit(["diff", "--cached"]);
  if (!indexDiff.trim()) {
    throw new Error("No staged changes. Run 'git add' first.");
  }

  const files = (await runGit(["diff", "--cached", "--name-only"]))
    .trim()
    .split("\n")
    .filter(Boolean);

  // Build per-file diffs, minifying large ones, capped at MAX_DIFF_CHARS
  const diffParts: string[] = [];
  let totalChars = 0;
  let tooLarge = false;
  let truncatedFiles = 0;

  for (const file of files) {
    if (tooLarge) {
      // Past the cap — don't diff at all, just note the file
      diffParts.push(`--- a/${file}\n+++ b/${file}\n@@ ... @@\n[omitted — total diff too large]`);
      truncatedFiles++;
      continue;
    }

    const fileDiff = await runGit(["diff", "--cached", "--", file]);
    const remainingBudget = MAX_DIFF_CHARS - totalChars;

    if (fileDiff.length <= remainingBudget) {
      diffParts.push(fileDiff);
      totalChars += fileDiff.length;
    } else if (fileDiff.length > remainingBudget) {
      // This individual file is too big — show stats instead
      const stat = await runGit(["diff", "--cached", "--stat", "--", file]);
      diffParts.push(`--- a/${file}\n+++ b/${file}\n@@ ... @@\n${stat.trim()}`);
      truncatedFiles++;

      // After adding the stat line, check if we're over budget
      if (totalChars >= MAX_DIFF_CHARS) {
        tooLarge = true;
      }
    }
  }

  let diff = diffParts.join("\n");

  // If truncation happened, append a note for the LLM
  if (truncatedFiles > 0) {
    const note = `\n# Note: The diff was truncated to ${MAX_PROMPT_TOKENS.toLocaleString()} tokens. ` +
      `${truncatedFiles} file(s) have stats-only summaries above. ` +
      `Use the file list and stats to infer the scope of the change.`;
    diff += note;
  }

  let history: string[] = [];
  try {
    history = (await runGit(["log", "--pretty=format:%s", "-n", "10"]))
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    history = ["Initial commit"];
  }

  let branch: string;
  try {
    branch = (await runGit(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  } catch {
    branch = "(detached)";
  }

  return { diff, files, history, branch };
}

function buildPrompt(ctx: { diff: string; files: string[]; history: string[]; branch: string }): string {
  return `
Generate a single commit message based on the provided context.

## Branch
${ctx.branch}

## Files Changed
${ctx.files.join(", ")}

## Diff
\`\`\`diff
${ctx.diff}
\`\`\`

## Recent Commits
\`\`\`
${ctx.history.join("\n")}
\`\`\`

## Requirements

- **Format**: No need to Follow Conventional Commits formats, Be chill and descriptive, keep it short, You don't need to mention accurately the exact changes we did. Just mention what is different from the project now after we did the commit message. 
- **Scope**: Should reflect the affected area (or be omitted if unclear)
- **Style**: Capture the primary user-visible or developer-visible change in the subject

## Body (optional)

Include only if necessary to explain non-obvious changes.

- Explain **what** changed and **why** (not how)
- Use bullet points if multiple changes exist
- Wrap lines at 72 characters

## Output Rules

- Return **only** the commit message
- No extra commentary or explanation
`;
}

function parseCommitMessage(fullMessage: string): { subject: string; body: string } {
  const lines = fullMessage.trim().split("\n");
  const subject = lines[0].trim();
  
  // Skip blank line after subject, join rest as body
  const bodyLines: string[] = [];
  let foundBlankLine = false;
  
  for (let i = 1; i < lines.length; i++) {
    if (!foundBlankLine && lines[i].trim() === "") {
      foundBlankLine = true;
      continue;
    }
    if (foundBlankLine) {
      bodyLines.push(lines[i]);
    }
  }
  
  const body = bodyLines.join("\n").trim();
  return { subject, body };
}

function createUserMessage(content: string): UserMessage {
  return {
    role: "user",
    content,
    timestamp: Date.now(),
  };
}

async function main() {
  try {
    console.log("Reading staged changes...");
    const ctx = await getGitContext();
    console.log(`   ${ctx.files.length} files`);

    const config = getConfig();
    console.log(`Clanker: ${config.provider}/${config.modelId}`);

		const model = getModel(config.provider as any, config.modelId);
		if (!model) {
			throw new Error(`Model ${config.provider}/${config.modelId} not found`);
		}

		console.log("Generating commit message...");

    const prompt = buildPrompt(ctx)
    console.log("token prediction:", Math.floor(prompt.length / 5.5))
    const context: Context = {
      systemPrompt: "You write concise git commit messages.",
      messages: [createUserMessage(prompt)],
    };

    const result = await complete(model, context, { apiKey: config.apiKey });
    
    const text = result.content
      .filter(c => c.type === "text")
      .map(c => (c as any).text)
      .join("");
    
    const { subject, body } = parseCommitMessage(text);
    
    // Display the message
    const R = "\x1b[0m";
    const bold = "\x1b[1m";
    const dim = "\x1b[2m";
    const cyan = "\x1b[36m";

    console.log();
    console.log(bold + cyan + subject + R);
    if (body) {
      console.log();
      console.log(dim + body + R);
    }
    console.log();

    // Commit with Bun shell - handles escaping automatically
    if (body) {
      await $`git commit -m ${subject} -m ${body}`;
    } else {
      await $`git commit -m ${subject}`;
    }
    console.log("Committed!");

  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
