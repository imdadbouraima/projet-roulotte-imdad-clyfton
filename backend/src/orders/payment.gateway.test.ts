import { describe, expect, it } from "vitest";
import { createPaymentGateway } from "./payment.gateway.js";
import { PaymentDeclinedError, PaymentProviderError } from "./payment.errors.js";

describe("PaymentGateway", () => {
  it("réutilise la même clé d'idempotence après une réponse 5xx", async () => {
    let attempts = 0;
    const idempotencyKeys: string[] = [];
    const bodies: Array<Record<string, unknown>> = [];
    const waits: number[] = [];
    const fetchPayment: typeof fetch = async (_input, init) => {
      attempts += 1;
      idempotencyKeys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
      bodies.push(JSON.parse(String(init?.body)));
      return attempts === 1
        ? new Response(null, { status: 503 })
        : Response.json({
            id: "ch_test",
            status: "succeeded",
            amountCents: 2300,
            currency: "EUR",
            reference: "order-12",
            createdAt: "2026-12-01T11:42:00.000Z",
          }, { status: 201 });
    };
    const gateway = createPaymentGateway({
      url: "http://payment.test/",
      apiKey: "test-key",
    }, fetchPayment, async (milliseconds) => {
      waits.push(milliseconds);
    });

    await gateway.charge({ amountCents: 2300, reference: "order-12", token: "tok_flaky" });

    expect(attempts).toBe(2);
    expect(idempotencyKeys[0]).not.toBe("");
    expect(idempotencyKeys[1]).toBe(idempotencyKeys[0]);
    expect(waits).toEqual([100]);
    expect(bodies).toEqual([
      { amountCents: 2300, currency: "EUR", reference: "order-12", token: "tok_flaky" },
      { amountCents: 2300, currency: "EUR", reference: "order-12", token: "tok_flaky" },
    ]);
  });

  it("ne retente pas un paiement refusé par le prestataire", async () => {
    let attempts = 0;
    const fetchPayment: typeof fetch = async () => {
      attempts += 1;
      return new Response(null, { status: 402 });
    };
    const gateway = createPaymentGateway({
      url: "http://payment.test",
      apiKey: "test-key",
    }, fetchPayment, async () => {});

    await expect(gateway.charge({ amountCents: 2300, reference: "order-12", token: "tok_declined" }))
      .rejects.toBeInstanceOf(PaymentDeclinedError);
    expect(attempts).toBe(1);
  });

  it("refuse une réponse 201 incohérente sans la considérer comme un paiement accepté", async () => {
    const gateway = createPaymentGateway({
      url: "http://payment.test",
      apiKey: "test-key",
    }, async () => Response.json({
      id: "ch_test",
      status: "succeeded",
      amountCents: 1,
      currency: "EUR",
      reference: "order-12",
      createdAt: "2026-12-01T11:42:00.000Z",
    }, { status: 201 }), async () => {});

    await expect(gateway.charge({ amountCents: 2300, reference: "order-12", token: "tok_visa" }))
      .rejects.toBeInstanceOf(PaymentProviderError);
  });
});
