import type { CiBindings } from "@cloudflare/ci/worker";

// Extends the official @cloudflare/ci bindings with the repository-specific
// secrets and deployment account used by the Vortex CI pipeline.
// Source: https://github.com/cloudflare/ci/tree/main/examples/cloudflare-artifacts
export type Bindings = CiBindings & {
  NPM_TOKEN: string;
  CLOUDFLARE_DEPLOY_ACCOUNT_ID: string;
};
