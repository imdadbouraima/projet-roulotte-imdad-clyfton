export const orderStatuses = ["RECEIVED", "PREPARING", "READY", "PICKED_UP", "CANCELLED"] as const;

export type OrderStatus = (typeof orderStatuses)[number];

export const allowedOrderTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  RECEIVED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: [],
  CANCELLED: [],
};
