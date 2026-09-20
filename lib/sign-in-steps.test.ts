import {
  FIRST_STEP,
  STEP_COPY,
  type SignInStep,
  previousStep,
  showsIdentifierRow,
} from "@/lib/sign-in-steps";

const ALL_STEPS: SignInStep[] = ["identifier", "credentials", "link-sent"];

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

describe("getting back", () => {
  test("the credentials step returns to the identifier", () => {
    expect(previousStep("credentials")).toBe("identifier");
  });

  test("a sent link returns to the credentials step, not to the identifier", () => {
    // The address is not what somebody is reconsidering when they have just
    // been told a link went to it.
    expect(previousStep("link-sent")).toBe("credentials");
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
    expect(showsIdentifierRow("credentials")).toBe(true);
    expect(showsIdentifierRow("link-sent")).toBe(true);
  });
});

describe("copy", () => {
  // The credentials step is deliberately absent here: what it says depends on
  // what the probe found, so its three wordings live in `CREDENTIALS_COPY` and
  // are covered in `sign-in-steps-credentials.test.ts`.
  test("the two fixed steps have a heading and a description", () => {
    for (const step of ["identifier", "link-sent"] as const) {
      expect(STEP_COPY[step].title).not.toBe("");
      expect(STEP_COPY[step].description).not.toBe("");
    }
  });
});
