#!/usr/bin/env bun

import { $ } from "bun";
import { getModel, complete, type Context, type UserMessage } from "@earendil-works/pi-ai";
import { decryptApiKey, PROVIDER, MODEL } from "./encrypted-config.js";

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
  const diff = await runGit(["diff", "--cached"]);
  
  if (!diff.trim()) {
    throw new Error("No staged changes. Run 'git add' first.");
  }

  const files = (await runGit(["diff", "--cached", "--name-only"]))
    .trim()
    .split("\n")
    .filter(Boolean);

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
Generate a single conventional commit message based on the provided context.

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

- **Format**: Follow Conventional Commits format: \`type(scope): short description\`
- **Scope**: Should reflect the affected area (or be omitted if unclear)
- **Subject**: Subject line must be concise, imperative, at most 72 characters, and have no trailing period
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
