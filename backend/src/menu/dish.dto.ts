export type DishDtoSource = {
  id: number;
  name: string;
  description: string;
  priceCents: number;
  available: boolean;
  stock: number | null;
  category: { id: number; name: string };
  allergens: Array<{ code: string; label: string }>;
};

export function toDishDto(dish: DishDtoSource) {
  return {
    id: dish.id,
    name: dish.name,
    description: dish.description,
    priceCents: dish.priceCents,
    available: dish.available,
    stock: dish.stock,
    category: {
      id: dish.category.id,
      name: dish.category.name,
    },
    allergens: dish.allergens.map(({ code, label }) => ({ code, label })),
  };
}
