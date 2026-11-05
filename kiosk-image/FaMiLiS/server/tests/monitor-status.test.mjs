import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

// Exercise the production Socket.IO handlers without starting HTTP or MySQL.
const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const handlersSource = source.slice(source.indexOf("const ADMIN_PRESENCE_ROOM"), source.indexOf("\n});", source.indexOf("io.on('connection'")) + 4);
function setup(query = async () => [[{ testing_room_id: 1 }]]) {
  const rooms = new Map();
  let connect;
  const delivered = [];
  runInNewContext(handlersSource, {
    rooms, console: { log() {}, error() {} },
    setTimeout: () => ({ unref() {} }), clearTimeout() {},
    poolPromise: Promise.resolve({ query }),
    io: { on: (_event, handler) => { connect = handler; }, to: (id) => ({ emit: (event, data) => delivered.push({ id, event, data }) }) },
  });
  function socket(id, role, username) {
    const handlers = new Map();
    const sent = [];
    const peer = {
      id, data: { auth: { role, id: 9, username } },
      on: (event, handler) => handlers.set(event, handler),
      emit: (event, data) => sent.push({ event, data }),
      join() {}, to: () => ({ emit() {} }),
    };
    connect(peer);
    return { sent, call: (event, data) => handlers.get(event)(data) };
  }
  return { socket, rooms, delivered };
}

test('tester presence distinguishes login, room consent and disconnect', async () => {
  const { socket, delivered } = setup(async (sql) => {
    if (sql.includes('JOIN food_products')) return [[{ room_code: '123456', food_name: 'Apple' }]];
    if (sql.includes("SELECT room_code FROM testing_rooms")) return [[]];
    return [[{ testing_room_id: 1 }]];
  });
  const viewer = socket('viewer', 'admin');
  await viewer.call('monitor-all-rooms');
  const tester = socket('tester-socket', 'tester', 'Tester 1');
  await tester.call('tester-presence-update', { stage: 'consent_pending', roomCode: '123456' });
  const online = delivered.filter(item => item.event === 'tester-presence-snapshot').at(-1).data;
  assert.equal(online[0].testerName, 'Tester 1');
  assert.equal(online[0].stage, 'consent_pending');
  assert.equal(online[0].roomCode, '123456');
  assert.equal(online[0].foodName, 'Apple');
  tester.call('disconnect');
  const offline = delivered.filter(item => item.event === 'tester-presence-snapshot').at(-1).data;
  assert.deepEqual(Array.from(offline), []);
});

test('late viewers receive the latest paused status and session identity', async () => {
  const { socket } = setup();
  const host = socket('host', 'tester');
  await host.call('join-room', 'room');
  assert.equal(host.sent[0].event, 'room-joined');
  await host.call('tester-session-status', { status: 'recording', sessionId: 12 });
  await host.call('tester-session-status', { status: 'paused', sessionId: 12 });
  const viewer = socket('viewer', 'admin');
  await viewer.call('join-room', 'room');
  const status = viewer.sent.find(item => item.event === 'tester-session-status').data;
  assert.equal(status.status, 'paused');
  assert.equal(status.sessionId, 12);
  assert.equal(status.from, 'host');
});

test('disconnected hosts are not replayed and viewers cannot set recording state', async () => {
  const { socket, rooms } = setup();
  const host = socket('host', 'tester');
  await host.call('join-room', 'room');
  await host.call('tester-session-status', { status: 'recording', sessionId: 1 });
  host.call('disconnect');
  const viewer = socket('viewer', 'admin');
  await viewer.call('join-room', 'room');
  await viewer.call('tester-session-status', { status: 'recording' });
  assert.equal(viewer.sent.some(item => item.event === 'tester-session-status'), false);
  assert.equal(rooms.get('room').get('viewer').status, undefined);
});

test('a reconnect restores status under the new peer and rejects unknown states', async () => {
  const { socket, rooms } = setup();
  const oldHost = socket('old', 'tester');
  await oldHost.call('join-room', 'room');
  await oldHost.call('tester-session-status', { status: 'recording', sessionId: 8 });
  oldHost.call('disconnect');
  const host = socket('new', 'tester');
  await host.call('join-room', 'room');
  await host.call('tester-session-status', { status: 'completed', sessionId: 8 });
  await host.call('tester-session-status', { status: 'invalid', sessionId: 8 });
  assert.equal(rooms.get('room').has('old'), false);
  assert.equal(rooms.get('room').get('new').status.status, 'completed');
});


test('all-room monitor discovers both foods, routes replies and cleans every membership', async () => {
  const { socket, rooms, delivered } = setup(async (sql) => sql === "SELECT room_code FROM testing_rooms WHERE status = 'active'"
    ? [[{ room_code: 'apple' }, { room_code: 'bread' }]] : [[{ testing_room_id: 1 }]]);
  const apple = socket('apple-kiosk', 'tester');
  const bread = socket('bread-kiosk', 'tester');
  await apple.call('join-room', 'apple');
  await bread.call('join-room', 'bread');
  const viewer = socket('monitor', 'admin');
  await viewer.call('monitor-all-rooms');
  assert.deepEqual(viewer.sent.filter(x => x.event === 'host-connected').map(x => x.data).sort(), ['apple-kiosk', 'bread-kiosk']);
  await viewer.call('monitor-all-rooms');
  assert.equal(viewer.sent.filter(x => x.event === 'host-connected').length, 2);
  viewer.call('signal', { to: 'apple-kiosk', sdp: { type: 'answer' } });
  assert.equal(delivered.at(-1).id, 'apple-kiosk');
  viewer.call('request-stream', { to: 'bread-kiosk' });
  assert.equal(delivered.at(-1).event, 'stream-request');
  const count = delivered.length;
  apple.call('signal', { to: 'bread-kiosk', sdp: {} });
  assert.equal(delivered.length, count, 'hosts cannot signal a different food room');
  viewer.call('disconnect');
  assert.equal(rooms.get('apple').has('monitor'), false);
  assert.equal(rooms.get('bread').has('monitor'), false);
});

test('tester cannot subscribe to all rooms', async () => {
  let queries = 0;
  const { socket } = setup(async () => { queries++; return [[]]; });
  await socket('host', 'tester').call('monitor-all-rooms');
  assert.equal(queries, 0);
});

test('legacy session discovery is scoped to authenticated owner and active matching food', async () => {
  const queries = [];
  const { socket, rooms } = setup(async (sql, args) => {
    queries.push({ sql, args });
    if (sql.includes('FROM sessions s JOIN testing_rooms')) return [[{ session_id: 17, testing_room_id: 3, room_code: 'apple' }]];
    return [[{ testing_room_id: 3 }]];
  });
  await socket('legacy', 'tester').call('join-room', 'session:17');
  assert.deepEqual(Array.from(queries[0].args), [17, 9]);
  assert.match(queries[0].sql, /s.user_id = \?/);
  assert.match(queries[0].sql, /tr.food_id = s.food_id/);
  assert.equal(rooms.get('apple').get('legacy').role, 'host');
});

test('unavailable or unowned legacy session cannot join a room', async () => {
  const { socket, rooms } = setup(async () => [[]]);
  const host = socket('legacy', 'tester');
  await host.call('join-room', 'session:17');
  assert.equal(rooms.size, 0);
  assert.equal(host.sent.at(-1).event, 'room-error');
});


test('monitor labels use authenticated username, ignoring client-supplied identity', async () => {
  const { socket } = setup();
  const host = socket('host', 'tester', 'Tester 1');
  await host.call('join-room', 'room');
  await host.call('tester-session-status', { status: 'recording', sessionId: 4, testerName: 'Spoofed name' });
  const viewer = socket('viewer', 'admin');
  await viewer.call('join-room', 'room');
  assert.equal(viewer.sent.find(item => item.event === 'tester-session-status').data.testerName, 'Tester 1');
});
