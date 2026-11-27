import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

export const uploadsDirectory = fileURLToPath(new URL("../../uploads/", import.meta.url));
const dishImagesDirectory = fileURLToPath(new URL("../../uploads/dishes/", import.meta.url));

export type DishImageFormat = {
  extension: "png" | "jpg" | "webp";
  contentType: "image/png" | "image/jpeg" | "image/webp";
};

// On se fie aux octets reçus, pas au nom ou au type que le navigateur annonce.
export function detectDishImageFormat(buffer: Buffer): DishImageFormat | null {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: "png", contentType: "image/png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { extension: "webp", contentType: "image/webp" };
  }
  return null;
}

export async function saveDishImage(buffer: Buffer, format: DishImageFormat) {
  await mkdir(dishImagesDirectory, { recursive: true });
  const filename = `${randomUUID()}.${format.extension}`;
  await writeFile(join(dishImagesDirectory, filename), buffer, { flag: "wx" });
  return `/uploads/dishes/${filename}`;
}

export async function removeDishImage(imageUrl: string | null) {
  const match = imageUrl?.match(/^\/uploads\/dishes\/([0-9a-f-]{36}\.(?:png|jpg|webp))$/i);
  if (!match || basename(match[1]) !== match[1]) return;
  await rm(join(dishImagesDirectory, match[1]), { force: true });
}
