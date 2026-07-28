import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { performLogout } from "../auth";
import logo from "../assets/logo.png";
import { getApiBase, toApiUrl } from "../apiConfig";
import {
  captureTesterContext,
  testerContextSearch,
} from "../testerContext";

const API_BASE = getApiBase();

type ActiveTestingRoom = {
  id: number;
  foodId: number;
  foodName: string;
  foodCategory: string;
  foodImageUrl: string | null;
  createdAt: string | null;
};

export default function TesterJoin() {
  const location = useLocation();
  const navigate = useNavigate();
  const [initialContext] = useState(() =>
    captureTesterContext(location.search),
  );
  const [rooms, setRooms] = useState<ActiveTestingRoom[]>([]);
  const [foodId, setFoodId] = useState(
    initialContext.foodId ? Number(initialContext.foodId) : 0,
  );
  const [roomCode, setRoomCode] = useState(initialContext.roomId);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadActiveTests() {
      try {
        const response = await fetch(`${API_BASE}/api/testing-rooms/active`, {
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || "Could not load active food tests.");
        }
        const activeRooms = (payload.rooms ?? []) as ActiveTestingRoom[];
        setRooms(activeRooms);
        setFoodId((current) =>
          activeRooms.some((room) => room.foodId === current)
            ? current
            : activeRooms[0]?.foodId ?? 0,
        );
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load active food tests.",
          );
        }
      } finally {
        setLoading(false);
      }
    }

    void loadActiveTests();
    return () => controller.abort();
  }, []);

  const handleJoin = async () => {
    if (!foodId || !/^\d{6}$/.test(roomCode)) {
      setError("Select a food test and enter the six-digit room code.");
      return;
    }

    setJoining(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/testing-rooms/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foodId, roomCode }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.error || "The room code could not be validated.",
        );
      }

      const query = testerContextSearch({
        roomId: String(payload.room.roomCode),
        foodId: String(payload.room.foodId),
        kioskId: initialContext.kioskId,
      });
      navigate(`/tester-consent?${query}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The room code could not be validated.",
      );
    } finally {
      setJoining(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#f6f7fb]"
      style={{ fontFamily: "'Montserrat', sans-serif" }}
    >
      <header className="bg-red-600 text-white">
        <div className="h-[72px] px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="FaMiLis logo"
              className="w-[44px] h-[44px] object-contain"
            />
            <span className="text-[22px] font-bold">FaMiLis</span>
          </div>
          <button
            type="button"
            onClick={() => performLogout(navigate)}
            className="bg-white text-red-700 px-4 py-2 rounded-md text-sm font-semibold"
          >
            Log Out
          </button>
        </div>
      </header>

      <main className="px-6 py-10">
        <div className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-red-600 px-6 py-4">
            <h1 className="text-white text-xl font-bold">
              Join an Active Food Test
            </h1>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-sm font-bold text-gray-900 mb-3">
                Active food testing
              </h2>
              {loading ? (
                <p className="text-sm text-gray-500">Loading active tests...</p>
              ) : rooms.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-4 py-3">
                  There are no active food tests. Please wait for the
                  administrator to activate one.
                </p>
              ) : (
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-md">
                  {rooms.map((room) => (
                    <label
                      key={room.id}
                      className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="radio"
                        name="active-food"
                        value={room.foodId}
                        checked={foodId === room.foodId}
                        onChange={() => setFoodId(room.foodId)}
                        className="w-4 h-4 accent-red-600"
                      />
                      {room.foodImageUrl ? (
                        <img
                          src={toApiUrl(room.foodImageUrl) ?? undefined}
                          alt=""
                          className="w-12 h-12 rounded-md object-cover border border-gray-200"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-md bg-gray-100 border border-gray-200" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {room.foodName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {room.foodCategory}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="room-code"
                className="block text-sm font-bold text-gray-900 mb-2"
              >
                Room code
              </label>
              <input
                id="room-code"
                value={roomCode}
                onChange={(event) =>
                  setRoomCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter 6-digit code"
                className="w-full h-12 border border-gray-300 rounded-md px-4 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-500"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleJoin}
              disabled={joining || loading || rooms.length === 0}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3 rounded-md text-sm font-semibold"
            >
              {joining ? "Checking Room..." : "Continue to Consent"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
