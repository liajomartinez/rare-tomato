import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptField, encryptField, masterKeysFromEnv, newDataKey, parseMasterKey, rewrapDataKey, unwrapDataKey, wrapDataKey,
} from "./crypto";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

describe("field encryption", () => {
  it("round-trips a value", () => {
    const key = newDataKey();
    const packed = encryptField(key, "Theo needs 15 minutes of notice", userA, "value");
    expect(decryptField(key, packed, userA, "value")).toBe("Theo needs 15 minutes of notice");
  });

  it("stores no readable plaintext", () => {
    const packed = encryptField(newDataKey(), "Mia has soccer on Tuesdays", userA, "value");
    expect(packed).not.toContain("soccer");
    expect(packed.startsWith("v1.")).toBe(true);
  });

  it("uses a fresh nonce every time", () => {
    const key = newDataKey();
    expect(encryptField(key, "same", userA, "value")).not.toBe(encryptField(key, "same", userA, "value"));
  });

  it("fails if the stored value was changed", () => {
    const key = newDataKey();
    const [v, iv, tag, body] = encryptField(key, "hello", userA, "value").split(".");
    const flipped = Buffer.from(body, "base64url");
    flipped[0] ^= 1;
    expect(() => decryptField(key, [v, iv, tag, flipped.toString("base64url")].join("."), userA, "value")).toThrow();
  });

  it("fails with a different data key", () => {
    const packed = encryptField(newDataKey(), "hello", userA, "value");
    expect(() => decryptField(newDataKey(), packed, userA, "value")).toThrow();
  });

  it("fails if a value is copied to another person", () => {
    const key = newDataKey();
    const packed = encryptField(key, "hello", userA, "value");
    expect(() => decryptField(key, packed, userB, "value")).toThrow();
  });

  it("fails if a value is copied to another field", () => {
    const key = newDataKey();
    const packed = encryptField(key, "hello", userA, "value");
    expect(() => decryptField(key, packed, userA, "note")).toThrow();
  });

  it("rejects text that is not an encrypted value", () => {
    expect(() => decryptField(newDataKey(), "just some text", userA, "value")).toThrow();
  });
});

describe("data key wrapping and master key changes", () => {
  const master = randomBytes(32);

  it("a wrapped data key unwraps with the master key", () => {
    const dataKey = newDataKey();
    const wrapped = wrapDataKey(master, dataKey, userA);
    expect(unwrapDataKey({ current: master }, wrapped, userA).equals(dataKey)).toBe(true);
  });

  it("does not unwrap with the wrong master key", () => {
    const wrapped = wrapDataKey(master, newDataKey(), userA);
    expect(() => unwrapDataKey({ current: randomBytes(32) }, wrapped, userA)).toThrow();
  });

  it("does not unwrap for a different person", () => {
    const wrapped = wrapDataKey(master, newDataKey(), userA);
    expect(() => unwrapDataKey({ current: master }, wrapped, userB)).toThrow();
  });

  it("a key change keeps old data readable: re-wrap moves a data key to a new master key", () => {
    const dataKey = newDataKey();
    const stored = encryptField(dataKey, "kept safe", userA, "value");
    const oldWrapped = wrapDataKey(master, dataKey, userA);
    const newMaster = randomBytes(32);

    // During the change the old key is still accepted as "previous".
    expect(unwrapDataKey({ current: newMaster, previous: master }, oldWrapped, userA).equals(dataKey)).toBe(true);

    const rewrapped = rewrapDataKey(oldWrapped, userA, master, newMaster);
    const recovered = unwrapDataKey({ current: newMaster }, rewrapped, userA);
    expect(decryptField(recovered, stored, userA, "value")).toBe("kept safe");
    expect(() => unwrapDataKey({ current: master }, rewrapped, userA)).toThrow();
  });
});

describe("master key settings", () => {
  it("accepts exactly 32 bytes in base64", () => {
    expect(parseMasterKey(randomBytes(32).toString("base64")).length).toBe(32);
    expect(() => parseMasterKey(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
    expect(() => parseMasterKey("not a key")).toThrow();
  });

  it("refuses to start without a master key", () => {
    expect(() => masterKeysFromEnv({})).toThrow(/MASTER_KEY is not set/);
  });

  it("reads the current and previous keys", () => {
    const a = randomBytes(32).toString("base64");
    const b = randomBytes(32).toString("base64");
    const keys = masterKeysFromEnv({ MASTER_KEY: a, MASTER_KEY_PREVIOUS: b });
    expect(keys.current.toString("base64")).toBe(a);
    expect(keys.previous?.toString("base64")).toBe(b);
  });
});
