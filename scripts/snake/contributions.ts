import type {
  Contribution,
  ContributionLevel,
  GitLabEvent,
} from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1_000;

export const isoDateUtc = (date: Date): string =>
  date.toISOString().slice(0, 10);

export const addUtcDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

export const contributionWindow = (
  today: Date,
  days = 365,
): { start: Date; end: Date } => {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error("Contribution window must contain at least one day");
  }

  const end = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  return { start: addUtcDays(end, -(days - 1)), end };
};

const levelForCount = (count: number, maximum: number): ContributionLevel => {
  if (count <= 0 || maximum === 0) return 0;
  if (count >= maximum) return 4;
  return Math.ceil((count / maximum) * 3) as 1 | 2 | 3;
};

export const buildContributions = (
  events: readonly GitLabEvent[],
  today: Date,
  days = 365,
): Contribution[] => {
  const { start, end } = contributionWindow(today, days);
  const counts = new Map<string, number>();
  const seen = new Set<string>();

  for (const event of events) {
    const identity = String(event.id);
    if (seen.has(identity)) continue;
    seen.add(identity);

    const instant = new Date(event.created_at);
    if (Number.isNaN(instant.getTime())) {
      throw new Error(`GitLab event ${identity} has an invalid created_at value`);
    }

    const date = isoDateUtc(instant);
    if (date < isoDateUtc(start) || date > isoDateUtc(end)) continue;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  const maximum = Math.max(0, ...counts.values());
  return Array.from({ length: days }, (_, index) => {
    const date = isoDateUtc(new Date(start.getTime() + index * DAY_MS));
    const count = counts.get(date) ?? 0;
    return { date, count, level: levelForCount(count, maximum) };
  });
};

export const contributionCounts = (
  contributions: readonly Contribution[],
): Record<string, number> =>
  Object.fromEntries(
    contributions
      .filter(({ count }) => count > 0)
      .map(({ date, count }) => [date, count]),
  );
