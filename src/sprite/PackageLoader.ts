// Port of ejoy2d/simplepackage.lua: package JSON plus numbered PPM/PGM textures.
import { SpritePack } from "./SpritePack";
import { loadPpmPair } from "../core/PpmLoader";
import type { Renderer } from "../core/Renderer";

export async function loadPackage(
  renderer: Renderer,
  name: string,
  base = `${import.meta.env.BASE_URL}assets/`,
) {
  const response = await fetch(`${base}${name}.json`);
  if (!response.ok)
    throw new Error(`Package fetch failed (${response.status}): ${name}`);
  const pack = new SpritePack(await response.json());
  const images = await Promise.all(
    Array.from({ length: pack.textureCount }, (_, i) =>
      loadPpmPair(`${base}${name}.${i + 1}`),
    ),
  );
  renderer.registerPack(
    pack,
    images.map((image) => renderer.createTexture(image)),
  );
  return pack;
}
