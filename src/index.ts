#!/usr/bin/env node

import { execSync } from "child_process";
import { getModel, complete, type Context, type UserMessage } from "@earendil-works/pi-ai";
import { decryptApiKey, PROVIDER, MODEL } from "./encrypted-config";

function getConfig() {
  // Binary must have encrypted config built in
  if (!PROVIDER || !MODEL) {
    console.error("❌ No encrypted API key found in binary.");
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

async function getGitContext() {
  const diff = execSync("git diff --cached", { encoding: "utf-8" });
  if (!diff.trim()) {
    throw new Error("No staged changes. Run 'git add' first.");
  }

  const files = execSync("git diff --cached --name-only", { encoding: "utf-8" })
    .trim()
    .split("\n")
    .filter(Boolean);

  // Get commit history (may fail if no commits yet)
  let history: string[] = [];
  try {
    const historyOutput = execSync('git log --pretty=format:"%s" -n 10', { 
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"] // Suppress stderr
    });
    history = historyOutput.trim().split("\n").filter(Boolean);
  } catch {
    // No commits yet, use empty history
    history = ["Initial commit"];
  }

  return { diff: diff.slice(0, 50000), files, history };
}

function buildPrompt(ctx: { diff: string; files: string[]; history: string[] }): string {
  return `Write a conventional commit message for these changes.

Files: ${ctx.files.join(", ")}

Diff:
\`\`\`diff
${ctx.diff}
\`\`\`

Recent commits:
${ctx.history.join("\n")}

Rules:
- Format: type(scope): subject (body optional)
- Types: feat, fix, docs, style, refactor, test, chore, perf
- Subject: imperative, lowercase, no period, under 72 chars
- Body: explain WHY if needed

Output ONLY the commit message.`;
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

    console.log("📝 Generating...");
    
    const context: Context = {
      systemPrompt: "You write clear, concise commit messages.",
      messages: [createUserMessage(buildPrompt(ctx))],
    };

    const result = await complete(model, context, { apiKey: config.apiKey });
    
    const text = result.content
      .filter(c => c.type === "text")
      .map(c => (c as any).text)
      .join("");
    
    const message = text.trim();
    
    console.log("\n" + "=".repeat(50));
    console.log(message);
    console.log("=".repeat(50) + "\n");

    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { stdio: "inherit" });
    console.log("✅ Done");

  } catch (err) {
    console.error("❌", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
