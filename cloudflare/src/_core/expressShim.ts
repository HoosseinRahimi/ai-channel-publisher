/**
 * Minimal Express-compatible surface for the Cloudflare Worker.
 *
 * The ported `_core` route modules (`health.ts`, `cookies.ts`,
 * `cookies.ts`, `sdk.ts`), and `routers.ts` were written
 * against the Express runtime API (`app.get/post`, `req.query/headers/get/body`,
 * `res.status/json/redirect/cookie/clearCookie`). Express itself cannot run on
 * the Workers runtime, and the tRPC fetch adapter does not hand us a `res`.
 *
 * Instead of rewriting every module, we provide a faithful shim: `createReq`
 * / `createRes` translate a standard fetch `Request` into `req`, and collect
 * writes into a `Response` later. `ShimApp` is a tiny route table that the
 * Worker's `fetch` handler drives, so `registerHealthRoute(app)` etc. keep
 * working unchanged. tRPC sets cookies by mutating a shared `resHeaders`
 * handle — see `_core/context.ts`.
 *
 * Types mirror the express signatures the callers actually use (only a subset
 * is needed). Nothing here depends on the `express` package.
 */

export type Method = "get" | "post";

export type ShimHeaders = {
  [key: string]: string | undefined;
};

export type ShimRequest = {
  method: string;
  url: string;
  path: string;
  query: Record<string, string | undefined>;
  params: Record<string, string>;
  headers: ShimHeaders;
  body: unknown;
  protocol: string;
  host?: string | null;
  header(name: string): string | undefined;
  get(name: string): string | undefined;
};

export type ShimResponse = {
  statusCode: number;
  headers: Headers;
  body: unknown;
  status(code: number): ShimResponse;
  set(name: string, value: string): ShimResponse;
  json(payload: unknown): ShimResponse;
  send(payload: unknown): ShimResponse;
  cookie(name: string, value: string, options?: Record<string, unknown>): ShimResponse;
  clearCookie(name: string, options?: Record<string, unknown>): ShimResponse;
  redirect(statusOrUrl: number | string, url?: string): ShimResponse;
};

type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonValue[]
  | { [key: string]: JsonValue };

function parseQuery(search: string): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  const params = new URLSearchParams(search);
  for (const [k, v] of params.entries()) {
    out[k] = v;
  }
  return out;
}

function toJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

let _reqId = 0;

export function createReq(fetchReq: Request, body: unknown): ShimRequest {
  const url = new URL(fetchReq.url);
  const path = url.pathname;
  const protocol = url.protocol === "https:" ? "https" : "http";

  // Express exposes request headers as a plain object with case-insensitive
  // lookup (e.g. `req.headers.cookie`, `req.headers.authorization`). Fetch's
  // `Request.headers` is a `Headers` instance with different semantics, so we
  // materialize a plain map and keep `.get()`/`.header()` helpers.
  const headerMap: Record<string, string> = {};
  fetchReq.headers.forEach((value, key) => {
    headerMap[key] = value;
  });
  const host = headerMap["host"];

  const header = (name: string): string | undefined =>
    headerMap[name.toLowerCase()] ?? headerMap[name] ?? undefined;

  return {
    method: fetchReq.method,
    url: fetchReq.url,
    path,
    query: parseQuery(url.search),
    params: {},
    headers: headerMap,
    body,
    protocol,
    host,
    header,
    get: header,
  };
}

export function createRes(): ShimResponse {
  const resp: ShimResponse = {
    statusCode: 200,
    headers: new Headers(),
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    set(name: string, value: string) {
      this.headers.set(name, value);
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
    cookie(name: string, value: string, options: Record<string, unknown> = {}) {
      let cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
      if (options.maxAge !== undefined) {
        const maxAge = Number(options.maxAge);
        cookieStr += `; Max-Age=${Math.floor(maxAge / 1000)}`;
      }
      if (options.domain) cookieStr += `; Domain=${options.domain}`;
      if (options.path) cookieStr += `; Path=${options.path}`;
      if (options.sameSite) {
        cookieStr += `; SameSite=${String(options.sameSite)}`;
      }
      if (options.secure) cookieStr += "; Secure";
      if (options.httpOnly) cookieStr += "; HttpOnly";
      this.headers.append("Set-Cookie", cookieStr);
      return this;
    },
    clearCookie(name: string, options: Record<string, unknown> = {}) {
      const opts = { ...options, maxAge: -1 };
      return this.cookie(name, "", opts);
    },
    redirect(statusOrUrl: number | string, url?: string) {
      if (typeof statusOrUrl === "number") {
        this.statusCode = statusOrUrl;
        if (url) this.headers.set("Location", url);
      } else {
        this.statusCode = 302;
        this.headers.set("Location", statusOrUrl);
      }
      return this;
    },
  };

  return resp;
}

export function toWorkerResponse(res: ShimResponse, bodyDecoder?: (value: unknown) => BodyInit | null): Response {
  const init: ResponseInit = { status: res.statusCode, headers: res.headers };
  const body = bodyDecoder ? bodyDecoder(res.body) : normalizeBody(res.body);
  return new Response(body, init);
}

function normalizeBody(value: unknown): BodyInit | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(toJsonValue(value));
}

export function jsonResponse(
  payload: JsonValue,
  status = 200,
  headers?: Record<string, string>
): Response {
  return new Response(JSON.stringify(toJsonValue(payload)), {
    status,
    headers: { "content-type": "application/json", ...(headers ?? {}) },
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type RouteHandler = (req: ShimRequest, res: ShimResponse) => any;

export class ShimApp {
  private routes: Array<{
    method: Method;
    pattern: string;
    handler: RouteHandler;
  }> = [];

  get(pattern: string, handler: RouteHandler): void {
    this.routes.push({ method: "get", pattern, handler });
  }

  post(pattern: string, handler: RouteHandler): void {
    this.routes.push({ method: "post", pattern, handler });
  }

  /** No-op middleware registration (Express `app.use`); unused by the ported routes. */
  use(..._args: unknown[]): void {
    // Intentionally empty.
  }

  /**
   * Match and run a single request against the registered routes. Returns the
   * handler's response, or `null` when nothing matches (404 handled by caller).
   * Supports the `*` wildcard used by generic callback routes.
   */
  async dispatch(fetchReq: Request): Promise<Response | null> {
    const url = new URL(fetchReq.url);
    const path = url.pathname;
    const method = fetchReq.method.toLowerCase();

    // Parse body once, lazily only for methods that carry one.
    let body: unknown = undefined;
    const contentType = fetchReq.headers.get("content-type") ?? "";
    if (method === "post" || method === "put" || method === "patch") {
      if (contentType.includes("application/json")) {
        body = await fetchReq.json().catch(() => undefined);
      } else if (contentType.includes("text/plain") || contentType.includes("text/html")) {
        body = await fetchReq.text();
      }
    }
    const req = createReq(fetchReq, body);

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const params = matchPattern(route.pattern, path);
      if (params === null) continue;
      req.params = params;
      const res = createRes();
      await route.handler(req, res);
      if (res.body !== undefined || res.statusCode !== 200 || res.headers.has("Location")) {
        return toWorkerResponse(res);
      }
      // A handler that set neither status nor body is treated as "matched but
      // produced no output" — still return so we don't collide with later routes.
      return toWorkerResponse(res);
    }
    return null;
  }
}

/**
 * Match an Express-style pattern against a path. Supports a trailing `*`
 * wildcard (captured into `params[0]`); all other
 * patterns are exact matches.
 */
function matchPattern(pattern: string, path: string): Record<string, string> | null {
  if (!pattern.endsWith("*")) {
    return pattern === path ? {} : null;
  }
  const prefix = pattern.slice(0, -1);
  if (!path.startsWith(prefix)) return null;
  return { 0: path.slice(prefix.length) };
}

export const isShimRequest = (
  value: unknown
): value is ShimRequest => typeof value === "object" && value !== null && "path" in value;

/** Express-style cookie options the ported `cookies.ts` returns. */
export type CookieOptions = {
  domain?: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: boolean | "lax" | "strict" | "none";
  maxAge?: number;
};

/** Structural stand-in for the Express `app` used by route-registration modules. */
export type ReferenceExpress = {
  get(pattern: string, handler: RouteHandler): void;
  post(pattern: string, handler: RouteHandler): void;
  use(...args: unknown[]): void;
};
