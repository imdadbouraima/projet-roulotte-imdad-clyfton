import { prisma } from "../db.js";
import { OrderDishUnavailableError, OrderOutOfStockError } from "./order.errors.js";

// Types réduits aux informations dont le service de commande a besoin.
export type OrderDish = {
  id: number;
  name: string;
  priceCents: number;
  available: boolean;
  stock: number | null;
};

export type OrderStatus = "RECEIVED" | "PREPARING" | "READY" | "PICKED_UP" | "CANCELLED";

export interface OrderRepository {
  findDishesByIds(dishIds: number[]): Promise<OrderDish[]>;
  create(data: {
    userId: number;
    note?: string;
    totalCents: number;
    items: Array<{ dishId: number; quantity: number; unitPriceCents: number }>;
  }): Promise<OrderRecord>;
  findMany(filters: {
    userId?: number;
    statuses?: string[];
    sort: "asc" | "desc";
    skip: number;
    take: number;
  }): Promise<{ items: OrderRecord[]; total: number }>;
  findById(orderId: number, userId?: number): Promise<OrderRecord | null>;
  changeStatus(
    orderId: number,
    expectedStatus: OrderStatus,
    nextStatus: OrderStatus,
    userId?: number,
  ): Promise<OrderRecord | null>;
}

export type OrderRecord = {
  id: number;
  status: OrderStatus;
  note: string | null;
  totalCents: number;

  createdAt: Date;
  updatedAt: Date;
  user: { id: number; name: string };
  items: Array<{
    dishId: number;
    quantity: number;
    unitPriceCents: number;
    dish: { name: string };
  }>;
};

const orderInclude = {
  user: { select: { id: true, name: true } },
  items: {
    include: { dish: { select: { name: true } } },
  },
} as const;

// Toutes les lectures et écritures de commandes passent par Prisma ici.
export const orderRepository: OrderRepository = {
  async findDishesByIds(dishIds) {
    return prisma.dish.findMany({
      where: { id: { in: dishIds } },
      select: { id: true, name: true, priceCents: true, available: true, stock: true },
    });
  },

  async create(data) {
    return prisma.$transaction(async (tx) => {
      for (const item of data.items) {
        const dish = await tx.dish.findUnique({
          where: { id: item.dishId },
          select: { available: true, stock: true },
        });

        if (!dish || !dish.available) {
          throw new OrderDishUnavailableError([{
            dishId: item.dishId,
            reason: dish ? "UNAVAILABLE" : "NOT_FOUND",
          }]);
        }
        if (dish.stock === null) continue;

        const updated = await tx.dish.updateMany({
          where: { id: item.dishId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (updated.count !== 1) {
          const current = await tx.dish.findUnique({
            where: { id: item.dishId },
            select: { available: true, stock: true },
          });
          if (!current || !current.available) {
            throw new OrderDishUnavailableError([{
              dishId: item.dishId,
              reason: current ? "UNAVAILABLE" : "NOT_FOUND",
            }]);
          }
          if (current.stock === null) continue;
          throw new OrderOutOfStockError([{ dishId: item.dishId, available: current.stock }]);
        }
      }

      return tx.order.create({
        data: {
          userId: data.userId,
          note: data.note,
          totalCents: data.totalCents,
          status: "RECEIVED",
          items: { create: data.items },
        },
        include: orderInclude,
      });
    }) as Promise<OrderRecord>;
  },

  async findMany(filters) {
    const where = {
      ...(filters.userId !== undefined ? { userId: filters.userId } : {}),
      ...(filters.statuses?.length
        ? { status: { in: filters.statuses as never } }
        : {}),
    };

    // Charge la page et son total pour que le front puisse construire la pagination.
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: filters.sort },
        skip: filters.skip,
        take: filters.take,
      }),
      prisma.order.count({ where }),
    ]);

    return { items: items as unknown as OrderRecord[], total };
  },

  async findById(orderId, userId) {
    return prisma.order.findFirst({
      where: {
        id: orderId,
        ...(userId !== undefined ? { userId } : {}),
      },
      include: orderInclude,
    }) as Promise<OrderRecord | null>;
  },

  async changeStatus(orderId, expectedStatus, nextStatus, userId) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: {
          id: orderId,
          status: expectedStatus,
          ...(userId !== undefined ? { userId } : {}),
        },
        data: { status: nextStatus },
      });

      if (updated.count !== 1) return null;

      if (nextStatus === "CANCELLED") {
        const items = await tx.orderItem.findMany({
          where: { orderId },
          select: { dishId: true, quantity: true },
        });
        for (const item of items) {
          await tx.dish.updateMany({
            where: { id: item.dishId, stock: { not: null } },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      return tx.order.findUnique({
        where: { id: orderId },
        include: orderInclude,
      });
    }) as Promise<OrderRecord | null>;
  },
};
