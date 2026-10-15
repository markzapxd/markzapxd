import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const validateAnimatedSvg = (svg: string, expectedSnakeColor?: string): void => {
  const requirements: Array<[boolean, string]> = [
    [svg.startsWith("<svg "), "root SVG element"],
    [svg.endsWith("</svg>"), "closing SVG element"],
    [svg.includes("Generated with https://github.com/Platane/snk"), "snk attribution"],
    [svg.includes("@keyframes"), "CSS keyframes"],
    [/class="s s\d+"/.test(svg), "animated snake segments"],
    [svg.includes("animation-name:"), "animation bindings"],
    [/<rect class="c(?: [^"]+)?"/.test(svg), "contribution cells"],
  ];
  if (expectedSnakeColor) {
    requirements.push([
      svg.toLowerCase().includes(`--cs:${expectedSnakeColor.toLowerCase()}`),
      `snake color ${expectedSnakeColor}`,
    ]);
  }

  const missing = requirements.filter(([present]) => !present).map(([, name]) => name);
  if (missing.length > 0) {
    throw new Error(`Invalid animated snake SVG: missing ${missing.join(", ")}`);
  }
};

const main = async (): Promise<void> => {
  const files = process.argv.slice(2);
  if (files.length === 0) throw new Error("Provide at least one SVG file to validate");
  for (const file of files) validateAnimatedSvg(await readFile(file, "utf8"));
  console.log(`Validated ${files.length} animated SVG file(s)`);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
