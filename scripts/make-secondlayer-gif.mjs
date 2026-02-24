/**
 * Captures the SECOND LAYER SVG animation (Y↔W) over one full cycle and builds a seamless looping GIF.
 * Captures one extra frame at t=duration (same state as t=0) so the loop has no jump.
 * Duration is read from the SVG dur attribute.
 * Requires: ffmpeg on PATH, Playwright (npm install playwright).
 * Run from repo root: node scripts/make-secondlayer-gif.mjs
 */

import { chromium } from "playwright";
import { mkdtemp, rm, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";

const SVG_PATH = join(
  process.cwd(),
  "pics",
  "secondlayer",
  "Screenshot-2026-02-23-at-14.05.03.svg"
);
const OUT_DIR = join(process.cwd(), "pics", "secondlayer");

const WIDTH = 380;
const HEIGHT = 100;
const NUM_INTERVALS = 90;

async function getDurationFromSvg(svgPath) {
  const content = await readFile(svgPath, "utf-8");
  const m = content.match(/dur="(\d+(?:\.\d+)?)s"/);
  if (!m) throw new Error('SVG has no dur="Ns" attribute');
  return Number(m[1]);
}

function buildGif(tmpDir, fps, outPath) {
  const frameInput = join(tmpDir, "frame_%04d.png");
  const palettePath = join(tmpDir, "palette.png");
  execSync(
    `ffmpeg -y -framerate ${fps} -i "${frameInput}" -vf "palettegen=stats_mode=diff" "${palettePath}"`,
    { stdio: "inherit" }
  );
  execSync(
    `ffmpeg -y -framerate ${fps} -i "${frameInput}" -i "${palettePath}" -lavfi "paletteuse=dither=bayer:bayer_scale=5" -loop 0 "${outPath}"`,
    { stdio: "inherit" }
  );
}

async function main() {
  const durationSec = await getDurationFromSvg(SVG_PATH);
  const totalFrames = NUM_INTERVALS + 1;
  const frameMs = (durationSec * 1000) / NUM_INTERVALS;

  const tmpDir = await mkdtemp(join(tmpdir(), "secondlayer-gif-"));

  console.log("Launching browser…");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  const fileUrl = "file://" + SVG_PATH;
  await page.goto(fileUrl, { waitUntil: "load" });
  await page.waitForTimeout(200);

  console.log(
    "Capturing",
    totalFrames,
    "frames (t=0 … t=" + durationSec + "s) for seamless loop…"
  );
  for (let i = 0; i < totalFrames; i++) {
    const path = join(tmpDir, `frame_${String(i).padStart(4, "0")}.png`);
    await page.screenshot({ path, type: "png" });
    if (i < totalFrames - 1) await page.waitForTimeout(frameMs);
  }
  await browser.close();

  const fps = totalFrames / durationSec;
  const outGif = join(OUT_DIR, `secondlayer-logo_${durationSec}s.gif`);
  console.log("Building GIF", WIDTH + "x" + HEIGHT, "…");
  buildGif(tmpDir, fps, outGif);

  await rm(tmpDir, { recursive: true });
  console.log("Done:", outGif);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
