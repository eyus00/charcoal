/** Small crypto helpers on WebCrypto, which both Node 22 and browsers have. */

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** A standalone ArrayBuffer copy (what WebCrypto wants, in every TypeScript lib setup). */
const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

/** AES-CBC decryption (PKCS#7 padding), returning UTF-8 text. */
export async function aesCbcDecrypt(cipher: Uint8Array, key: Uint8Array, iv: Uint8Array): Promise<string> {
  const k = await crypto.subtle.importKey('raw', buf(key), { name: 'AES-CBC' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: buf(iv) }, k, buf(cipher));
  return new TextDecoder().decode(plain);
}
