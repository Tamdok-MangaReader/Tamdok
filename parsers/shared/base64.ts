const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(offset, offset + CHUNK) as unknown as number[]));
  }
  return btoa(parts.join(''));
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
