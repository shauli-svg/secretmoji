import { webcrypto } from "node:crypto";

const crypto = webcrypto;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const iterations = 110000;

function b64u(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function fromB64u(value) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function importAesKey(rawKeyBytes) {
  return crypto.subtle.importKey("raw", rawKeyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function derive(pattern, saltB64) {
  const raw = await crypto.subtle.importKey("raw", encoder.encode(pattern.join("-")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: fromB64u(saltB64),
    iterations,
    hash: "SHA-256"
  }, raw, 256);
  return importAesKey(new Uint8Array(bits));
}

async function encrypt(message, pattern) {
  const salt = b64u(crypto.getRandomValues(new Uint8Array(16)));
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(pattern, salt);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: ivBytes }, key, encoder.encode(message));
  return `CM8P.candy.ABC.${salt}.${b64u(ivBytes)}.${b64u(new Uint8Array(cipher))}`;
}

function parse(hash) {
  const cm8p = hash.match(/CM8P\.([a-z0-9-]+)\.([A-L]{3})\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/i);
  if (!cm8p) throw new Error("parse failed");
  return { skin: cm8p[1], sign: cm8p[2], salt: cm8p[3], iv: cm8p[4], c: cm8p[5] };
}

async function decrypt(capsule, pattern) {
  const key = await derive(pattern, capsule.salt);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64u(capsule.iv) }, key, fromB64u(capsule.c));
  return decoder.decode(plain);
}

const pattern = [1, 2, 3, 6];
const hash = await encrypt("בדיקה", pattern);
const capsule = parse(hash);
const plain = await decrypt(capsule, pattern);
if (plain !== "בדיקה") throw new Error("correct pattern did not decrypt");
let wrongFailed = false;
try {
  await decrypt(capsule, [1, 2, 3, 4]);
} catch {
  wrongFailed = true;
}
if (!wrongFailed) throw new Error("wrong pattern unexpectedly decrypted");
console.log("cm8p-roundtrip-node: PASS");
