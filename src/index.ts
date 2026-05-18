#!/usr/bin/env bun

import { $ } from "bun";
import { getModel, complete, type Context, type UserMessage } from "@earendil-works/pi-ai";
import { decryptApiKey, PROVIDER, MODEL } from "./encrypted-config";

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

  return { diff: diff.slice(0, 50000), files, history };
}

function buildPrompt(ctx: { diff: string; files: string[]; history: string[] }): string {
  return `
Write the most unhinged commit message, in the style of gen z, based on the changes.

Files: ${ctx.files.join(", ")}

Diff:
\`\`\`diff
${ctx.diff}
\`\`\`

Recent commits:
${ctx.history.join("\n")}

Rules for commit message:
1. First line (subject): type(scope): description all in genz terms

2. Second line: blank

3. Remaining lines (body): Explain WHAT changed and WHY in more serious terms
   - Wrap at 72 characters
   - Use bullet points for multiple changes
   - Be specific but concise

If the changes are simple/trivial, you may omit the body.

Respond with ONLY the commit message, nothing else.`;
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
    console.log("📋 Reading staged changes...");
    const ctx = await getGitContext();
    console.log(`   ${ctx.files.length} files`);

    const config = getConfig();
    console.log(`🤖 ${config.provider}/${config.modelId}`);

    const model = getModel(config.provider as any, config.modelId);
    if (!model) {
      throw new Error(`Model ${config.provider}/${config.modelId} not found`);
    }

    console.log("📝 Generating commit message...");
    
    const context: Context = {
      systemPrompt: "You are an expert at writing clear, conventional commit messages.",
      messages: [createUserMessage(buildPrompt(ctx))],
    };

    const result = await complete(model, context, { apiKey: config.apiKey });
    
    const text = result.content
      .filter(c => c.type === "text")
      .map(c => (c as any).text)
      .join("");
    
    const { subject, body } = parseCommitMessage(text);
    
    // Display the message
    console.log("\n" + "=".repeat(60));
    console.log(subject);
    if (body) {
      console.log();
      console.log(body);
    }
    console.log("=".repeat(60) + "\n");

    // Commit with Bun shell - handles escaping automatically
    if (body) {
      await $`git commit -m ${subject} -m ${body}`;
    } else {
      await $`git commit -m ${subject}`;
    }
    console.log("✅ Committed!");

  } catch (err) {
    console.error("❌", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
