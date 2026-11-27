import { describe, expect, it, vi } from "vitest";
import { AuthHttpError } from "../fourni/auth/errors.js";
import { toOrderDto } from "./order.dto.js";
import { OrderService } from "./order.service.js";
import type { OrderRecord, OrderRepository } from "./order.repository.js";
import { PaymentDeclinedError } from "./payment.errors.js";
import { createOrderEventBus } from "../realtime/event-bus.js";
import type { PaymentGateway } from "./payment.gateway.js";

function record(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 12,
    status: "RECEIVED",
    paymentStatus: "UNPAID",
    paymentInProgress: false,
    note: null,
    totalCents: 2300,
    userId: 3,

    createdAt: new Date("2026-12-01T11:42:00.000Z"),
    updatedAt: new Date("2026-12-01T11:42:00.000Z"),
    user: { id: 3, name: "Chris Client" },
    items: [
      {
        orderId: 12,
        dishId: 1,
        quantity: 2,
        unitPriceCents: 1150,
        dish: { name: "Le Classique" },
      },
    ],
    ...overrides,
  };
}

function repositoryStub(overrides: Partial<OrderRepository> = {}): OrderRepository {
  return {
    findDishesByIds: vi.fn(async () => [
      { id: 1, name: "Le Classique", priceCents: 1150, available: true, stock: null },
    ]),
    create: vi.fn(async (data) => ({
      ...record(),
      id: 12,
      note: data.note ?? null,
      totalCents: data.totalCents,
      user: { id: data.userId, name: "Chris Client" },
    })),
    findMany: vi.fn(async () => ({ items: [record()], total: 1 })),
    findById: vi.fn(async () => record()),
    changeStatus: vi.fn(async (_id, _expectedStatus, nextStatus) => record({ status: nextStatus })),
    beginPayment: vi.fn(async () => true),
    completePayment: vi.fn(async () => record({ paymentStatus: "PAID" })),
    releasePayment: vi.fn(async () => {}),
    ...overrides,
  };
}

function createService(repository: OrderRepository, paymentGateway?: PaymentGateway) {
  return new OrderService(repository, paymentGateway, createOrderEventBus());
}

describe("OrderService", () => {
  it("publie order.created après l'enregistrement de la commande", async () => {
    const repository = repositoryStub();
    const events = createOrderEventBus();
    const listener = vi.fn();
    events.subscribe(listener);
    const service = new OrderService(repository, undefined, events);

    await service.create(
      { id: 3, role: "CUSTOMER" },
      { items: [{ dishId: 1, quantity: 1 }] },
    );

    expect(repository.create).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: "order.created",
      order: expect.objectContaining({ id: 12 }),
    }));
  });

  it("prend les prix dans la base et calcule le total", async () => {
    const repository = repositoryStub();
    const service = createService(repository);

    await service.create(
      { id: 3, role: "CUSTOMER" },
      { items: [{ dishId: 1, quantity: 2 }], note: "Sans oignons" },
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 3,
        totalCents: 2300,
        items: [{ dishId: 1, quantity: 2, unitPriceCents: 1150 }],
      }),
    );
  });

  it("refuse tous les plats indisponibles avec leur detail", async () => {
    const repository = repositoryStub({
      findDishesByIds: vi.fn(async () => [
        { id: 1, name: "Le Classique", priceCents: 1150, available: false, stock: null },
      ]),
    });
    const service = createService(repository);

    await expect(service.create(
      { id: 3, role: "CUSTOMER" },
      { items: [{ dishId: 1, quantity: 1 }] },
    )).rejects.toMatchObject({
      status: 422,
      code: "DISH_UNAVAILABLE",
      details: [{ dishId: 1, reason: "UNAVAILABLE" }],
    } satisfies Partial<AuthHttpError>);
  });

  it("ne laisse pas un client lire une commande d'un autre client", async () => {
    const repository = repositoryStub({
      findById: vi.fn(async () => null),
    });
    const service = createService(repository);

    await expect(service.getById(
      { id: 3, role: "CUSTOMER" },
      12,
    )).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    } satisfies Partial<AuthHttpError>);
  });

  it("fait avancer une commande selon le cycle autorisé pour le staff", async () => {
    const repository = repositoryStub({
      findById: vi.fn(async () => record({ status: "PREPARING" })),
    });
    const service = createService(repository);

    const updated = await service.changeStatus(
      { id: 2, role: "STAFF" },
      12,
      "READY",
    );

    expect(updated.status).toBe("READY");
    expect(repository.changeStatus).toHaveBeenCalledWith(12, "PREPARING", "READY", undefined);
  });

  it("permet à un client d'annuler uniquement sa commande reçue", async () => {
    const repository = repositoryStub();
    const service = createService(repository);

    const updated = await service.changeStatus(
      { id: 3, role: "CUSTOMER" },
      12,
      "CANCELLED",
    );

    expect(updated.status).toBe("CANCELLED");
    expect(repository.changeStatus).toHaveBeenCalledWith(12, "RECEIVED", "CANCELLED", 3);
  });

  it("refuse les transitions interdites et les actions client non autorisées", async () => {
    const repository = repositoryStub();
    const service = createService(repository);

    await expect(service.changeStatus(
      { id: 2, role: "STAFF" },
      12,
      "READY",
    )).rejects.toMatchObject({
      status: 409,
      code: "INVALID_TRANSITION",
    } satisfies Partial<AuthHttpError>);

    await expect(service.changeStatus(
      { id: 3, role: "CUSTOMER" },
      12,
      "PREPARING",
    )).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    } satisfies Partial<AuthHttpError>);
  });

  it("masque la commande d'un autre client lors d'une tentative d'annulation", async () => {
    const repository = repositoryStub({
      findById: vi.fn(async () => null),
    });
    const service = createService(repository);

    await expect(service.changeStatus(
      { id: 4, role: "CUSTOMER" },
      12,
      "CANCELLED",
    )).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    } satisfies Partial<AuthHttpError>);
  });

  it("paie le montant enregistré et ne confirme le paiement qu'après la réponse du prestataire", async () => {
    const repository = repositoryStub();
    const gateway = { charge: vi.fn(async () => {}) };
    const service = createService(repository, gateway);

    const paid = await service.pay({ id: 3, role: "CUSTOMER" }, 12, "tok_visa");

    expect(gateway.charge).toHaveBeenCalledWith({
      amountCents: 2300,
      reference: "order-12",
      token: "tok_visa",
    });
    expect(repository.completePayment).toHaveBeenCalledWith(12, 3);
    expect(repository.releasePayment).not.toHaveBeenCalled();
    expect(paid.paymentStatus).toBe("PAID");
  });

  it("libère la commande après un refus afin que le client puisse réessayer", async () => {
    const repository = repositoryStub();
    const gateway = {
      charge: vi.fn(async () => {
        throw new PaymentDeclinedError();
      }),
    };
    const service = createService(repository, gateway);

    await expect(service.pay({ id: 3, role: "CUSTOMER" }, 12, "tok_declined")).rejects.toMatchObject({
      status: 402,
      code: "PAYMENT_DECLINED",
    } satisfies Partial<AuthHttpError>);
    expect(repository.releasePayment).toHaveBeenCalledWith(12, 3);
    expect(repository.completePayment).not.toHaveBeenCalled();
  });

  it("refuse le paiement par un autre rôle avant tout appel au prestataire", async () => {
    const repository = repositoryStub();
    const gateway = { charge: vi.fn(async () => {}) };
    const service = createService(repository, gateway);

    await expect(service.pay({ id: 2, role: "STAFF" }, 12, "tok_visa")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    } satisfies Partial<AuthHttpError>);
    expect(gateway.charge).not.toHaveBeenCalled();
    expect(repository.beginPayment).not.toHaveBeenCalled();
  });

  it("refuse une deuxième tentative déjà en cours", async () => {
    const repository = repositoryStub({
      beginPayment: vi.fn(async () => false),
    });
    const gateway = { charge: vi.fn(async () => {}) };
    const service = createService(repository, gateway);

    await expect(service.pay({ id: 3, role: "CUSTOMER" }, 12, "tok_visa")).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
    } satisfies Partial<AuthHttpError>);
    expect(gateway.charge).not.toHaveBeenCalled();
  });

  it("donne au staff toutes les commandes", async () => {
    const repository = repositoryStub();
    const service = createService(repository);

    await service.list(
      { id: 2, role: "STAFF" },
      { sort: "desc", page: 1, pageSize: 20 },
    );

    expect(repository.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ userId: expect.anything() }),
    );
  });
  it("limite les commandes d'un client à son propre compte", async () => {
  const repository = repositoryStub();
  const service = createService(repository);

  await service.list(
    { id: 3, role: "CUSTOMER" },
    { sort: "desc", page: 1, pageSize: 20 },
  );

  expect(repository.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ userId: 3 }),
  );
});

  it("produit exactement les champs visibles de la commande au Palier 1", () => {
    expect(toOrderDto(record())).toEqual({
      id: 12,
      status: "RECEIVED",
      paymentStatus: "UNPAID",
      note: null,
      totalCents: 2300,
      createdAt: "2026-12-01T11:42:00.000Z",
      updatedAt: "2026-12-01T11:42:00.000Z",
      customer: { id: 3, name: "Chris Client" },
      items: [
        {
          dishId: 1,
          name: "Le Classique",
          quantity: 2,
          unitPriceCents: 1150,
          lineTotalCents: 2300,
        },
      ],
    });
  });
});
