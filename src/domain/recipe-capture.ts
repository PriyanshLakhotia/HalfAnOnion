import { z } from "zod";
export const MAX_RECIPE_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_RECIPE_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_RECIPE_REQUEST_BYTES = 12 * 1024 * 1024;
export function photoBytes(value: string) {
  const data = value.slice(value.indexOf(",") + 1);
  return (
    (data.length * 3) / 4 -
    (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0)
  );
}
const photo = z
  .string()
  .max(Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 50)
  .refine((value) => {
    const match =
      /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || match[2].length % 4 || photoBytes(value) > MAX_PHOTO_BYTES)
      return false;
    const bytes = atob(match[2].slice(0, 32));
    return match[1] === "jpeg"
      ? bytes.startsWith("\xff\xd8\xff")
      : match[1] === "png"
        ? bytes.startsWith("\x89PNG\r\n\x1a\n")
        : bytes.startsWith("RIFF") && bytes.slice(8, 12) === "WEBP";
  }, "Use a JPEG, PNG or WebP photo under 2 MB.");
export const recipeCaptureSchema = z
  .object({
    id: z.string().uuid(),
    text: z.string().trim().max(12000).default(""),
    images: z.array(photo).max(MAX_RECIPE_PHOTOS).default([]),
  })
  .strict()
  .refine(
    (v) => v.text.length > 0 || v.images.length > 0,
    "Add a photo or describe the recipe.",
  )
  .refine(
    (v) =>
      v.images.reduce((size, image) => size + photoBytes(image), 0) <=
      MAX_RECIPE_PHOTO_BYTES,
    "Photos must total less than 8 MB.",
  );
