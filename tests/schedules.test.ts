import test from 'node:test';
import assert from 'node:assert/strict';
import { jobSchedules, nextScheduledRun } from '../src/domain/schedules';
const recipes = jobSchedules.find(j => j.id === 'recipes')!;
test('daily schedules roll forward exactly at the scheduled time in Amsterdam', () => {
  assert.equal(nextScheduledRun(recipes, new Date('2026-11-11T07:59:59Z')).toISOString(), '2026-11-11T08:00:00.000Z');
  assert.equal(nextScheduledRun(recipes, new Date('2026-11-11T08:00:00Z')).toISOString(), '2026-11-12T08:00:00.000Z');
});
test('next run uses the offset of the target day across both DST changes', () => {
  assert.equal(nextScheduledRun(recipes, new Date('2026-03-28T09:00:00Z')).toISOString(), '2026-03-29T07:00:00.000Z');
  assert.equal(nextScheduledRun(recipes, new Date('2026-10-24T09:00:00Z')).toISOString(), '2026-10-25T08:00:00.000Z');
});
test('weekly offers retain their weekday and the PLUS minute offset', () => {
  const now = new Date('2026-11-11T10:00:00Z');
  const times = Object.fromEntries(jobSchedules.map(job => [job.id, nextScheduledRun(job, now).toISOString()]));
  assert.equal(times['offers-ALDI'], '2026-11-11T13:00:00.000Z');
  assert.equal(times['offers-AH'], '2026-11-13T13:00:00.000Z');
  assert.equal(times['offers-Jumbo'], '2026-11-14T13:00:00.000Z');
  assert.equal(times['offers-PLUS'], '2026-11-14T13:20:00.000Z');
});
