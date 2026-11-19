import type { Instrumentation } from "next";

export async function register() {}

/** Every uncaught server error (pages, route handlers, server actions, middleware) is recorded. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") { console.error(err); return; }
  const { reportError } = await import("@/lib/errors");
  const e = err as Error & { digest?: string };
  await reportError("server", e, { path: request.path, digest: e.digest, method: request.method, routeType: context.routeType, route: context.routePath });
};
