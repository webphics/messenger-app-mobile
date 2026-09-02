import { readSeedAccounts, seedAccountLabel } from "@/lib/seed-accounts";

describe("reading the configured seed accounts", () => {
  test("an entry is a role, an email and a password", () => {
    expect(readSeedAccounts("admin:root@example.com:hunter2")).toEqual([
      { role: "admin", email: "root@example.com", password: "hunter2" },
    ]);
  });

  test("several entries keep the order they were configured in", () => {
    const accounts = readSeedAccounts(
      "customer:c@example.com:one,agent:a@example.com:two,admin:r@example.com:three",
    );

    expect(accounts.map((account) => account.role)).toEqual([
      "customer",
      "agent",
      "admin",
    ]);
  });

  test("a password may contain colons — only the first two separate fields", () => {
    expect(readSeedAccounts("agent:a@example.com:pa:ss")?.[0]?.password).toBe("pa:ss");
  });

  test("whitespace around an entry is not part of it", () => {
    expect(readSeedAccounts("  admin : root@example.com : hunter2  ")).toEqual([
      { role: "admin", email: "root@example.com", password: "hunter2" },
    ]);
  });

  test("an unset variable configures nothing", () => {
    expect(readSeedAccounts(undefined)).toEqual([]);
  });

  test("an empty variable configures nothing", () => {
    expect(readSeedAccounts("   ")).toEqual([]);
  });
});

describe("refusing an entry that cannot sign anyone in", () => {
  const unusable: [string, string][] = [
    ["a role the API does not have", "owner:root@example.com:hunter2"],
    ["an address that is not one", "admin:root:hunter2"],
    ["no password to send", "admin:root@example.com:"],
    ["no password field at all", "admin:root@example.com"],
    ["nothing but separators", "::"],
  ];

  test.each(unusable)("%s is dropped", (_reason, raw) => {
    expect(readSeedAccounts(raw)).toEqual([]);
  });

  test("a malformed entry does not take the good ones with it", () => {
    expect(readSeedAccounts("nonsense,agent:a@example.com:two")).toEqual([
      { role: "agent", email: "a@example.com", password: "two" },
    ]);
  });
});

describe("one control per role", () => {
  test("a second entry for a role already listed is dropped", () => {
    const accounts = readSeedAccounts(
      "admin:first@example.com:one,admin:second@example.com:two",
    );

    expect(accounts).toEqual([
      { role: "admin", email: "first@example.com", password: "one" },
    ]);
  });
});

describe("labelling a seed account", () => {
  test("says the role the API would call it", () => {
    expect(seedAccountLabel("customer")).toBe("Customer");
    expect(seedAccountLabel("agent")).toBe("Agent");
    expect(seedAccountLabel("admin")).toBe("Admin");
  });
});
