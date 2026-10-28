import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PUSH_LOOP_SECONDS, pushLoopSeconds, startPushLoop } from "@/lib/push-loop";

describe("how often the server pushes by itself", () => {
  it("defaults to every 15 seconds on a production server", () => {
    expect(DEFAULT_PUSH_LOOP_SECONDS).toBe(15);
    expect(pushLoopSeconds({ nodeEnv: "production" })).toBe(15);
  });

  it("never runs on a development or test server", () => {
    expect(pushLoopSeconds({ seconds: 15, nodeEnv: "development" })).toBe(0);
    expect(pushLoopSeconds({ seconds: 15, nodeEnv: "test" })).toBe(0);
  });

  it("is switched off by 0 or anything that is not a number, and never faster than every 5 seconds", () => {
    expect(pushLoopSeconds({ seconds: 0 })).toBe(0);
    expect(pushLoopSeconds({ seconds: -3 })).toBe(0);
    expect(pushLoopSeconds({ seconds: "soon" })).toBe(0);
    expect(pushLoopSeconds({ seconds: 1 })).toBe(5);
    expect(pushLoopSeconds({ seconds: 45 })).toBe(45);
  });
});

describe("the loop", () => {
  let registry;
  beforeEach(() => {
    vi.useFakeTimers();
    registry = {};
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the work on every interval, and stops when told to", async () => {
    const run = vi.fn(async () => {});
    const stop = startPushLoop({ run, seconds: 10, registry });
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("does not start at all when it is switched off", () => {
    const run = vi.fn();
    expect(startPushLoop({ run, seconds: 0, registry })).toBeNull();
    expect(startPushLoop({ run, seconds: 10, nodeEnv: "development", registry })).toBeNull();
  });

  it("starts once per process, however often it is asked", async () => {
    const run = vi.fn(async () => {});
    const first = startPushLoop({ run, seconds: 10, registry });
    const second = startPushLoop({ run, seconds: 10, registry });
    expect(second).toBe(first);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(1);
    first();
  });

  it("never lets two runs overlap: a slow run makes the next tick wait", async () => {
    let finish;
    const run = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    const stop = startPushLoop({ run, seconds: 5, registry });
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(5_000); // still busy: skipped
    expect(run).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it("survives a run that fails, logs it, and tries again", async () => {
    const log = vi.fn();
    const run = vi.fn().mockRejectedValueOnce(new Error("database down")).mockResolvedValue(undefined);
    const stop = startPushLoop({ run, seconds: 5, log, registry });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(log).toHaveBeenCalledWith("[push-loop] run failed:", "database down");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });
});
