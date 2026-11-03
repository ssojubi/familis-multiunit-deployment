import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { isConnectionPause, pauseForInterruption, probeSessionRecovery, startSessionRecovery } from '../src/lib/sessionRecovery.ts';

const active = { id: 42, status: 'active', hasConsent: true, invalidatedAt: null };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const healthy = async path => path.includes('/sessions/')
  ? json({ ok: true, session: active }) : json({ ok: true, emotion: { modelLoaded: true } });
const signal = () => new AbortController().signal;

function setup(t, request = healthy) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const events = new EventTarget();
  const results = [];
  let online = true;
  const loop = startSessionRecovery({ request, sessionId: 42, requireConsent: true,
    events, online: () => online, onResult: result => results.push(result) });
  t.after(() => loop.stop());
  return { loop, results, events, offline() { online = false; events.dispatchEvent(new Event('offline')); },
    reconnect() { online = true; events.dispatchEvent(new Event('online')); } };
}

test('recovery verifies the original session and processing service using read-only requests', async () => {
  const calls = [];
  const result = await probeSessionRecovery(async (path, options) => {
    calls.push({ path, options }); return healthy(path);
  }, 42, true, signal());
  assert.equal(result.kind, 'ready');
  assert.equal(result.session.id, 42);
  assert.deepEqual(calls.map(c => c.path), ['/api/sessions/42', '/api/emotion/health']);
  assert.ok(calls.every(c => c.options.cache === 'no-store' && !c.options.method));
});

test('offline immediately pauses; reconnect checks and recovers the same session', async t => {
  const h = setup(t);
  await setImmediate();
  assert.equal(h.results.at(-1).kind, 'ready');
  h.offline();
  assert.equal(h.results.at(-1).kind, 'unavailable');
  h.reconnect();
  await setImmediate();
  assert.equal(h.results.at(-1).kind, 'ready');
  assert.equal(h.results.at(-1).session.id, 42);
});

test('server outage recovers by polling even without a browser online event', async t => {
  let down = true;
  const h = setup(t, async path => { if (down) throw new TypeError('Failed to fetch'); return healthy(path); });
  await setImmediate();
  assert.equal(h.results.at(-1).kind, 'unavailable');
  down = false;
  t.mock.timers.tick(3000);
  await setImmediate();
  assert.equal(h.results.at(-1).kind, 'ready');
});

test('hung checks time out and abort without trapping recovery', async t => {
  let aborted = false;
  let hung = true;
  const h = setup(t, (path, options) => {
    if (!hung) return healthy(path);
    options.signal.addEventListener('abort', () => { aborted = true; });
    return new Promise(() => {});
  });
  t.mock.timers.tick(5000);
  await setImmediate();
  assert.equal(aborted, true);
  assert.equal(h.results.at(-1).kind, 'unavailable');
  hung = false;
  t.mock.timers.tick(3000);
  await setImmediate();
  assert.equal(h.results.at(-1).kind, 'ready');
});

test('a stale successful check cannot undo a newer disconnect', async t => {
  let resolve;
  const h = setup(t, path => path.includes('/sessions/')
    ? new Promise(r => { resolve = r; }) : healthy(path));
  h.offline();
  resolve(json({ ok: true, session: active }));
  await setImmediate();
  assert.deepEqual(h.results.map(r => r.kind), ['unavailable']);
});

test('unmount stops callbacks and removes reconnection listeners', async t => {
  let resolve;
  const h = setup(t, () => new Promise(r => { resolve = r; }));
  h.loop.stop();
  h.reconnect();
  resolve(json({ ok: true, session: active }));
  await setImmediate();
  t.mock.timers.tick(10000);
  await setImmediate();
  assert.deepEqual(h.results, []);
});

test('manual, initial, camera, no-face and stop pauses survive a network interruption', () => {
  for (const reason of ['manual', 'initial', 'camera-error', 'camera-ended', 'no-face', 'confirm-stop', 'session-unavailable']) {
    assert.equal(pauseForInterruption(true, reason), false, reason);
    assert.equal(isConnectionPause(reason), false, reason);
  }
  assert.equal(pauseForInterruption(false, null), true);
  assert.equal(pauseForInterruption(true, 'offline'), true);
  assert.equal(isConnectionPause('emotion-offline'), true);
});

for (const session of [
  { ...active, id: 43 }, { ...active, status: 'completed' }, { ...active, status: 'cancelled' },
  { ...active, status: 'pending' }, { ...active, invalidatedAt: '2026-10-29' }, { ...active, hasConsent: false },
]) {
  test(`does not resume an unrecordable session: ${JSON.stringify(session)}`, async () => {
    const result = await probeSessionRecovery(async () => json({ ok: true, session }), 42, true, signal());
    assert.equal(result.kind, 'blocked');
  });
}
for (const status of [401, 403, 404]) {
  test(`access failure ${status} blocks automatic resumption`, async () => {
    assert.equal((await probeSessionRecovery(async () => json({}, status), 42, true, signal())).kind, 'blocked');
  });
}
test('a reachable web server alone does not prove the processing service recovered', async () => {
  await assert.rejects(probeSessionRecovery(async path => path.includes('/sessions/')
    ? healthy(path) : json({ ok: false, emotion: { modelLoaded: false } }, 503), 42, true, signal()));
});
