import { AuthHttpError } from "../fourni/auth/errors.js";
import { OrderDishUnavailableError, OrderOutOfStockError } from "./order.errors.js";
import type { OrderRecord, OrderRepository } from "./order.repository.js";
import { allowedOrderTransitions, type OrderStatus } from "./order-status.js";
import {
  PaymentDeclinedError,
  PaymentProviderError,
  PaymentProviderTimeoutError,
} from "./payment.errors.js";
import type { PaymentGateway } from "./payment.gateway.js";
import type { OrderEventPublisher } from "../realtime/event-bus.js";

export type AuthenticatedUser = {
  id: number;
  role: "CUSTOMER" | "STAFF" | "ADMIN";
};

export type CreateOrderInput = {
  items: Array<{ dishId: number; quantity: number }>;
  note?: string;
};

export interface OrderServiceApi {
  create(user: AuthenticatedUser, input: CreateOrderInput): Promise<OrderRecord>;
  list(
    user: AuthenticatedUser,
    filters: { statuses?: OrderStatus[]; sort: "asc" | "desc"; page: number; pageSize: number },
  ): Promise<{ items: OrderRecord[]; total: number }>;
  getById(user: AuthenticatedUser, orderId: number): Promise<OrderRecord>;
  changeStatus(user: AuthenticatedUser, orderId: number, nextStatus: OrderStatus): Promise<OrderRecord>;
  pay(user: AuthenticatedUser, orderId: number, token: string): Promise<OrderRecord>;
}

export class OrderService implements OrderServiceApi {
  constructor(
    private readonly repository: OrderRepository,
    private readonly paymentGateway: PaymentGateway | undefined,
    private readonly events: OrderEventPublisher,
  ) {}

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
      const order = await this.repository.create({
        userId: user.id,
        note: input.note,
        totalCents,
        items: lines,
      });
      this.events.publish({ type: "order.created", order });
      return order;
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
    filters: { statuses?: OrderStatus[]; sort: "asc" | "desc"; page: number; pageSize: number },
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

    if (!allowedOrderTransitions[order.status].includes(nextStatus)) {
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

    this.events.publish({ type: "order.updated", order: updated });
    return updated;
  }

  async pay(user: AuthenticatedUser, orderId: number, token: string) {
    if (user.role !== "CUSTOMER") {
      throw new AuthHttpError(403, "FORBIDDEN", "Seul le client peut payer sa commande");
    }

    const order = await this.getById(user, orderId);
    if (order.paymentStatus === "PAID" || order.status === "CANCELLED") {
      throw new AuthHttpError(409, "CONFLICT", "Cette commande ne peut pas être payée");
    }
    if (!this.paymentGateway) {
      throw new AuthHttpError(502, "PAYMENT_PROVIDER_ERROR", "Le prestataire de paiement n'est pas configuré");
    }

    const paymentStarted = await this.repository.beginPayment(orderId, user.id);
    if (!paymentStarted) {
      throw new AuthHttpError(409, "CONFLICT", "Un paiement est déjà en cours ou la commande a changé");
    }

    let completed = false;
    try {
      await this.paymentGateway.charge({
        amountCents: order.totalCents,
        reference: `order-${order.id}`,
        token,
      });

      const paidOrder = await this.repository.completePayment(orderId, user.id);
      if (!paidOrder) {
        throw new AuthHttpError(409, "CONFLICT", "La commande a changé pendant le paiement");
      }

      completed = true;
      this.events.publish({ type: "order.updated", order: paidOrder });
      return paidOrder;
    } catch (error) {
      if (error instanceof PaymentDeclinedError) {
        throw new AuthHttpError(402, "PAYMENT_DECLINED", "Le paiement a été refusé");
      }
      if (error instanceof PaymentProviderTimeoutError) {
        throw new AuthHttpError(504, "PAYMENT_PROVIDER_TIMEOUT", "Le prestataire de paiement ne répond pas");
      }
      if (error instanceof PaymentProviderError) {
        throw new AuthHttpError(502, "PAYMENT_PROVIDER_ERROR", "Le prestataire de paiement est indisponible");
      }
      throw error;
    } finally {
      if (!completed) await this.repository.releasePayment(orderId, user.id);
    }
  }
}
