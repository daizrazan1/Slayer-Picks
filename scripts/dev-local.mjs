import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, ".env.local");

if (!existsSync(envPath)) {
  console.error("Create .env.local from .env.example and add your Supabase DATABASE_URL.");
  process.exit(1);
}

process.loadEnvFile(envPath);

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("[YOUR-PASSWORD]")) {
  console.error("Replace [YOUR-PASSWORD] in .env.local with your Supabase database password.");
  process.exit(1);
}

if (!/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL)) {
  console.error("DATABASE_URL must be the PostgreSQL URI from Supabase Connect, not the project web URL.");
  process.exit(1);
}

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error("Add a SESSION_SECRET of at least 32 characters to .env.local.");
  process.exit(1);
}

const children = [];
let stopping = false;

function run(args, extraEnv = {}, stopOnExit = true) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });
  children.push(child);
  child.on("exit", (code) => {
    if (!stopping && stopOnExit) {
      console.error(`App process stopped with code ${code ?? "unknown"}.`);
      stop();
    }
  });
  return child;
}

function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

const build = run([resolve(root, "artifacts/api-server/build.mjs")], {}, false);
build.on("exit", (code) => {
  if (stopping) return;
  if (code !== 0) {
    console.error("API build failed.");
    process.exitCode = code ?? 1;
    return;
  }
  run(["--enable-source-maps", resolve(root, "artifacts/api-server/dist/index.mjs")], {
    NODE_ENV: "development",
    PORT: "3001",
  });
  run([resolve(root, "artifacts/fantasy-helper/node_modules/vite/bin/vite.js"), "--config", resolve(root, "artifacts/fantasy-helper/vite.config.ts")], {
    NODE_ENV: "development",
    PORT: "3000",
    BASE_PATH: "/",
    API_PROXY_TARGET: "http://127.0.0.1:3001",
  });
  console.log("Open http://localhost:3000 when both servers are ready.");
});
