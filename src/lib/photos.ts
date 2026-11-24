export const PHOTO_WIDTHS = { thumb: 160, medium: 640, large: 1200 } as const;
export type PhotoSize = keyof typeof PHOTO_WIDTHS;

export function photoSrc(key: string, size: PhotoSize, resizing: boolean): string {
  const path = `/photos/${key.split('/').map(encodeURIComponent).join('/')}`;
  return resizing ? `/cdn-cgi/image/width=${PHOTO_WIDTHS[size]},fit=scale-down,format=auto${path}` : path;
}
