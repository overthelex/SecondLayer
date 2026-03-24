/**
 * Lex Chat Demo Video Recorder — 4K
 *
 * Records a ~60s showcase video of the Lex web chat UX in 4K (3840x2160):
 * 1. Playwright records browser interaction with chat
 * 2. ffmpeg adds zoom/pan effects and trims to 1 minute
 *
 * Usage:
 *   cd tests && npx tsx ../scripts/record-demo-video.ts
 *
 * Env vars:
 *   TEST_BASE_URL  — default https://localdev.legal.org.ua
 *   TEST_EMAIL     — default testuser@secondlayer.com
 *   TEST_PASSWORD  — default testuser123
 */

import { chromium, type Page } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Allow self-signed certs for local dev
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BASE_URL = process.env.TEST_BASE_URL || 'https://localhost';
const TEST_EMAIL = process.env.TEST_EMAIL || 'testuser@secondlayer.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'testuser123';

// 4K resolution
const WIDTH = 3840;
const HEIGHT = 2160;
// Device scale factor for crisp text at 4K
const DEVICE_SCALE = 2;

const OUTPUT_DIR = path.resolve(__dirname, '../demo-output');
const RAW_VIDEO = path.join(OUTPUT_DIR, 'raw-recording.webm');
const FINAL_VIDEO = path.join(OUTPUT_DIR, 'lex-chat-demo-4k.mp4');

// Demo conversation — realistic Ukrainian legal questions with follow-ups
const CONVERSATION = [
  {
    question: 'Які підстави для звільнення працівника з ініціативи роботодавця?',
    waitForAnswer: 40_000,
    pauseAfter: 4_000,
  },
  {
    question: 'А якщо працівник на лікарняному, чи можна його звільнити?',
    waitForAnswer: 35_000,
    pauseAfter: 4_000,
  },
  {
    question: 'Покажіть судову практику по незаконному звільненню під час лікарняного',
    waitForAnswer: 45_000,
    pauseAfter: 5_000,
  },
];

/**
 * Type text character by character with realistic delays
 */
async function typeRealistically(page: Page, selector: string, text: string) {
  const el = page.locator(selector);
  await el.click();
  for (const char of text) {
    await el.pressSequentially(char, { delay: 0 });
    await page.waitForTimeout(40 + Math.random() * 80);
  }
}

/**
 * Wait for assistant response to stream to completion
 */
async function waitForResponse(page: Page, timeoutMs: number) {
  // Wait for streaming to start — stop button appears
  try {
    await page.locator('button[aria-label*="Зупинити"]').waitFor({
      state: 'visible',
      timeout: 10_000,
    });
  } catch {
    // Sometimes response is very fast
  }

  // Wait for streaming to end — send button reappears
  await page.locator('button[aria-label*="Надіслати"]').waitFor({
    state: 'visible',
    timeout: timeoutMs,
  });
}

/**
 * Login via API and get JWT token + user object
 */
async function loginAndGetAuth(): Promise<{ token: string; user: any }> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return { token: data.token, user: data.user };
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Clean previous recordings
  for (const f of fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.webm'))) {
    fs.unlinkSync(path.join(OUTPUT_DIR, f));
  }

  console.log('🔑 Logging in...');
  const auth = await loginAndGetAuth();
  console.log(`   ✓ Logged in as ${auth.user.email}`);

  console.log(`🎬 Launching browser (${WIDTH}x${HEIGHT} @ ${DEVICE_SCALE}x)...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: WIDTH / DEVICE_SCALE, height: HEIGHT / DEVICE_SCALE },
    deviceScaleFactor: DEVICE_SCALE,
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: WIDTH, height: HEIGHT },
    },
    ignoreHTTPSErrors: true,
  });

  // Inject auth before any page loads
  await context.addInitScript(
    ({ token, user }: { token: string; user: any }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('user', JSON.stringify(user));
    },
    { token: auth.token, user: auth.user }
  );

  const page = await context.newPage();

  // Navigate to chat
  console.log('📍 Opening chat page...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2000);

  // Dismiss any modals/onboarding popups
  try {
    await page.click('text=Пропустити', { timeout: 2000 });
    await page.waitForTimeout(500);
  } catch {
    // No modal
  }

  // Dismiss cookie/consent banner if present
  try {
    // Try common accept buttons
    const acceptBtn = page.locator('text=Прийняти').or(page.locator('text=Accept')).or(page.locator('text=Зрозуміло'));
    await acceptBtn.first().click({ timeout: 2000 });
    await page.waitForTimeout(500);
  } catch {
    // No cookie banner
  }

  // Force-remove any fixed bottom overlays that might block input
  await page.evaluate(() => {
    document.querySelectorAll('[class*="fixed"][class*="bottom"]').forEach(el => {
      // Remove cookie/consent banners but not the chat input
      if (!el.querySelector('#chat-message-input') && !el.querySelector('textarea')) {
        (el as HTMLElement).style.display = 'none';
      }
    });
  });

  // Screenshot empty state
  await page.screenshot({ path: path.join(OUTPUT_DIR, '01-empty-state.png') });
  console.log('   ✓ Empty state captured');

  // Let welcome animation play
  await page.waitForTimeout(2000);

  // Run through the conversation
  for (let i = 0; i < CONVERSATION.length; i++) {
    const step = CONVERSATION[i];
    console.log(`💬 Step ${i + 1}: "${step.question.substring(0, 50)}..."`);

    // Type the question realistically
    await typeRealistically(page, '#chat-message-input', step.question);
    await page.waitForTimeout(600);

    // Screenshot before sending
    await page.screenshot({
      path: path.join(OUTPUT_DIR, `0${i + 2}-before-send.png`),
    });

    // Send message
    await page.locator('button[aria-label*="Надіслати"]').click();
    console.log('   → Sent, waiting for response...');

    // Wait for response to stream in
    await waitForResponse(page, step.waitForAnswer);
    console.log('   ✓ Response received');

    // Pause to let viewer read
    await page.waitForTimeout(step.pauseAfter);

    // Screenshot the conversation state
    await page.screenshot({
      path: path.join(OUTPUT_DIR, `0${i + 2}-response.png`),
    });

    // Smoothly scroll down to show full response
    await page.evaluate(() => {
      const container = document.querySelector('.overflow-y-auto');
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    });
    await page.waitForTimeout(2000);
  }

  // Final pause on the full conversation
  await page.waitForTimeout(3000);
  await page.screenshot({
    path: path.join(OUTPUT_DIR, 'final-conversation.png'),
  });

  // Close browser — video is saved automatically
  console.log('🎬 Closing browser, saving video...');
  await page.close();
  await context.close();
  await browser.close();

  // Find the recorded video file
  const videoFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.webm'));
  if (videoFiles.length === 0) {
    throw new Error('No video file found in output directory');
  }

  const recordedVideo = path.join(OUTPUT_DIR, videoFiles[videoFiles.length - 1]);
  console.log(`   ✓ Raw video: ${recordedVideo}`);

  if (recordedVideo !== RAW_VIDEO) {
    fs.renameSync(recordedVideo, RAW_VIDEO);
  }

  // Post-process with ffmpeg
  console.log('🎞️  Post-processing with ffmpeg...');
  applyZoomEffects();

  console.log(`\n✅ Done!`);
  console.log(`   4K video with zoom: ${FINAL_VIDEO}`);
  console.log(`   4K video clean:     ${path.join(OUTPUT_DIR, 'lex-chat-demo-4k-clean.mp4')}`);
  console.log(`   Screenshots:        ${OUTPUT_DIR}/`);
}

/**
 * Apply zoom/pan "camera" effects with ffmpeg and trim to ~60s
 *
 * Creates a 1-minute 4K video with:
 * - Smooth zoom into the chat area at key moments
 * - Pan effects following the conversation
 * - Fade in/out transitions
 */
function applyZoomEffects() {
  const durationStr = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${RAW_VIDEO}"`
  ).toString().trim();
  const totalDuration = parseFloat(durationStr);
  console.log(`   Raw video duration: ${totalDuration.toFixed(1)}s`);

  const targetDuration = Math.min(totalDuration, 65);
  const fadeOutStart = targetDuration - 2;

  // ── Version 1: with zoom/pan effects ──
  // zoompan works on individual frames: z=zoom, x/y=pan offset
  // We zoom into the chat message area during typing, pull back for responses
  const zoomFilter = [
    `[0:v]`,
    // Scale to 4K first if not already
    `scale=${WIDTH}:${HEIGHT},`,
    `fps=30,`,
    `zoompan=`,
    // Zoom expression: smoothly oscillate 1.0→1.25 at key moments
    `z='if(between(in_time,0,3),1+in_time*0.06,`,        // 0-3s: zoom in 1→1.18 (empty state)
    `if(between(in_time,3,5),1.18-(in_time-3)*0.09,`,    // 3-5s: zoom out to 1.0
    `if(between(in_time,5,12),1+max(0,(in_time-5))*0.036,`, // 5-12s: slow zoom in during Q1 typing (→1.25)
    `if(between(in_time,12,15),1.25-(in_time-12)*0.083,`, // 12-15s: zoom out for A1 (→1.0)
    `if(between(in_time,15,22),1.0,`,                     // 15-22s: hold full for response reading
    `if(between(in_time,22,28),1+(in_time-22)*0.042,`,    // 22-28s: zoom in for Q2 (→1.25)
    `if(between(in_time,28,31),1.25-(in_time-28)*0.083,`, // 28-31s: zoom out for A2
    `if(between(in_time,31,40),1.0,`,                     // 31-40s: hold full for response
    `if(between(in_time,40,46),1+(in_time-40)*0.042,`,    // 40-46s: zoom in for Q3 (→1.25)
    `if(between(in_time,46,49),1.25-(in_time-46)*0.083,`, // 46-49s: zoom out for A3
    `if(between(in_time,49,58),1.0,`,                     // 49-58s: full view for final response
    `if(between(in_time,58,${targetDuration}),1+(in_time-58)*0.03,`, // 58-end: gentle zoom in
    `1.0`,
    `))))))))))))':`,
    // Pan X: keep centered horizontally
    `x='iw/2-(iw/zoom/2)':`,
    // Pan Y: follow the action — lower during typing (input area), higher during response
    `y='if(between(in_time,5,12),ih*0.55-(ih*0.55/zoom/2),`,  // Q1: focus on input (bottom)
    `if(between(in_time,22,28),ih*0.55-(ih*0.55/zoom/2),`,     // Q2: focus on input
    `if(between(in_time,40,46),ih*0.55-(ih*0.55/zoom/2),`,     // Q3: focus on input
    `ih*0.4-(ih*0.4/zoom/2)`,                                  // responses: center-ish
    `)))':`,
    `d=1:`,
    `s=${WIDTH}x${HEIGHT}:`,
    `fps=30,`,
    // Fade in/out
    `fade=t=in:st=0:d=1.5,`,
    `fade=t=out:st=${fadeOutStart}:d=2`,
    `[v]`,
  ].join('');

  const zoomCmd = [
    'ffmpeg', '-y',
    '-i', `"${RAW_VIDEO}"`,
    '-t', String(targetDuration),
    '-filter_complex', `"${zoomFilter}"`,
    '-map', '"[v]"',
    '-an',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    `"${FINAL_VIDEO}"`,
  ].join(' ');

  console.log('   Processing 4K with zoom effects...');
  try {
    execSync(zoomCmd, { stdio: 'pipe', timeout: 300_000 });
    console.log('   ✓ Zoom version done');
  } catch (err: any) {
    console.error('   ⚠ ffmpeg zoom error:', err.stderr?.toString().slice(-500) || err.message);
  }

  // ── Version 2: clean 4K without zoom (just fade in/out) ──
  const cleanVideo = path.join(OUTPUT_DIR, 'lex-chat-demo-4k-clean.mp4');
  const cleanCmd = [
    'ffmpeg', '-y',
    '-i', `"${RAW_VIDEO}"`,
    '-t', String(targetDuration),
    '-vf', `"scale=${WIDTH}:${HEIGHT},fps=30,fade=t=in:st=0:d=1.5,fade=t=out:st=${fadeOutStart}:d=2"`,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    `"${cleanVideo}"`,
  ].join(' ');

  console.log('   Processing 4K clean version...');
  try {
    execSync(cleanCmd, { stdio: 'pipe', timeout: 300_000 });
    console.log('   ✓ Clean version done');
  } catch (err: any) {
    console.error('   ⚠ ffmpeg clean error:', err.stderr?.toString().slice(-500) || err.message);
    console.log('   Raw video still available at:', RAW_VIDEO);
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
