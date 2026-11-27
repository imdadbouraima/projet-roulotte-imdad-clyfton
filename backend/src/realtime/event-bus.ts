import { logger } from "../logging.js";
import type { OrderRecord } from "../orders/order.repository.js";

export type OrderEvent = {
  type: "order.created" | "order.updated";
  order: OrderRecord;
};

export interface OrderEventPublisher {
  publish(event: OrderEvent): void;
}

export interface OrderEventBus extends OrderEventPublisher {
  subscribe(listener: (event: OrderEvent) => void): () => void;
}

export function createOrderEventBus(): OrderEventBus {
  const listeners = new Set<(event: OrderEvent) => void>();

  return {
    publish(event) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          logger.error(
            { errorName: error instanceof Error ? error.name : "UnknownError" },
            "Order event subscriber failed",
          );
        }
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
