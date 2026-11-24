export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_PHOTOS_PER_CALL = 10;

export type ImageKind = { mime: 'image/jpeg' | 'image/png' | 'image/webp'; ext: 'jpg' | 'png' | 'webp' };
export type Picture = ImageKind & { bytes: Uint8Array; width: number; height: number };
export type PhotoInput = { url?: string; data?: string; mime_type?: string };

export class PhotoProblem extends Error {}

export function sniff(b: Uint8Array): ImageKind | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (b.length > 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export function isHeic(b: Uint8Array): boolean {
  return b.length > 12 && ascii(b, 4, 8) === 'ftyp' && /^(heic|heix|hevc|mif1|msf1|avif)$/.test(ascii(b, 8, 12));
}

export function dimensions(b: Uint8Array, kind: ImageKind): { width: number; height: number } {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    if (kind.ext === 'png') return { width: v.getUint32(16), height: v.getUint32(20) };
    if (kind.ext === 'webp') return webpSize(b, v);
    return jpegSize(b, v);
  } catch {
    return { width: 0, height: 0 };
  }
}

export function readPicture(bytes: Uint8Array): Picture {
  if (bytes.length === 0) throw new PhotoProblem('That photo was empty.');
  if (bytes.length > MAX_PHOTO_BYTES) throw new PhotoProblem('That photo is over 15 MB. Please send a smaller copy.');
  const kind = sniff(bytes);
  if (!kind) {
    if (isHeic(bytes)) throw new PhotoProblem('That photo is in iPhone HEIC format. Please send it as a JPEG (most apps do this when sharing).');
    throw new PhotoProblem('That file is not a JPEG, PNG or WebP photo.');
  }
  return { ...kind, bytes, ...dimensions(bytes, kind) };
}

export function decodeBase64(data: string): Uint8Array {
  const clean = data.replace(/^data:[^;,]*;base64,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(clean)) throw new PhotoProblem('The photo data is not valid base64.');
  if ((clean.length * 3) / 4 > MAX_PHOTO_BYTES + 4) throw new PhotoProblem('That photo is over 15 MB. Please send a smaller copy.');
  try {
    return Uint8Array.fromBase64(clean.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    throw new PhotoProblem('The photo data is not valid base64.');
  }
}

export async function download(url: string, fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PhotoProblem('That photo link is not a valid web address.');
  }
  if (parsed.protocol !== 'https:') throw new PhotoProblem('Photo links must start with https://.');
  let res: Response;
  try {
    res = await fetcher(parsed.href, { redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { Accept: 'image/*' } });
  } catch {
    throw new PhotoProblem('The photo link could not be reached.');
  }
  if (!res.ok || !res.body) throw new PhotoProblem(`The photo link answered ${res.status}.`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_PHOTO_BYTES) throw new PhotoProblem('That photo is over 15 MB. Please send a smaller copy.');
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PHOTO_BYTES) {
      await reader.cancel();
      throw new PhotoProblem('That photo is over 15 MB. Please send a smaller copy.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export async function pictureFrom(input: PhotoInput, fetcher: typeof fetch = fetch): Promise<Picture> {
  if (input.data) return readPicture(decodeBase64(input.data));
  if (input.url) return readPicture(await download(input.url, fetcher));
  throw new PhotoProblem('Each photo needs a url or base64 data.');
}

function ascii(b: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...b.subarray(from, to));
}

function jpegSize(b: Uint8Array, v: DataView): { width: number; height: number } {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) {
      i += marker === 0xff ? 1 : 2;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: v.getUint16(i + 5), width: v.getUint16(i + 7) };
    }
    i += 2 + v.getUint16(i + 2);
  }
  return { width: 0, height: 0 };
}

function webpSize(b: Uint8Array, v: DataView): { width: number; height: number } {
  const chunk = ascii(b, 12, 16);
  if (chunk === 'VP8X') return { width: 1 + (v.getUint32(24, true) & 0xffffff), height: 1 + (v.getUint32(27, true) & 0xffffff) };
  if (chunk === 'VP8L') {
    const bits = v.getUint32(21, true);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (chunk === 'VP8 ') return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
  return { width: 0, height: 0 };
}
