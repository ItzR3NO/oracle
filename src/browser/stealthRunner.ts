import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium, firefox, type BrowserContext, type Browser } from 'playwright';
import type { BrowserRunOptions, BrowserRunResult, BrowserLogger } from './types.js';
import { DEFAULT_MODEL_TARGET, INPUT_SELECTORS, SEND_BUTTON_SELECTOR, ANSWER_SELECTORS, OVERLAY_SELECTORS } from './constants.js';
import { estimateTokenCount } from './utils.js';

export async function runStealth(options: BrowserRunOptions, logger: BrowserLogger): Promise<BrowserRunResult> {
  const promptText = options.prompt?.trim();
  if (!promptText) {
    throw new Error('Prompt text is required when using browser mode.');
  }

  const config = options.config ?? {};
  // If the user provides a profile path, we assume they want to use that specific profile.
  // If not, we create a temp one.
  const tempProfile = config.chromeProfilePath ? null : await mkdtemp(path.join(os.tmpdir(), 'oracle-stealth-'));
  const userDataDir = config.chromeProfilePath ?? tempProfile ?? (await mkdtemp(path.join(os.tmpdir(), 'oracle-stealth-')));
  const headless = config.headless ?? false;
  const camoufoxPath = process.env.CAMOUFOX_PATH ?? '/home/r3no/Codex Projects/Scraper-Dataset-AiTrainer/api/.venv/bin/camoufox';
  const executablePath = config.chromePath ?? camoufoxPath;

  // Explicit CDP URL overrides everything
  const remoteCdp = process.env.PLAYWRIGHT_CDP_URL;
  let browserContext: BrowserContext | null = null;
  let remoteAttached = false;

  if (remoteCdp && await isPortOpen(remoteCdp)) {
    logger(`Connecting to existing Chrome via CDP at ${remoteCdp}`);
    try {
      const connectedBrowser: Browser = await chromium.connectOverCDP(remoteCdp);
      browserContext = connectedBrowser.contexts()[0] ?? (await connectedBrowser.newContext());
      remoteAttached = true;
    } catch (err) {
      logger(`Failed to connect to CDP: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // If no CDP connection, launch a persistent context.
  // We prefer Playwright Chromium with a real profile if provided, or Camoufox if available and no specific profile key is set to force standard Chrome.
  if (!browserContext) {
    const useCamoufox = !config.chromePath && !config.chromeProfilePath && await canAccess(camoufoxPath);
    
    if (useCamoufox) {
       try {
        logger(`Launching Camoufox from ${camoufoxPath}`);
        browserContext = await firefox.launchPersistentContext(userDataDir, {
          headless,
          executablePath: camoufoxPath,
          viewport: { width: 1280, height: 720 },
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            `--width=1280`,
            `--height=720`,
          ],
        });
      } catch (err) {
        logger(`Camoufox launch failed, falling back to Chromium: ${err}`);
      }
    }

    if (!browserContext) {
      logger(`Launching Chromium with profile: ${userDataDir}`);
      browserContext = await chromium.launchPersistentContext(userDataDir, {
        headless, // Respect the headless flag; user can set it to false for debugging
        executablePath: config.chromePath ?? undefined,
        viewport: { width: 1280, height: 720 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          `--window-size=1280,720`,
        ],
      });
    }
  }

  // Reuse an existing ChatGPT tab if present and not busy, else create a new one.
  // Creating a new tab is often safer for avoiding stale state.
  let page = browserContext.pages().find((p) => (p.url() ?? '').includes('chatgpt.com')) ?? null;
  if (!page) {
    page = await browserContext.newPage();
  }
  
  try {
      await page.goto(config.url ?? 'https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  } catch (e) {
      // Sometimes navigation fails if we are already there or network blips
      logger(`Navigation warning: ${e}`);
  }

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // 1. Solve Cloudflare
  await solveCloudflare(page, logger, config.inputTimeoutMs ?? 90_000);

  // 2. Dismiss Overlays (onboarding, etc.)
  await dismissOverlays(page, logger);

  // 3. Select Model (Best Effort)
  if (config.desiredModel && config.desiredModel !== DEFAULT_MODEL_TARGET) {
    await selectModel(page, config.desiredModel, logger);
  }

  // 4. Wait for Prompt and Fill
  const promptSelector = '#prompt-textarea';
  logger(`Waiting for ${promptSelector}...`);
  
  try {
    await page.waitForSelector(promptSelector, { state: 'visible', timeout: config.inputTimeoutMs ?? 60_000 });
  } catch (e) {
    logger('Specific selector failed, trying generic wait...');
    await waitForPrompt(page, config.inputTimeoutMs ?? 60_000, logger);
  }

  const promptHandle = await page.$(promptSelector) ?? await page.$(INPUT_SELECTORS.join(','));
  if (!promptHandle) throw new Error('Prompt handle not found');

  // Ensure visible and focused
  await promptHandle.scrollIntoViewIfNeeded();
  
  // Click center to force focus
  const box = await promptHandle.boundingBox();
  if (box) {
      await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
  } else {
      await promptHandle.click();
  }
  await page.waitForTimeout(300); // Brief pause for focus

  // Strategy 1: Clipboard Paste (FAST)
  logger('Pasting prompt...');
  try {
    await page.evaluate((text: string) => navigator.clipboard.writeText(text), promptText);
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+V`);
    await page.waitForTimeout(200);
  } catch (e) {
     logger(`Paste failed: ${e}`);
  }

  // Verification
  let currentVal = await promptHandle.evaluate((el: any) => el.value || el.innerText);

  // Strategy 2: Fast Typing (Fallback)
  if (!currentVal || currentVal.trim().length === 0) {
      logger('Paste failed/empty. Typing prompt (fast)...');
      try {
          await page.keyboard.type(promptText, { delay: 5 }); 
      } catch (e) {
          logger(`Typing failed: ${e}`);
      }
  }
  
  // Strategy 3: Direct Injection (Final Resort)
  currentVal = await promptHandle.evaluate((el: any) => el.value || el.innerText);
  if (!currentVal || currentVal.trim().length === 0) {
      logger('Fallback: Direct Value Injection.');
      await page.$eval(promptSelector, (el: any, text: string) => {
          el.value = text;
          el.innerText = text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
      }, promptText);
  }

  // Final wait to ensure UI updates
  await page.waitForTimeout(300);

  const existingAssistantCount = await countAssistantMessages(page);
  const sendButton = await page.$(SEND_BUTTON_SELECTOR);
  
  if (sendButton) {
    // Check if button is actually enabled
    let isDisabled = await sendButton.isDisabled();
    
    if (isDisabled && currentVal && currentVal.trim().length > 0) {
        logger('Send button is disabled despite text presence. Triggering manual input events...');
        // Try to wake up the UI
        try {
            await promptHandle.focus();
            await page.keyboard.press('Space');
            await page.waitForTimeout(100);
            await page.keyboard.press('Backspace');
            await page.waitForTimeout(500);
            isDisabled = await sendButton.isDisabled();
        } catch (e) {
            logger(`Wake-up sequence failed: ${e}`);
        }
    }

    if (!isDisabled) {
      logger('Clicking Send button...');
      await sendButton.click();
    } else {
        logger('Send button still disabled. Attempting fallback Enter key...');
        await page.keyboard.press('Enter');
    }
  } else {
    logger('Send button not found. Using Enter key...');
    await page.keyboard.press('Enter');
  }

  const answer = await waitForAnswer(page, config.timeoutMs ?? 900_000, existingAssistantCount);

  const durationMs = answer.elapsedMs;
  const tokens = estimateTokenCount(answer.text);
  
  if (!config.keepBrowser && !remoteAttached) {
    await browserContext.close();
    if (tempProfile) {
      await rm(tempProfile, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  return {
    answerText: answer.text,
    answerMarkdown: answer.text,
    answerHtml: answer.html,
    tookMs: durationMs,
    answerTokens: tokens,
    answerChars: answer.text.length,
    chromePid: undefined, // Playwright manages this
    chromePort: undefined,
    userDataDir: userDataDir ?? undefined,
  };
}

async function solveCloudflare(page: any, logger: BrowserLogger, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let consecutiveCleanChecks = 0;

  while (Date.now() < deadline) {
    const cf = await detectCloudflare(page);
    if (!cf.challenge) {
        consecutiveCleanChecks++;
        // Ensure it stays clean for a moment (flaky loads)
        if (consecutiveCleanChecks > 3) return;
        await page.waitForTimeout(500);
        continue;
    }
    consecutiveCleanChecks = 0;

    logger('Cloudflare challenge detected...');
    if (cf.frameBox) {
      logger('Clicking Cloudflare checkbox...');
      try {
        await page.mouse.move(cf.frameBox.x, cf.frameBox.y, { steps: 10 });
        await page.mouse.click(cf.frameBox.x, cf.frameBox.y, { delay: 100 });
      } catch (e) {
          // Ignore click errors (frame might detach)
      }
      await page.waitForTimeout(3000); // Wait for reaction
    } else {
      // Just wait if we see title but no box (maybe loading)
      await page.waitForTimeout(1000);
    }
  }
  logger('Warning: Cloudflare challenge wait timed out (or persisted).');
}

async function detectCloudflare(page: any) {
  const title = (await page.title())?.toLowerCase?.() ?? '';
  // Check for the specific Cloudflare challenge iframe
  const frame = page.frames().find((f: any) => f.url().includes('challenges.cloudflare.com/cdn-cgi/challenge-platform'));
  
  let frameBox = null;
  if (frame) {
    try {
        frameBox = await frame.evaluate(() => {
        const el = document.querySelector('input[type="checkbox"], .challenge-form input');
        if (!el) return null;
        const r = (el as HTMLElement).getBoundingClientRect();
        // Return absolute page coordinates
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
    } catch {
        // frame might be detached
    }
  }
  
  const isTitleMatch = title.includes('just a moment');
  return { challenge: isTitleMatch || Boolean(frameBox), frameBox };
}

async function dismissOverlays(page: any, logger: BrowserLogger) {
    // Try multiple times as some overlays might appear sequentially
    for (let i = 0; i < 3; i++) {
        for (const selector of OVERLAY_SELECTORS) {
            try {
                const el = await page.$(selector);
                if (el && await el.isVisible()) {
                    logger(`Dismissing overlay: ${selector}`);
                    await el.click();
                    await page.waitForTimeout(500);
                }
            } catch {
                // ignore
            }
        }
        await page.waitForTimeout(200);
    }
}

async function waitForPrompt(page: any, timeoutMs: number, logger: BrowserLogger) {
  const selectors = INPUT_SELECTORS.join(',');
  const deadline = Date.now() + timeoutMs;
  
  while (Date.now() < deadline) {
    // 1. Check for prompt
    const handle = await page.$(selectors);
    if (handle && await handle.isVisible() && await handle.isEnabled()) {
       // Double check bounding box
       const box = await handle.boundingBox();
       if (box && box.width > 0 && box.height > 0) {
         return handle;
       }
    }

    // 2. Check/Solve Cloudflare again (in case of reload)
    const cf = await detectCloudflare(page);
    if (cf.challenge) {
      logger('Cloudflare reappeared during prompt wait.');
      await solveCloudflare(page, logger, 10_000);
      continue;
    }

    // 3. Dismiss overlays that might block the prompt
    await dismissOverlays(page, logger);

    await page.waitForTimeout(500);
  }
  throw new Error('Prompt textarea did not become visible');
}

async function waitForAnswer(
  page: any,
  timeoutMs: number,
  initialAssistantCount = 0,
): Promise<{ text: string; html?: string; elapsedMs: number }> {
  const start = Date.now();
  await waitForNewAssistantMessage(page, initialAssistantCount, timeoutMs);
  await page.waitForTimeout(1500); // Let render finish
  
  const text = await page.evaluate((selectors: string[]) => {
    const node = selectors
      .map((sel) => document.querySelector(sel))
      .find((el) => el && el.textContent && el.textContent.trim().length > 0) as HTMLElement | null;
    return node?.innerText ?? '';
  }, ANSWER_SELECTORS);
  
  const html = await page.evaluate((selectors: string[]) => {
    const node = selectors
      .map((sel) => document.querySelector(sel))
      .find((el) => el && el.innerHTML && el.innerHTML.trim().length > 0) as HTMLElement | null;
    return node?.innerHTML;
  }, ANSWER_SELECTORS);
  
  return { text, html, elapsedMs: Date.now() - start };
}

async function waitForNewAssistantMessage(page: any, initialCount: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = await countAssistantMessages(page);
    if (count > initialCount) return;
    await page.waitForTimeout(500);
  }
  throw new Error('Assistant response did not arrive before timeout');
}

async function countAssistantMessages(page: any): Promise<number> {
  return page.evaluate(() => {
    const turnSelector = 'article[data-testid^=\"conversation-turn\"],[data-message-author-role=\"assistant\"]';
    return document.querySelectorAll(turnSelector).length;
  });
}

async function selectModel(page: any, desiredLabel: string, logger: BrowserLogger): Promise<void> {
  try {
    const button = await page.$('[data-testid="model-switcher-dropdown-button"]');
    if (!button) return;
    await button.click();
    await page.waitForTimeout(500);
    const items = await page.$$('button,[role="menuitem"],[role="menuitemradio"]');
    for (const item of items) {
      const text = (await item.innerText())?.trim().toLowerCase();
      if (text && desiredLabel.toLowerCase().split(/\s+/).every((t) => text.includes(t))) {
        await item.click();
        logger(`Model picker: ${await item.innerText()}`);
        break;
      }
    }
  } catch {
    /* ignore */
  }
}

// Simple helpers for port checking/file access
async function isPortOpen(urlOrPort: string | number): Promise<boolean> {
    const port = typeof urlOrPort === 'number' ? urlOrPort : parseInt(new URL(urlOrPort).port || '9222');
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(500);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.once('error', () => {
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, '127.0.0.1');
    });
}

async function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isPortOpen(port)) return;
        await new Promise(r => setTimeout(r, 200));
    }
}

async function canAccess(file: string): Promise<boolean> {
    try {
        const fs = await import('node:fs/promises');
        await fs.access(file);
        return true;
    } catch {
        return false;
    }
}
