import { describe, expect, it } from "vitest";
import { rebindExclusiveDevice, removeOwnedDevice } from "./pushOwnershipPolicy";

describe("exclusive push device ownership", () => {
  it("moves one endpoint from account A to B without duplicating delivery", () => {
    const endpoint = "https://push.example/device-secret";
    const updates = rebindExclusiveDevice(
      [
        { userId: "user-a", values: [endpoint, "device-a2"] },
        { userId: "user-b", values: ["device-b1"] },
      ],
      "user-b",
      endpoint,
      (value) => value,
      10,
    );
    expect(updates.get("user-a")).toEqual(["device-a2"]);
    expect(updates.get("user-b")).toEqual(["device-b1", endpoint]);
    expect(updates.get("user-a")).not.toContain(endpoint);
    expect(updates.get("user-b")?.filter((value) => value === endpoint)).toHaveLength(1);
  });

  it("revoke removes a device only from its authenticated owner", () => {
    expect(removeOwnedDevice(["one", "two"], "one", (value) => value)).toEqual([
      "two",
    ]);
  });
});
