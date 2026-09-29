import { createLaunchDeadline, LAUNCH_DEADLINE_MS } from "@/lib/launch-deadline";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test("fires once the budget has passed with the load still out", () => {
  const expire = jest.fn();
  createLaunchDeadline().arm(expire);

  jest.advanceTimersByTime(LAUNCH_DEADLINE_MS - 1);
  expect(expire).not.toHaveBeenCalled();

  jest.advanceTimersByTime(1);
  expect(expire).toHaveBeenCalledTimes(1);
});

// The whole of #52: a Resync must not restart the clock.
test("a second arm does not restart it", () => {
  const expire = jest.fn();
  const deadline = createLaunchDeadline(1000);

  deadline.arm(expire);
  jest.advanceTimersByTime(600);
  deadline.arm(expire);

  jest.advanceTimersByTime(400);
  expect(expire).toHaveBeenCalledTimes(1);
});

test("a fetch that settled first stops it, and nothing arms it again afterwards", () => {
  const expire = jest.fn();
  const deadline = createLaunchDeadline(1000);

  deadline.arm(expire);
  jest.advanceTimersByTime(400);
  deadline.settle();
  deadline.arm(expire);

  jest.advanceTimersByTime(10_000);
  expect(expire).not.toHaveBeenCalled();
});

test("a reset stops it and lets the next launch arm", () => {
  const expire = jest.fn();
  const deadline = createLaunchDeadline(1000);

  deadline.arm(expire);
  jest.advanceTimersByTime(900);
  deadline.reset();
  jest.advanceTimersByTime(1000);
  expect(expire).not.toHaveBeenCalled();

  deadline.arm(expire);
  jest.advanceTimersByTime(1000);
  expect(expire).toHaveBeenCalledTimes(1);
});
