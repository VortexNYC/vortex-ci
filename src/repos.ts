import { z } from "zod";

const repoConfigSchema = z.object({
  name: z.string(),
  buildEnv: z.record(z.string()).default({}),
  installEnv: z.record(z.string()).default({}),
  d1Database: z.string().optional(),
  deployCommand: z.string(),
});

export type RepoConfig = z.infer<typeof repoConfigSchema>;

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
      NPM_CONFIG_USERCONFIG: "/tmp/.npmrc",
    },
    d1Database: "vortex-sign-global",
    deployCommand: "pnpm exec vp run deploy",
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
