import {
  createLaunchDeadline,
  LAUNCH_DEADLINE_MS,
} from "@/lib/launch-deadline";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("arming", () => {
  test("fires once the budget has passed with the load still out", () => {
    const expire = jest.fn();
    createLaunchDeadline().arm(expire);

    jest.advanceTimersByTime(LAUNCH_DEADLINE_MS - 1);
    expect(expire).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  test("honours a budget of its own", () => {
    const expire = jest.fn();
    createLaunchDeadline(200).arm(expire);

    jest.advanceTimersByTime(199);
    expect(expire).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  /**
   * The whole of #52. A Resync abandons the load in flight and starts another,
   * and if that restarted the clock the launch would have no bound at all — only
   * each hop of it would.
   */
  test("a second arm does not restart it", () => {
    const expire = jest.fn();
    const deadline = createLaunchDeadline(1000);

    deadline.arm(expire);
    jest.advanceTimersByTime(600);
    deadline.arm(expire);

    // 1000 from the first arm, not 1600.
    jest.advanceTimersByTime(400);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  test("however many times the socket flaps", () => {
    const expire = jest.fn();
    const deadline = createLaunchDeadline(1000);

    deadline.arm(expire);
    for (let flap = 0; flap < 20; flap += 1) {
      jest.advanceTimersByTime(100);
      deadline.arm(expire);
    }

    expect(expire).toHaveBeenCalledTimes(1);
  });
});

describe("settling", () => {
  test("a fetch that settled first stops it", () => {
    const expire = jest.fn();
    const deadline = createLaunchDeadline(1000);

    deadline.arm(expire);
    jest.advanceTimersByTime(400);
    deadline.settle();

    jest.advanceTimersByTime(10_000);
    expect(expire).not.toHaveBeenCalled();
  });

  // Settling is the end of this launch, not a return to the start of one: the
  // gate has already been released and a later load must not put it back.
  test("nothing arms it again afterwards", () => {
    const expire = jest.fn();
    const deadline = createLaunchDeadline(1000);

    deadline.arm(expire);
    deadline.settle();
    deadline.arm(expire);

    jest.advanceTimersByTime(10_000);
    expect(expire).not.toHaveBeenCalled();
  });

  test("settling after it has already fired changes nothing", () => {
    const expire = jest.fn();
    const deadline = createLaunchDeadline(1000);

    deadline.arm(expire);
    jest.advanceTimersByTime(1000);
    expect(expire).toHaveBeenCalledTimes(1);

    deadline.settle();
    deadline.arm(expire);
    jest.advanceTimersByTime(10_000);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  test("settling one that was never armed is harmless", () => {
    expect(() => createLaunchDeadline().settle()).not.toThrow();
  });
});

describe("resetting", () => {
  // Somebody else signed in, or the provider went away. That is a different
  // launch, and it gets a clock of its own.
  test("a reset stops it and lets the next launch arm", () => {
    const expire = jest.fn();
    const deadline = createLaunchDeadline(1000);

    deadline.arm(expire);
    jest.advanceTimersByTime(900);
    deadline.reset();
    jest.advanceTimersByTime(1000);
    expect(expire).not.toHaveBeenCalled();

    deadline.arm(expire);
    jest.advanceTimersByTime(999);
    expect(expire).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  test("a reset after settling lets the next launch arm too", () => {
    const expire = jest.fn();
    const deadline = createLaunchDeadline(1000);

    deadline.arm(expire);
    deadline.settle();
    deadline.reset();
    deadline.arm(expire);

    jest.advanceTimersByTime(1000);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  test("a reset after it fired lets the next launch arm too", () => {
    const expire = jest.fn();
    const deadline = createLaunchDeadline(1000);

    deadline.arm(expire);
    jest.advanceTimersByTime(1000);
    deadline.reset();
    deadline.arm(expire);
    jest.advanceTimersByTime(1000);

    expect(expire).toHaveBeenCalledTimes(2);
  });

  test("each launch gets the callback it was armed with", () => {
    const first = jest.fn();
    const second = jest.fn();
    const deadline = createLaunchDeadline(1000);

    deadline.arm(first);
    deadline.reset();
    deadline.arm(second);
    jest.advanceTimersByTime(1000);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  test("two deadlines do not share state", () => {
    const one = jest.fn();
    const other = jest.fn();
    createLaunchDeadline(1000).arm(one);
    createLaunchDeadline(1000).arm(other);

    jest.advanceTimersByTime(1000);
    expect(one).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
  });
});

test("the budget is shorter than a round trip's own deadline, on purpose", () => {
  // Not derived from `REQUEST_DEADLINE_MS`: sizing this to whatever is
  // happening underneath is the coupling #52 is a report about. It is a limit
  // on what somebody is asked to watch.
  expect(LAUNCH_DEADLINE_MS).toBeLessThan(15_000);
});
