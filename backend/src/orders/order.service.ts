import { AuthHttpError } from "../fourni/auth/errors.js";
import type { OrderRepository, OrderRecord } from "./order.repository.js";

export type AuthenticatedUser = {
  id: number;
  role: "CUSTOMER" | "STAFF" | "ADMIN";
};

export type CreateOrderInput = {
  items: Array<{ dishId: number; quantity: number }>;
  note?: string;
};

export class OrderService {
  constructor(private readonly repository: OrderRepository) {}

  async create(user: AuthenticatedUser, input: CreateOrderInput) {
    // Le prix vient de la base, pas du navigateur : le total reçu du front n'est pas fiable.
    const dishes = await this.repository.findDishesByIds(
      input.items.map((item) => item.dishId),
    );
    const dishById = new Map(dishes.map((dish) => [dish.id, dish]));
    const refused: Array<{ dishId: number; reason: "NOT_FOUND" | "UNAVAILABLE" }> = [];

    for (const item of input.items) {
      const dish = dishById.get(item.dishId);
      if (!dish) refused.push({ dishId: item.dishId, reason: "NOT_FOUND" });
      else if (!dish.available) refused.push({ dishId: item.dishId, reason: "UNAVAILABLE" });
    }

    if (refused.length) {
      throw new AuthHttpError(422, "DISH_UNAVAILABLE", "Un ou plusieurs plats sont indisponibles", refused);
    }

    // Enregistre le prix au moment de la commande pour garder son historique.
    let totalCents = 0;
    const lines = input.items.map((item) => {
      const dish = dishById.get(item.dishId)!;
      totalCents += dish.priceCents * item.quantity;
      return {
        dishId: item.dishId,
        quantity: item.quantity,
        unitPriceCents: dish.priceCents,
      };
    });

    return this.repository.create({
      userId: user.id,
      note: input.note,
      totalCents,
      items: lines,
    });
  }

  async list(
    user: AuthenticatedUser,
    filters: { statuses?: string[]; sort: "asc" | "desc"; page: number; pageSize: number },
  ) {
    // Les employés voient toutes les commandes ; un client ne voit que les siennes.
    const isCustomer = user.role === "CUSTOMER";
    return this.repository.findMany({
      ...(isCustomer ? { userId: user.id } : {}),
      statuses: filters.statuses,
      sort: filters.sort,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    });
  }

  async getById(user: AuthenticatedUser, orderId: number) {
    // Chercher par identifiant et propriétaire empêche un client d'ouvrir la commande d'un autre.
    if (user.role === "CUSTOMER") {
      const order = await this.repository.findById(orderId, user.id);
      if (!order) throw new AuthHttpError(404, "NOT_FOUND", "Commande introuvable");
      return order;
    }

    const order = await this.repository.findById(orderId);
    if (!order) throw new AuthHttpError(404, "NOT_FOUND", "Commande introuvable");
    return order;
  }
}

// Prépare la commande dans un format stable, sans exposer les objets Prisma.
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
