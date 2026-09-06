// @ts-nocheck -- executed directly by Node's type-stripping test runner.
import assert from "node:assert/strict";
import test from "node:test";
import { PushRegistrationCoordinator } from "./pushRegistrationCoordinator.ts";

test("late account-A registration is always followed by account B", async () => {
  const coordinator = new PushRegistrationCoordinator();
  const tokenA = coordinator.setOwner("user-a")!;
  let releaseA!: () => void;
  const waitA = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  const serverOwners: string[] = [];
  const resultA = coordinator.enqueue(tokenA, async () => {
    await waitA;
    serverOwners.push("user-a");
  });

  await new Promise((resolve) => setImmediate(resolve));
  const tokenB = coordinator.setOwner("user-b")!;
  const resultB = coordinator.enqueue(tokenB, async () => {
    serverOwners.push("user-b");
  });
  releaseA();

  assert.equal(await resultA, false);
  assert.equal(await resultB, true);
  assert.deepEqual(serverOwners, ["user-a", "user-b"]);
  assert.equal(serverOwners.at(-1), "user-b");
});

test("queued work for an owner that went stale before start is skipped", async () => {
  const coordinator = new PushRegistrationCoordinator();
  const tokenA = coordinator.setOwner("user-a")!;
  coordinator.setOwner("user-b");
  let called = false;
  assert.equal(
    await coordinator.enqueue(tokenA, async () => {
      called = true;
    }),
    false,
  );
  assert.equal(called, false);
});

test("logout revocation runs after an already in-flight registration", async () => {
  const coordinator = new PushRegistrationCoordinator();
  const tokenA = coordinator.setOwner("user-a")!;
  let releaseRegister!: () => void;
  const blocked = new Promise<void>((resolve) => {
    releaseRegister = resolve;
  });
  let serverOwner: string | null = null;
  const registration = coordinator.enqueue(tokenA, async () => {
    await blocked;
    serverOwner = "user-a";
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(coordinator.clearIfCurrent(tokenA), true);
  const revocation = coordinator.enqueueCleanup(async () => {
    serverOwner = null;
  });
  releaseRegister();
  await Promise.all([registration, revocation]);
  assert.equal(serverOwner, null);
  assert.equal(coordinator.capture(), null);
});

test("cleanup from A cannot invalidate the newer B owner", () => {
  const coordinator = new PushRegistrationCoordinator();
  const tokenA = coordinator.setOwner("user-a")!;
  const tokenB = coordinator.setOwner("user-b")!;
  assert.equal(coordinator.clearIfCurrent(tokenA), false);
  assert.equal(coordinator.isCurrent(tokenB), true);
});

test("a stuck cleanup releases the queue by its deadline", async () => {
  const coordinator = new PushRegistrationCoordinator();
  coordinator.setOwner("user-a");
  const cleanup = coordinator.enqueueCleanup(() => new Promise(() => {}), 5);
  const tokenB = coordinator.setOwner("user-b")!;
  let registeredB = false;
  const registrationB = coordinator.enqueue(tokenB, async () => {
    registeredB = true;
  });

  await Promise.all([cleanup, registrationB]);
  assert.equal(registeredB, true);
});
