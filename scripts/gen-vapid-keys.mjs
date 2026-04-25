#!/usr/bin/env node
// scripts/gen-vapid-keys.mjs
//
// Generate a fresh VAPID key pair for Web Push. Prints the public
// key (safe to set as VITE_VAPID_PUBLIC_KEY) and the private key
// (set as a Supabase secret only — never as a VITE_* env var).
//
// Usage:  node scripts/gen-vapid-keys.mjs
//
// No external deps — uses Node's webcrypto (P-256 ECDSA, then encodes
// the raw public key + the private scalar as base64url).

import { webcrypto } from "node:crypto";

function toBase64Url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

const subtle = webcrypto.subtle;

const keyPair = await subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);

// Public key — raw 65-byte uncompressed point (0x04 || X || Y).
const publicRaw = await subtle.exportKey("raw", keyPair.publicKey);

// Private key — JWK gives us d (the private scalar) as base64url.
const privateJwk = await subtle.exportKey("jwk", keyPair.privateKey);

const publicKey  = toBase64Url(new Uint8Array(publicRaw));
const privateKey = privateJwk.d; // already base64url-encoded

console.log("VAPID key pair generated.\n");
console.log("Public  (set as VITE_VAPID_PUBLIC_KEY in Vercel + .env.local):");
console.log("  " + publicKey + "\n");
console.log("Private (set as VAPID_PRIVATE_KEY in Supabase secrets, NOT a VITE_* env var):");
console.log("  " + privateKey + "\n");
console.log("Subject (set as VAPID_SUBJECT in Supabase secrets, mailto:… or https://…):");
console.log("  mailto:ops@courtsync.app\n");
console.log("Next:");
console.log("  supabase secrets set --linked \\");
console.log("    VAPID_PUBLIC_KEY=" + publicKey + " \\");
console.log("    VAPID_PRIVATE_KEY=" + privateKey + " \\");
console.log("    VAPID_SUBJECT=mailto:ops@courtsync.app");
