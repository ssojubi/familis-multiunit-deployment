import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

// Exercise the production Socket.IO handlers without starting HTTP or MySQL.
const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const handlersSource = source.slice(source.indexOf("io.on('connection'"), source.indexOf("\n});", source.indexOf("io.on('connection'")) + 4);
function setup() {
  const rooms = new Map();
  let connect;
  runInNewContext(handlersSource, {
    rooms, console: { log() {}, error() {} },
    poolPromise: Promise.resolve({ query: async () => [[{ testing_room_id: 1 }]] }),
    io: { on: (_event, handler) => { connect = handler; } },
  });
  function socket(id, role) {
    const handlers = new Map();
    const sent = [];
    const peer = {
      id, data: { auth: { role } },
      on: (event, handler) => handlers.set(event, handler),
      emit: (event, data) => sent.push({ event, data }),
      join() {}, to: () => ({ emit() {} }),
    };
    connect(peer);
    return { sent, call: (event, data) => handlers.get(event)(data) };
  }
  return { socket, rooms };
}

test('late viewers receive the latest paused status and session identity', async () => {
  const { socket } = setup();
  const host = socket('host', 'tester');
  await host.call('join-room', 'room');
  assert.equal(host.sent[0].event, 'room-joined');
  host.call('tester-session-status', { status: 'recording', sessionId: 12 });
  host.call('tester-session-status', { status: 'paused', sessionId: 12 });
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
  host.call('tester-session-status', { status: 'recording', sessionId: 1 });
  host.call('disconnect');
  const viewer = socket('viewer', 'admin');
  await viewer.call('join-room', 'room');
  viewer.call('tester-session-status', { status: 'recording' });
  assert.equal(viewer.sent.some(item => item.event === 'tester-session-status'), false);
  assert.equal(rooms.get('room').get('viewer').status, undefined);
});

test('a reconnect restores status under the new peer and rejects unknown states', async () => {
  const { socket, rooms } = setup();
  const oldHost = socket('old', 'tester');
  await oldHost.call('join-room', 'room');
  oldHost.call('tester-session-status', { status: 'recording', sessionId: 8 });
  oldHost.call('disconnect');
  const host = socket('new', 'tester');
  await host.call('join-room', 'room');
  host.call('tester-session-status', { status: 'completed', sessionId: 8 });
  host.call('tester-session-status', { status: 'invalid', sessionId: 8 });
  assert.equal(rooms.get('room').has('old'), false);
  assert.equal(rooms.get('room').get('new').status.status, 'completed');
});
