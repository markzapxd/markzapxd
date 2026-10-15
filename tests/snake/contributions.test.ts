import assert from "node:assert/strict";
import test from "node:test";
import { buildContributions } from "../../scripts/snake/contributions.js";
import type { GitLabEvent } from "../../scripts/snake/types.js";

const event = (
  id: number,
  createdAt: string,
  extra: Partial<GitLabEvent> = {},
): GitLabEvent => ({ id, created_at: createdAt, ...extra });

test("fills every day, deduplicates event IDs, and crosses the year boundary", () => {
  const contributions = buildContributions(
    [
      event(1, "2024-12-31T23:59:59Z"),
      event(1, "2024-12-31T23:59:59Z"),
      event(2, "2025-01-01T00:00:00Z"),
    ],
    new Date("2025-01-02T18:00:00Z"),
    4,
  );

  assert.deepEqual(
    contributions.map(({ date, count }) => ({ date, count })),
    [
      { date: "2024-12-30", count: 0 },
      { date: "2024-12-31", count: 1 },
      { date: "2025-01-01", count: 1 },
      { date: "2025-01-02", count: 0 },
    ],
  );
});

test("normalizes offset timestamps to UTC dates", () => {
  const [contribution] = buildContributions(
    [event(1, "2025-01-02T23:30:00-03:00")],
    new Date("2025-01-03T12:00:00Z"),
    1,
  );
  assert.deepEqual(contribution, { date: "2025-01-03", count: 1, level: 4 });
});

test("counts one push event rather than its aggregated commit count", () => {
  const [contribution] = buildContributions(
    [
      event(1, "2025-01-03T12:00:00Z", {
        action_name: "pushed",
        push_data: { commit_count: 37 },
      }),
    ],
    new Date("2025-01-03T12:00:00Z"),
    1,
  );
  assert.equal(contribution?.count, 1);
});

test("assigns relative intensity levels including zero", () => {
  const events = [
    event(1, "2025-01-01T01:00:00Z"),
    event(2, "2025-01-02T01:00:00Z"),
    event(3, "2025-01-02T02:00:00Z"),
    event(4, "2025-01-03T01:00:00Z"),
    event(5, "2025-01-03T02:00:00Z"),
    event(6, "2025-01-03T03:00:00Z"),
    event(7, "2025-01-03T04:00:00Z"),
  ];
  assert.deepEqual(
    buildContributions(events, new Date("2025-01-04T12:00:00Z"), 4).map(
      ({ level }) => level,
    ),
    [1, 2, 4, 0],
  );
});
