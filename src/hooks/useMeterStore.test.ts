import { describe, it, expect, vi, beforeEach } from "vitest";
import { pushMeterData } from "./useMeterStore";

// We need to test the internal smoothing logic, so we'll import the
// smoothing function directly. We'll export it as a named export.
import { computeSmoothedFrame } from "./useMeterStore";

describe("meter ballistics", () => {
  it("snaps up instantly on attack (fast attack)", () => {
    const previous = [0.0, 0.0, 0.0];
    const raw = [0.8, 0.5, 0.3];
    const result = computeSmoothedFrame(previous, raw, 16);
    // Attack is instant: smoothed >= raw
    expect(result[0]).toBeCloseTo(0.8);
    expect(result[1]).toBeCloseTo(0.5);
    expect(result[2]).toBeCloseTo(0.3);
  });

  it("decays gradually when raw drops (moderate decay)", () => {
    const previous = [0.8, 0.8, 0.8];
    const raw = [0.0, 0.0, 0.0];
    const result = computeSmoothedFrame(previous, raw, 16);
    // After one 16ms frame, should be less than previous but not zero
    expect(result[0]).toBeLessThan(0.8);
    expect(result[0]).toBeGreaterThan(0.5);
  });

  it("decays significantly after ~1 second of silence", () => {
    let values = [0.8, 0.8, 0.8];
    const raw = [0.0, 0.0, 0.0];
    // ~60 frames at 16ms = ~960ms
    for (let i = 0; i < 60; i++) {
      values = computeSmoothedFrame(values, raw, 16);
    }
    // 300ms half-life: after ~960ms, value ≈ 0.8 * 0.5^(960/300) ≈ 0.087
    expect(values[0]).toBeLessThan(0.1);
  });

  it("handles raw array longer than previous (new channels)", () => {
    const previous = [0.5];
    const raw = [0.5, 0.8];
    const result = computeSmoothedFrame(previous, raw, 16);
    expect(result.length).toBe(2);
    expect(result[1]).toBeCloseTo(0.8);
  });
});
