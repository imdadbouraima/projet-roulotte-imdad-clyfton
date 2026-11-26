import { describe, expect, it, vi } from "vitest";
import { AuthHttpError } from "../fourni/auth/errors.js";
import { OrderService, toOrderDto } from "./order.service.js";
import type { OrderRecord, OrderRepository } from "./order.repository.js";

function record(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 12,
    status: "RECEIVED",
    note: null,
    totalCents: 2300,
    paymentStatus: "UNPAID",
    createdAt: new Date("2026-12-01T11:42:00.000Z"),
    updatedAt: new Date("2026-12-01T11:42:00.000Z"),
    user: { id: 3, name: "Chris Client" },
    items: [
      {
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
      { id: 1, name: "Le Classique", priceCents: 1150, available: true },
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
    ...overrides,
  };
}

describe("OrderService", () => {
  it("prend les prix dans la base et calcule le total", async () => {
    const repository = repositoryStub();
    const service = new OrderService(repository);

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
        { id: 1, name: "Le Classique", priceCents: 1150, available: false },
      ]),
    });
    const service = new OrderService(repository);

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
    const service = new OrderService(repository);

    await expect(service.getById(
      { id: 3, role: "CUSTOMER" },
      12,
    )).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    } satisfies Partial<AuthHttpError>);
  });

  it("donne au staff toutes les commandes", async () => {
    const repository = repositoryStub();
    const service = new OrderService(repository);

    await service.list(
      { id: 2, role: "STAFF" },
      { sort: "desc", page: 1, pageSize: 20 },
    );

    expect(repository.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ userId: expect.anything() }),
    );
  });

  it("produit exactement les champs visibles de la commande au Palier 1", () => {
    expect(toOrderDto(record())).toEqual({
      id: 12,
      status: "RECEIVED",
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
