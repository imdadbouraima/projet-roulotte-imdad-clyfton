import { createAuth, type Auth } from "./fourni/auth/index.js";
import { config } from "./config.js";
import { userRepository } from "./users/user.repository.js";
import { categoryRepository } from "./menu/category.repository.js";
import { allergenRepository } from "./menu/allergen.repository.js";
import { createCachedDishRepository } from "./menu/cached-dish.repository.js";
import { dishRepository } from "./menu/dish.repository.js";
import { MenuService, type MenuServiceApi } from "./menu/menu.service.js";
import { orderRepository } from "./orders/order.repository.js";
import { OrderService, type OrderServiceApi } from "./orders/order.service.js";
import { createPaymentGateway, type PaymentGateway } from "./orders/payment.gateway.js";
import { createOrderEventBus, type OrderEventBus } from "./realtime/event-bus.js";
import { healthRepository, type HealthRepository } from "./health/health.repository.js";

export interface AppContainer {
  auth: Auth;
  menuService: MenuServiceApi;
  orderService: OrderServiceApi;
  healthRepository: HealthRepository;
  orderEventBus: OrderEventBus;
}

export type ContainerOverrides = Partial<AppContainer> & {
  paymentGateway?: PaymentGateway;
};

export function createContainer(overrides: ContainerOverrides = {}): AppContainer {
  const orderEventBus = overrides.orderEventBus ?? createOrderEventBus();
  const cachedDishes = createCachedDishRepository(dishRepository);

  orderEventBus.subscribe(() => cachedDishes.invalidate());

  return {
    auth:
      overrides.auth ??
      createAuth({
        users: userRepository,
        jwtSecret: config.JWT_SECRET,
        jwtExpiresIn: config.JWT_EXPIRES_IN,
      }),
    menuService:
      overrides.menuService ??
      new MenuService({
        categories: categoryRepository,
        allergens: allergenRepository,
        dishes: cachedDishes,
      }),
    orderService:
      overrides.orderService ??
      new OrderService(
        orderRepository,
        overrides.paymentGateway ??
          createPaymentGateway({
            url: config.PAYMENT_URL,
            apiKey: config.PAYMENT_API_KEY,
          }),
        orderEventBus,
      ),
    healthRepository: overrides.healthRepository ?? healthRepository,
    orderEventBus,
  };
}
