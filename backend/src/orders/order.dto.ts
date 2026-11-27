import type { OrderRecord } from "./order.repository.js";

export function toOrderDto(order: OrderRecord) {
  return {
    id: order.id,
    status: order.status,
    note: order.note,
    totalCents: order.totalCents,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    customer: { id: order.user.id, name: order.user.name },
    items: order.items.map((item) => ({
      dishId: item.dishId,
      name: item.dish.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.unitPriceCents * item.quantity,
    })),
  };
}
