import { mcp } from "./discovery";
import { aiRoute } from "./ai";
import { assets } from "../../.sites-runtime/assets";
import { DomainError, DAY } from "../domain/model";
import { z } from "zod";
import {
  authRoute,
  accountRoute,
  body,
  json,
  requiredActor,
  sameOrigin,
  snapshot,
  mutate,
  limit,
  type Env,
} from "./service";
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const path = new URL(request.url).pathname;
    try {
      if (path === "/mcp" && request.method === "POST")
        return await mcp(request, env);
      if (path.startsWith("/api/")) {
        if (path.startsWith("/api/auth/"))
          return await authRoute(request, env, path);
        const actor = await requiredActor(request, env);
        if (request.method !== "GET") {
          sameOrigin(request);
          await limit(env.DB, "write:" + actor.id, 300, 60000);
        }
        if (path === "/api/state" && request.method === "GET")
          return json(await snapshot(env, actor));
        if (path === "/api/export" && request.method === "GET") {
          const data = await snapshot(env, actor);
          return json(
            {
              format: "half-an-onion-v1",
              exportedAt: new Date().toISOString(),
              ...data,
            },
            200,
            {
              "Content-Disposition":
                'attachment; filename="half-an-onion.json"',
            },
          );
        }
        if (path === "/api/invites" && request.method === "GET") {
          if (actor.role !== "owner")
            throw new DomainError("Owner access required.", 403);
          return json(
            (
              await env.DB.prepare(
                "SELECT hash,expires_at,used_by,revoked FROM invites WHERE household_id=?",
              )
                .bind(actor.household_id)
                .all()
            ).results,
          );
        }
        if (path === "/api/operations" && request.method === "POST")
          return json(await mutate(env, actor, await body(request)));
        if (
          [
            "/api/profile",
            "/api/password",
            "/api/invites",
            "/api/household/delete",
          ].includes(path) &&
          request.method === "POST"
        )
          return await accountRoute(request, env, actor, path);
        if (
          ((path.startsWith("/api/ai/") && path !== "/api/ai/status") ||
            path === "/api/transcribe") &&
          request.method !== "POST"
        )
          throw new DomainError("POST required.", 405);
        if (path.startsWith("/api/ai/") || path === "/api/transcribe")
          return await aiRoute(request, env, actor, path);
        throw new DomainError("Not found.", 404);
      }
      if (request.method !== "GET" && request.method !== "HEAD")
        return json({ error: "Method not allowed." }, 405);
      const asset = assets[path] ?? (path === "/" ? assets["/"] : null);
      if (!asset) return new Response("Not found", { status: 404 });
      const bytes = asset.base64
        ? Uint8Array.from(atob(asset.body), (c) => c.charCodeAt(0))
        : asset.body;
      return new Response(request.method === "HEAD" ? null : bytes, {
        headers: {
          "Content-Type": asset.type,
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "same-origin",
          "Cache-Control": ["/", "/main.js", "/main.css"].includes(path)
            ? "no-cache"
            : "public, max-age=3600",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'",
          ...(path === "/sw.js"
            ? { "Service-Worker-Allowed": "/", "Cache-Control": "no-cache" }
            : {}),
        },
      });
    } catch (e) {
      if (e instanceof DomainError) return json({ error: e.message }, e.status);
      if (e instanceof z.ZodError)
        return json(
          {
            error: e.issues
              .map((i) => i.path.join(".") + ": " + i.message)
              .join("; "),
          },
          400,
        );
      if (String(e).includes("UNIQUE constraint"))
        return json({ error: "That username or request already exists." }, 409);
      console.error("request_failed", {
        path,
        type: e instanceof Error ? e.name : "unknown",
      });
      return json(
        {
          error:
            "Could not save that change. Your input is still here. Try again.",
        },
        500,
      );
    }
  },
};
