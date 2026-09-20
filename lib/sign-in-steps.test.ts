import {
  FIRST_STEP,
  STEP_COPY,
  type SignInStep,
  previousStep,
  showsIdentifierRow,
  stepMayAsk,
} from "@/lib/sign-in-steps";

const ALL_STEPS: SignInStep[] = ["identifier", "password", "link-sent"];

describe("where sign-in starts", () => {
  test("the identifier, alone", () => {
    expect(FIRST_STEP).toBe("identifier");
  });

  test("and it is the only step with nothing behind it", () => {
    expect(previousStep(FIRST_STEP)).toBeNull();
    for (const step of ALL_STEPS.filter((s) => s !== FIRST_STEP)) {
      expect(previousStep(step)).not.toBeNull();
    }
  });
});

describe("step one cannot ask the API anything", () => {
  // The rule the whole flow rests on. The API refuses to say whether an account
  // exists, so a step that branched on it would need an oracle three separate
  // defences exist to deny.
  test("the identifier step may not", () => {
    expect(stepMayAsk("identifier")).toBe(false);
  });

  test("every later step may", () => {
    expect(stepMayAsk("password")).toBe(true);
    expect(stepMayAsk("link-sent")).toBe(true);
  });
});

describe("getting back", () => {
  test("the password step returns to the identifier", () => {
    expect(previousStep("password")).toBe("identifier");
  });

  test("a sent link returns to the password, not to the identifier", () => {
    // The address is not what somebody is reconsidering when they have just
    // been told a link went to it.
    expect(previousStep("link-sent")).toBe("password");
  });

  test("every step reaches the first one by walking back", () => {
    for (const step of ALL_STEPS) {
      let at: SignInStep | null = step;
      let hops = 0;
      while (at !== null && at !== FIRST_STEP && hops < 10) {
        at = previousStep(at);
        hops += 1;
      }
      expect(at).toBe(FIRST_STEP);
    }
  });
});

describe("the identifier stays visible once it stops being asked for", () => {
  test("not on the step that asks for it", () => {
    expect(showsIdentifierRow("identifier")).toBe(false);
  });

  test("on every step that does not", () => {
    expect(showsIdentifierRow("password")).toBe(true);
    expect(showsIdentifierRow("link-sent")).toBe(true);
  });
});

describe("copy", () => {
  test("every step has a heading and a description", () => {
    for (const step of ALL_STEPS) {
      expect(STEP_COPY[step].title).not.toBe("");
      expect(STEP_COPY[step].description).not.toBe("");
    }
  });
});
