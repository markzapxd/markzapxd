import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchGitLabEvents,
  GitLabApiError,
} from "../../scripts/snake/gitlab-client.js";

const response = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response => Response.json(body, { status, headers });

const options = (fetchImplementation: typeof fetch) => ({
  baseUrl: "https://gitlab.example.com",
  userId: 30,
  token: "test-token",
  fetch: fetchImplementation,
  sleep: async () => {},
  minimumRequestIntervalMs: 0,
});

test("follows GitLab pagination headers and sends a bounded UTC date window", async () => {
  const requested: URL[] = [];
  const fakeFetch: typeof fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requested.push(url);
    return url.searchParams.get("page") === "1"
      ? response(
          [{ id: 1, created_at: "2025-01-01T00:00:00Z" }],
          200,
          { "x-next-page": "2" },
        )
      : response([{ id: 2, created_at: "2025-01-02T00:00:00Z" }]);
  };

  const events = await fetchGitLabEvents(
    options(fakeFetch),
    new Date("2025-01-02T18:00:00Z"),
  );

  assert.deepEqual(events.map(({ id }) => id), [1, 2]);
  assert.equal(requested[0]?.searchParams.get("after"), "2024-01-03");
  assert.equal(requested[0]?.searchParams.get("before"), "2025-01-03");
  assert.equal(requested[0]?.searchParams.get("per_page"), "100");
});

test("deduplicates overlapping pagination results", async () => {
  let page = 0;
  const fakeFetch: typeof fetch = async () => {
    page += 1;
    return page === 1
      ? response(
          [{ id: 1, created_at: "2025-01-01T00:00:00Z" }],
          200,
          { "x-next-page": "2" },
        )
      : response([{ id: 1, created_at: "2025-01-01T00:00:00Z" }]);
  };
  assert.equal(
    (await fetchGitLabEvents(options(fakeFetch), new Date("2025-01-02Z"))).length,
    1,
  );
});

test("rejects authentication failures without leaking response details", async () => {
  for (const status of [401, 403]) {
    const fakeFetch: typeof fetch = async () =>
      new Response("secret server details", { status });
    await assert.rejects(
      fetchGitLabEvents(options(fakeFetch), new Date("2025-01-02Z")),
      (error: unknown) =>
        error instanceof GitLabApiError &&
        error.status === status &&
        !error.message.includes("secret"),
    );
  }
});

test("returns an empty list for a valid empty response", async () => {
  const fakeFetch: typeof fetch = async () => response([]);
  assert.deepEqual(
    await fetchGitLabEvents(options(fakeFetch), new Date("2025-01-02Z")),
    [],
  );
});

test("retries rate-limited requests using Retry-After", async () => {
  let attempts = 0;
  const waits: number[] = [];
  const fakeFetch: typeof fetch = async () => {
    attempts += 1;
    return attempts === 1
      ? new Response(null, { status: 429, headers: { "retry-after": "2" } })
      : response([{ id: 1, created_at: "2025-01-01T00:00:00Z" }]);
  };
  const events = await fetchGitLabEvents(
    {
      ...options(fakeFetch),
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
      },
    },
    new Date("2025-01-02Z"),
  );
  assert.equal(events.length, 1);
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [2_000]);
});
