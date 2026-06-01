import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from 'socket.io-client';

type Role = 'host' | 'viewer' | null;

interface ServerToClientEvents {
  'viewer-connected': () => void;
  'user-disconnected': (userId: string) => void;
  'host-disconnected': () => void;
  'signal': (data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) => void;
}

interface ClientToServerEvents {
  'join-room': (roomId: string, role: Role) => void;
  'signal': (data: { room: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) => void;
}

// make API base dynamic
const API_BASE = window.location.hostname === 'localhost'
  ? 'https://localhost:8888'
  : `https://${window.location.hostname}:8888`;

const toApiUrl = (url: string | null) => {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
};

const SOCKET_SERVER_URL = API_BASE; 

const WEBRTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}

export default function KioskHost() {
  const [role, setRole] = useState<Role>(null);         
  const [roomId, setRoomId] = useState<string>('');
  const [kioskStatus, setKioskStatus] = useState<string>('Select a role to begin.');
  const [shareUrl, setShareUrl] = useState<string>('');

  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);   // host's camera
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);  // remote stream (viewer sees this)


  // get room ID from URL
  useEffect(() => {
    // retrieve the logged-in user from your auth state / localStorage
    const storedUser = localStorage.getItem("user"); 
    const user = storedUser ? JSON.parse(storedUser) : null;
    const userRole = user?.role;
  
    const urlParams = new URLSearchParams(window.location.search);
    const urlRoom = urlParams.get('room');
  
    if (userRole === 'admin') {
      setRole('viewer'); // admin is automatically the remote viewer
      if (urlRoom) {
        setRoomId(urlRoom);
      } else {
        const newRoomId = Math.random().toString(36).substring(2, 9);
        setRoomId(newRoomId);
      }
    } else if (userRole === 'staff') {  // TODO : might wanna change this to tester or sumn
      setRole('host'); // staff is automatically the camera host
      if (urlRoom) {
        setRoomId(urlRoom);
      } else {
        setRoomId('default-staff-room');
      }
    } else {
      // fallback if no user is found
      if (urlRoom) {
        setRoomId(urlRoom);
        setRole('host');
      }
    }
  }, []);
  

  // connect socket once room is known
  useEffect(() => {
    if (!roomId || !role) return;
  
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SOCKET_SERVER_URL, {
      reconnection: true,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;
  
    socket.on('connect', () => {
      setKioskStatus(`Connected as ${role}. Room: ${roomId}`);
      // pass both roomId and role to help the server configure user sets
      socket.emit('join-room', roomId, role);
    });
  
    socket.on('connect_error', () => {
      setKioskStatus('Connection failed — check that server.js is running.');
    });
  
    // HOST: Changed listener from 'user-connected' to 'viewer-connected'
    socket.on('viewer-connected', async () => {
      if (role !== 'host') return;
      setKioskStatus('Viewer connected! Starting stream...');
  
      if (!localStreamRef.current) {
        await startCamera();
      }
  
      const pc = await createPeerConnection();
  
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }
  
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      
      // package inside the server's expected 'signal' wrapper
      socket.emit('signal', { room: roomId, sdp: offer });
    });
  
    // unified signaling listener for offers, answers, and candidates
    socket.on('signal', async (data) => {
      if (!peerConnectionRef.current && role === 'viewer') {
        await createPeerConnection();
      }
      const pc = peerConnectionRef.current;
      if (!pc) return;
  
      if (data.sdp) {
        if (data.sdp.type === 'offer' && role === 'viewer') {
          setKioskStatus('Received stream offer...');
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          // return the answer packaged inside the signal wrapper
          socket.emit('signal', { room: roomId, sdp: answer });
        } else if (data.sdp.type === 'answer' && role === 'host') {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          }
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error('ICE candidate error:', e);
        }
      }
    });
  
    socket.on('user-disconnected', () => {
      setKioskStatus('Remote peer disconnected.');
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      cleanupPeerConnection();
    });
  
    socket.on('host-disconnected', () => {
      setKioskStatus('Host disconnected.');
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      cleanupPeerConnection();
    });
  
    return () => {
      socket.disconnect();
      cleanupWebRTC();
    };
  }, [roomId, role]);

 const createPeerConnection = async (): Promise<RTCPeerConnection> => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    const pc = new RTCPeerConnection(WEBRTC_CONFIG);
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && roomId) {
        // send ICE candidates wrapped inside the 'signal' packet structure
        socketRef.current.emit('signal', { room: roomId, candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      setKioskStatus(`Connection: ${pc.connectionState}`);
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', pc.iceConnectionState);
    };

    // remote track appears on the remote video element for both roles
    pc.ontrack = (event) => {
      console.log('Remote track received:', event.track.kind);
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        remoteVideoRef.current.play().catch(() => {
          // autoplay policy — mute and retry
          if (remoteVideoRef.current) {
            remoteVideoRef.current.muted = true;
            remoteVideoRef.current.play();
          }
        });
      }
    };

    return pc;
  };

  // start local camera (host only)
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }
      setKioskStatus('Camera active');
    } catch (err) {
      console.error('Camera error:', err);
      setKioskStatus('Camera permission denied or unavailable.');
    }
  };

  // stop everything
  const stopCamera = () => {
    cleanupWebRTC();
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setKioskStatus('Stopped.');
  };

  const copyLinkToClipboard = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    alert('Share link copied! Open it on the kiosk/remote device.');
  };

  const cleanupPeerConnection = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  };

  const cleanupWebRTC = () => {
    cleanupPeerConnection();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
  };

  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-gray-900 font-bold mb-1">Manage Kiosks</h2>
          <p className="text-[12px] text-gray-500">
            Status: <span className="font-semibold text-gray-700">{kioskStatus}</span>
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* local camera preview — locked for host/staff device */}
        <div>
          <p className="text-[12px] text-gray-600 font-semibold mb-1">
            Local Camera Feed (This Kiosk Device)
          </p>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded-lg border border-gray-200 bg-black aspect-video"
          />
        </div>

        {/* Staff/Host Device Functional Controls */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={startCamera}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-[#e8174a] hover:bg-[#c9143f] text-white py-2.5 rounded-md text-sm font-semibold transition-colors"
          >
            ▶︎ Start Camera
          </button>
          <button
            type="button"
            onClick={stopCamera}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 py-2.5 rounded-md text-sm font-semibold transition-colors"
          >
            ⏹ Stop Camera
          </button>
        </div>
      </div>
    </section>
  );
}