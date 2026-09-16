import { z } from "zod";

const repoConfigSchema = z.object({
  name: z.string(),
  buildEnv: z.record(z.string()).default({}),
  installEnv: z.record(z.string()).default({}),
  proofCommand: z.string(),
  deployCommand: z.string(),
  d1Database: z.string().optional(),
  proofTimeoutMs: z.number().positive().optional(),
  proofCommandTimeoutMs: z.number().positive().optional(),
  deployTimeoutMs: z.number().positive().optional(),
  deployCommandTimeoutMs: z.number().positive().optional(),
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
      "pnpm exec vp run build:all && pnpm exec vp check && pnpm test",
    deployCommand: "pnpm exec vp run deploy",
    d1Database: "vortex-sign-global",
    proofTimeoutMs: 45 * MINUTE,
    proofCommandTimeoutMs: 44 * MINUTE + 50 * 1000,
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
