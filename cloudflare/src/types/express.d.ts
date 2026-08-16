/**
 * Ambient `express` module declarations for the Cloudflare Worker.
 *
 * The ported `_core`/`publisher`/`routers` modules use `import type { ... } from
 * "express"` — these declarations are erased at compile time, but tsc+esbuild
 * still need a resolvable module. Rather than ship the real `express` package
 * (Node-only) into the Worker bundle, we declare the handful of types the
 * ported code actually references, backed by the runtime shim in
 * `_core/expressShim.ts`. The Worker entry (`_core/indexWorker.ts`) drives those
 * modules with `ShimRequest`/`ShimResponse`, which structurally satisfy these
 * types.
 */
import type { ShimRequest, ShimResponse, Method } from "../_core/expressShim";

export type Request = ShimRequest;
export type Response = ShimResponse;
export type Express = {
  get(pattern: string, handler: (req: ShimRequest, res: ShimResponse) => unknown): void;
  post(pattern: string, handler: (req: ShimRequest, res: ShimResponse) => unknown): void;
  use(...args: unknown[]): void;
};

export type CookieOptions = {
  domain?: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: boolean | "lax" | "strict" | "none";
  maxAge?: number;
};

export { Method };
