// Centralized runtime config helpers
// Public (browser) variables must be prefixed with NEXT_PUBLIC_

export const MEDIA_BASE =
  process.env.NEXT_PUBLIC_MEDIA_BASE?.replace(/\/$/, "") ||
  "http://localhost:8000";

export const IMAGE_PROXY_PATH = "/api/image-proxy";

export function buildImageProxyUrl(target: string) {
  return `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(target)}`;
}
