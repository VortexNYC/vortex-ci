import { z } from "zod";

const repoConfigSchema = z.object({
  name: z.string(),
  buildEnv: z.record(z.string()).default({}),
  installEnv: z.record(z.string()).default({}),
  buildCommand: z.string(),
  proofCommand: z.string(),
  deployCommand: z.string(),
  d1Database: z.string().optional(),
});

export type RepoConfig = z.infer<typeof repoConfigSchema>;

const buildCommand = "pnpm exec vp run build:all";

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
    buildCommand,
    proofCommand: `${buildCommand} && pnpm exec vp check && pnpm test`,
    deployCommand:
      "(cd apps/anydoc-worker && pnpm exec wrangler deploy) && " +
      "(cd apps/convert-worker && pnpm exec wrangler deploy) && " +
      "(cd apps/api && pnpm exec wrangler deploy -e production) && " +
      "(cd apps/mcp-worker && pnpm exec wrangler deploy) && " +
      "(cd apps/web && pnpm exec wrangler deploy)",
    d1Database: "vortex-sign-global",
  },
};

const repoNameSchema = z.enum(["vortex-sign"]);

export function getRepoConfig(repoName: unknown): RepoConfig | undefined {
  const parsed = repoNameSchema.safeParse(repoName);
  if (!parsed.success) {
    return undefined;
  }
  const config = repoConfigs[parsed.data];
  return config ? repoConfigSchema.parse(config) : undefined;
}
