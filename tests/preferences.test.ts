import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  loadCloudPreferences,
  saveCloudPreferences,
  type CloudBudgetPreferences,
} from "../src/api/preferences.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const settings: CloudBudgetPreferences = {
  version: 1,
  plan: { overrides: {}, annualReserve: 0, incomeInput: "" },
  sortOrder: [],
  reimbursements: {
    version: 1,
    categoryIds: null,
    startDate: "2026-06-01",
    matches: [],
    ignored: {},
  },
};

test("loads preferences from the same-origin authenticated API", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return new Response(JSON.stringify({ settings, revision: 4 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await loadCloudPreferences("11111111-1111-4111-8111-111111111111");
  assert.equal(
    requestedUrl,
    "/api/preferences/11111111-1111-4111-8111-111111111111",
  );
  assert.equal(requestedInit?.credentials, "same-origin");
  assert.equal(requestedInit?.method, undefined);
  assert.deepEqual(result, { settings, revision: 4 });
});

test("saves a budget copy with its expected revision", async () => {
  let requestedInit: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    requestedInit = init;
    return new Response(JSON.stringify({ settings, revision: 5 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await saveCloudPreferences(
    "11111111-1111-4111-8111-111111111111",
    settings,
    4,
  );
  assert.equal(requestedInit?.method, "PUT");
  assert.equal(requestedInit?.credentials, "same-origin");
  assert.deepEqual(JSON.parse(String(requestedInit?.body)), {
    settings,
    expectedRevision: 4,
  });
  assert.equal(result.revision, 5);
});

test("surfaces revision conflicts with the latest account copy", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        settings,
        revision: 8,
        error: "These settings changed in another session.",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );

  await assert.rejects(
    saveCloudPreferences(
      "11111111-1111-4111-8111-111111111111",
      settings,
      7,
    ),
    (error: Error & { status?: number; body?: unknown }) => {
      assert.equal(error.status, 409);
      assert.deepEqual(error.body, {
        settings,
        revision: 8,
        error: "These settings changed in another session.",
      });
      return true;
    },
  );
});
