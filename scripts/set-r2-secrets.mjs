#!/usr/bin/env node
// Usage:
//   R2_API_TOKEN=<r2-token-value> pnpm exec scripts/set-r2-secrets.mjs
//   R2_ACCESS_KEY_ID=<id> R2_SECRET_ACCESS_KEY=<secret> pnpm exec scripts/set-r2-secrets.mjs
// Sets R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY as secrets on the vortex-ci worker.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

let accessKeyId = process.env.R2_ACCESS_KEY_ID;
let secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

if (process.env.R2_API_TOKEN) {
  const token = process.env.R2_API_TOKEN;
  const verifyResp = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!verifyResp.ok) {
    console.error("Failed to verify R2_API_TOKEN:", verifyResp.status, await verifyResp.text());
    process.exit(1);
  }

  const verify = await verifyResp.json();
  if (!verify.success) {
    console.error("R2_API_TOKEN verification failed:", JSON.stringify(verify.errors));
    process.exit(1);
  }

  accessKeyId = verify.result.id;
  secretAccessKey = createHash("sha256").update(token).digest("hex");
}

if (!accessKeyId || !secretAccessKey) {
  console.error(
    "Missing R2 credentials. Set either R2_API_TOKEN or both R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY."
  );
  process.exit(1);
}

for (const [name, value] of [
  ["R2_ACCESS_KEY_ID", accessKeyId],
  ["R2_SECRET_ACCESS_KEY", secretAccessKey],
]) {
  try {
    execFileSync("pnpm", ["exec", "wrangler", "secret", "put", name], {
      input: value,
      cwd: new URL("..", import.meta.url),
      stdio: ["pipe", "inherit", "inherit"],
    });
    console.log(`Set ${name}`);
  } catch (err) {
    console.error(`Failed to set ${name}:`, err.message);
    process.exit(1);
  }
}
