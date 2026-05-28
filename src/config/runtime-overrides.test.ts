import { beforeEach, describe, expect, it } from "vitest";
import {
  applyConfigOverrides,
  getConfigOverrides,
  resetConfigOverrides,
  setConfigOverride,
  unsetConfigOverride,
} from "./runtime-overrides.js";
import type { OpenClawConfig } from "./types.js";

describe("runtime overrides", () => {
  beforeEach(() => {
    resetConfigOverrides();
  });

  it("sets and applies nested overrides", () => {
    const cfg = {
      messages: { responsePrefix: "[openclaw]" },
    } as OpenClawConfig;
    setConfigOverride("messages.responsePrefix", "[debug]");
    const next = applyConfigOverrides(cfg);
    expect(next.messages?.responsePrefix).toBe("[debug]");
  });

  it("merges object overrides without clobbering siblings", () => {
    const cfg = {
      channels: { whatsapp: { dmPolicy: "pairing", allowFrom: ["+1"] } },
    } as OpenClawConfig;
    setConfigOverride("channels.whatsapp.dmPolicy", "open");
    const next = applyConfigOverrides(cfg);
    expect(next.channels?.whatsapp?.dmPolicy).toBe("open");
    expect(next.channels?.whatsapp?.allowFrom).toEqual(["+1"]);
  });

  it("unsets overrides and prunes empty branches", () => {
    setConfigOverride("channels.whatsapp.dmPolicy", "open");
    const removed = unsetConfigOverride("channels.whatsapp.dmPolicy");
    expect(removed.ok).toBe(true);
    expect(removed.removed).toBe(true);
    expect(Object.keys(getConfigOverrides()).length).toBe(0);
  });

  it("rejects prototype pollution paths", () => {
    const attempts = ["__proto__.polluted", "constructor.polluted", "prototype.polluted"];
    for (const path of attempts) {
      const result = setConfigOverride(path, true);
      expect(result.ok).toBe(false);
      expect(Object.keys(getConfigOverrides()).length).toBe(0);
    }
  });

  it("blocks __proto__ keys inside override object values", () => {
    const cfg = { commands: {} } as OpenClawConfig;
    setConfigOverride("commands", JSON.parse('{"__proto__":{"bash":true}}'));

    const next = applyConfigOverrides(cfg);
    expect(next.commands?.bash).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(next.commands ?? {}, "bash")).toBe(false);
  });

  it("blocks constructor/prototype keys inside override object values", () => {
    const cfg = { commands: {} } as OpenClawConfig;
    setConfigOverride("commands", JSON.parse('{"constructor":{"prototype":{"bash":true}}}'));

    const next = applyConfigOverrides(cfg);
    expect(next.commands?.bash).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(next.commands ?? {}, "bash")).toBe(false);
  });

  it("sanitizes blocked object keys when writing overrides", () => {
    setConfigOverride("commands", JSON.parse('{"__proto__":{"bash":true},"debug":true}'));

    expect(getConfigOverrides()).toEqual({
      commands: {
        debug: true,
      },
    });
  });

  it("applies environment variable overrides for allowed origins", () => {
    const prevAllowedOrigins = process.env.OPENCLAW_ALLOWED_ORIGINS;
    try {
      process.env.OPENCLAW_ALLOWED_ORIGINS = "https://example.com, https://another.com";
      const cfg = {
        gateway: { controlUi: { allowedOrigins: ["http://localhost:8080"] } },
      } as OpenClawConfig;
      const next = applyConfigOverrides(cfg);
      expect(next.gateway?.controlUi?.allowedOrigins).toEqual([
        "https://example.com",
        "https://another.com",
      ]);
    } finally {
      if (prevAllowedOrigins === undefined) {
        delete process.env.OPENCLAW_ALLOWED_ORIGINS;
      } else {
        process.env.OPENCLAW_ALLOWED_ORIGINS = prevAllowedOrigins;
      }
    }
  });

  it("applies environment variable overrides for dangerous host fallback", () => {
    const prevFallback = process.env.OPENCLAW_DANGEROUS_ALLOW_HOST_HEADER_ORIGIN_FALLBACK;
    try {
      process.env.OPENCLAW_DANGEROUS_ALLOW_HOST_HEADER_ORIGIN_FALLBACK = "true";
      const cfg = {
        gateway: { controlUi: { dangerouslyAllowHostHeaderOriginFallback: false } },
      } as OpenClawConfig;
      const next = applyConfigOverrides(cfg);
      expect(next.gateway?.controlUi?.dangerouslyAllowHostHeaderOriginFallback).toBe(true);
    } finally {
      if (prevFallback === undefined) {
        delete process.env.OPENCLAW_DANGEROUS_ALLOW_HOST_HEADER_ORIGIN_FALLBACK;
      } else {
        process.env.OPENCLAW_DANGEROUS_ALLOW_HOST_HEADER_ORIGIN_FALLBACK = prevFallback;
      }
    }
  });
});
