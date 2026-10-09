import {
  signUpDefaults,
  signUpFieldErrors,
  signUpNeedsEmail,
  type SignUpFields,
} from "@/lib/sign-up-fields";

function fields(over: Partial<SignUpFields> = {}): SignUpFields {
  return { name: "Ada Lovelace", username: "ada", email: "ada@example.com", phone: "", ...over };
}

describe("what step one already said", () => {
  test("an address fills the email and is not asked for again", () => {
    expect(signUpNeedsEmail("Ada@Example.com")).toBe(false);
    expect(signUpDefaults("Ada@Example.com")).toEqual({
      name: "",
      username: "",
      email: "ada@example.com",
      phone: "",
    });
  });

  test("a username fills the username, and the address is asked for", () => {
    expect(signUpNeedsEmail("Ada_L")).toBe(true);
    expect(signUpDefaults("Ada_L")).toEqual({
      name: "",
      username: "ada_l",
      email: "",
      phone: "",
    });
  });
});

describe("what a submit refuses", () => {
  test("a complete form has nothing wrong with it, phone or not", () => {
    expect(signUpFieldErrors(fields())).toEqual({});
    expect(signUpFieldErrors(fields({ phone: "+8801712345678" }))).toEqual({});
  });

  test("every missing field is reported at once", () => {
    expect(signUpFieldErrors(fields({ name: " ", username: "", email: "" }))).toEqual({
      name: "Enter your name",
      username: "Choose a username",
      email: "Enter your email address",
    });
  });

  const badUsernames = [
    ["one character over the bound", "a".repeat(21), "Username must be 20 characters or fewer"],
    ["a dot", "ada.l", "Use only letters, numbers and underscores"],
    ["a space inside", "ada l", "Use only letters, numbers and underscores"],
  ] as const;

  test.each(badUsernames)("a username with %s", (_label, username, message) => {
    expect(signUpFieldErrors(fields({ username })).username).toBe(message);
  });

  test("an address with no dot in its domain", () => {
    expect(signUpFieldErrors(fields({ email: "ada@example" })).email).toBe(
      "Enter a valid email address",
    );
  });

  test("the phone is left to the API", () => {
    expect(signUpFieldErrors(fields({ phone: "not a number" })).phone).toBeUndefined();
  });
});
