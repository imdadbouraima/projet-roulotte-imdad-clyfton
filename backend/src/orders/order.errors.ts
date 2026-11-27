export class OrderOutOfStockError extends Error {
  constructor(public readonly details: Array<{ dishId: number; available: number }>) {
    super("Stock insuffisant");
  }
}

export class OrderDishUnavailableError extends Error {
  constructor(public readonly details: Array<{ dishId: number; reason: "NOT_FOUND" | "UNAVAILABLE" }>) {
    super("Un ou plusieurs plats sont indisponibles");
  }
}
