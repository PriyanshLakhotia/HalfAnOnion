import { z } from "zod";
import { retailerRules, type Retailer } from "../domain/retailers";
import { schemas, DomainError, today, type State, DAY } from "../domain/model";
import {
  json,
  body,
  sha,
  mutate,
  snapshot,
  type Actor,
  type Env,
} from "./service";
const retailer = z.enum(["AH", "ALDI", "Jumbo", "PLUS"]);
const ingestSchema = z.object({
  retailer,
  requestId: z.string().uuid(),
  status: z.enum(["success", "not-yet-published", "source-unavailable"]),
  offers: z.array(schemas.offers).max(100),
  note: z.string().max(500).default(""),
});
async function owner(request: Request, env: Env) {
  if (
    !env.BOOTSTRAP_OWNER_EMAIL ||
    request.headers.get("oai-authenticated-user-email")?.toLowerCase() !==
      env.BOOTSTRAP_OWNER_EMAIL.toLowerCase()
  )
    throw new DomainError("Only the Site owner can use discovery tools.", 403);
  const actor = await env.DB.prepare(
    "SELECT * FROM accounts WHERE role='owner' LIMIT 1",
  ).first<Actor>();
  return actor;
}
export function validateOffer(
  offer: z.infer<typeof schemas.offers>,
  chain: Retailer,
) {
  const url = new URL(offer.sourceUrl);
  if (
    url.protocol !== "https:" ||
    !(retailerRules[chain].hosts as readonly string[]).includes(url.hostname) ||
    offer.retailer !== chain
  )
    throw new DomainError("Offer source is outside the retailer allowlist.");
  if (offer.end < offer.start || offer.end < today())
    throw new DomainError("Expired or invalid campaign dates.");
  if (
    offer.fetchedAt > Date.now() + 60000 ||
    Date.now() - offer.fetchedAt > DAY
  )
    throw new DomainError("Offer evidence needs a fresh retrieval timestamp.");
  if (
    /personal|bonus box|persoonlijk|extra.s/i.test(
      offer.terms + " " + offer.scope,
    )
  )
    throw new DomainError("Personal offers are not supported.");
  return offer;
}
export async function ingest(env: Env, actor: Actor, raw: unknown) {
  const input = ingestSchema.parse(raw);
  const snap = await snapshot(env, actor);
  if (
    !Object.values(snap.state.entities.stores).some(
      (s) => s.chain === input.retailer && s.discovery,
    )
  )
    return {
      status: "skipped",
      reason: "Retailer not selected for discovery.",
    };
  const actions = [];
  for (const rawOffer of input.offers) {
    const offer = validateOffer(rawOffer, input.retailer),
      id =
        "offer-" +
        (await sha(
          [offer.retailer, offer.productKey, offer.start, offer.end].join("|"),
        ));
    actions.push({
      type: snap.state.entities.offers[id] ? "patch" : "put",
      kind: "offers",
      id,
      data: offer,
    });
  }
  if (input.status !== "success" && actions.length)
    throw new DomainError("Failed collection cannot supply offers.");
  if (actions.length)
    await mutate(env, actor, { id: input.requestId, actions }, "discovery");
  for (let retry = 0; retry < 4; retry++) {
    const row = await env.DB.prepare(
      "SELECT state,version FROM households WHERE id=?",
    )
      .bind(actor.household_id)
      .first<any>();
    const state = JSON.parse(row.state) as State;
    state.offerJobs[input.retailer] = {
      status: input.status,
      checkedAt: Date.now(),
      lastSuccess:
        input.status === "success"
          ? Date.now()
          : (state.offerJobs[input.retailer]?.lastSuccess ?? null),
      count: actions.length,
      note: input.note,
      rule: retailerRules[input.retailer],
    };
    const r = await env.DB.prepare(
      "UPDATE households SET state=?,version=version+1 WHERE id=? AND version=?",
    )
      .bind(JSON.stringify(state), actor.household_id, row.version)
      .run();
    if (r.meta.changes) return state.offerJobs[input.retailer];
  }
  throw new DomainError(
    "Discovery status could not be saved. Retry safely.",
    409,
  );
}
const tools = [
  {
    name: "discovery_context",
    description:
      "Read selected retailers, verified/provisional schedules, recent collection state and relevant grocery/recipe names. No household passwords or AI credentials.",
    inputSchema: {
      type: "object",
      properties: {
        retailer: { type: "string", enum: ["AH", "ALDI", "Jumbo", "PLUS"] },
      },
      required: ["retailer"],
      additionalProperties: false,
    },
  },
  {
    name: "save_discovered_offers",
    description:
      "Automatic discovery writer. Save only offers just retrieved from official retailer sources, with actual dates and conditions. No invented or personal offers. Failed fetches must be source-unavailable, not success. No manual offer-entry UI.",
    inputSchema: {
      type: "object",
      properties: {
        retailer: { type: "string", enum: ["AH", "ALDI", "Jumbo", "PLUS"] },
        requestId: { type: "string" },
        status: {
          type: "string",
          enum: ["success", "not-yet-published", "source-unavailable"],
        },
        note: { type: "string" },
        offers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              retailer: { type: "string" },
              variant: { type: "string" },
              terms: { type: "string" },
              price: { type: ["number", "null"] },
              quantity: { type: "string" },
              start: { type: "string" },
              end: { type: "string" },
              sourceUrl: { type: "string" },
              fetchedAt: { type: "number" },
              scope: { type: "string" },
              loyalty: { type: "string" },
              activation: { type: "string" },
              productKey: { type: "string" },
            },
            required: [
              "name",
              "retailer",
              "variant",
              "terms",
              "price",
              "quantity",
              "start",
              "end",
              "sourceUrl",
              "fetchedAt",
              "scope",
              "loyalty",
              "activation",
              "productKey",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["retailer", "requestId", "status", "note", "offers"],
      additionalProperties: false,
    },
  },
];
export async function mcp(request: Request, env: Env) {
  const msg: any = await body(request);
  if (msg.method === "server/discover")
    return json({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        supportedVersions: ["2026-07-28"],
        capabilities: { tools: {} },
      },
    });
  if (msg.method === "tools/list")
    return json({ jsonrpc: "2.0", id: msg.id, result: { tools } });
  try {
    const actor = await owner(request, env);
    if (!actor)
      return json({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "setup-required",
                message: "Create the household before discovery can run.",
              }),
            },
          ],
        },
      });
    let result;
    if (msg.method !== "tools/call")
      throw new DomainError("Unsupported method");
    const args = msg.params?.arguments ?? {};
    if (msg.params.name === "discovery_context") {
      const chain = retailer.parse(args.retailer);
      const s = await snapshot(env, actor);
      const selected = Object.values(s.state.entities.stores).filter(
        (st) => st.chain === chain && st.discovery,
      );
      result = {
        selected: selected.length > 0,
        branches: selected.map((st) => ({
          name: st.name,
          locality: st.locality,
        })),
        rule: retailerRules[chain],
        lastRun: s.state.offerJobs[chain] ?? null,
        today: today(),
        ingredients: [
          ...new Set([
            ...Object.values(s.state.entities.items).map((x) => x.name),
            ...Object.values(s.state.entities.recipes).flatMap((r) =>
              r.ingredients.map((i: any) => i.name),
            ),
          ]),
        ].slice(0, 100),
      };
    } else if (msg.params.name === "save_discovered_offers")
      result = await ingest(env, actor, args);
    else throw new DomainError("Unknown tool");
    return json({
      jsonrpc: "2.0",
      id: msg.id,
      result: { content: [{ type: "text", text: JSON.stringify(result) }] },
    });
  } catch (e: any) {
    return json({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        isError: true,
        content: [
          {
            type: "text",
            text: e instanceof z.ZodError ? "Invalid offer fields." : e.message,
          },
        ],
      },
    });
  }
}
