const PREFIX_BYTES = 65_536;
const PREFIX_TIMEOUT_MS = 2_500;

function readU16Be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readU16Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readU24Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

function readU32Le(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

function readU32Be(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function usable(width: number, height: number): { width: number; height: number } | null {
  if (width < 16 || height < 16 || width > 80_000 || height > 200_000) return null;
  return { width, height };
}

function parsePng(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  if (ascii(bytes, 1, 3) !== 'PNG') return null;
  return usable(readU32Be(bytes, 16), readU32Be(bytes, 20));
}

function parseGif(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 10) return null;
  const header = ascii(bytes, 0, 6);
  if (header !== 'GIF87a' && header !== 'GIF89a') return null;
  return usable(readU16Le(bytes, 6), readU16Le(bytes, 8));
}

function parseWebp(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  const kind = ascii(bytes, 12, 4);
  if (kind === 'VP8X') {
    return usable(readU24Le(bytes, 24) + 1, readU24Le(bytes, 27) + 1);
  }
  if (kind === 'VP8 ' && bytes.length > 29 && bytes[20] === 0x9d && bytes[21] === 0x01 && bytes[22] === 0x2a) {
    return usable(readU16Le(bytes, 23) & 0x3fff, readU16Le(bytes, 25) & 0x3fff);
  }
  if (kind === 'VP8L' && bytes.length > 21 && bytes[16] === 0x2f) {
    const bits = readU32Le(bytes, 17);
    return usable((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
  }
  return null;
}

function parseJpeg(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xd8 || marker === 0x00) {
      offset += 1;
      continue;
    }
    if (marker === 0xd9) break;
    const size = readU16Be(bytes, offset + 2);
    if (size < 2) break;
    const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb);
    if (isSof && offset + 8 < bytes.length) {
      return usable(readU16Be(bytes, offset + 7), readU16Be(bytes, offset + 5));
    }
    offset += 2 + size;
  }
  return null;
}

export function parseImageSizeFromPrefix(bytes: Uint8Array): { width: number; height: number } | null {
  return parsePng(bytes) ?? parseGif(bytes) ?? parseWebp(bytes) ?? parseJpeg(bytes);
}

function readPrefix(url: string, headers: Record<string, string>): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (bytes: Uint8Array | null) => {
      if (settled) return;
      settled = true;
      try {
        xhr.abort();
      } catch {
        // already closed
      }
      resolve(bytes);
    };

    xhr.open('GET', url);
    xhr.responseType = 'arraybuffer';
    xhr.timeout = PREFIX_TIMEOUT_MS;
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'range') continue;
      try {
        xhr.setRequestHeader(key, value);
      } catch {
        // some headers are forbidden on XHR
      }
    }
    xhr.setRequestHeader('Range', `bytes=0-${PREFIX_BYTES - 1}`);

    xhr.onprogress = () => {
      const buffer = xhr.response as ArrayBuffer | null;
      if (buffer && buffer.byteLength >= 4096) {
        const parsed = parseImageSizeFromPrefix(new Uint8Array(buffer));
        if (parsed) finish(new Uint8Array(buffer.slice(0, PREFIX_BYTES)));
      }
    };
    xhr.onload = () => {
      const buffer = xhr.response as ArrayBuffer | null;
      finish(buffer ? new Uint8Array(buffer) : null);
    };
    xhr.onerror = () => finish(null);
    xhr.ontimeout = () => finish(null);
    xhr.onabort = () => {
      if (!settled) finish(null);
    };
    xhr.send();
  });
}

/** Read width/height from the first bytes so huge webtoon strips don't have to fully download. */
export async function readImageSizeFromPrefix(
  url: string,
  headers?: Record<string, string>,
): Promise<{ width: number; height: number } | null> {
  if (!url.startsWith('http')) return null;
  const bytes = await readPrefix(url, headers ?? {});
  if (!bytes) return null;
  return parseImageSizeFromPrefix(bytes);
}
