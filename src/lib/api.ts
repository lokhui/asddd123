// Keep auth tokens strictly in JS memory (never localStorage or sessionStorage)
let inMemoryToken: string | null = null;
let inMemoryAdminToken: string | null = null;

export function setAuthToken(token: string | null) {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export function setAdminToken(token: string | null) {
  inMemoryAdminToken = token;
}

export function getAdminToken(): string | null {
  return inMemoryAdminToken;
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit & { useAdminToken?: boolean; overrideToken?: string } = {}
): Promise<T> {
  const { useAdminToken, overrideToken, headers, ...rest } = options;
  const token = overrideToken ?? (useAdminToken ? inMemoryAdminToken : inMemoryToken);

  const mergedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string> | undefined),
  };

  if (token) {
    mergedHeaders.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...rest,
    headers: mergedHeaders,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `請求失敗 (${res.status})`);
  }
  return data as T;
}

/**
 * Re-encodes uploaded image via offscreen HTML5 Canvas to strip all EXIF
 * GPS coordinates, camera metadata, and device identifiers before upload.
 */
export async function stripImageExif(file: File, maxDimension = 1280): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('僅支援 JPEG、PNG 或 WebP 格式圖片');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('單張圖片大小不可超過 5MB');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('圖片讀取失敗'));
      image.src = objectUrl;
    });

    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('無法初始化影像處理畫布');
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Canvas export produces clean pixel data with zero EXIF metadata
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
