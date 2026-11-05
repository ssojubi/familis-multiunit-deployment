import test from 'node:test';
import assert from 'node:assert/strict';
import { receivePeerSignal } from '../src/lib/peerSignaling.ts';

function peer(state = 'stable') {
  const calls = [];
  return { calls, signalingState: state, remoteDescription: null, localDescription: null,
    async setRemoteDescription(sdp) { calls.push('remote'); this.remoteDescription = sdp; },
    async addIceCandidate(candidate) {
      assert.ok(this.remoteDescription, 'ICE must wait for a remote description');
      calls.push(candidate.candidate);
    },
    async createAnswer() { calls.push('answer'); return { type: 'answer', sdp: 'answer' }; },
    async setLocalDescription(sdp) { calls.push('local'); this.localDescription = sdp; },
  };
}

test('viewer buffers candidates arriving before the offer', async () => {
  const pc = peer(); let answer;
  await receivePeerSignal(pc, { candidate: { candidate: 'early' } });
  assert.deepEqual(pc.calls, []);
  await receivePeerSignal(pc, { sdp: { type: 'offer', sdp: 'offer' } }, value => { answer = value; });
  assert.deepEqual(pc.calls, ['remote', 'early', 'answer', 'local']);
  assert.equal(answer.type, 'answer');
});

test('kiosk buffers candidates arriving before the answer', async () => {
  const pc = peer('have-local-offer');
  await receivePeerSignal(pc, { candidate: { candidate: 'early' } });
  await receivePeerSignal(pc, { sdp: { type: 'answer', sdp: 'answer' } });
  assert.deepEqual(pc.calls, ['remote', 'early']);
});

test('asynchronous SDP installation cannot race the next candidate', async () => {
  const pc = peer(); let release;
  pc.setRemoteDescription = async function(sdp) {
    await new Promise(resolve => { release = resolve; });
    this.remoteDescription = sdp;
  };
  const offer = receivePeerSignal(pc, { sdp: { type: 'offer', sdp: 'offer' } });
  const ice = receivePeerSignal(pc, { candidate: { candidate: 'following' } });
  await Promise.resolve();
  assert.deepEqual(pc.calls, []);
  release();
  await Promise.all([offer, ice]);
  assert.deepEqual(pc.calls, ['following']);
});

test('a closed connection ignores queued work', async () => {
  const pc = peer('closed');
  await receivePeerSignal(pc, { sdp: { type: 'offer' } });
  await receivePeerSignal(pc, { candidate: { candidate: 'stale' } });
  assert.deepEqual(pc.calls, []);
});

test('one failed message does not poison the next negotiation', async () => {
  const pc = peer(); const original = pc.setRemoteDescription;
  pc.setRemoteDescription = async () => { throw new Error('old offer'); };
  await assert.rejects(receivePeerSignal(pc, { sdp: { type: 'offer' } }));
  pc.setRemoteDescription = original;
  await receivePeerSignal(pc, { sdp: { type: 'offer', sdp: 'new' } });
  await receivePeerSignal(pc, { candidate: { candidate: 'good' } });
  assert.deepEqual(pc.calls, ['remote', 'good']);
});

test('connections have independent ICE queues', async () => {
  const first = peer(), second = peer();
  await receivePeerSignal(first, { candidate: { candidate: 'first-only' } });
  await receivePeerSignal(second, { sdp: { type: 'offer' } });
  assert.deepEqual(second.calls, ['remote']);
  await receivePeerSignal(first, { sdp: { type: 'offer' } });
  assert.deepEqual(first.calls, ['remote', 'first-only']);
});

// Exercise the production event handler: joining late must offer an active camera.
const { readFileSync } = await import('node:fs');
const { runInNewContext } = await import('node:vm');
const source = readFileSync(new URL('../src/pages/TesterSession.tsx', import.meta.url), 'utf8');
const handlerStart = source.indexOf('    socket.on("viewer-connected",');
const handlerEnd = source.indexOf('\n    });', handlerStart) + '\n    });'.length;
for (const recording of [true, false]) {
  test(`late monitor ${recording ? 'receives the active stream' : 'does not start an idle camera'}`, () => {
    const viewers = new Set(), published = [];
    let handler;
    runInNewContext(source.slice(handlerStart, handlerEnd), {
      socket: { on(_event, callback) { handler = callback; } },
      viewerIdsRef: { current: viewers }, isRecordingRef: { current: recording },
      publishCameraStream: id => { published.push(id); },
    });
    handler('monitor-1');
    assert.equal(viewers.has('monitor-1'), true);
    assert.deepEqual(published, recording ? ['monitor-1'] : []);
  });
}


test('stale buffered ICE does not suppress the answer or remaining candidates', async () => {
  const pc = peer();
  const original = pc.addIceCandidate;
  pc.addIceCandidate = async function(candidate) {
    if (candidate.candidate === 'stale') throw new Error('old ICE generation');
    return original.call(this, candidate);
  };
  await receivePeerSignal(pc, { candidate: { candidate: 'stale' } });
  await receivePeerSignal(pc, { candidate: { candidate: 'valid' } });
  let answer;
  await receivePeerSignal(pc, { sdp: { type: 'offer' } }, value => { answer = value; });
  assert.equal(answer.type, 'answer');
  assert.ok(pc.calls.includes('valid'));
});
