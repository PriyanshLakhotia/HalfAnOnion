import { z } from "zod";
import { DomainError, today } from "../domain/model";
import { parseAssistantResult, assistantValidationIssues, INVALID_ASSISTANT_OUTPUT } from '../domain/assistant';
import {
  body,
  json,
  snapshot,
  mutate,
  limit,
  sha,
  type Actor,
  type Env,
} from "./service";
export async function requestBridge(
  env: Env,
  path: string,
  payload: BodyInit = '{}',
  contentType = 'application/json',
  timeout = 20000,
) {
  if (!env.BRIDGE_URL || !env.BRIDGE_SECRET)
    throw new DomainError('The household assistant is not connected yet. Manual planning and shopping are ready.', 503);
  const url = new URL(path, env.BRIDGE_URL);
  if (url.protocol !== 'https:') throw new DomainError('The assistant requires a secure connection.', 503);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.BRIDGE_SECRET, 'Content-Type': contentType },
    body: payload,
    signal: AbortSignal.timeout(timeout),
    // Cloudflare Workers implements follow/manual, but rejects error before I/O.
    // Never follow a redirect carrying the private service credential.
    redirect: 'manual',
  }).catch((error: unknown) => {
    console.error('bridge_request_failed', {path, type: error instanceof Error ? error.name : 'unknown', message: error instanceof Error ? error.message.slice(0, 250) : 'unknown'});
    throw new DomainError('Could not reach the assistant service. Try again in a moment.', 503);
  });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new DomainError('The assistant service returned an unexpected redirect. Please try again later.', 502);
  }
  return response;
}
export async function bridge(env: Env, path: string, payload: unknown = {}) {
  const r = await requestBridge(env, path, JSON.stringify(payload), 'application/json', path === '/command' ? 185000 : 20000);
  let data: any;
  try {
    data = await r.json();
  } catch {
    throw new DomainError(
      "The assistant did not respond. Your input is saved.",
      502,
    );
  }
  if (!r.ok)
    throw new DomainError(
      data.error ?? "Assistant unavailable. Try again later.",
      r.status === 429 ? 429 : 503,
    );
  return data;
}
export async function aiRoute(
  request: Request,
  env: Env,
  actor: Actor,
  path: string,
) {
  if (path === "/api/ai/status") {
    const snap = await snapshot(env, actor);
    if (!env.BRIDGE_URL)
      return json({
        connected: false,
        available: false,
        transcription: false,
        model: snap.state.model,
        reasoning: snap.state.reasoning,
      });
    try {
      return json({
        ...(await bridge(env, "/status")),
        schedules: env.SCHEDULES_CONFIGURED === "true",
      });
    } catch (e: any) {
      return json({
        connected: false,
        available: false,
        transcription: false,
        error: e.message,
      });
    }
  }
  if (
    ["/api/ai/connect", "/api/ai/disconnect", "/api/ai/models"].includes(path)
  ) {
    if (actor.role !== "owner")
      throw new DomainError(
        "Only the owner can manage the AI connection.",
        403,
      );
    if (path === "/api/ai/connect") {
      const response = await requestBridge(env, '/connect', '{}', 'application/json', 205000);
      return new Response(response.body, { status: response.status, headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    return json(await bridge(env, path.replace("/api/ai", "")));
  }
  if (path === "/api/ai/command") {
    const input = z
      .object({
        id: z.string().uuid(),
        text: z.string().trim().min(1).max(4000),
        context: z.string().max(8000).optional(),
      })
      .parse(await body(request));
    await limit(env.DB, "agent:" + actor.household_id, 30, 86400000);
    const snap = await snapshot(env, actor);
    const context = {
      today: today(),
      timezone: "Europe/Amsterdam",
      speaker: actor.id,
      members: snap.members,
      recentActivity: snap.state.activity.filter(a => a.actor === actor.id && !a.undone).slice(-10),
      entities: {
        ...snap.state.entities,
        memories: Object.fromEntries(
          Object.entries(snap.state.entities.memories).filter(
            ([, m]) => !m.forgotten,
          ),
        ),
      },
    };
    const result = await bridge(env, "/command", {
      ...input,
      priorContext: input.context,
      context,
      model: snap.state.model,
      reasoning: snap.state.reasoning,
    });
    if (result.status !== "completed")
      throw new DomainError(
        result.status === "interrupted"
          ? "The instruction was cancelled. No changes were applied."
          : "The assistant could not complete this instruction. No changes were applied.",
        502,
      );
    let parsed;
    try { parsed = parseAssistantResult(result.result); }
    catch (error) {
      if (error instanceof DomainError) throw error;
      console.warn('assistant_output_rejected', { issues: assistantValidationIssues(error) });
      throw new DomainError(INVALID_ASSISTANT_OUTPUT, 502);
    }
    if (parsed.followUp || !parsed.actions?.length)
      return json({ message: parsed.message, completed: false });
    if (
      parsed.actions.some(
        (a) =>
          ["settings", "clear-history"].includes(a.type) || a.kind === "offers",
      )
    )
      throw new DomainError(
        "The assistant cannot change account settings or invent offers.",
        403,
      );
    const destructive = parsed.actions.filter(
      (a) => a.type === "remove" || a.type === "forget",
    );
    if (destructive.length > 1)
      return json({
        message:
          "This would remove several records. Review those changes in the app before continuing.",
        completed: false,
      });
    const operation = { id: input.id, actions: parsed.actions };
    let saved;
    try { saved = await mutate(env, actor, operation, "assistant"); }
    catch (error) {
      if (!(error instanceof z.ZodError)) throw error;
      console.warn('assistant_update_rejected', { issues: assistantValidationIssues(error) });
      throw new DomainError(INVALID_ASSISTANT_OUTPUT, 502);
    }
    return json({
      message: parsed.message,
      completed: true,
      operationId: saved.id,
      context: JSON.stringify({
        text: input.text,
        result: parsed.message,
      }).slice(0, 8000),
    });
  }
  if (path === "/api/transcribe") {
    if (!env.BRIDGE_URL || !env.BRIDGE_SECRET)
      throw new DomainError(
        "Voice transcription is not connected. You can type your instruction.",
        503,
      );
    await limit(env.DB, "transcribe:" + actor.household_id, 20, 86400000);
    if (Number(request.headers.get("Content-Length") ?? 0) > 8 * 1024 * 1024)
      throw new DomainError("Keep recordings under one minute.", 413);
    const data = await request.formData(),
      file = data.get("audio");
    if (
      !(file instanceof File) ||
      file.size > 8 * 1024 * 1024 ||
      file.size < 300
    )
      throw new DomainError("The recording was empty or too long.");
    if (
      !["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg"].some(
        (t) => file.type.startsWith(t),
      )
    )
      throw new DomainError("This recording format is unsupported.");
    const r = await requestBridge(env, '/transcribe', await file.arrayBuffer(), file.type, 115000);
    if (!r.ok)
      throw new DomainError(
        r.status === 429
          ? "Transcription limit reached. Try again later."
          : "Could not transcribe this recording. Try again or type.",
        r.status === 429 ? 429 : 502,
      );
    const result: any = await r.json();
    if (!result.text?.trim())
      throw new DomainError("No speech found. Try again.");
    return json({ text: result.text });
  }
  throw new DomainError("Not found.", 404);
}
