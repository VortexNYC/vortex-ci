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
const MIGRATE_TIMEOUT_MS = 10 * MINUTE;
const MIGRATE_COMMAND_TIMEOUT_MS = 3 * MINUTE;

const npmrcCommand =
  "{ cp .npmrc ~/.npmrc 2>/dev/null || printf '@vortexnyc:registry=https://npm.pkg.github.com\\n' > ~/.npmrc; } && " +
  'printf "//npm.pkg.github.com/:_authToken=%s\\n" "$NPM_TOKEN" >> ~/.npmrc';

const loggedInstall =
  "(pnpm install --frozen-lockfile > /tmp/ci-install.log 2>&1; install_status=$?; tail -c 100000 /tmp/ci-install.log; [ $install_status -eq 0 ] || exit $install_status)";

// vortex-payments runs a single proof step for non-main and a single deploy
// step for main. Large Vortex monorepos hit RPCTransportErrors and long restore
// times when four parallel runners each download the install workspace snapshot.
// A single runner per stage keeps the snapshot in one container, matches the
// existing working pattern, and is still generic across repos.
export class CI extends CIWorkflow<CloudflareArtifacts, Bindings> {
  protected async pipeline(
    _event: WorkflowEvent<CiParams<CloudflareArtifacts>>,
    _step: WorkflowStep,
    ci: CiContext
  ): Promise<void> {
    const repo = _event.payload.repo;
    const branch = _event.payload.branch;
    const config = getRepoConfig(repo);

    const baseEnv = {
      ...config.installEnv,
      ...config.buildEnv,
    };

    const proof = await ci.runner({
      name: "proof",
      command: `sh -c '${npmrcCommand} && ${loggedInstall} && ${config.proofCommand}'`,
      secrets: ["NPM_TOKEN"],
      env: baseEnv,
      config: {
        timeout: config.proofTimeoutMs ?? 30 * MINUTE,
        commandTimeoutMs: config.proofCommandTimeoutMs ?? 29 * MINUTE + 50 * 1000,
      },
    });

    if (branch !== "main") {
      return;
    }

    if (config.d1Database) {
      await ci.runner({
        name: "migrate",
        command: `wrangler d1 migrations apply ${config.d1Database} --env production --remote`,
        cwd: "apps/api",
        cloudflareCredentials: {
          accountId: this.env.CLOUDFLARE_ACCOUNT_ID,
        },
        env: baseEnv,
        config: {
          timeout: MIGRATE_TIMEOUT_MS,
          commandTimeoutMs: MIGRATE_COMMAND_TIMEOUT_MS,
        },
      });
    }

    await proof.runner({
      name: "deploy",
      command: `sh -c '${npmrcCommand} && ${loggedInstall} && ${config.deployCommand}'`,
      cloudflareCredentials: {
        accountId: this.env.CLOUDFLARE_DEPLOY_ACCOUNT_ID,
      },
      secrets: ["NPM_TOKEN"],
      env: baseEnv,
      config: {
        timeout: config.deployTimeoutMs ?? 45 * MINUTE,
        commandTimeoutMs: config.deployCommandTimeoutMs ?? 44 * MINUTE + 50 * 1000,
      },
    });
  }
}
