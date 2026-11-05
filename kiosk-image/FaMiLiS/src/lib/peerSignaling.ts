export type PeerSignal = {
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type PendingSignals = {
  candidates: RTCIceCandidateInit[];
  tail: Promise<void>;
};
const pending = new WeakMap<RTCPeerConnection, PendingSignals>();

/** Socket messages are ordered, but async SDP operations must also be serialized.
 * Trickle ICE can arrive before SDP, particularly over a remote signaling path.
 */
export function receivePeerSignal(
  pc: RTCPeerConnection,
  signal: PeerSignal,
  sendAnswer?: (answer: RTCSessionDescriptionInit) => void,
): Promise<void> {
  let state = pending.get(pc);
  if (!state) {
    state = { candidates: [], tail: Promise.resolve() };
    pending.set(pc, state);
  }
  const queue = state;
  const operation = queue.tail.then(async () => {
    if (pc.signalingState === "closed") return;
    if (signal.sdp) {
      if (signal.sdp.type === "answer" && pc.signalingState !== "have-local-offer") return;
      await pc.setRemoteDescription(signal.sdp);
      for (const candidate of queue.candidates.splice(0)) {
        // A stale candidate from a replaced connection must not prevent the SDP answer.
        try { await pc.addIceCandidate(candidate); } catch { /* Continue with other candidates. */ }
      }
      if (signal.sdp.type === "offer" && sendAnswer) {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendAnswer(pc.localDescription ?? answer);
      }
    } else if (signal.candidate) {
      if (!pc.remoteDescription) {
        if (queue.candidates.length >= 64) throw new Error("Too many early ICE candidates");
        queue.candidates.push(signal.candidate);
      } else {
        await pc.addIceCandidate(signal.candidate);
      }
    }
  });
  // One rejected candidate must not poison every subsequent message.
  queue.tail = operation.catch(() => {});
  return operation;
}
