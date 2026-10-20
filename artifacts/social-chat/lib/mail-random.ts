import { getRandomBytes } from "expo-crypto";

// Hermes versions without WebCrypto getRandomValues use Expo's native secure RNG for HPKE.
const runtime = globalThis as typeof globalThis & { crypto?: Crypto };
if (typeof runtime.crypto?.getRandomValues !== "function") {
  const cryptoObject = {
    ...(runtime.crypto ?? {}),
    getRandomValues<T extends ArrayBufferView>(array: T): T {
      const bytes = getRandomBytes(array.byteLength);
      new Uint8Array(array.buffer as ArrayBuffer, array.byteOffset, array.byteLength).set(bytes);
      return array;
    },
  };
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: cryptoObject });
}
