/**
 * Type shims for @noble/* subpath imports.
 *
 * @noble v2 ships per-module `.d.ts` files but its package.json `exports` map
 * does not declare a `types` condition for each subpath. Under TypeScript's
 * `moduleResolution: "bundler"` that means the editor/tsc cannot locate the
 * declarations even though Metro resolves the JS at runtime. These shims
 * re-point each subpath at its co-located declaration file.
 */
declare module '@noble/ciphers/aes' {
  export * from '@noble/ciphers/aes.js';
}
declare module '@noble/ciphers/utils' {
  export * from '@noble/ciphers/utils.js';
}
declare module '@noble/hashes/pbkdf2' {
  export * from '@noble/hashes/pbkdf2.js';
}
declare module '@noble/hashes/sha2' {
  export * from '@noble/hashes/sha2.js';
}
declare module '@noble/hashes/hmac' {
  export * from '@noble/hashes/hmac.js';
}
declare module '@noble/hashes/legacy' {
  export * from '@noble/hashes/legacy.js';
}
