#!/usr/bin/env node
/**
 * Expo launcher that keeps EXPO_PUBLIC_API_URL pointed at this machine's current
 * LAN IP.
 *
 * WHY: on a physical phone (Expo Go), the app reaches the dev backend by the
 * Mac's LAN IP — but that IP changes with the network (Wi-Fi, hotspot, DHCP
 * lease). A stale IP in .env makes every API call fail ("Could not submit",
 * "Failed to fetch nearby stores") while a cached login still looks signed in.
 * This script rewrites the IP on every start so it can never drift out of sync.
 *
 * Because EXPO_PUBLIC_* values are inlined into the JS bundle at build time, a
 * changed IP requires clearing the Metro cache (`-c`) — we do that automatically
 * only when the IP actually changed, so normal restarts stay fast.
 *
 * Override the port with API_PORT (default 4000). Extra args pass through to
 * `expo start` (e.g. `npm start -- --tunnel`).
 */
import { networkInterfaces } from "node:os";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = join(ROOT, ".env");
const PORT = process.env.API_PORT || "4000";
const KEY = "EXPO_PUBLIC_API_URL";

/** First non-internal IPv4 address (prefers common LAN ranges). */
function lanIP() {
  const nets = networkInterfaces();
  const candidates = [];
  for (const addrs of Object.values(nets)) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) candidates.push(a.address);
    }
  }
  // Prefer typical private LAN ranges over things like VPN/utun interfaces.
  const preferred = candidates.find((ip) =>
    /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip)
  );
  return preferred || candidates[0] || "localhost";
}

const ip = lanIP();
const url = `http://${ip}:${PORT}/api`;

let env = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
const line = `${KEY}=${url}`;
const re = new RegExp(`^${KEY}=.*$`, "m");
const prev = env.match(re)?.[0];
const changed = prev !== line;

if (re.test(env)) {
  env = env.replace(re, line);
} else {
  env = env ? `${env.replace(/\n?$/, "\n")}${line}\n` : `${line}\n`;
}
writeFileSync(ENV_PATH, env);

console.log(
  changed
    ? `✓ API URL set to ${url} (was ${prev ? prev.split("=")[1] : "unset"}) — clearing Metro cache`
    : `✓ API URL already ${url}`
);

const args = ["expo", "start", ...(changed ? ["-c"] : []), ...process.argv.slice(2)];
spawn("npx", args, { stdio: "inherit", cwd: ROOT }).on("exit", (code) =>
  process.exit(code ?? 0)
);
