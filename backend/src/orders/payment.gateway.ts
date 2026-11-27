import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  PaymentDeclinedError,
  PaymentProviderError,
  PaymentProviderTimeoutError,
} from "./payment.errors.js";

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 2_000;
const RETRY_DELAY_MS = 100;

const paymentResponseSchema = z.object({
  id: z.string().min(1),
  status: z.literal("succeeded"),
  amountCents: z.number().int().positive(),
  currency: z.literal("EUR"),
  reference: z.string().min(1),
  createdAt: z.iso.datetime(),
});

export type PaymentRequest = {
  amountCents: number;
  reference: string;
  token: string;
};

export type PaymentProviderSettings = {
  url: string;
  apiKey: string;
};

export interface PaymentGateway {
  charge(payment: PaymentRequest): Promise<void>;
}

type Delay = (milliseconds: number) => Promise<void>;

const delay: Delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function createPaymentGateway(
  settings: PaymentProviderSettings,
  fetchPayment: typeof fetch = fetch,
  wait: Delay = delay,
): PaymentGateway {
  return {
    async charge({ amountCents, reference, token }) {
      const idempotencyKey = randomUUID();
      let lastFailure: "network" | "timeout" | "provider" = "provider";

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        let response: Response;

        try {
          response = await fetchPayment(`${settings.url.replace(/\/$/, "")}/v1/charges`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${settings.apiKey}`,
              "Content-Type": "application/json",
              "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify({
              amountCents,
              currency: "EUR",
              reference,
              token,
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
        } catch (error) {
          lastFailure = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network";
          if (attempt < MAX_ATTEMPTS) {
            await wait(RETRY_DELAY_MS * 2 ** (attempt - 1));
            continue;
          }
          break;
        }

        if (response.status === 201) {
          let body: unknown;
          try {
            body = await response.json();
          } catch {
            throw new PaymentProviderError("Réponse invalide du prestataire de paiement");
          }

          const parsed = paymentResponseSchema.safeParse(body);
          if (
            !parsed.success ||
            parsed.data.amountCents !== amountCents ||
            parsed.data.reference !== reference
          ) {
            throw new PaymentProviderError("Réponse invalide du prestataire de paiement");
          }
          return;
        }
        if (response.status === 402) throw new PaymentDeclinedError();
        if (response.status < 500 || response.status > 599) {
          throw new PaymentProviderError(`Réponse inattendue du prestataire : ${response.status}`);
        }

        lastFailure = "provider";
        if (attempt < MAX_ATTEMPTS) await wait(RETRY_DELAY_MS * 2 ** (attempt - 1));
      }

      if (lastFailure === "timeout") throw new PaymentProviderTimeoutError();
      throw new PaymentProviderError("Le prestataire de paiement est indisponible");
    },
  };
}
