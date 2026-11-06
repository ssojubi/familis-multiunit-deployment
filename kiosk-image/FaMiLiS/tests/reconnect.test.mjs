import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const server = readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const monitor = readFileSync(new URL('../src/pages/VideoMonitoring.tsx', import.meta.url), 'utf8');
const tester = readFileSync(new URL('../src/pages/TesterSession.tsx', import.meta.url), 'utf8');
const ts = (await import('typescript')).default;
function run(source, context) {
  vm.runInNewContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022 }), context);
}
function handler(source, name) {
  const start = source.indexOf(`    socket.on("${name}",`);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n    });', start) + 8);
}

test('server disconnect uses the last shared lease, not a new 90 seconds', async () => {
  const events = [], timers = [], updates = [];
  const context = {
    Date: { now: () => 12000 }, TESTER_RECONNECT_TIMEOUT_MS: 90000,
    testerReconnectTimers: new Map(), sessionLastFrameActivity: new Map([[7, 10000]]),
    setTimeout: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeout() {}, ADMIN_PRESENCE_ROOM: 'admin',
    io: { to: () => ({ emit: (...args) => events.push(args) }) },
    poolPromise: Promise.resolve({ query: (...args) => updates.push(args) }), console,
  };
  const start = server.indexOf('function clearTesterReconnectTimer(');
  run(server.slice(start, server.indexOf('function currentTesterPresence()', start)), context);
  const entry = { status: { testerId: 2, sessionId: 7, status: 'recording' } };
  context.scheduleTesterReconnectTimeout(entry);
  context.scheduleTesterReconnectTimeout(entry);
  assert.equal(timers.length, 1, 'duplicate disconnect must not reset deadline');
  assert.equal(events[0][1].deadline, 100000);
  assert.equal(timers[0].delay, 88000);
  await timers[0].callback();
  assert.equal(updates.length, 1);
  assert.equal(events.at(-1)[0], 'tester-reconnect-expired');
});

test('admin disconnect does not overwrite the server deadline or expire locally', () => {
  let kiosks = [{ peerId: 'old', testerId: 2, reconnectDeadline: null }];
  const handlers = {};
  const context = {
    socket: { on: (name, callback) => handlers[name] = callback },
    Date: { now: () => 20000 },
    setRemoteKiosks: update => kiosks = update(kiosks),
    sessionStatusByPeerRef: { current: new Map([['old', { status: 'recording' }]]) },
    peerConnectionsRef: { current: new Map() }, cameraRetryRef: { current: new Map() },
    disconnectTimerRef: { current: new Map() },
    window: { clearTimeout() {}, setTimeout() { assert.fail('must not invent a local expiry'); } },
    removeKiosk() { assert.fail('must wait for server expiry'); },
  };
  run(handler(monitor, 'tester-reconnecting'), context);
  run(handler(monitor, 'user-disconnected'), context);
  handlers['tester-reconnecting']({ testerId: 2, deadline: 100000, serverNow: 12000 });
  handlers['user-disconnected']('old');
  assert.equal(kiosks[0].reconnectDeadline, 108000);
});

test('stale survey presence cannot remove a recording peer', () => {
  let presence;
  const handlers = {};
  run(handler(monitor, 'tester-presence-snapshot'), {
    socket: { on: (name, callback) => handlers[name] = callback },
    setTesterPresence: value => presence = value,
    sessionStatusByPeerRef: { current: new Map([['live', { testerId: 2, status: 'recording' }]]) },
    removeKiosk() { assert.fail('presence must not destroy a recording'); },
  });
  handlers['tester-presence-snapshot']([{ testerId: 2, stage: 'survey' }]);
  assert.equal(presence.length, 1);
});

test('tester restores recording only after a matching server lease', () => {
  const handlers = {}, states = [];
  const context = {
    socket: { on: (name, callback) => handlers[name] = callback },
    Date: { now: () => 5000 }, isRecordingRef: { current: true }, sessionIdRef: { current: 7 },
    reconnectLeaseRef: { current: null }, reconnectDeadlineRef: { current: 90000 },
    clearReconnectCountdown: () => states.push('clear'),
    setStatus: value => states.push(value), setIsRecording: value => states.push(value),
    setMessage: value => states.push(value),
  };
  run(handler(tester, 'session-reconnect-lease'), context);
  handlers['session-reconnect-lease']({ sessionId: 6, deadline: 100000, serverNow: 10000 });
  assert.equal(states.length, 0);
  handlers['session-reconnect-lease']({ sessionId: 7, deadline: 100000, serverNow: 10000 });
  assert.equal(context.reconnectLeaseRef.current, 95000);
  assert.deepEqual(states.slice(0, 3), ['clear', 'recording', true]);
});
