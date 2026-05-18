#!/usr/bin/env node
/**
 * Build-time encryption for API keys with fuzzy-matching TUI
 */

import { createCipheriv, randomBytes, pbkdf2Sync } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import Enquirer from "enquirer";
import { getProviders, getModels, type Model, type KnownProvider } from "@earendil-works/pi-ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple fuzzy match - checks if chars appear in order
function fuzzyMatch(pattern: string, str: string): boolean {
  pattern = pattern.toLowerCase();
  str = str.toLowerCase();
  let pi = 0;
  for (let si = 0; si < str.length && pi < pattern.length; si++) {
    if (str[si] === pattern[pi]) pi++;
  }
  return pi === pattern.length;
}

// Code artifacts for key derivation
const CODE_ARTIFACTS = [
  "getModel", "complete", "createUserMessage",
  "git diff --cached", "conventional", "anthropic", "claude",
];

function deriveKey(salt: Buffer): Buffer {
  const material = CODE_ARTIFACTS.join("::");
  return pbkdf2Sync(material, salt, 100000, 32, "sha256");
}

function encrypt(plaintext: string, salt: Buffer) {
  const key = deriveKey(salt);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  return {
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    encrypted,
  };
}

async function main() {
  console.log("🔐 Build-Time Encryption Setup\n");

  // Get providers from pi-ai
  const providers = getProviders();
  
  // Select provider with fuzzy matching
  const { provider } = await Enquirer.prompt<{ provider: string }>({
    type: "autocomplete",
    name: "provider",
    message: "Select provider:",
    choices: providers,
    suggest(input: string, choices: any[]) {
      if (!input) return choices;
      return choices.filter(c => fuzzyMatch(input, c.name));
    },
  });
  console.log(`   ✓ ${provider}\n`);

  // Get models for selected provider
  const models = getModels(provider as KnownProvider);
  const modelChoices = models.map((m: Model<any>) => ({
    name: m.id,
    message: `${m.id}${m.name !== m.id ? ` — ${m.name}` : ""}`,
    value: m.id,
  }));

  // Select model with fuzzy matching
  const { modelId } = await Enquirer.prompt<{ modelId: string }>({
    type: "autocomplete",
    name: "modelId",
    message: "Select model:",
    choices: modelChoices,
    suggest(input: string, choices: any[]) {
      if (!input) return choices;
      return choices.filter(c => fuzzyMatch(input, c.name));
    },
  });
  console.log(`   ✓ ${modelId}\n`);

  // Get API key
  const { apiKey } = await Enquirer.prompt<{ apiKey: string }>({
    type: "input",
    name: "apiKey",
    message: `Enter ${provider} API key:`,
  });
  
  if (!apiKey) {
    console.error("❌ API key required");
    process.exit(1);
  }

  // Encrypt
  const salt = randomBytes(32);
  const { iv, authTag, encrypted } = encrypt(apiKey, salt);

  // Generate config
  const configContent = `// Auto-generated encrypted config
const SALT = Buffer.from("${salt.toString("base64")}", "base64");
const IV = Buffer.from("${iv}", "base64");
const AUTH_TAG = Buffer.from("${authTag}", "base64");
const ENCRYPTED = "${encrypted}";

const ARTIFACTS = [
  "getModel", "complete", "createUserMessage",
  "git diff --cached", "conventional", "anthropic", "claude",
];

function deriveDecryptionKey(salt: Buffer): Buffer {
  const crypto = require("crypto");
  const material = ARTIFACTS.join("::");
  return crypto.pbkdf2Sync(material, salt, 100000, 32, "sha256");
}

export function decryptApiKey(): string {
  const crypto = require("crypto");
  const key = deriveDecryptionKey(SALT);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, IV);
  decipher.setAuthTag(AUTH_TAG);
  
  let decrypted = decipher.update(ENCRYPTED, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export const PROVIDER = "${provider}";
export const MODEL = "${modelId}";
`;

  const configPath = path.join(__dirname, "..", "src", "encrypted-config.ts");
  fs.writeFileSync(configPath, configContent);
  
  console.log(`\n✅ Encrypted config: ${configPath}`);
  console.log("🔒 Build with: bun run build");
}

main().catch((err: any) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
