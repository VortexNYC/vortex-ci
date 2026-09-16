import { CiSandbox } from "@cloudflare/ci/worker";

import { CI } from "./ci";
import type { Bindings } from "./env";

export { CiSandbox, CI };

export default {
  fetch(_request: Request, _env: Bindings) {
    return new Response("vortex-ci", { status: 200 });
  },
};
