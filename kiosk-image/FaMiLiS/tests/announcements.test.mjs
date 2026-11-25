import test from 'node:test';
import assert from 'node:assert/strict';
import { queueAnnouncement, deliverAnnouncements } from '../server/announcements.js';

test('queues selected offline users atomically and deduplicates recipients', async () => {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return sql.startsWith('SELECT') ? [[{ user_id: 7 }, { user_id: 8 }]] : [{}]; } };
  const result = await queueAnnouncement(pool, 1, { message: 'Hello', recipientIds: [7, 8, 7] });
  assert.equal(result.recipientCount, 2);
  assert.deepEqual(calls[0].params, [[7, 8]]);
  assert.equal(calls[1].params[0].length, 2);
});
test('rejects invalid messages, recipients and past schedules before saving', async () => {
  const pool = { query: async () => { throw new Error('Unexpected query'); } };
  for (const body of [{ message: '', recipientIds: [7] }, { message: 'x'.repeat(151), recipientIds: [7] }, { message: 'Hi', recipientIds: [] }, { message: 'Hi', recipientIds: [7], scheduledAt: 'invalid' }, { message: 'Hi', recipientIds: [7], scheduledAt: '2000-01-01T00:00:00Z' }]) {
    await assert.rejects(queueAnnouncement(pool, 1, body), error => error.message !== 'Unexpected query');
  }
});
test('all tasters are snapshotted and scheduled time preserves its timezone', async () => {
  let rows;
  const pool = { query: async (sql, params) => sql.startsWith('SELECT') ? [[{ user_id: 2 }]] : (rows = params[0], [{}]) };
  const result = await queueAnnouncement(pool, 1, { message: 'Scheduled', allTasters: true, scheduledAt: '2030-01-01T10:00:00+08:00' }, new Date('2029-01-01'));
  assert.equal(result.scheduledAt, '2030-01-01T02:00:00.000Z');
  assert.equal(rows[0][1], 2);
});
test('delivery is account scoped, due only, and not repeatedly emitted on the same connection', async () => {
  const events = [];
  const socket = { connected: true, data: { auth: { id: 7, role: 'tester' } }, emit: (...args) => events.push(args) };
  const pool = { query: async (sql, params) => {
    assert.equal(params[0], 7);
    assert.match(sql, /dismissed_at IS NULL AND a.scheduled_at <= NOW/);
    return [[{ id: 'one', message: 'Hello', sentAt: new Date() }]];
  } };
  await deliverAnnouncements(pool, [socket]);
  await deliverAnnouncements(pool, [socket]);
  assert.equal(events.length, 1);
  socket.data.sentAnnouncements = new Set();
  await deliverAnnouncements(pool, [socket]);
  assert.equal(events.length, 2, 'undismissed announcements return on reconnection');
});
