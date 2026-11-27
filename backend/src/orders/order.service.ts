import { AuthHttpError } from "../fourni/auth/errors.js";
import { OrderDishUnavailableError, OrderOutOfStockError } from "./order.errors.js";
import type { OrderRepository, OrderStatus } from "./order.repository.js";

const allowedTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  RECEIVED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: [],
  CANCELLED: [],
};

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
    const outOfStock: Array<{ dishId: number; available: number }> = [];

    for (const item of input.items) {
      const dish = dishById.get(item.dishId);
      if (!dish) refused.push({ dishId: item.dishId, reason: "NOT_FOUND" });
      else if (!dish.available) refused.push({ dishId: item.dishId, reason: "UNAVAILABLE" });
      else if (dish.stock !== null && item.quantity > dish.stock) {
        outOfStock.push({ dishId: item.dishId, available: dish.stock });
      }
    }

    if (refused.length) {
      throw new AuthHttpError(422, "DISH_UNAVAILABLE", "Un ou plusieurs plats sont indisponibles", refused);
    }
    if (outOfStock.length) {
      throw new AuthHttpError(409, "OUT_OF_STOCK", "Stock insuffisant", outOfStock);
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

    try {
      return await this.repository.create({
        userId: user.id,
        note: input.note,
        totalCents,
        items: lines,
      });
    } catch (error) {
      if (error instanceof OrderOutOfStockError) {
        throw new AuthHttpError(409, "OUT_OF_STOCK", "Stock insuffisant", error.details);
      }
      if (error instanceof OrderDishUnavailableError) {
        throw new AuthHttpError(
          422,
          "DISH_UNAVAILABLE",
          "Un ou plusieurs plats sont indisponibles",
          error.details,
        );
      }
      throw error;
    }
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

  async changeStatus(user: AuthenticatedUser, orderId: number, nextStatus: OrderStatus) {
    const order = await this.getById(user, orderId);
    const isCustomer = user.role === "CUSTOMER";

    if (isCustomer && nextStatus !== "CANCELLED") {
      throw new AuthHttpError(403, "FORBIDDEN", "Un client peut seulement annuler sa commande");
    }

    if (isCustomer && order.status !== "RECEIVED") {
      throw new AuthHttpError(409, "INVALID_TRANSITION", "La commande ne peut plus être annulée");
    }

    if (!allowedTransitions[order.status].includes(nextStatus)) {
      throw new AuthHttpError(409, "INVALID_TRANSITION", "Transition de statut invalide");
    }

    const updated = await this.repository.changeStatus(
      orderId,
      order.status,
      nextStatus,
      isCustomer ? user.id : undefined,
    );

    if (!updated) {
      throw new AuthHttpError(409, "INVALID_TRANSITION", "La commande a été modifiée entre-temps");
    }

    return updated;
  }
}
