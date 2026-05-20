from datetime import datetime

class KioskRegistry:
    def __init__(self):
        self.kiosks = {}  # kiosk_id -> {"websocket": ws, "status": str, "session_id": str, "last_heartbeat": datetime}

    async def register(self, kiosk_id: str, websocket):
        self.kiosks[kiosk_id] = {
            "websocket": websocket,
            "status": "idle",
            "session_id": None,
            "last_heartbeat": datetime.now()
        }
        print(f"Kiosk {kiosk_id} registered")

    async def update_heartbeat(self, kiosk_id: str):
        if kiosk_id in self.kiosks:
            self.kiosks[kiosk_id]["last_heartbeat"] = datetime.now()

    async def set_recording(self, kiosk_id: str, session_id: str):
        if kiosk_id in self.kiosks:
            self.kiosks[kiosk_id]["status"] = "recording"
            self.kiosks[kiosk_id]["session_id"] = session_id

    async def set_idle(self, kiosk_id: str):
        if kiosk_id in self.kiosks:
            self.kiosks[kiosk_id]["status"] = "idle"
            self.kiosks[kiosk_id]["session_id"] = None

    def unregister(self, kiosk_id: str):
        if kiosk_id in self.kiosks:
            del self.kiosks[kiosk_id]
            print(f"Kiosk {kiosk_id} unregistered")

    def count(self):
        return len(self.kiosks)

    def get_websocket(self, kiosk_id: str):
        kiosk = self.kiosks.get(kiosk_id)
        return kiosk.get("websocket") if kiosk else None

    def is_recording_session(self, kiosk_id: str, session_id: str):
        kiosk = self.kiosks.get(kiosk_id)
        if not kiosk:
            return False
        return kiosk.get("status") == "recording" and kiosk.get("session_id") == session_id

    def get_all_status(self):
        return {
            kid: {
                "status": info.get("status"),
                "session_id": info.get("session_id"),
                "last_heartbeat": info.get("last_heartbeat").isoformat() if info.get("last_heartbeat") else None
            }
            for kid, info in self.kiosks.items()
        }

# Global registry instance
_kiosk_registry = None

def get_kiosk_registry():
    global _kiosk_registry
    return _kiosk_registry

def set_kiosk_registry(registry):
    global _kiosk_registry
    _kiosk_registry = registry
