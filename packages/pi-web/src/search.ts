/**
 * pi-web - Search and Content Extraction
 *
 * Internal search and fetch utilities. No framework dependencies.
 */

// ═════════════════════════════════════════════════════════════════════════════
// Types
// ═════════════════════════════════════════════════════════════════════════════

export interface ScrapingResult {
  content: string;
  title: string;
  method: string;
  url: string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// Content Extraction (Cascade)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Fast fetch for simple HTML sites
 */
async function fastFetch(url: string, maxLength: number): Promise<ScrapingResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0)' },
      signal: controller.signal
    });

    clearTimeout(timeout);
    if (!response.ok) return null;

    const html = await response.text();
    const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() || "Untitled";

    const content = html
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);

    if (content.length < 200) return null;
    return { content, title, method: 'fast', url };
  } catch {
    return null;
  }
}

/**
 * Readability-style extraction using regex
 */
async function readabilityFetch(url: string, maxLength: number): Promise<ScrapingResult | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0)' }
    });

    if (!response.ok) return null;
    const html = await response.text();

    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    const contentDiv = html.match(/<div[^>]*class="[^"]*(?:content|article|post)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    const rawContent = articleMatch?.[1] || mainMatch?.[1] || contentDiv?.[1];
    if (!rawContent) return null;

    const content = rawContent
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);

    const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() || "Untitled";
    if (content.length < 200) return null;

    return { content, title, method: 'readability', url };
  } catch {
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Playwright Browser Manager
// ═════════════════════════════════════════════════════════════════════════════

class BrowserManager {
  private browser: any = null;
  private context: any = null;
  private lastUsed: number = 0;
  private readonly POOL_TTL_MS = 120000;

  async getBrowser() {
    const { chromium } = await import('playwright');

    if (this.browser && Date.now() - this.lastUsed < this.POOL_TTL_MS) {
      try {
        await this.browser.contexts();
        this.lastUsed = Date.now();
        return { browser: this.browser, context: this.context, newBrowser: false };
      } catch {
        await this.close();
      }
    }

    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run']
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (compatible; 0xKobold/0.1)'
    });

    this.lastUsed = Date.now();
    return { browser: this.browser, context: this.context, newBrowser: true };
  }

  async close() {
    if (this.browser) {
      try { await this.browser.close(); } catch { /* ignore */ }
      this.browser = null;
      this.context = null;
    }
  }
}

const browserManager = new BrowserManager();

// Request queue for Playwright
type QueuedRequest = {
  url: string;
  maxLength: number;
  timeoutMs: number;
  resolve: (value: ScrapingResult | null) => void;
};

const requestQueue: QueuedRequest[] = [];
let isProcessing = false;
const MAX_CONCURRENT = 2;
const MAX_RETRIES = 3;

async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  while (requestQueue.length > 0) {
    const batch = requestQueue.splice(0, MAX_CONCURRENT);
    await Promise.all(batch.map(req => processRequest(req)));
    if (requestQueue.length > 0) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  isProcessing = false;
}

async function processRequest(req: QueuedRequest, attempt = 1): Promise<void> {
  try {
    const result = await playwrightFetchWithTimeout(req.url, req.maxLength, req.timeoutMs);
    req.resolve(result);
  } catch {
    if (attempt < MAX_RETRIES) {
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
      await new Promise(r => setTimeout(r, delay));
      await processRequest(req, attempt + 1);
    } else {
      req.resolve(null);
    }
  }
}

async function playwrightFetchWithTimeout(
  url: string,
  maxLength: number,
  timeoutMs: number = 15000
): Promise<ScrapingResult | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs + 2000);

  try {
    const { context, newBrowser } = await browserManager.getBrowser();
    const page = await context.newPage();

    page.setDefaultTimeout(Math.min(timeoutMs, 10000));
    page.setDefaultNavigationTimeout(Math.min(timeoutMs, 10000));

    controller.signal.addEventListener('abort', () => {
      page.close().catch(() => {});
    });

    try {
      const response = await page.goto(url, {
        waitUntil: 'commit',
        timeout: Math.min(timeoutMs, 10000)
      });

      if (!response) throw new Error("No response");
      await page.waitForTimeout(500);

      const extracted = await page.evaluate((maxLen: number) => {
        const doc = (globalThis as any).document;
        const main = doc.querySelector('main, article, .content, [role="main"]');
        if (main?.innerText?.trim().length > 100) {
          return main.innerText.slice(0, maxLen);
        }
        return doc.body?.innerText?.slice(0, maxLen) || '';
      }, maxLength);

      const title = await page.title().catch(() => 'Untitled');

      if (!extracted || extracted.length < 50) throw new Error("Insufficient content");

      return { content: extracted, title, url, method: newBrowser ? 'playwright-new' : 'playwright-pooled' };
    } finally {
      await page.close();
      clearTimeout(timeoutId);
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Playwright fetch with queue-based concurrency
 */
export async function playwrightFetch(
  url: string,
  maxLength: number,
  timeoutMs: number = 15000
): Promise<ScrapingResult | null> {
  return new Promise((resolve) => {
    requestQueue.push({ url, maxLength, timeoutMs, resolve });
    processQueue();
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Cascade Fetch
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CASCADE: Try all methods in order of speed → quality
 */
export async function cascadeFetch(
  url: string,
  maxLength: number = 5000,
  usePlaywright: boolean = false,
  timeoutMs: number = 15000
): Promise<ScrapingResult | null> {
  // Level 1: Fast HTML fetch
  if (!usePlaywright) {
    const fast = await fastFetch(url, maxLength);
    if (fast && fast.content.length > 1000) return fast;
  }

  // Level 2: Readability extraction
  if (!usePlaywright) {
    const readability = await readabilityFetch(url, maxLength);
    if (readability) return readability;
  }

  // Level 3: JavaScript rendering with Playwright
  const pw = await playwrightFetch(url, maxLength, timeoutMs);
  if (pw) return pw;

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// Search
// ═════════════════════════════════════════════════════════════════════════════

export async function searchDuckDuckGo(query: string, limit: number): Promise<WebSearchResult[]> {
  const results: WebSearchResult[] = [];

  try {
    const liteUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const response = await fetch(liteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return results;

    const html = await response.text();

    const linkRegex = /href="\/\/duckduckgo\.com\/l\/\?uddg=([^"&]+)/gi;
    const urls: string[] = [];
    let match;

    while ((match = linkRegex.exec(html)) && urls.length < limit * 2) {
      try {
        const decoded = decodeURIComponent(match[1]);
        const cleanUrl = decoded.split('&')[0].split('?rut=')[0];
        if (cleanUrl.startsWith('http') && !urls.includes(cleanUrl)) {
          urls.push(cleanUrl);
        }
      } catch { /* skip */ }
    }

    const anchorRegex = /<a[^>]*href="[^"]*uddg=[^"]*"[^>]*>([^<]+)<\/a>/gi;
    const titles: string[] = [];
    while ((match = anchorRegex.exec(html)) && titles.length < urls.length) {
      const title = match[1].replace(/<[^>]*>/g, '').trim();
      if (title && title.length > 2 && title.length < 200) {
        titles.push(title);
      }
    }

    for (let i = 0; i < Math.min(urls.length, titles.length, limit); i++) {
      results.push({ title: titles[i] || new URL(urls[i]).hostname, url: urls[i], snippet: '' });
    }

    for (let i = results.length; i < Math.min(urls.length, limit); i++) {
      try {
        results.push({ title: new URL(urls[i]).hostname, url: urls[i], snippet: '' });
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  return results;
}

export async function searchSearX(query: string, limit: number, instance?: string): Promise<WebSearchResult[]> {
  const results: WebSearchResult[] = [];

  const searxInstances = instance ? [instance] : [
    "https://search.bus-hit.me",
    "https://search.projectsegfau.ltd",
    "https://searx.foss.family",
  ];

  for (const baseUrl of searxInstances) {
    try {
      const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json`;
      const response = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) continue;

      const data: any = await response.json();
      if (data.results && data.results.length > 0) {
        for (const r of data.results.slice(0, limit)) {
          results.push({
            title: r.title || "Untitled",
            url: r.url,
            snippet: r.content || r.snippet || ""
          });
        }
        if (results.length >= limit) break;
      }
    } catch {
      continue;
    }
  }

  return results;
}

/**
 * Combined search across multiple engines
 */
export async function webSearch(query: string, limit: number = 5): Promise<WebSearchResult[]> {
  let results = await searchDuckDuckGo(query, Math.min(limit, 10));
  if (results.length < limit) {
    const searxResults = await searchSearX(query, Math.min(limit, 10));
    results = [...results, ...searxResults].slice(0, limit);
  }
  return results;
}