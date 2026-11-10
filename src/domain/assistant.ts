import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { schemas, operationSchema, applyOperation, emptyState, DomainError, type Kind, type State, type Member } from './model';

// The model contract and validation use the same entity schemas as manual edits.
const kinds = Object.keys(schemas).filter(kind => kind !== 'offers') as Exclude<Kind, 'offers'>[];
const recordId = z.string().min(1).max(150);
const variants: z.ZodTypeAny[] = [];
const blockedPatchFields: Record<string, string[]> = { items: ['status', 'origin', 'sourceKey'], memories: ['forgotten'] };
for (const kind of kinds) {
  variants.push(z.object({ type: z.literal('put'), kind: z.literal(kind), id: recordId, data: schemas[kind].strict() }).strict());
  const fields = Object.entries(schemas[kind].shape).filter(([field]) => !blockedPatchFields[kind]?.includes(field));
  const changes = fields.map(([field, schema]) => {
    const value = schema instanceof z.ZodDefault ? schema.removeDefault() : schema;
    return z.object({ field: z.literal(field), value, expected: value }).strict();
  });
  variants.push(z.object({ type: z.literal('patch'), kind: z.literal(kind), id: recordId,
    changes: z.array(z.union(changes as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]])).min(1).max(30),
  }).strict());
  variants.push(z.object({ type: z.literal('remove'), kind: z.literal(kind), id: recordId, expectedVersion: z.number().int().positive() }).strict());
}
for (const type of ['accept', 'dismiss'] as const)
  for (const kind of ['items', 'suggestions'] as const)
    variants.push(z.object({ type: z.literal(type), kind: z.literal(kind), id: recordId,
      expectedVersion: z.number().int().positive(),
      ...(type === 'accept' && kind === 'suggestions' ? { date: schemas.meals.shape.date } : {}),
    }).strict());
variants.push(z.object({ type: z.literal('purchase'), kind: z.literal('items'), id: recordId, purchased: z.boolean(), expectedVersion: z.number().int().positive() }).strict());
variants.push(z.object({ type: z.literal('forget'), kind: z.literal('memories'), id: recordId, expectedVersion: z.number().int().positive() }).strict());
variants.push(z.object({ type: z.literal('groceries'), from: schemas.meals.shape.date, to: schemas.meals.shape.date, confirm: z.boolean() }).strict());
variants.push(z.object({ type: z.literal('undo'), id: recordId }).strict());
const wire = z.object({ message: z.string().max(1200), followUp: z.boolean(),
  actions: z.array(z.union(variants as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]])).max(25),
}).strict();
const offers = z.object({
  status: z.enum(['success', 'source-unavailable', 'not-yet-published']),
  note: z.string().max(3000), offers: z.array(schemas.offers.strict()).max(20),
}).strict();
function structuredSchema(schema: z.ZodTypeAny) {
  const output: any = zodToJsonSchema(schema, { $refStrategy: 'none' });
  const strict = (node: any) => {
    if (!node || typeof node !== 'object') return;
    delete node.$schema; delete node.default;
    if (node.type === 'object') {
      node.additionalProperties = false;
      node.required = Object.keys(node.properties ?? {});
    }
    Object.values(node).forEach(value => Array.isArray(value) ? value.forEach(strict) : strict(value));
  };
  strict(output);
  return output;
}
export const assistantOutputSchema = structuredSchema(wire);
export const offerOutputSchema = structuredSchema(offers);
export const INVALID_ASSISTANT_OUTPUT = 'The assistant could not prepare a valid kitchen update. Nothing was changed. Your text is saved; try a smaller request.';
const variantsByAction = new Map(variants.map((schema: any) => [schema.shape.type.value + ':' + (schema.shape.kind?.value ?? ''), schema]));

export function decodeAssistantOutput(raw: unknown) {
  const parsed = z.object({ message: z.string().max(1200), followUp: z.boolean(), actions: z.array(z.unknown()).max(25) }).strict().parse(raw);
  // Select the matching branch before validation so correction feedback identifies
  // the actual invalid field instead of a generic union mismatch.
  parsed.actions = parsed.actions.map((action: any, index) => {
    const schema = variantsByAction.get(action?.type + ':' + (action?.kind ?? ''));
    if (!schema) throw new Error('Unknown action type or record kind.');
    const result = schema.safeParse(action);
    if (!result.success) throw new z.ZodError(result.error.issues.map((issue: z.ZodIssue) => ({ ...issue, path: ['actions', index, ...issue.path] })));
    return result.data;
  });
  return { ...parsed, actions: parsed.actions.map((a: any) => {
    if (a.type === 'patch') {
      if (new Set(a.changes.map((c: any) => c.field)).size !== a.changes.length)
        throw new Error('A patch must change each field only once.');
      return { type: a.type, kind: a.kind, id: a.id,
        data: Object.fromEntries(a.changes.map((c: any) => [c.field, c.value])),
        expected: Object.fromEntries(a.changes.map((c: any) => [c.field, c.expected])) };
    }
    if (a.type === 'put' || a.type === 'undo') return a;
    if (a.type === 'groceries') return { type: a.type, data: { from: a.from, to: a.to, confirm: a.confirm } };
    return { type: a.type, kind: a.kind, id: a.id, expected: { version: a.expectedVersion },
      ...(a.type === 'purchase' ? { data: { purchased: a.purchased } } : {}),
      ...(a.type === 'accept' && a.kind === 'suggestions' ? { data: { date: a.date } } : {}) };
  }) };
}

const envelope = z.object({ message: z.string().max(1200), followUp: z.boolean().default(false),
  // Empty actions are valid for questions and ordinary conversational replies.
  actions: z.array(operationSchema.shape.actions.element).max(25).default([]),
});
export function parseAssistantResult(raw: unknown) {
  const parsed = envelope.parse(raw);
  if (parsed.followUp && parsed.actions.length) throw new Error('A follow-up must not include changes.');
  for (const a of parsed.actions) {
    if (['settings', 'clear-history'].includes(a.type) || a.kind === 'offers')
      throw new DomainError('The assistant cannot change account settings or invent offers.', 403);
    if (a.type !== 'groceries' && (!a.id || (a.type !== 'undo' && !a.kind))) throw new Error('An action needs an existing record kind and ID.');
    if (a.type === 'put' || a.type === 'patch') {
      if (!a.kind || !a.id) throw new Error('A record change needs its kind and ID.');
      const data = { ...a.data };
      // Lossless compatibility with responses from older companion revisions.
      if (a.kind === 'recipes') {
        if (data.origin === 'inference' || (a.type === 'put' && data.origin === undefined)) data.origin = 'generated';
        if (Array.isArray(data.prerequisites) && data.prerequisites.every(v => typeof v === 'string')) data.prerequisites = data.prerequisites.join('\n');
      }
      if (a.type === 'patch') {
        if (Object.keys(data).some(field => blockedPatchFields[a.kind!]?.includes(field))) throw new Error('Use the dedicated action for status changes.');
        a.data = schemas[a.kind].partial().strict().parse(data);
        if (!Object.keys(a.data).length || Object.keys(a.data).some(field => !a.expected || !(field in a.expected)))
          throw new Error('Every changed field needs its previous value.');
      } else a.data = schemas[a.kind].strict().parse(data);
    } else if (a.type === 'groceries') {
      a.data = z.object({ from: schemas.meals.shape.date, to: schemas.meals.shape.date, confirm: z.boolean() }).strict().parse(a.data);
    } else if (a.type === 'purchase') {
      if (a.kind !== 'items') throw new Error('Only shopping items can be purchased.');
      a.data = z.object({ purchased: z.boolean() }).strict().parse(a.data);
    } else if (a.type === 'forget' && a.kind !== 'memories') throw new Error('Only preferences can be forgotten.');
    else if (['accept', 'dismiss'].includes(a.type) && !['items', 'suggestions'].includes(a.kind ?? '')) throw new Error('Only proposals can be accepted or dismissed.');
  }
  return parsed;
}

export function validateAssistantResult(raw: unknown, state: State, actor: string, members: Member[], mode = 'interactive') {
  const parsed = parseAssistantResult(raw);
  if (!parsed.actions.length) return parsed;
  if (mode === 'recipes' && (parsed.actions.length > 6 || parsed.actions.some(a => a.type !== 'put' || !['recipes', 'suggestions'].includes(a.kind ?? '') || (a.kind === 'suggestions' && a.data?.status !== 'proposed'))))
    throw new DomainError('Scheduled recipes may only add up to three recipe proposals.', 403);
  if (parsed.actions.filter(a => a.type === 'remove' || a.type === 'forget').length > 1)
    throw new Error('Ask a follow-up before removing several records.');
  applyOperation(state, { id: '00000000-0000-4000-8000-000000000000', actions: parsed.actions }, actor, members, Date.now(), 'assistant');
  return parsed;
}

export function validateModelResult(raw: unknown, context: any, mode = 'interactive') {
  if (mode === 'offers') {
    const result = offers.parse(raw);
    if (result.status !== 'success' && result.offers.length) throw new Error('Unavailable sources must not produce offers.');
    for (const offer of result.offers) {
      if (offer.retailer !== context.retailer || !context.pages?.some((p: any) => p.url === offer.sourceUrl)) throw new Error('Offer evidence must match the requested retailer and a supplied source URL.');
      if (offer.start > offer.end) throw new Error('Offer end date must not precede its start date.');
    }
    return result;
  }
  return validateAssistantResult(decodeAssistantOutput(raw), {
    ...emptyState(), entities: { ...emptyState().entities, ...context.entities }, activity: context.recentActivity ?? [],
  }, context.speaker, context.members ?? [], mode);
}

export function assistantValidationIssues(error: unknown) {
  if (error instanceof z.ZodError)
    return error.issues.slice(0, 12).map(issue => ({ path: issue.path.join('.'), message: issue.message }));
  return [{ path: 'actions', message: error instanceof Error ? error.message.slice(0, 500) : 'Invalid assistant response' }];
}
