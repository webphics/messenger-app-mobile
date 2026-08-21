import {
  guardedSimulatedRefresh,
  runSimulatedRefresh,
  SIMULATED_REFRESH_MS,
} from "@/lib/simulated-refresh";

describe("runSimulatedRefresh", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("waits the default delay then calls onReload", async () => {
    const onReload = jest.fn();
    const done = runSimulatedRefresh(onReload);

    expect(onReload).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(SIMULATED_REFRESH_MS - 1);
    expect(onReload).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    await done;
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  test("honors a custom delay", async () => {
    const onReload = jest.fn();
    const done = runSimulatedRefresh(onReload, 200);

    await jest.advanceTimersByTimeAsync(199);
    expect(onReload).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await done;
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});

describe("guardedSimulatedRefresh", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("skips a second call while the first is in flight", async () => {
    const state = { busy: false };
    const onReload = jest.fn();

    const first = guardedSimulatedRefresh(state, onReload);
    const second = guardedSimulatedRefresh(state, onReload);

    expect(await second).toBe(false);
    expect(onReload).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(SIMULATED_REFRESH_MS);
    expect(await first).toBe(true);
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  test("allows another refresh after the first finishes", async () => {
    const state = { busy: false };
    const onReload = jest.fn();

    const first = guardedSimulatedRefresh(state, onReload, 100);
    await jest.advanceTimersByTimeAsync(100);
    expect(await first).toBe(true);

    const second = guardedSimulatedRefresh(state, onReload, 100);
    await jest.advanceTimersByTimeAsync(100);
    expect(await second).toBe(true);
    expect(onReload).toHaveBeenCalledTimes(2);
  });
});
