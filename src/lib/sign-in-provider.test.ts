import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ calls: [] as string[], fail: false }));
vi.mock("@workos-inc/node", () => ({
  WorkOS: class {
    userManagement = {
      deleteUser: async (id: string) => {
        sdk.calls.push(id);
        if (sdk.fail) throw new Error("provider down");
      },
    };
  },
}));

import { removeSignInRecord } from "./sign-in-provider";

beforeEach(() => {
  sdk.calls = [];
  sdk.fail = false;
});

describe("removing the sign-in record after account deletion (FR-H2)", () => {
  it("asks the provider to delete exactly this person's record", async () => {
    expect(await removeSignInRecord("user_abc", "key")).toBe("removed");
    expect(sdk.calls).toEqual(["user_abc"]);
  });

  it("reports a provider failure without throwing (our data is already gone)", async () => {
    sdk.fail = true;
    expect(await removeSignInRecord("user_abc", "key")).toBe("failed");
  });

  it("does nothing when there is no sign-in id or no key", async () => {
    expect(await removeSignInRecord(null, "key")).toBe("not_configured");
    expect(await removeSignInRecord("user_abc", undefined)).toBe("not_configured");
    expect(sdk.calls).toEqual([]);
  });
});
