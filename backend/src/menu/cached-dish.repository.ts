import type { DishFilters, DishRepository } from "./dish.repository.js";

const MAX_CACHE_ENTRIES = 100;

export function createCachedDishRepository(repository: DishRepository) {
  const cache = new Map<string, Awaited<ReturnType<DishRepository["findAll"]>>>();

  function invalidate() {
    cache.clear();
  }

  return {
    async findAll(filters: DishFilters) {
      const key = JSON.stringify(filters);
      const cached = cache.get(key);
      if (cached) return cached;

      const result = await repository.findAll(filters);
      if (cache.size >= MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
      }
      cache.set(key, result);
      return result;
    },

    findById: repository.findById.bind(repository),

    async create(data) {
      const dish = await repository.create(data);
      invalidate();
      return dish;
    },

    async update(id, data) {
      const dish = await repository.update(id, data);
      invalidate();
      return dish;
    },

    async updateImage(id, imageUrl) {
      const dish = await repository.updateImage(id, imageUrl);
      invalidate();
      return dish;
    },

    async delete(id) {
      await repository.delete(id);
      invalidate();
    },

    invalidate,
  } satisfies DishRepository & { invalidate(): void };
}
