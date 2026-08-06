import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

function readDotEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!match) continue;
    env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return env;
}

const env = readDotEnv(".env");
const secrets = {
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
};

const missing = Object.entries(secrets)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(`Missing required .env values: ${missing.join(", ")}`);
  process.exit(1);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(
  npm,
  [
    "exec",
    "--yes",
    "--package=wrangler",
    "--",
    "wrangler",
    "--cwd",
    ".output/server",
    "secret",
    "bulk",
  ],
  {
    env: { ...process.env, npm_config_cache: ".npm-cache" },
    shell: process.platform === "win32",
    stdio: ["pipe", "inherit", "inherit"],
  },
);

child.stdin.end(JSON.stringify(secrets));
child.on("exit", (code) => process.exit(code ?? 1));
