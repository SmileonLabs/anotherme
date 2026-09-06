// @ts-nocheck -- executed directly by Node's type-stripping test runner.
import assert from "node:assert/strict";
import test from "node:test";
import {
  canApplyCallCardAction,
  durableCallAttemptId,
} from "./callAttemptPolicy.ts";

test("existing calls reuse a durable server attempt ID", () => {
  assert.equal(durableCallAttemptId({
    attemptId: "10000000-0000-4000-8000-000000000001",
  }), "10000000-0000-4000-8000-000000000001");
});

test("legacy calls do not invent an attempt ID", () => {
  assert.equal(durableCallAttemptId({ attemptId: null }), undefined);
  assert.equal(durableCallAttemptId({}), undefined);
});

test("a delayed card action for A cannot disturb current incoming call B", () => {
  assert.equal(canApplyCallCardAction("incoming", "call-b", "call-a"), false);
  assert.equal(canApplyCallCardAction("incoming", "call-b", "call-b"), true);
  assert.equal(canApplyCallCardAction("idle", "call-b", "call-a"), true);
});
