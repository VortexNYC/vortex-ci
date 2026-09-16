import { z } from "zod";

const repoConfigSchema = z.object({
  name: z.string(),
  buildEnv: z.record(z.string()).default({}),
  installEnv: z.record(z.string()).default({}),
  proofCommand: z.string(),
  deployCommand: z.string().optional(),
  deployCommands: z.array(z.string()).optional(),
  d1Database: z.string().optional(),
  proofTimeoutMs: z.number().positive().optional(),
  proofCommandTimeoutMs: z.number().positive().optional(),
  deployTimeoutMs: z.number().positive().optional(),
  deployCommandTimeoutMs: z.number().positive().optional(),
  perDeployTimeoutMs: z.number().positive().optional(),
});

export type RepoConfig = z.infer<typeof repoConfigSchema>;

const MINUTE = 60 * 1000;

const repoConfigs: Record<string, RepoConfig> = {
  "vortex-sign": {
    name: "vortex-sign",
    buildEnv: {
      VITE_API_URL: "https://api.seal.nyc",
      VITE_BETTER_AUTH_URL: "https://api.seal.nyc",
      VITE_APP_URL: "https://app.seal.nyc",
      HOME: "/tmp",
    },
    installEnv: {
      HOME: "/tmp",
      CI: "true",
    },
    proofCommand:
      "(pnpm exec vp run build:all > /tmp/build.log 2>&1; build_status=$?; tail -c 150000 /tmp/build.log; exit $build_status) && " +
      "(pnpm exec vp check > /tmp/check.log 2>&1; check_status=$?; tail -c 50000 /tmp/check.log; exit $check_status) && " +
      "(pnpm test > /tmp/test.log 2>&1; test_status=$?; tail -c 40000 /tmp/test.log; exit $test_status)",
    deployCommand:
      "(cd apps/anydoc-worker && pnpm exec wrangler deploy) && " +
      "(cd apps/convert-worker && pnpm exec wrangler deploy) && " +
      "(cd apps/api && pnpm exec wrangler deploy -e production) && " +
      "(cd apps/mcp-worker && pnpm exec wrangler deploy) && " +
      "(cd apps/web && pnpm exec wrangler deploy)",
    d1Database: "vortex-sign-global",
    proofTimeoutMs: 30 * MINUTE,
    proofCommandTimeoutMs: 29 * MINUTE + 50 * 1000,
    deployTimeoutMs: 45 * MINUTE,
    deployCommandTimeoutMs: 44 * MINUTE + 50 * 1000,
  },
};

const repoNameSchema = z.enum(["vortex-sign"]);

export function getRepoConfig(repoName: unknown): RepoConfig {
  const name = repoNameSchema.parse(repoName);
  const config = repoConfigs[name];
  if (!config) {
    throw new Error(`Unsupported repository: ${String(name)}`);
  }
  return repoConfigSchema.parse(config);
}
