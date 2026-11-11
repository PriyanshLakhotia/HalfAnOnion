import { z } from "zod";
export const DAY = 86400000;
export const TIMEZONE = "Europe/Amsterdam";
export const today = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
export function plusDays(date: string, n: number) {
  return new Date(Date.parse(date + "T12:00:00Z") + n * DAY)
    .toISOString()
    .slice(0, 10);
}
export const commitment = (minutes: number) =>
  minutes <= 20 ? "Low" : minutes <= 45 ? "Medium" : "High";
const text = z.string().trim().min(1).max(180),
  note = z.string().max(3000).default(""),
  id = z.string().min(1).max(150);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (d) =>
      !Number.isNaN(Date.parse(d)) &&
      new Date(d + "T12:00:00Z").toISOString().slice(0, 10) === d,
    "Invalid date",
  );
const unit = z.enum([
  "",
  "g",
  "kg",
  "ml",
  "l",
  "piece",
  "packet",
  "tbsp",
  "tsp",
  "cup",
]);
export const ingredient = z.object({
  name: text,
  quantity: z.number().positive().max(100000).nullable().default(null),
  unit: unit.default(""),
  brand: z.string().max(100).default(""),
  variant: z.string().max(100).default(""),
  storeId: id.default("any"),
});
export const profileSchema = z.object({
  diet: z
    .enum(["unspecified", "vegetarian", "nonvegetarian", "vegan"])
    .default("unspecified"),
  eggs: z.enum(["yes", "no", "ask"]).default("ask"),
  dairy: z.enum(["yes", "no", "ask"]).default("ask"),
  allergies: z.array(text).max(30).default([]),
  exclusions: z.array(text).max(50).default([]),
  preferences: note,
  sharedVegetarian: z.boolean().default(true),
  onboarded: z.boolean().default(false),
});
export type Profile = z.infer<typeof profileSchema>;
export const schemas = {
  stores: z.object({
    name: text,
    chain: z
      .enum(["AH", "ALDI", "Jumbo", "PLUS", "Custom", "Any"])
      .default("Custom"),
    locality: z.string().max(150).default(""),
    website: z.union([z.literal(""), z.string().url().max(500)]).default(""),
    discovery: z.boolean().default(false),
  }),
  items: ingredient.extend({
    notes: note,
    status: z
      .enum([
        "confirmed",
        "proposed",
        "purchased",
        "dismissed",
        "removed",
        "expired",
      ])
      .default("confirmed"),
    origin: z
      .enum(["manual", "instruction", "recipe", "offer", "inference"])
      .default("manual"),
    sourceId: z.string().max(180).default(""),
    sourceKey: z.string().max(500).default(""),
    expiresOn: date.nullable().default(null),
    offerId: z.string().max(150).default(""),
  }),
  recipes: z.object({
    name: text,
    collection: z.enum(["ours", "saved", "suggested", "dismissed"]).default("ours"),
    sourceUrl: z.union([z.literal(""), z.string().url().max(1000)]).default(""),
    origin: z
      .enum(["manual", "link", "generated", "variation"])
      .default("manual"),
    parentId: z.string().max(150).default(""),
    servings: z.number().positive().max(100).default(2),
    ingredients: z.array(ingredient).max(100).default([]),
    steps: z.array(z.string().max(2000)).max(80).default([]),
    tags: z.array(text).max(30).default([]),
    activeMinutes: z.number().min(0).max(2880).default(0),
    totalMinutes: z.number().min(0).max(10080).default(0),
    prerequisites: note,
    notes: note,
  }),
  meals: z.object({
    name: text,
    date,
    mealType: z
      .enum(["breakfast", "lunch", "dinner", "snack", "custom"])
      .default("dinner"),
    time: z
      .string()
      .regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/)
      .default(""),
    participants: z.array(id).min(1).max(30),
    servings: z.number().positive().max(100).default(2),
    kind: z
      .enum(["cooking", "leftovers", "eating-out", "undecided"])
      .default("cooking"),
    components: z
      .array(
        z.object({
          name: text,
          recipeId: z.string().max(150).default(""),
          participants: z.array(id).min(1).max(30),
          servings: z.number().positive().max(100),
        }),
      )
      .max(30)
      .default([]),
    notes: note,
    cooked: z.boolean().default(false),
    feedback: z.enum(["", "liked", "not-for-us"]).default(""),
  }),
  pantry: ingredient.extend({
    state: z.enum(["have", "low", "out", "usual"]).default("usual"),
    confirmedAt: z.number().nullable().default(null),
    notes: note,
  }),
  memories: z.object({
    fact: text,
    scope: id.default("household"),
    kind: z.enum(["explicit", "tentative"]).default("explicit"),
    confidence: z.number().min(0).max(1).default(1),
    provenance: note,
    forgotten: z.boolean().default(false),
  }),
  suggestions: z.object({
    name: text,
    kind: z.enum(["recipe", "restaurant", "meal"]).default("recipe"),
    recipeId: z.string().max(150).default(""),
    location: z.string().max(200).default(""),
    url: z.union([z.literal(""), z.string().url().regex(/^https?:\/\//).max(1000)]).default(""),
    participants: z.array(id).min(1).max(30),
    reason: note,
    date: date.nullable().default(null),
    status: z
      .enum(["proposed", "accepted", "dismissed", "expired"])
      .default("proposed"),
    expiresOn: date,
    activeMinutes: z.number().min(0).default(0),
    totalMinutes: z.number().min(0).default(0),
  }),
  offers: z.object({
    name: text,
    retailer: z.enum(["AH", "ALDI", "Jumbo", "PLUS"]),
    variant: note,
    terms: text,
    price: z.number().positive().max(10000).nullable(),
    quantity: note,
    start: date,
    end: date,
    sourceUrl: z.string().url(),
    fetchedAt: z.number(),
    scope: text,
    loyalty: note,
    activation: note,
    productKey: text,
  }),
};
export type Kind = keyof typeof schemas;
export type Entity = {
  id: string;
  updatedAt: number;
  actor: string;
  version: number;
} & Record<string, any>;
export type Member = {
  id: string;
  name: string;
  role: string;
  profile: Profile;
};
export type Change = {
  kind: Kind;
  id: string;
  before: Entity | null;
  after: Entity | null;
};
export type Activity = {
  id: string;
  actor: string;
  at: number;
  label: string;
  changes: Change[];
  undone: boolean;
};
export type State = {
  entities: Record<Kind, Record<string, Entity>>;
  activity: Activity[];
  model: string;
  reasoning: string;
  offerJobs: Record<string, any>;
};
export function emptyState(): State {
  return {
    entities: {
      stores: {
        any: {
          id: "any",
          name: "Any store",
          chain: "Any",
          locality: "",
          website: "",
          discovery: false,
          updatedAt: Date.now(),
          actor: "system",
          version: 1,
        },
      },
      items: {},
      meals: {},
      recipes: {},
      pantry: {},
      memories: {},
      suggestions: {},
      offers: {},
    },
    activity: [],
    model: "gpt-6.1-sol",
    reasoning: "high",
    offerJobs: {},
  };
}
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const normalize = (v: string) =>
  v.trim().toLocaleLowerCase().replace(/\s+/g, " ");
export function sameSuggestion(a: Record<string, any>, b: Record<string, any>) {
  return ((a.kind ?? "recipe") === (b.kind ?? "recipe")) &&
    ((a.recipeId && a.recipeId === b.recipeId) || normalize(a.name) === normalize(b.name)) &&
    JSON.stringify([...a.participants].sort()) === JSON.stringify([...b.participants].sort());
}
export function pendingSuggestions(records: Record<string, Entity>, date = today()) {
  const current = Object.values(records).filter(s => s.expiresOn >= date);
  const result: Entity[] = [];
  for (const suggestion of current.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))) {
    if (suggestion.status !== 'proposed' ||
        current.some(s => ['accepted', 'dismissed'].includes(s.status) && sameSuggestion(s, suggestion)) ||
        result.some(s => sameSuggestion(s, suggestion))) continue;
    result.push(suggestion);
  }
  return result;
}
// Old data predates an explicit collection. Preserve user creations even when
// subsequently suggested by the assistant; only legacy recommendation drafts move.
export function normalizeRecipeCollections(state: State): State {
  for (const recipe of Object.values(state.entities.recipes)) {
    if (recipe.collection) continue;
    const creation = state.activity.find(a => a.changes.some(c => c.kind === "recipes" && c.id === recipe.id && !c.before && c.after));
    const bornWithSuggestion = creation?.changes.some(c => c.kind === "suggestions" && c.after?.recipeId === recipe.id);
    const linked = Object.values(state.entities.suggestions).some(s => s.recipeId === recipe.id);
    recipe.collection = (creation ? bornWithSuggestion : recipe.origin === "generated" && linked) ? "suggested" : "ours";
    for (const activity of state.activity) for (const change of activity.changes) {
      if (change.kind !== "recipes" || change.id !== recipe.id) continue;
      if (change.before && !change.before.collection) change.before.collection = recipe.collection;
      if (change.after && !change.after.collection) change.after.collection = recipe.collection;
    }
  }
  return state;
}
export function suggestedRecipes(state: State, date = today()): Entity[] {
  const recipes = Object.values(state.entities.recipes);
  const excludedNames = new Set(recipes.filter(r => r.collection !== "suggested").map(r => normalize(r.name)));
  const found = new Set<string>();
  return recipes.filter(r => r.collection === "suggested").sort((a,b) => b.updatedAt - a.updatedAt).filter(r => {
    const related = Object.values(state.entities.suggestions).filter(s => s.recipeId === r.id);
    const name = normalize(r.name);
    if (excludedNames.has(name) || found.has(name) || (related.length && !related.some(s => s.status === "accepted" || (s.status === "proposed" && s.expiresOn >= date)))) return false;
    found.add(name); return true;
  });
}
// Suggestions are not preferences or saved recipes. Only explicit saves and
// recipes used in accepted plans are sent back to the assistant.
export function assistantState(input: State): State {
  const state = normalizeRecipeCollections(structuredClone(input));
  const planned = new Set(Object.values(state.entities.meals).flatMap(m => m.components.map((c: any) => c.recipeId)));
  state.entities.recipes = Object.fromEntries(Object.entries(state.entities.recipes).filter(([id,r]) => ["ours", "saved"].includes(r.collection) || planned.has(id)));
  state.entities.suggestions = Object.fromEntries(Object.entries(state.entities.suggestions).filter(([,s]) => s.status === "accepted"));
  state.entities.memories = Object.fromEntries(Object.entries(state.entities.memories).filter(([,m]) => !m.forgotten));
  state.activity = state.activity.map(a => ({ ...a, changes: a.changes.filter(c => !["recipes", "suggestions", "memories"].includes(c.kind) || !!state.entities[c.kind][c.id]) })).filter(a => a.changes.length);
  return state;
}
export const matchKey = (v: any) =>
  [v.name, v.brand, v.variant, v.storeId ?? "any", v.unit]
    .map((x) => normalize(x ?? ""))
    .join("|");
export function activeOffer(v: Entity, now = today()) {
  return v.start <= now && v.end >= now && Date.now() - v.fetchedAt < 8 * DAY;
}
export const operationSchema = z.object({
  id: z.string().uuid(),
  actions: z
    .array(
      z.object({
        type: z.enum([
          "put",
          "patch",
          "remove",
          "accept",
          "save-recipe",
          "dismiss-recipe",
          "dismiss",
          "purchase",
          "undo",
          "groceries",
          "forget",
          "settings",
          "clear-history",
        ]),
        kind: z
          .enum([
            "stores",
            "items",
            "meals",
            "recipes",
            "pantry",
            "memories",
            "suggestions",
            "offers",
          ])
          .optional(),
        id: z.string().max(180).optional(),
        data: z.record(z.any()).optional(),
        expected: z.record(z.any()).optional(),
      }),
    )
    .min(1)
    .max(50),
});
export type Operation = z.infer<typeof operationSchema>;
function equal(a: any, b: any) {
  return JSON.stringify(a) === JSON.stringify(b);
}
export function compatible(
  recipe: Entity,
  members: Member[],
  participants: string[],
) {
  if (!recipe) return false;
  return participants.every((p) => {
    const profile = members.find((m) => m.id === p)?.profile;
    if (!profile) return false;
    const names = recipe.ingredients
      .map((x: any) => normalize(x.name))
      .join(" ");
    const blocked = [...profile.allergies, ...profile.exclusions];
    if (blocked.some((x) => names.includes(normalize(x)))) return false;
    if (profile.diet === "vegan" && !recipe.tags.includes("vegan"))
      return false;
    if (
      profile.diet === "vegetarian" &&
      !recipe.tags.some((x: string) => ["vegetarian", "vegan"].includes(x))
    )
      return false;
    if (profile.eggs === "no" && /egg|anda|ei\b/.test(names)) return false;
    if (
      profile.dairy === "no" &&
      /milk|paneer|cheese|yoghurt|yogurt|butter|ghee|cream|dairy/.test(names)
    )
      return false;
    return true;
  });
}
export function applyOperation(
  input: State,
  op: Operation,
  actor: string,
  members: Member[],
  now = Date.now(),
  source: "manual" | "assistant" | "discovery" | "capture" = "manual",
): { state: State; label: string } {
  const state = normalizeRecipeCollections(structuredClone(input)),
    changes: Change[] = [];
  const currentDate = today(new Date(now));
  const save = (kind: Kind, id: string, data: Record<string, any> | null) => {
    const before = state.entities[kind][id] ?? null;
    const after = data
      ? {
          ...data,
          id,
          updatedAt: now,
          actor,
          version: (before?.version ?? 0) + 1,
        }
      : null;
    const existingChange = changes.find((c) => c.kind === kind && c.id === id);
    if (existingChange) existingChange.after = after;
    else changes.push({ kind, id, before, after });
    if (after) state.entities[kind][id] = after;
    else delete state.entities[kind][id];
  };
  const validate = (kind: Kind, data: any) => {
    const v = schemas[kind].parse(data) as any;
    if (kind === "stores" && normalize(v.name).includes("bahar")) {
      v.discovery = false;
      v.website = "";
    }
    if (kind === "meals" || kind === "suggestions") {
      for (const person of [
        ...v.participants,
        ...(v.components ?? []).flatMap((x: any) => x.participants),
      ])
        if (!members.some((m) => m.id === person))
          throw new DomainError("Choose a household member.");
      if (
        kind === "suggestions" && v.kind === "recipe" &&
        !compatible(state.entities.recipes[v.recipeId], members, v.participants)
      )
        throw new DomainError(
          "This suggestion does not meet the selected dietary profiles.",
        );
      if (kind === "suggestions" && v.kind !== "recipe" && v.recipeId)
        throw new DomainError("A restaurant or meal idea cannot reference a recipe.");
      if (kind === "meals")
        for (const c of v.components)
          if (c.recipeId && !state.entities.recipes[c.recipeId])
            throw new DomainError("Recipe not found.");
    }
    if (kind === "items" || kind === "pantry") {
      if (!state.entities.stores[v.storeId])
        throw new DomainError("Store not found.");
    }
    if (
      kind === "memories" &&
      v.scope !== "household" &&
      !members.some((m) => m.id === v.scope)
    )
      throw new DomainError("Memory scope is not in this household.");
    return v;
  };
  const calculateGroceries = (data: any) => {
    const range = z
      .object({ from: date, to: date, confirm: z.boolean().default(false) })
      .parse(data);
    if (range.from > range.to)
      throw new DomainError("Choose a valid date range.");
    const needed = new Map<string, any>();
    const generatedKeys = new Set<string>();
    const affectedMealIds = new Set(
      [
        ...Object.values(input.entities.meals),
        ...Object.values(state.entities.meals),
      ]
        .filter((m) => m.date >= range.from && m.date <= range.to)
        .map((m) => m.id),
    );
    for (const meal of Object.values(state.entities.meals).filter(
      (m) => m.date >= range.from && m.date <= range.to && m.kind === "cooking",
    ))
      for (const c of meal.components) {
        const recipe = state.entities.recipes[c.recipeId];
        if (!recipe) continue;
        for (const ingredient of recipe.ingredients) {
          const key = matchKey(ingredient);
          const quantity =
            ingredient.quantity === null
              ? null
              : (ingredient.quantity * c.servings) / recipe.servings;
          const rec = needed.get(key) ?? {
            ...ingredient,
            quantity: quantity === null ? null : 0,
            mealIds: [],
            end: meal.date,
          };
          rec.quantity =
            rec.quantity === null || quantity === null
              ? null
              : rec.quantity + quantity;
          rec.mealIds.push(meal.id);
          rec.end = rec.end > meal.date ? rec.end : meal.date;
          needed.set(key, rec);
        }
      }
    for (const [key, n] of needed) {
      const sourceKey =
        "groceries:" + key + ":" + [...new Set(n.mealIds)].sort().join(",");
      const existing = Object.values(state.entities.items).find(
        (i) => i.sourceKey === sourceKey,
      );
      if (
        existing &&
        ["dismissed", "confirmed", "purchased", "removed"].includes(
          existing.status,
        )
      )
        continue;
      if (
        Object.values(state.entities.items).some(
          (i) =>
            ["confirmed", "purchased"].includes(i.status) &&
            matchKey(i) === key,
        )
      )
        continue;
      const pantry = Object.values(state.entities.pantry).find(
        (p) => matchKey({ ...p, storeId: n.storeId }) === key,
      );
      if (
        pantry?.state === "have" &&
        pantry.confirmedAt &&
        now - pantry.confirmedAt < 3 * DAY
      )
        continue;
      generatedKeys.add(sourceKey);
      save(
        "items",
        existing?.id ?? crypto.randomUUID(),
        validate("items", {
          ...n,
          status: range.confirm ? "confirmed" : "proposed",
          origin: "recipe",
          sourceKey,
          sourceId: n.mealIds.join(","),
          expiresOn: plusDays(n.end, 1),
          notes: pantry
            ? "Pantry " + pantry.state + "; check before buying."
            : "Pantry quantity not confirmed.",
        }),
      );
    }
    for (const item of Object.values(state.entities.items)) {
      if (
        item.status === "proposed" &&
        item.origin === "recipe" &&
        item.sourceId
          .split(",")
          .some((id: string) => affectedMealIds.has(id)) &&
        !generatedKeys.has(item.sourceKey)
      )
        save("items", item.id, { ...item, status: "expired" });
    }
  };
  for (const a of op.actions) {
    const kind = a.kind;
    const id = a.id ?? crypto.randomUUID();
    const old = kind ? state.entities[kind][id] : null;
    if (a.type === "settings") {
      if (source !== "manual")
        throw new DomainError("Account settings require a manual action.", 403);
      const d = z
        .object({
          model: z.string().min(1).max(80),
          reasoning: z.enum(["none", "low", "medium", "high", "xhigh", "max"]),
        })
        .parse(a.data);
      state.model = d.model;
      state.reasoning = d.reasoning;
      continue;
    }
    if (a.type === "clear-history") {
      state.activity = [];
      continue;
    }
    if (a.type === "undo") {
      const entry = state.activity.find(
        (x) => x.id === a.id && x.actor === actor && !x.undone,
      );
      if (!entry)
        throw new DomainError(
          "This change is no longer available to undo.",
          409,
        );
      for (const c of [...entry.changes].reverse()) {
        const cur = state.entities[c.kind][c.id] ?? null;
        if (!equal(cur, c.after))
          throw new DomainError(
            "Someone changed this since. Edit it directly to keep their work.",
            409,
          );
        save(c.kind, c.id, c.before);
      }
      entry.undone = true;
      continue;
    }
    if (a.type === "groceries") {
      calculateGroceries(a.data);
      continue;
    }
    if (!kind) throw new DomainError("Choose a record type.");
    if (kind === "offers" && source !== "discovery")
      throw new DomainError("Offers are collected automatically.", 403);
    if (a.type === "put") {
      if (old) throw new DomainError("That record already exists.", 409);
      const v = validate(kind, a.data);
      // Different daily runs use different IDs. Keep the existing decision or
      // proposal while it is current, including duplicates within one batch.
      if (kind === 'suggestions' && source === 'assistant' && v.status === 'proposed' &&
          Object.values(state.entities.suggestions).some(s => s.expiresOn >= currentDate &&
            s.status !== 'expired' && sameSuggestion(s, v))) continue;
      if (kind === "recipes") v.collection = source === "assistant" ? "suggested" : "ours";
      if (kind === "items" && source === "manual") {
        v.status = "confirmed";
        v.origin = "manual";
      }
      if (kind === "items" && source === "assistant") {
        // Missing origin must never turn an inferred recommendation into a purchase task.
        if (v.origin === "manual") v.origin = "inference";
        v.status = v.origin === "instruction" ? "confirmed" : "proposed";
      }
      if (
        kind === "memories" &&
        source === "assistant" &&
        Object.values(state.entities.memories).some(
          (m) => m.forgotten && normalize(m.fact) === normalize(v.fact),
        )
      )
        throw new DomainError("This preference was forgotten.");
      save(kind, id, v);
    } else {
      if (!old)
        throw new DomainError("This record is no longer available.", 404);
      if (kind === "stores" && id === "any")
        throw new DomainError("Any store is always available.");
      if (a.expected)
        for (const [key, value] of Object.entries(a.expected))
          if (!equal(old[key], value))
            throw new DomainError(
              "This was changed on another device. Review the latest version.",
              409,
            );
      if (["save-recipe", "dismiss-recipe"].includes(a.type)) {
        if (kind !== "recipes" || source !== "manual")
          throw new DomainError("Save recipes using the recipe's Save button.", 403);
        if (!["suggested", "dismissed"].includes(old.collection))
          throw new DomainError("This recipe is already saved.", 409);
        save(kind, id, { ...old, collection: a.type === "save-recipe" ? "saved" : "dismissed" });
        if (a.type === "dismiss-recipe")
          for (const proposal of Object.values(state.entities.suggestions))
            if (proposal.status === "proposed" && (proposal.recipeId === id || normalize(proposal.name) === normalize(old.name)))
              save("suggestions", proposal.id, { ...proposal, status: "dismissed" });
      }
      if (a.type === "patch") {
        if (kind === "recipes" && a.data && "collection" in a.data)
          throw new DomainError("Use the recipe's Save button to add it to your recipes.");
        if (
          kind === "items" &&
          a.data &&
          ["status", "origin", "sourceKey"].some((k) => k in a.data!)
        )
          throw new DomainError("Use the item action for status changes.");
        save(kind, id, validate(kind, { ...old, ...a.data }));
      }
      if (a.type === "remove") {
        if (kind === "items") save(kind, id, { ...old, status: "removed" });
        else if (kind === "stores") {
          if (
            Object.values(state.entities.items).some(
              (i) =>
                i.storeId === id &&
                ["confirmed", "proposed"].includes(i.status),
            )
          )
            throw new DomainError(
              "Move this store’s groceries before removing it.",
            );
          save(kind, id, null);
        } else if (kind === "recipes") {
          if (
            Object.values(state.entities.meals).some((m) =>
              m.components.some((c: any) => c.recipeId === id),
            )
          )
            throw new DomainError(
              "Remove this recipe from planned meals before deleting it.",
            );
          save(kind, id, null);
        } else save(kind, id, null);
      }
      if (a.type === "forget") {
        if (kind !== "memories")
          throw new DomainError("Only preferences can be forgotten.");
        save(kind, id, { ...old, forgotten: true });
      }
      if (["accept", "dismiss"].includes(a.type)) {
        if (
          !["items", "suggestions"].includes(kind) ||
          old.status !== "proposed"
        )
          throw new DomainError("This proposal is no longer pending.", 409);
        if (old.expiresOn && old.expiresOn < currentDate)
          throw new DomainError("This proposal has expired.", 409);
        if (kind === "suggestions" && a.type === "accept") {
          const recipe = state.entities.recipes[old.recipeId];
          const recipeIdea = (old.kind ?? "recipe") === "recipe";
          if (recipeIdea && (!recipe || !compatible(recipe, members, old.participants)))
            throw new DomainError(
              "Review dietary suitability before scheduling.",
            );
          const d = validate("meals", {
            name: old.name,
            date: a.data?.date ?? old.date ?? currentDate,
            participants: old.participants,
            servings: old.participants.length,
            kind: recipeIdea ? "cooking" : old.kind === "restaurant" ? "eating-out" : "undecided",
            notes: recipeIdea ? "" : [old.reason, old.location, old.url].filter(Boolean).join("\n"),
            components: recipeIdea ? [
              {
                name: old.name,
                recipeId: old.recipeId,
                participants: old.participants,
                servings: old.participants.length,
              },
            ] : [],
          });
          save("meals", crypto.randomUUID(), d);
        }
        save(kind, id, {
          ...old,
          status:
            a.type === "dismiss"
              ? "dismissed"
              : kind === "items"
                ? "confirmed"
                : "accepted",
        });
        if (kind === 'suggestions') {
          for (const duplicate of Object.values(state.entities.suggestions)) {
            if (duplicate.id !== id && duplicate.status === 'proposed' && duplicate.expiresOn >= currentDate && sameSuggestion(duplicate, old))
              save('suggestions', duplicate.id, { ...duplicate, status: a.type === 'accept' ? 'accepted' : 'dismissed' });
          }
        }
      }
      if (a.type === "purchase") {
        if (
          kind !== "items" ||
          !["confirmed", "purchased"].includes(old.status)
        )
          throw new DomainError("Accept a proposal before marking it bought.");
        save(kind, id, {
          ...old,
          status: a.data?.purchased ? "purchased" : "confirmed",
        });
      }
    }
  }
  for (const action of op.actions) {
    if (action.type !== "put" || action.kind !== "suggestions" || state.entities.suggestions[action.id ?? ""]) continue;
    const recipeId = action.data?.recipeId;
    if (source === "assistant" && recipeId && !input.entities.recipes[recipeId] &&
        !Object.values(state.entities.suggestions).some(s => s.recipeId === recipeId) &&
        !Object.values(state.entities.meals).some(m => m.components.some((c: any) => c.recipeId === recipeId))) {
      delete state.entities.recipes[recipeId];
      const change = changes.findIndex(c => c.kind === "recipes" && c.id === recipeId);
      if (change >= 0) changes.splice(change, 1);
    }
  }
  // Planning updates infer proposals immediately; undo restores its own recorded changes.
  if (
    !op.actions.some((a) => a.type === "groceries" || a.type === "undo") &&
    changes.some((c) => c.kind === "meals" || c.kind === "recipes")
  ) {
    const lastDate = [
      ...Object.values(input.entities.meals),
      ...Object.values(state.entities.meals),
    ].reduce(
      (last, meal) => (meal.date > last ? meal.date : last),
      currentDate,
    );
    calculateGroceries({ from: currentDate, to: lastDate });
  }
  // Reconcile proposals only. Accepted groceries remain independent of recipe changes.
  for (const i of Object.values(state.entities.items)) {
    if (
      i.status === "proposed" &&
      ((i.expiresOn && i.expiresOn < currentDate) ||
        (i.origin === "recipe" &&
          i.sourceId &&
          i.sourceId
            .split(",")
            .some((id: string) => !state.entities.meals[id])))
    )
      save("items", i.id, { ...i, status: "expired" });
  }
  const label =
    op.actions.length === 1
      ? op.actions[0].type === "groceries"
        ? "Groceries suggested"
        : op.actions[0].type === "undo"
          ? "Change undone"
          : "Kitchen updated"
      : `${op.actions.length} changes saved`;
  state.activity = state.activity
    .filter((x) => now - x.at < 30 * DAY)
    .slice(-99);
  if (changes.length)
    state.activity.push({
      id: op.id,
      actor,
      at: now,
      label,
      changes,
      undone: false,
    });
  return { state, label };
}
