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

const stepConfig = {
  install: {
    timeoutMs: 20 * MINUTE,
    commandTimeoutMs: 19 * MINUTE + 50 * 1000,
  },
  check: {
    timeoutMs: 20 * MINUTE,
    commandTimeoutMs: 19 * MINUTE + 50 * 1000,
  },
  build: {
    timeoutMs: 20 * MINUTE,
    commandTimeoutMs: 19 * MINUTE + 50 * 1000,
  },
  migrate: {
    timeoutMs: 10 * MINUTE,
    commandTimeoutMs: 9 * MINUTE + 50 * 1000,
  },
  deploy: {
    timeoutMs: 45 * MINUTE,
    commandTimeoutMs: 44 * MINUTE + 50 * 1000,
  },
};

const npmrcCommand =
  'printf "@%s:registry=https://npm.pkg.github.com\\n" vortexnyc > /tmp/.npmrc && ' +
  'printf "//npm.pkg.github.com/:_authToken=%s\\n" "$NPM_TOKEN" >> /tmp/.npmrc';

// Generic pipeline shape from the Cloudflare Artifacts example:
// install -> parallel lint/test/typecheck/build -> migrate (main) -> deploy (main)
// Per-repo commands and env are resolved from src/repos.ts.
// Source: https://github.com/cloudflare/ci/tree/main/examples/cloudflare-artifacts
export class CI extends CIWorkflow<CloudflareArtifacts, Bindings> {
  protected async pipeline(
    _event: WorkflowEvent<CiParams<CloudflareArtifacts>>,
    _step: WorkflowStep,
    ci: CiContext
  ): Promise<void> {
    const repo = _event.payload.repo;
    const branch = _event.payload.branch;
    const config = getRepoConfig(repo);

    const install = await ci.runner({
      name: "install",
      command: `${npmrcCommand} && pnpm install --frozen-lockfile`,
      cache: { inputs: ["package.json", "pnpm-lock.yaml"] },
      secrets: ["NPM_TOKEN"],
      env: config.installEnv,
      config: {
        timeout: stepConfig.install.timeoutMs,
        commandTimeoutMs: stepConfig.install.commandTimeoutMs,
      },
    });

    const [, , , build] = await Promise.all([
      install.runner({
        name: "lint",
        command: "pnpm exec vp run lint",
        config: {
          timeout: stepConfig.check.timeoutMs,
          commandTimeoutMs: stepConfig.check.commandTimeoutMs,
        },
      }),
      install.runner({
        name: "typecheck",
        command: "pnpm exec vp run typecheck",
        config: {
          timeout: stepConfig.check.timeoutMs,
          commandTimeoutMs: stepConfig.check.commandTimeoutMs,
        },
      }),
      install.runner({
        name: "test",
        command: "pnpm exec vp run test",
        config: {
          timeout: stepConfig.check.timeoutMs,
          commandTimeoutMs: stepConfig.check.commandTimeoutMs,
        },
      }),
      install.runner({
        name: "build",
        command: "pnpm exec vp run build:all",
        env: config.buildEnv,
        config: {
          timeout: stepConfig.build.timeoutMs,
          commandTimeoutMs: stepConfig.build.commandTimeoutMs,
        },
      }),
    ]);

    if (branch !== "main") {
      return;
    }

    if (config.d1Database) {
      await install.runner({
        name: "migrate",
        command: `cd apps/api && pnpm exec wrangler d1 migrations apply ${config.d1Database} --env production --remote`,
        cloudflareCredentials: {
          accountId: this.env.CLOUDFLARE_ACCOUNT_ID,
        },
        config: {
          timeout: stepConfig.migrate.timeoutMs,
          commandTimeoutMs: stepConfig.migrate.commandTimeoutMs,
        },
      });
    }

    await build.runner({
      name: "deploy",
      command: config.deployCommand,
      cloudflareCredentials: {
        accountId: this.env.CLOUDFLARE_DEPLOY_ACCOUNT_ID,
      },
      config: {
        timeout: stepConfig.deploy.timeoutMs,
        commandTimeoutMs: stepConfig.deploy.commandTimeoutMs,
      },
    });
  }
}
