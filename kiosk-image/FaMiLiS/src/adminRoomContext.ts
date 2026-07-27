const ADMIN_ROOM_KEY = "familis.adminRoom";
const ADMIN_FOOD_KEY = "familis.adminFoodId";

export type AdminRoomContext = {
  roomId: string;
  foodId: number | null;
};

export function getAdminRoomContext(search = window.location.search): AdminRoomContext {
  const params = new URLSearchParams(search);
  const roomId = params.get("room") || localStorage.getItem(ADMIN_ROOM_KEY) || "";
  const rawFoodId = params.get("foodId") || localStorage.getItem(ADMIN_FOOD_KEY);
  const parsedFoodId = rawFoodId ? Number(rawFoodId) : null;

  return {
    roomId,
    foodId:
      parsedFoodId !== null && Number.isInteger(parsedFoodId) && parsedFoodId > 0
        ? parsedFoodId
        : null,
  };
}

export function saveAdminRoomContext(roomId: string, foodId: number | null): void {
  if (roomId) localStorage.setItem(ADMIN_ROOM_KEY, roomId);
  if (foodId !== null) localStorage.setItem(ADMIN_FOOD_KEY, String(foodId));
}

export function getAdminDashboardPath(roomId: string, foodId: number | null): string {
  const params = new URLSearchParams();
  if (roomId) params.set("room", roomId);
  if (foodId !== null) params.set("foodId", String(foodId));
  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}
