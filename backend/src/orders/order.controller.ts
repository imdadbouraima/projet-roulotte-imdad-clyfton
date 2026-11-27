import type { RequestHandler } from "express";
import { z } from "zod";
import { AuthHttpError } from "../fourni/auth/errors.js";
import { currentUser } from "../fourni/auth/index.js";
import { toOrderDto } from "./order.dto.js";
import { orderStatuses, type OrderStatus } from "./order-status.js";
import type { OrderServiceApi } from "./order.service.js";

const createOrderSchema = z.strictObject({
  items: z.array(z.strictObject({
    dishId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(10),
  })).min(1).max(20),
  note: z.string().max(200).optional(),
});

const listOrdersSchema = z.strictObject({
  status: z.string().optional(),
  sort: z.enum(["createdAt", "-createdAt"]).default("-createdAt"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const orderStatusSchema = z.enum(orderStatuses);

function validationError(result: z.ZodSafeParseResult<unknown>): never {
  if (result.success) throw new Error("validationError called with valid data");
  throw new AuthHttpError(
    400,
    "VALIDATION_ERROR",
    "Données invalides",
    result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  );
}

export function createOrderController(orderService: OrderServiceApi) {
  const createOrder: RequestHandler = async (req, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) validationError(parsed);

    const dishIds = parsed.data.items.map((item) => item.dishId);
    if (new Set(dishIds).size !== dishIds.length) {
      throw new AuthHttpError(400, "VALIDATION_ERROR", "Deux lignes ne peuvent pas viser le même plat");
    }

    const order = await orderService.create(currentUser(req), parsed.data);
    res.status(201).location(`/orders/${order.id}`).json(toOrderDto(order));
  };

  const listOrders: RequestHandler = async (req, res) => {
    const parsed = listOrdersSchema.safeParse(req.query);
    if (!parsed.success) validationError(parsed);

    let statuses: OrderStatus[] | undefined;
    if (parsed.data.status) {
      const requestedStatuses = parsed.data.status.split(",").map((status) => status.trim());
      const allowed = new Set<string>(orderStatuses);
      const validStatuses = requestedStatuses.filter(
        (status): status is OrderStatus => allowed.has(status),
      );
      if (validStatuses.length !== requestedStatuses.length) {
        throw new AuthHttpError(400, "VALIDATION_ERROR", "Statut de commande invalide");
      }
      statuses = validStatuses;
    }

    const result = await orderService.list(currentUser(req), {
      statuses,
      sort: parsed.data.sort === "createdAt" ? "asc" : "desc",
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });

    res.json({
      items: result.items.map(toOrderDto),
      total: result.total,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
  };

  const getOrder: RequestHandler = async (req, res) => {
    const parsed = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!parsed.success) {
      throw new AuthHttpError(400, "VALIDATION_ERROR", "Identifiant invalide");
    }

    const order = await orderService.getById(currentUser(req), parsed.data);
    res.json(toOrderDto(order));
  };

  const updateOrderStatus: RequestHandler = async (req, res) => {
    const parsedId = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!parsedId.success) {
      throw new AuthHttpError(400, "VALIDATION_ERROR", "Identifiant invalide");
    }

    const parsedBody = z.strictObject({ status: orderStatusSchema }).safeParse(req.body);
    if (!parsedBody.success) validationError(parsedBody);

    const order = await orderService.changeStatus(
      currentUser(req),
      parsedId.data,
      parsedBody.data.status,
    );
    res.json(toOrderDto(order));
  };

  const payOrder: RequestHandler = async (req, res) => {
    const parsedId = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!parsedId.success) {
      throw new AuthHttpError(400, "VALIDATION_ERROR", "Identifiant invalide");
    }

    const parsedBody = z.strictObject({ token: z.string() }).safeParse(req.body);
    if (!parsedBody.success) validationError(parsedBody);

    const order = await orderService.pay(currentUser(req), parsedId.data, parsedBody.data.token);
    res.json(toOrderDto(order));
  };

  return { createOrder, listOrders, getOrder, updateOrderStatus, payOrder };
}
