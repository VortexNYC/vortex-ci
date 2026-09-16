import { env } from "node:process";

const accountId =
  env.CLOUDFLARE_ACCOUNT_ID ?? "31bfc2c14a28e0a39e8b9e3c556a18be";
const workflowName = "vortex-ci";

function usage() {
  console.error(
    "Usage: INSTANCE_ID=<id> [STEP=<name>] node scripts/get-logs.mjs"
  );
  console.error(
    "       STEP defaults to deploy-1. Use --json to emit raw JSON."
  );
  process.exit(1);
}

const token = env.CLOUDFLARE_API_TOKEN;
const instanceId = env.INSTANCE_ID;
const step = env.STEP ?? "deploy-1";
const rawJson = process.argv.includes("--json");

if (!token || !instanceId) {
  usage();
}

const url =
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/` +
  `workflows/${workflowName}/instances/${instanceId}/step` +
  `?name=${encodeURIComponent(step)}&type=step`;

const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  process.exit(1);
}

const contentType = res.headers.get("content-type") ?? "";
if (contentType.includes("application/json")) {
  const data = await res.json();
  if (!data.success) {
    console.error(data.errors);
    process.exit(1);
  }
  if (rawJson) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    const output = data.result?.output;
    if (output && typeof output === "object") {
      console.log(`--- ${step} exit code: ${output.exitCode} ---`);
      if (output.logs?.stdout) process.stdout.write(output.logs.stdout);
      if (output.logs?.stderr) process.stderr.write(output.logs.stderr);
    } else {
      console.log(output);
    }
  }
} else {
  // Streamed binary output
  const reader = res.body?.getReader();
  if (!reader) {
    console.error("No response body");
    process.exit(1);
  }
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    process.stdout.write(decoder.decode(value, { stream: true }));
  }
}
