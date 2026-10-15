import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { generateSnakeAnimation } from "generate-snake-animation";
import type { Color, Output } from "generate-snake-animation";
import { buildContributions, contributionCounts } from "./contributions.js";
import { fetchGitLabEvents } from "./gitlab-client.js";
import { validateAnimatedSvg } from "./validate.js";

const GITLAB_BASE_URL = "https://git.garten.com.br";
const GITLAB_USER_ID = 30;
const GITLAB_USERNAME = "marcelo";

const palette = (
  colorEmpty: string,
  colorDots: [string, string, string, string, string],
  colorSnake: string,
): Output => ({
  format: "svg",
  drawOptions: {
    colorDotBorder: "#1b1f230a",
    colorEmpty,
    colorDots: Object.fromEntries(
      colorDots.map((color, level) => [level, color]),
    ) as Record<Color, string>,
    colorSnake,
    sizeCell: 16,
    sizeDot: 12,
    sizeDotBorderRadius: 2,
  },
  animationOptions: { frameByStep: 1, stepDurationMs: 100 },
});

const outputs: [Output, Output] = [
  palette("#ebedf0", ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"], "#00a58f"),
  palette("#161b22", ["#161b22", "#01311f", "#034525", "#0f6d31", "#00c647"], "#00f5d4"),
];

export const renderSnakes = async (
  counts: Record<string, number>,
): Promise<[string, string]> => {
  process.env.TZ = "UTC";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const expectedPath = `/users/${GITLAB_USERNAME}/calendar.json`;
    if (url.origin !== "https://snk-adapter.invalid" || url.pathname !== expectedPath) {
      throw new Error("snk requested an unexpected data source");
    }
    return Response.json(counts);
  };

  try {
    const generated = await generateSnakeAnimation(
      {
        platform: "gitlab",
        username: GITLAB_USERNAME,
        baseUrl: "https://snk-adapter.invalid",
      },
      outputs,
    );
    const [light, dark] = generated;
    if (typeof light !== "string" || typeof dark !== "string") {
      throw new Error("snk did not return both SVG outputs");
    }
    validateAnimatedSvg(light, "#00a58f");
    validateAnimatedSvg(dark, "#00f5d4");
    return [light, dark];
  } finally {
    globalThis.fetch = originalFetch;
  }
};

const writeAtomically = async (path: string, content: string): Promise<void> => {
  const temporary = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
};

export type GenerateOptions = {
  token?: string;
  today?: Date;
  fetch?: typeof fetch;
};

export const generate = async (options: GenerateOptions = {}): Promise<void> => {
  const token = options.token ?? process.env.GITLAB_TOKEN;
  if (!token) throw new Error("GITLAB_TOKEN is required");

  const events = await fetchGitLabEvents(
    {
      baseUrl: process.env.GITLAB_BASE_URL ?? GITLAB_BASE_URL,
      userId: process.env.GITLAB_USER_ID ?? GITLAB_USER_ID,
      token,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    },
    options.today,
  );
  if (events.length === 0) {
    throw new Error("GitLab returned no contribution events; existing SVGs were preserved");
  }

  const contributions = buildContributions(events, options.today ?? new Date());
  const [light, dark] = await renderSnakes(contributionCounts(contributions));
  await Promise.all([
    writeAtomically("assets/gitlab-snake.svg", light),
    writeAtomically("assets/gitlab-snake-dark.svg", dark),
  ]);
  console.log(`Generated animated snakes from ${events.length} unique GitLab events`);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await generate().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown generation failure";
    console.error(`Snake generation failed: ${message}`);
    process.exitCode = 1;
  });
}
