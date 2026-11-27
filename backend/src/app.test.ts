import request from "supertest";
import { describe, expect, it } from "vitest";
import type { MenuServiceApi } from "./menu/menu.service.js";

async function createTestApp(overrides: {
  healthCheck?: () => Promise<void>;
  menuService?: MenuServiceApi;
} = {}) {
  process.env.DATABASE_URL = "file:./test.db";
  process.env.JWT_SECRET = "cle-secrete-pour-les-tests";
  process.env.PAYMENT_URL = "http://localhost:4010";
  process.env.PAYMENT_API_KEY = "test-key";

  const [{ createApp }, { createContainer }] = await Promise.all([
    import("./app.js"),
    import("./container.js"),
  ]);
  return createApp(createContainer({
    healthRepository: {
      checkDatabase: overrides.healthCheck ?? (async () => {}),
    },
    ...(overrides.menuService ? { menuService: overrides.menuService } : {}),
  }));
}

function menuServiceStub(): MenuServiceApi {
  const unused = async (): Promise<never> => {
    throw new Error("Cette méthode ne doit pas être appelée dans ce test");
  };
  return {
    getCategories: async () => [],
    getAllergens: async () => [],
    getDishes: async () => ({ dishes: [], total: 0 }),
    getDishById: async () => null,
    createDish: unused,
    updateDish: unused,
    uploadDishImage: unused,
    deleteDish: unused,
  };
}

describe("API HTTP", () => {
  it("GET /health vérifie la base et identifie la requête", async () => {
    const app = await createTestApp();
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", database: "up" });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("signale une base indisponible avec le statut prévu au contrat", async () => {
    const app = await createTestApp({
      healthCheck: async () => {
        throw new Error("database unavailable");
      },
    });
    const response = await request(app).get("/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "degraded", database: "down" });
  });

  it("une route inconnue conserve le format d'erreur et reçoit son propre identifiant", async () => {
    const app = await createTestApp();
    const response = await request(app).get("/route-inconnue");

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Route introuvable",
    });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("POST /orders sans token retourne 401", async () => {
    const app = await createTestApp();
    const response = await request(app)
      .post("/orders")
      .send({ items: [{ dishId: 1, quantity: 1 }] });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET /dishes/abc retourne 400 avec le format d'erreur", async () => {
    const app = await createTestApp();
    const response = await request(app).get("/dishes/abc");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /dishes répond 304 quand le client possède déjà la représentation", async () => {
    const app = await createTestApp({ menuService: menuServiceStub() });
    const first = await request(app).get("/dishes");
    const second = await request(app).get("/dishes").set("If-None-Match", first.headers.etag);

    expect(first.headers.etag).toBeTruthy();
    expect(second.status).toBe(304);
  });

  it("un corps JSON mal formé retourne 400 INVALID_JSON", async () => {
    const app = await createTestApp();
    const response = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });
});
