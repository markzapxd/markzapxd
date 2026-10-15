import { addUtcDays, contributionWindow, isoDateUtc } from "./contributions.js";
import type { GitLabEvent } from "./types.js";

export type GitLabClientOptions = {
  baseUrl: string;
  userId: number | string;
  token: string;
  timeoutMs?: number;
  maxRetries?: number;
  minimumRequestIntervalMs?: number;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
};

export class GitLabApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GitLabApiError";
  }
}

const retryableStatus = (status: number): boolean =>
  status === 408 || status === 425 || status === 429 || status >= 500;

const parseRetryAfter = (response: Response, now: number): number | undefined => {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, date - now);
  }

  const reset = Number(response.headers.get("ratelimit-reset"));
  return Number.isFinite(reset) && reset > 0
    ? Math.max(0, reset * 1_000 - now)
    : undefined;
};

const nextLink = (link: string | null): string | undefined => {
  if (!link) return undefined;
  for (const part of link.split(",")) {
    const match = part.match(/^\s*<([^>]+)>\s*;\s*rel="?([^";]+)"?\s*$/);
    if (match?.[2] === "next") return match[1];
  }
  return undefined;
};

const validateEvent = (value: unknown): GitLabEvent => {
  if (!value || typeof value !== "object") {
    throw new GitLabApiError("GitLab returned a malformed event");
  }

  const event = value as Record<string, unknown>;
  if (
    (typeof event.id !== "number" && typeof event.id !== "string") ||
    typeof event.created_at !== "string" ||
    Number.isNaN(Date.parse(event.created_at))
  ) {
    throw new GitLabApiError("GitLab returned a malformed event");
  }

  const result: GitLabEvent = {
    id: event.id,
    created_at: event.created_at,
  };
  if (typeof event.action_name === "string") {
    result.action_name = event.action_name;
  }
  if (event.push_data && typeof event.push_data === "object") {
    const push = event.push_data as Record<string, unknown>;
    result.push_data = {};
    if (typeof push.commit_count === "number") {
      result.push_data.commit_count = push.commit_count;
    }
    if (typeof push.ref_count === "number") {
      result.push_data.ref_count = push.ref_count;
    }
  }
  return result;
};

export const fetchGitLabEvents = async (
  options: GitLabClientOptions,
  today = new Date(),
): Promise<GitLabEvent[]> => {
  if (!options.token) throw new GitLabApiError("GITLAB_TOKEN is required");

  const fetchImplementation = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((milliseconds: number) => {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, milliseconds);
    return promise;
  });
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRetries = options.maxRetries ?? 3;
  const intervalMs = options.minimumRequestIntervalMs ?? 100;
  const baseUrl = new URL(options.baseUrl);
  const endpoint = new URL(
    `/api/v4/users/${encodeURIComponent(String(options.userId))}/events`,
    baseUrl,
  );
  const { start, end } = contributionWindow(today);
  endpoint.searchParams.set("after", isoDateUtc(addUtcDays(start, -1)));
  endpoint.searchParams.set("before", isoDateUtc(addUtcDays(end, 1)));
  endpoint.searchParams.set("sort", "asc");
  endpoint.searchParams.set("per_page", "100");
  endpoint.searchParams.set("page", "1");

  let nextUrl: URL | undefined = endpoint;
  let nextAllowedAt = 0;
  const visited = new Set<string>();
  const events = new Map<string, GitLabEvent>();

  while (nextUrl) {
    if (nextUrl.origin !== baseUrl.origin || !nextUrl.pathname.startsWith("/api/v4/")) {
      throw new GitLabApiError("GitLab returned an unsafe pagination URL");
    }
    if (visited.has(nextUrl.href)) {
      throw new GitLabApiError("GitLab returned a pagination loop");
    }
    visited.add(nextUrl.href);

    let response: Response | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const waitMs = nextAllowedAt - Date.now();
      if (waitMs > 0) await sleep(waitMs);
      nextAllowedAt = Date.now() + intervalMs;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        response = await fetchImplementation(nextUrl, {
          headers: {
            Accept: "application/json",
            "PRIVATE-TOKEN": options.token,
          },
          redirect: "error",
          signal: controller.signal,
        });
      } catch (error) {
        if (attempt === maxRetries) {
          const reason = error instanceof Error && error.name === "AbortError"
            ? `timed out after ${timeoutMs}ms`
            : "could not be reached";
          throw new GitLabApiError(`GitLab API ${reason}`);
        }
        await sleep(250 * 2 ** attempt);
        continue;
      } finally {
        clearTimeout(timer);
      }

      if (response.ok) break;
      if (!retryableStatus(response.status) || attempt === maxRetries) {
        const message = response.status === 401 || response.status === 403
          ? `GitLab authentication failed with HTTP ${response.status}`
          : `GitLab API returned HTTP ${response.status}`;
        throw new GitLabApiError(message, response.status);
      }
      await sleep(parseRetryAfter(response, Date.now()) ?? 250 * 2 ** attempt);
    }

    if (!response?.ok) throw new GitLabApiError("GitLab API request failed");
    const payload: unknown = await response.json().catch(() => {
      throw new GitLabApiError("GitLab returned invalid JSON");
    });
    if (!Array.isArray(payload)) {
      throw new GitLabApiError("GitLab returned an invalid events response");
    }

    for (const value of payload) {
      const event = validateEvent(value);
      events.set(String(event.id), event);
    }

    const linked = nextLink(response.headers.get("link"));
    const nextPage = response.headers.get("x-next-page");
    if (linked) {
      nextUrl = new URL(linked, nextUrl);
    } else if (nextPage) {
      nextUrl = new URL(nextUrl);
      nextUrl.searchParams.set("page", nextPage);
    } else if (payload.length === 100) {
      nextUrl = new URL(nextUrl);
      const page = Number(nextUrl.searchParams.get("page") ?? "1");
      nextUrl.searchParams.set("page", String(page + 1));
    } else {
      nextUrl = undefined;
    }
  }

  return [...events.values()];
};
