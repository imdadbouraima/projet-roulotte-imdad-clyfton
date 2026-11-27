import request from "supertest";
import { describe, expect, it } from "vitest";

describe("API HTTP Palier 1", () => {
  it("GET /health vérifie la base et identifie la requête", async () => {
    process.env.DATABASE_URL ??= "file:./dev.db";
    process.env.JWT_SECRET ??= "cle-secrete-pour-les-tests";
    const { createApp } = await import("./app.js");
    const app = createApp();

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", database: "up" });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("une route inconnue conserve le format d'erreur et reçoit son propre identifiant", async () => {
    const { createApp } = await import("./app.js");
    const app = createApp();
    const response = await request(app).get("/route-inconnue");

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Route introuvable",
    });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("POST /orders sans token retourne 401", async () => {
    const { createApp } = await import("./app.js");
    const app = createApp();
    const response = await request(app)
      .post("/orders")
      .send({ items: [{ dishId: 1, quantity: 1 }] });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET /dishes/abc retourne 400 avec le format d'erreur", async () => {
    const { createApp } = await import("./app.js");
    const app = createApp();
    const response = await request(app).get("/dishes/abc");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("un corps JSON mal forme retourne 400 INVALID_JSON", async () => {
    const { createApp } = await import("./app.js");
    const app = createApp();
    const response = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });
});
