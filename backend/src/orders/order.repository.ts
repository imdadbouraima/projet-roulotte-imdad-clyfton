import { prisma } from "../db.js";

export type OrderDish = {
  id: number;
  name: string;
  priceCents: number;
  available: boolean;
};

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
}

export type OrderRecord = {
  id: number;
  status: "RECEIVED" | "PREPARING" | "READY" | "PICKED_UP" | "CANCELLED";
  note: string | null;
  totalCents: number;
  paymentStatus: "UNPAID" | "PAID";
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

export const orderRepository: OrderRepository = {
  async findDishesByIds(dishIds) {
    return prisma.dish.findMany({
      where: { id: { in: dishIds } },
      select: { id: true, name: true, priceCents: true, available: true },
    });
  },

  async create(data) {
    return prisma.$transaction(async (tx) =>
      tx.order.create({
        data: {
          userId: data.userId,
          note: data.note,
          totalCents: data.totalCents,
          status: "RECEIVED",
          items: { create: data.items },
        },
        include: orderInclude,
      }),
    ) as Promise<OrderRecord>;
  },

  async findMany(filters) {
    const where = {
      ...(filters.userId !== undefined ? { userId: filters.userId } : {}),
      ...(filters.statuses?.length
        ? { status: { in: filters.statuses as never } }
        : {}),
    };

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
};
