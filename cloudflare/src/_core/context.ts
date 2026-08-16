import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "../schema";
import { sdk } from "./sdk";
import { createReq, createRes, type ShimRequest, type ShimResponse } from "./expressShim";

export type TrpcContext = {
  req: ShimRequest;
  res: ShimResponse;
  user: User | null;
};

export type ContextOptions = Pick<FetchCreateContextFnOptions, "req"> & {
  resHeaders: Headers;
};

/**
 * Build the tRPC context for the Worker. The tRPC fetch adapter passes a fetch
 * `Request` and a shared `resHeaders` handle used for response metadata
 * (headers returned with the final response). The ported routers call
 * `ctx.res.cookie(...)`/`ctx.res.clearCookie(...)` to mutate the session cookie;
 * we forward those Set-Cookie writes into `resHeaders` so they reach the
 * browser. Mutations are collected on the shared handle so the adapter returns
 * them even though each tRPC procedure runs with the same `res`.
 */
export async function createContext(
  opts: ContextOptions
): Promise<TrpcContext> {
  const fetchReq = opts.req;
  const req = createReq(fetchReq, undefined);

  const res = createRes();

  // Forward any Set-Cookie written via the shim `res` into the adapter's
  // shared response-headers handle.
  const shimAppend = res.headers.append.bind(res.headers);
  res.headers.append = ((name: string, value: string) => {
    shimAppend(name, value);
    if (name.toLowerCase() === "set-cookie") {
      opts.resHeaders.append(name, value);
    }
  }) as typeof shimAppend;

  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req,
    res,
    user,
  };
}
