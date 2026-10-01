// Port of lib/ppm.c. Only binary P5/P6 with maxval=255 belong to the MVP.
export interface PpmImage {
  width: number;
  height: number;
  channels: 1 | 3;
  pixels: Uint8Array;
}
export interface RgbaImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export function parsePpm(bytes: Uint8Array): PpmImage {
  let offset = 0;
  const whitespace = (c: number) => c === 9 || c === 10 || c === 13 || c === 32;
  function token() {
    while (offset < bytes.length) {
      if (whitespace(bytes[offset])) {
        offset++;
        continue;
      }
      if (bytes[offset] !== 35) break;
      while (offset < bytes.length && bytes[offset] !== 10) offset++;
    }
    const start = offset;
    while (
      offset < bytes.length &&
      !whitespace(bytes[offset]) &&
      bytes[offset] !== 35
    )
      offset++;
    if (start === offset) throw new Error("Incomplete PPM header");
    return new TextDecoder().decode(bytes.subarray(start, offset));
  }
  const magic = token();
  if (magic !== "P5" && magic !== "P6")
    throw new Error(`Unsupported PPM magic: ${magic}`);
  const width = Number(token()),
    height = Number(token()),
    maxval = Number(token());
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("Invalid PPM dimensions");
  }
  if (maxval !== 255)
    throw new Error(`Unsupported PPM maxval: ${maxval}; expected 255`);
  if (!whitespace(bytes[offset]))
    throw new Error("PPM raster must follow a whitespace separator");
  // Consume the header delimiter only: the first raster byte can itself be whitespace or '#'.
  if (bytes[offset] === 13 && bytes[offset + 1] === 10) offset += 2;
  else offset++;
  const channels = magic === "P6" ? 3 : 1;
  const length = width * height * channels;
  if (length > bytes.length - offset) throw new Error("Truncated PPM raster");
  return {
    width,
    height,
    channels,
    pixels: bytes.slice(offset, offset + length),
  };
}

export function combinePpm(
  rgb: PpmImage | null,
  alpha: PpmImage | null,
): RgbaImage {
  const size = rgb ?? alpha;
  if (!size) throw new Error("Texture needs a PPM or PGM image");
  if (rgb && rgb.channels !== 3) throw new Error("RGB file must be P6");
  if (alpha && alpha.channels !== 1) throw new Error("Alpha file must be P5");
  if (
    rgb &&
    alpha &&
    (rgb.width !== alpha.width || rgb.height !== alpha.height)
  ) {
    throw new Error("PPM and PGM dimensions do not match");
  }
  const pixels = new Uint8Array(size.width * size.height * 4);
  for (let i = 0; i < size.width * size.height; i++) {
    const a = alpha ? alpha.pixels[i] : 255;
    pixels.set(
      rgb
        ? [rgb.pixels[i * 3], rgb.pixels[i * 3 + 1], rgb.pixels[i * 3 + 2], a]
        : [a, a, a, a],
      i * 4,
    );
  }
  return { width: size.width, height: size.height, pixels };
}

export async function loadPpmPair(baseUrl: string) {
  async function read(suffix: string) {
    const response = await fetch(baseUrl + suffix);
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error(
        `Texture fetch failed (${response.status}): ${response.url}`,
      );
    return parsePpm(new Uint8Array(await response.arrayBuffer()));
  }
  const [rgb, alpha] = await Promise.all([read(".ppm"), read(".pgm")]);
  return combinePpm(rgb, alpha);
}
