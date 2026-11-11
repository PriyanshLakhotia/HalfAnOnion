import { createHash } from 'node:crypto';
import { load } from 'cheerio';

export const sources = {
  AH: ['https://www.ah.nl/bonus', 'https://www.ah.nl/klantenservice/ah-bonus/bonusfolder'],
  ALDI: ['https://www.aldi.nl/aanbiedingen-volgende-week.html', 'https://www.aldi.nl/folders.html'],
  Jumbo: ['https://www.jumbo.com/aanbiedingen'],
  PLUS: ['https://www.plus.nl/aanbiedingen'],
};
export function requestId(name, day) {
  const h = createHash('sha256').update(name + ':' + day).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
async function site(path, body) {
  const r = await fetch(new URL(path, process.env.SITE_URL), {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      Authorization: 'Bearer ' + process.env.BRIDGE_SECRET,
      'OAI-Sites-Authorization': 'Bearer ' + process.env.SITE_ACCESS_TOKEN },
    body: JSON.stringify(body), signal: AbortSignal.timeout(25000), redirect: 'error',
  });
  if (!r.ok) throw new Error('Kitchen update failed (' + r.status + ').');
  return r.json();
}
export async function evidence(url, fetcher = fetch) {
  const r = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'HalfAnOnion/0.2 (personal grocery planning)', Accept: 'text/html' } });
  if (!r.ok || !r.headers.get('content-type')?.includes('text/html')) throw new Error('Source unavailable');
  let size = 0; const chunks = [];
  for await (const chunk of r.body) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error('Source too large');
    chunks.push(chunk);
  }
  const $ = load(Buffer.concat(chunks).toString());
  const structured = $('script[type="application/ld+json"]').map((_, e) => $(e).text()).get().join('\n');
  $('script,style,nav,footer,header,noscript').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  if (text.length < 300 || /access denied|verify you are human|captcha/i.test(text.slice(0, 1500))) throw new Error('Source unavailable');
  return { url, fetchedAt: Date.now(), text: (structured + '\n' + text).slice(0, 26000) };
}
export async function runJob(name, input, execute) {
  const retailer = name.startsWith('offers-') ? name.slice(7) : null;
  const context = await site('/internal/jobs/context', { retailer });
  if (context.skipped) return context;
  const id = requestId(name, context.today);
  const previous = retailer ? context.state.offerJobs[retailer] : null;
  if (previous?.status === 'success' && Date.now() - previous.lastSuccess < 24 * 3600000)
    return { skipped: true, reason: 'Already refreshed today.' };
  let pages = [];
  if (retailer) {
    for (const url of sources[retailer] ?? []) {
      try { pages.push(await evidence(url)); } catch { /* Persist an honest unavailable status below. */ }
    }
    if (!pages.length)
      return site('/internal/jobs/offers', { retailer, requestId: id, status: 'source-unavailable', offers: [], note: 'Official pages could not be retrieved. Existing offers were preserved.' });
  }
  const output = await execute(id, async runtime => {
    const common = { model: context.state.model, reasoning: context.state.reasoning };
    if (retailer) return runtime.command({ ...common, mode: 'offers',
      text: 'Extract only current or upcoming, dated offers relevant to the household. Never infer campaign dates from today. Return source-unavailable if no verifiable dated offers are present.',
      context: { retailer, today: context.today, pages, ingredients: context.ingredients },
    });
    return runtime.command({ ...common, mode: 'recipes',
      text: 'Suggest up to three recipes for today using pantry, recent meals, preferences and verified active offers. Create recipes only when needed and proposed suggestions; do not change meals, shopping lists, preferences or settings. Suggestions expire in two days. Do not repeat a recipe or dish already present in an unexpired proposed, accepted or dismissed suggestion for the same people. Choose different ideas instead. Use only put actions for recipes and suggestions with new UUIDs. Never overwrite existing records. If dietary information is missing, return a follow-up with no actions.',
      context: { today: context.today, timezone: 'Europe/Amsterdam', speaker: context.ownerId, members: context.members, entities: context.state.entities },
    });
  });
  if (output.status === 'not-connected') return { skipped: true, reason: 'Connect ChatGPT in Settings to enable scheduled suggestions.' };
  if (output.status !== 'completed') throw new Error('Scheduled assistant did not complete.');
  if (retailer) {
    const result = output.result;
    if (!Array.isArray(result.offers)) throw new Error('Invalid offer response');
    // URLs and collection timestamps must come from fetched evidence, never model guesses.
    for (const offer of result.offers) {
      const page = pages.find(p => p.url === offer.sourceUrl);
      if (!page) throw new Error('Offer lacks fetched source evidence.');
      offer.fetchedAt = page.fetchedAt;
    }
    return site('/internal/jobs/offers', { ...result, retailer, requestId: id });
  }
  return site('/internal/jobs/recipes', { id, ...output.result });
}
