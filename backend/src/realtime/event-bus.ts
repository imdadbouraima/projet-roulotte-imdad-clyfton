import type { Response } from "express";
import type { AuthUser } from "../fourni/auth/crypto.js";

type OrderEventData = {
  customer: { id: number; name: string };
};

type Subscriber = {
  response: Response;
  user: AuthUser;
};

const subscribers = new Set<Subscriber>();

export function subscribeToOrderEvents(user: AuthUser, response: Response) {
  const subscriber = { user, response };
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

function sendToSubscribers(
  eventName: "order.created" | "order.updated",
  order: OrderEventData,
  shouldReceive: (user: AuthUser) => boolean,
) {
  // Le filtrage se fait commande par commande pour ne rien révéler aux autres clients.
  const frame = `event: ${eventName}\ndata: ${JSON.stringify(order)}\n\n`;
  for (const subscriber of subscribers) {
    if (!shouldReceive(subscriber.user)) continue;
    if (subscriber.response.destroyed || subscriber.response.writableEnded) {
      subscribers.delete(subscriber);
      continue;
    }
    subscriber.response.write(frame);
  }
}

export function publishOrderCreated(order: OrderEventData) {
  sendToSubscribers("order.created", order, ({ role }) => role === "STAFF" || role === "ADMIN");
}

export function publishOrderUpdated(order: OrderEventData) {
  sendToSubscribers(
    "order.updated",
    order,
    ({ id, role }) => role === "STAFF" || role === "ADMIN" || id === order.customer.id,
  );
}
