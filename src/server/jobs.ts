import { z } from 'zod';
import { DomainError, today, operationSchema } from '../domain/model';
import { body, json, sha, snapshot, mutate, type Actor, type Env } from './service';
import { ingest } from './discovery';

export async function jobRoute(request: Request, env: Env, path: string) {
  if (!env.BRIDGE_SECRET || await sha(request.headers.get('Authorization') ?? '') !== await sha('Bearer ' + env.BRIDGE_SECRET))
    throw new DomainError('Unauthorized.', 401);
  if (request.method !== 'POST') throw new DomainError('POST required.', 405);
  const actor = await env.DB.prepare("SELECT * FROM accounts WHERE role='owner' LIMIT 1").first<Actor>();
  if (!actor) return json({ skipped: true, reason: 'Set up the household first.' });
  const input: any = await body(request);
  const snap = await snapshot(env, actor);
  if (path === '/internal/jobs/context') {
    const retailer = z.enum(['AH','ALDI','Jumbo','PLUS']).nullable().parse(input.retailer ?? null);
    if (retailer && !Object.values(snap.state.entities.stores).some(s => s.chain === retailer && s.discovery))
      return json({ skipped: true, reason: 'Retailer is not selected.' });
    snap.state.entities.memories = Object.fromEntries(Object.entries(snap.state.entities.memories).filter(([,m]) => !m.forgotten));
    snap.state.entities.offers = Object.fromEntries(Object.entries(snap.state.entities.offers).filter(([,o]) => o.start <= today() && o.end >= today() && Date.now() - o.fetchedAt < 8 * 86400000));
    return json({ today: today(), ownerId: actor.id, members: snap.members, state: snap.state,
      ingredients: [...new Set(Object.values(snap.state.entities.items).map(i => i.name))].slice(0,100) });
  }
  if (path === '/internal/jobs/offers') return json(await ingest(env, actor, input));
  if (path === '/internal/jobs/recipes') {
    const result = z.object({ id: z.string().uuid(), message: z.string().max(1200), followUp: z.boolean(), actions: operationSchema.shape.actions }).parse(input);
    if (result.followUp || !result.actions.length) return json({ skipped: true, reason: result.message });
    if (result.actions.length > 6 || result.actions.some(a => a.type !== 'put' || !['recipes','suggestions'].includes(a.kind ?? '') || !a.id))
      throw new DomainError('Scheduled recipes may only add up to three recipe proposals.', 403);
    // A callback retry uses the receipt before checking IDs that the first call created.
    const receipt = await env.DB.prepare('SELECT result FROM receipts WHERE id=? AND household_id=?').bind(result.id, actor.household_id).first<{result:string}>();
    if (receipt) return json(await mutate(env, actor, {id: result.id, actions: result.actions}, 'assistant'));
    for (const action of result.actions) {
      if (snap.state.entities[action.kind!][action.id!]) throw new DomainError('Scheduled suggestions cannot overwrite records.', 409);
      if (action.kind === 'suggestions' && action.data?.status !== 'proposed')
        throw new DomainError('Scheduled suggestions must remain proposals.', 403);
    }
    return json(await mutate(env, actor, {id: result.id, actions: result.actions}, 'assistant'));
  }
  throw new DomainError('Not found.', 404);
}
