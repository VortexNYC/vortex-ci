import {
  CIWorkflow,
  type CiContext,
  type CiParams,
  type CloudflareArtifacts,
} from "@cloudflare/ci";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import type { Bindings } from "./env";
import { getRepoConfig } from "./repos";

const MINUTE = 60 * 1000;

// Workflow steps must stay within Cloudflare's 30-minute ceiling and still
// leave the sandbox time to snapshot /workspace before the step timeout fires.
// Source: https://developers.cloudflare.com/workflows/build/rules-of-workflows/
const PROOF_STEP_TIMEOUT_MS = 25 * MINUTE;
const PROOF_COMMAND_TIMEOUT_MS = 20 * MINUTE;
const MIGRATE_STEP_TIMEOUT_MS = 10 * MINUTE;
const MIGRATE_COMMAND_TIMEOUT_MS = 3 * MINUTE;
const DEPLOY_STEP_TIMEOUT_MS = 30 * MINUTE;
const DEPLOY_COMMAND_TIMEOUT_MS = 25 * MINUTE;

// The sandbox runs every command as a wrapped subshell, so we only need the
// shell string itself. We deliberately keep the workspace free of node_modules
// and build artifacts before the snapshot is taken, otherwise each backup
// becomes a multi-gigabyte squashfs upload that exhausts the step margin and
// triggers RPCTransportError / internal Workflow failures.
const npmrcCommand =
  '{ cp .npmrc ~/.npmrc 2>/dev/null || printf "@vortexnyc:registry=https://npm.pkg.github.com\\n" > ~/.npmrc; } && ' +
  'printf "//npm.pkg.github.com/:_authToken=%s\\n" "$NPM_TOKEN" >> ~/.npmrc';

const cleanupCommand =
  'find . -type d \\( -name node_modules -o -name dist -o -name .cache -o -name .wrangler \\) -prune -exec rm -rf {} + 2>/dev/null';

export class CI extends CIWorkflow<CloudflareArtifacts, Bindings> {
  protected async pipeline(
    _event: WorkflowEvent<CiParams<CloudflareArtifacts>>,
    _step: WorkflowStep,
    ci: CiContext
  ): Promise<void> {
    const repo = _event.payload.repo;
    const branch = _event.payload.branch;
    const config = getRepoConfig(repo);

    if (!config) {
      console.log(`[vortex-ci] skipping unsupported repo: ${String(repo)}`);
      return;
    }

    const baseEnv = {
      ...config.installEnv,
      ...config.buildEnv,
    };

    const proofCommand =
      `${npmrcCommand} && ` +
      `pnpm install --frozen-lockfile && ` +
      `${config.proofCommand} && ` +
      cleanupCommand;

    const proofResult = await ci.runner({
      name: "proof",
      command: proofCommand,
      secrets: ["NPM_TOKEN"],
      env: baseEnv,
      config: {
        timeout: PROOF_STEP_TIMEOUT_MS,
        commandTimeoutMs: PROOF_COMMAND_TIMEOUT_MS,
      },
    });

    if (branch !== "main") {
      if (config.previewCommand) {
        // Stable per-branch preview alias, e.g. fix-foo-seal-web.<sub>.workers.dev.
        const previewAlias = (branch ?? "preview")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40);
        const previewEnv = { ...baseEnv, CI_PREVIEW_ALIAS: previewAlias };

        const previewCommand =
          `${npmrcCommand} && ` +
          `pnpm install --frozen-lockfile && ` +
          `${config.buildCommand} && ` +
          `${config.previewCommand} && ` +
          cleanupCommand;

        await proofResult.runner({
          name: "preview",
          command: previewCommand,
          secrets: ["NPM_TOKEN"],
          cloudflareCredentials: {
            accountId: this.env.CLOUDFLARE_ACCOUNT_ID,
          },
          env: previewEnv,
          config: {
            timeout: DEPLOY_STEP_TIMEOUT_MS,
            commandTimeoutMs: DEPLOY_COMMAND_TIMEOUT_MS,
          },
        });
      }
      return;
    }

    let deployInput = proofResult;

    if (config.d1Database) {
      const migrateResult = await proofResult.runner({
        name: "migrate",
        command: `wrangler d1 migrations apply ${config.d1Database} --env production --remote`,
        cwd: "apps/api",
        cloudflareCredentials: {
          accountId: this.env.CLOUDFLARE_ACCOUNT_ID,
        },
        env: baseEnv,
        config: {
          timeout: MIGRATE_STEP_TIMEOUT_MS,
          commandTimeoutMs: MIGRATE_COMMAND_TIMEOUT_MS,
        },
      });
      deployInput = migrateResult;
    }

    const deployCommand =
      `${npmrcCommand} && ` +
      `pnpm install --frozen-lockfile && ` +
      `${config.buildCommand} && ` +
      `${config.deployCommand} && ` +
      cleanupCommand;

    await deployInput.runner({
      name: "deploy",
      command: deployCommand,
      secrets: ["NPM_TOKEN"],
      cloudflareCredentials: {
        accountId: this.env.CLOUDFLARE_ACCOUNT_ID,
      },
      env: baseEnv,
      config: {
        timeout: DEPLOY_STEP_TIMEOUT_MS,
        commandTimeoutMs: DEPLOY_COMMAND_TIMEOUT_MS,
      },
    });
  }
}
