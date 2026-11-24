export const SHRINK_EDGE = 2000;
const KEEP_BYTES = 1_200_000;
const KEEP_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function shrunkSize(width: number, height: number, edge = SHRINK_EDGE): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

async function decode(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function shrinkPhoto(file: File): Promise<File> {
  if (KEEP_TYPES.includes(file.type) && file.size <= KEEP_BYTES) return file;
  try {
    const img = await decode(file);
    const size = shrunkSize(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext('2d')!.drawImage(img, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.86));
    canvas.width = 0;
    canvas.height = 0;
    if (!blob || (blob.size >= file.size && KEEP_TYPES.includes(file.type))) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
