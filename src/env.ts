import type { CiBindings } from "@cloudflare/ci/worker";

export type Bindings = CiBindings & {
  NPM_TOKEN: string;
  ADMIN_TOKEN?: string;
};
