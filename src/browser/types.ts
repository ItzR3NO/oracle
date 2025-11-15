import type CDP from 'chrome-remote-interface';
import type Protocol from 'devtools-protocol';

export type ChromeClient = Awaited<ReturnType<typeof CDP>>;
export type CookieParam = Protocol.Network.CookieParam;

export interface ChromeCookiesSecureModule {
  getCookiesPromised: (
    url: string,
    format: 'puppeteer' | 'object',
    profile?: string
  ) => Promise<PuppeteerCookie[] | Record<string, unknown>>;
}

export interface PuppeteerCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  // biome-ignore lint/style/useNamingConvention: matches Puppeteer cookie shape
  Secure?: boolean;
  // biome-ignore lint/style/useNamingConvention: matches Puppeteer cookie shape
  HttpOnly?: boolean;
}

export type BrowserLogger = (message: string) => void;

export interface BrowserAutomationConfig {
  chromeProfile?: string | null;
  chromePath?: string | null;
  url?: string;
  timeoutMs?: number;
  inputTimeoutMs?: number;
  cookieSync?: boolean;
  headless?: boolean;
  keepBrowser?: boolean;
  hideWindow?: boolean;
  desiredModel?: string | null;
  debug?: boolean;
  allowCookieErrors?: boolean;
}

export interface BrowserRunOptions {
  prompt: string;
  attachmentFilePath?: string;
  config?: BrowserAutomationConfig;
  log?: (message: string) => void;
  heartbeatIntervalMs?: number;
}

export interface BrowserRunResult {
  answerText: string;
  answerMarkdown: string;
  answerHtml?: string;
  tookMs: number;
  answerTokens: number;
  answerChars: number;
  chromePid?: number;
  chromePort?: number;
  userDataDir?: string;
}

export type ResolvedBrowserConfig = Required<
  Omit<BrowserAutomationConfig, 'chromeProfile' | 'chromePath' | 'desiredModel'>
> & {
  chromeProfile?: string | null;
  chromePath?: string | null;
  desiredModel?: string | null;
};
