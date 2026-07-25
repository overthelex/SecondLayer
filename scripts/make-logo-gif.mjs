/**
 * Captures one full 360° rotation from logo_chat_3d.html and builds two looping GIFs (small + large).
 * Requires: ffmpeg on PATH.
 * Run from repo root: node scripts/make-logo-gif.mjs
 */

import { chromium } from "playwright";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";

const LARGE_SIZE = 320;
const SMALL_SIZE = 128;
const DURATION_SEC = 2;
const NUM_FRAMES = 360;
const FRAME_MS = (DURATION_SEC * 1000) / NUM_FRAMES;
const HTML_PATH = join(process.cwd(), "pics", "logo_chat_3d.html");
const OUT_DIR = join(process.cwd(), "pics");
const OUT_GIF_LARGE = join(OUT_DIR, "logo_chat_3d.gif");
const OUT_GIF_SMALL = join(OUT_DIR, "logo_chat_3d_small.gif");

function buildGif(tmpDir, fps, outPath, scaleFilter = null) {
  const frameInput = join(tmpDir, "frame_%04d.png");
  const palettePath = join(tmpDir, scaleFilter ? "palette_small.png" : "palette.png");
  const vfForPalette = scaleFilter ? `${scaleFilter},palettegen=stats_mode=diff` : "palettegen=stats_mode=diff";
  const vfForEncode = scaleFilter ? `${scaleFilter},paletteuse=dither=bayer:bayer_scale=5` : "paletteuse=dither=bayer:bayer_scale=5";

  execSync(
    `ffmpeg -y -framerate ${fps} -i "${frameInput}" -vf "${vfForPalette}" "${palettePath}"`,
    { stdio: "inherit" }
  );
  execSync(
    `ffmpeg -y -framerate ${fps} -i "${frameInput}" -i "${palettePath}" -lavfi "${vfForEncode}" -loop 0 "${outPath}"`,
    { stdio: "inherit" }
  );
}

async function main() {
  const tmpDir = await mkdtemp(join(tmpdir(), "logo-gif-"));

  console.log("Launching browser…");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.setViewportSize({ width: LARGE_SIZE, height: LARGE_SIZE });
  const fileUrl = "file://" + HTML_PATH + "?duration=" + DURATION_SEC;
  await page.goto(fileUrl, { waitUntil: "load" });
  await page.waitForTimeout(150);

  console.log("Capturing", NUM_FRAMES, "frames…");
  for (let i = 0; i < NUM_FRAMES; i++) {
    const path = join(tmpDir, `frame_${String(i).padStart(4, "0")}.png`);
    await page.screenshot({ path, type: "png" });
    if (i < NUM_FRAMES - 1) await page.waitForTimeout(FRAME_MS);
  }
  await browser.close();

  const fps = NUM_FRAMES / DURATION_SEC;

  console.log("Building large GIF", LARGE_SIZE + "x" + LARGE_SIZE, "…");
  buildGif(tmpDir, fps, OUT_GIF_LARGE);

  console.log("Building small GIF", SMALL_SIZE + "x" + SMALL_SIZE, "…");
  buildGif(tmpDir, fps, OUT_GIF_SMALL, `scale=${SMALL_SIZE}:${SMALL_SIZE}:flags=lanczos`);

  await rm(tmpDir, { recursive: true });
  console.log("Done:", OUT_GIF_LARGE, OUT_GIF_SMALL);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
