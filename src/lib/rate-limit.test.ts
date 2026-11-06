import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit, then reports how long to wait", () => {
    const limiter = new RateLimiter({ max: 2, windowMs: 1000 });
    expect(limiter.check("a", 0)).toBe(0);
    expect(limiter.check("a", 100)).toBe(0);
    expect(limiter.check("a", 200)).toBe(800);
  });

  it("frees capacity as old requests leave the window", () => {
    const limiter = new RateLimiter({ max: 1, windowMs: 1000 });
    expect(limiter.check("a", 0)).toBe(0);
    expect(limiter.check("a", 1000)).toBe(0);
  });

  it("tracks callers independently", () => {
    const limiter = new RateLimiter({ max: 1, windowMs: 1000 });
    expect(limiter.check("a", 0)).toBe(0);
    expect(limiter.check("b", 0)).toBe(0);
  });
});
