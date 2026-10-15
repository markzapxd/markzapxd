import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chdir, cwd } from "node:process";
import assert from "node:assert/strict";
import test from "node:test";
import { generate, renderSnakes } from "../../scripts/snake/generate.js";
import { validateAnimatedSvg } from "../../scripts/snake/validate.js";

test("renders valid light and dark SVGs with Platane/snk animation", async () => {
  const [light, dark] = await renderSnakes({
    "2025-01-01": 1,
    "2025-01-02": 3,
  });

  assert.doesNotThrow(() => validateAnimatedSvg(light, "#00a58f"));
  assert.doesNotThrow(() => validateAnimatedSvg(dark, "#00f5d4"));
  assert.match(light, /@keyframes s0/);
  assert.match(light, /animation-name:s0/);
  assert.match(light, /Generated with https:\/\/github.com\/Platane\/snk/);
  assert.notEqual(light, dark);
});

test("rejects a static calendar SVG", () => {
  assert.throws(
    () => validateAnimatedSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    /missing .*keyframes.*animated snake segments.*animation bindings/,
  );
});

test("collects mocked GitLab events and writes both animated SVGs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gitlab-snake-"));
  const originalDirectory = cwd();
  const fakeFetch: typeof fetch = async () =>
    Response.json([
      { id: 1, created_at: "2025-01-01T12:00:00Z" },
      { id: 2, created_at: "2025-01-02T12:00:00Z" },
    ]);

  try {
    chdir(directory);
    await generate({
      token: "test-token",
      today: new Date("2025-01-02T18:00:00Z"),
      fetch: fakeFetch,
    });
    const [light, dark] = await Promise.all([
      readFile("assets/gitlab-snake.svg", "utf8"),
      readFile("assets/gitlab-snake-dark.svg", "utf8"),
    ]);
    validateAnimatedSvg(light, "#00a58f");
    validateAnimatedSvg(dark, "#00f5d4");
  } finally {
    chdir(originalDirectory);
    await rm(directory, { recursive: true, force: true });
  }
});
