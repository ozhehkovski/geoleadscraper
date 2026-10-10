/**
 * In-browser native contact scraper (standalone client-side crawler).
 * Visited via fetch from the Chrome Service Worker.
 * No external backend, Node.js or Puppeteer required!
 */

export const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,24}/g;
export const FILE_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|css|js|woff2?|ttf|ico)$/i;
export const EXCLUDED_DOMAINS = ['sentry', 'sentry.io', 'domain.com', 'example.com', 'email.com', 'wixpress.com'];

export const PRIORITY_LOCALPARTS = [
  'info',
  'contact',
  'contacts',
  'hello',
  'support',
  'office',
  'sales',
  'admin',
  'mail',
  // Multilingual equivalents (DE, ES, IT, FR, TR, PL, etc.)
  'kontakt',
  'contacto',
  'contatti',
  'kontakty',
  'iletisim',
  'satis',
  'ofis',
  'destek',
  'merhaba',
];

export const CONTACT_LINK_RE =
  /(?:contact|contacts|kontakt|contacto|contactos|contatti|kontakty|contactez-nous|iletisim|iletişim|bize-ulasin|bize-ulaşın|about|uber-uns|über-uns|hakkimizda|hakkımızda|impressum|mentions-legales)/i;

export const SOCIAL_DOMAINS = [
  'facebook.com',
  'fb.com',
  'instagram.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'pinterest.com',
];

export interface IExtractedContact {
  url: string;
  email?: string;
  emails: string[];
  phones: string[];
  socials: string[];
  _exec?: number;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '').replace(/^mailto:/, '');
}

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&#64;|&commat;|&#x40;/gi, '@')
    .replace(/&#46;|&#x2e;/gi, '.')
    .replace(/&nbsp;/gi, ' ');
}

/**
 * Safe deobfuscation: only targets patterns that clearly look like obfuscated email addresses
 * (e.g. "info [at] example [dot] com"), preventing false positives like "open at 9 dot 30".
 */
export function deobfuscate(text: string): string {
  // 1. Bracketed forms: [at], (at), {at} paired with literal dot, bracketed dot, or word dot
  let result = text.replace(
    /\b([a-zA-Z0-9._%+-]+)\s*(?:\[at\]|\(at\)|\{at\})\s*([a-zA-Z0-9.-]+)\s*(?:\.|\(dot\)|\[dot\]|\{dot\}|\bdot\b)\s*([a-zA-Z]{2,24})\b/gi,
    '$1@$2.$3',
  );

  // 2. Bare-word "at": only valid if paired with word-form/bracketed "dot", never with a literal dot
  result = result.replace(
    /\b([a-zA-Z0-9._%+-]+)\s+\bat\b\s+([a-zA-Z0-9.-]+)\s+(?:\(dot\)|\[dot\]|\{dot\}|\bdot\b)\s+([a-zA-Z]{2,24})\b/gi,
    '$1@$2.$3',
  );

  return result;
}

export function isValidEmail(email: string): boolean {
  if (!email.includes('@')) return false;
  const [local, domain] = email.split('@');
  if (!local || !domain) return false;
  if (!domain.includes('.')) return false;
  if (FILE_EXTENSIONS.test(email)) return false;
  if (/\.\./.test(email)) return false;
  if (email.startsWith('.') || local.endsWith('.')) return false;
  if (EXCLUDED_DOMAINS.some(d => domain.includes(d))) return false;
  return /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,24}$/.test(email);
}

export function bestEmail(emails: string[]): string | undefined {
  if (emails.length === 0) return undefined;
  for (const localpart of PRIORITY_LOCALPARTS) {
    const match = emails.find(e => e.split('@')[0] === localpart);
    if (match) return match;
  }
  return emails[0];
}

export function extractEmailsFromHtml(html: string): string[] {
  const candidates: string[] = [];

  // 1. mailto: links (highest reliability)
  const mailtoMatches = html.matchAll(/href=["']mailto:([^"'?]+)[^"']*["']/gi);
  for (const m of mailtoMatches) {
    if (m[1]) candidates.push(normalizeEmail(decodeURIComponent(m[1])));
  }

  // 2. JSON-LD blocks
  const jsonLdBlocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of jsonLdBlocks) {
    try {
      const parsed = JSON.parse(block[1]);
      const walk = (node: any) => {
        if (!node) return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (typeof node === 'object') {
          for (const [key, val] of Object.entries(node)) {
            if (key.toLowerCase() === 'email' && typeof val === 'string') {
              candidates.push(normalizeEmail(val));
            } else {
              walk(val);
            }
          }
        }
      };
      walk(parsed);
    } catch {
      // ignore invalid json
    }
  }

  // 3. Text emails (deobfuscated visible text only)
  const visibleText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const cleanText = deobfuscate(decodeHtmlEntities(visibleText));
  const textMatches = cleanText.match(EMAIL_RE) || [];
  for (const em of textMatches) {
    candidates.push(normalizeEmail(em));
  }

  // Deduplicate & filter
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const email of candidates) {
    if (!isValidEmail(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    valid.push(email);
  }

  return valid;
}

export function normalizePhone(raw: string): string {
  const clean = decodeURIComponent(raw).trim().replace(/^tel:/i, '').trim();
  const hasPlus = clean.startsWith('+');
  const digits = clean.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 16) return '';
  if (/^(\d)\1+$/.test(digits)) return '';
  return hasPlus ? `+${digits}` : digits;
}

export function extractPhonesFromHtml(html: string): string[] {
  const phones: string[] = [];

  // 1. tel: links (highest reliability)
  const telMatches = html.matchAll(/href=["']tel:([^"'\s]+)["']/gi);
  for (const m of telMatches) {
    const normalized = normalizePhone(m[1]);
    if (normalized && !phones.includes(normalized)) {
      phones.push(normalized);
    }
  }

  // 2. JSON-LD structured data (telephone)
  const jsonLdBlocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of jsonLdBlocks) {
    try {
      const parsed = JSON.parse(block[1]);
      const walk = (node: any) => {
        if (!node) return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (typeof node === 'object') {
          for (const [key, val] of Object.entries(node)) {
            if (key.toLowerCase() === 'telephone' && typeof val === 'string') {
              const normalized = normalizePhone(val);
              if (normalized && !phones.includes(normalized)) {
                phones.push(normalized);
              }
            } else {
              walk(val);
            }
          }
        }
      };
      walk(parsed);
    } catch {
      // ignore
    }
  }

  return Array.from(new Set(phones)).slice(0, 5);
}

export function extractSocialsFromHtml(html: string): string[] {
  const socials: string[] = [];
  const hrefMatches = html.matchAll(/href=["'](https?:\/\/[^"'\s>]+)["']/gi);

  for (const m of hrefMatches) {
    const link = m[1];
    try {
      const parsed = new URL(link);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      if (SOCIAL_DOMAINS.some(d => host === d || host.endsWith(`.${d}`))) {
        // Exclude share links
        if (!link.includes('/share') && !link.includes('/intent') && !link.includes('sharer.php')) {
          socials.push(link.replace(/\/$/, ''));
        }
      }
    } catch {
      // ignore invalid URLs
    }
  }

  return Array.from(new Set(socials)).slice(0, 10);
}

export function findContactPageUrl(baseUrl: string, html: string): string | null {
  try {
    const origin = new URL(baseUrl).origin;
    const aTags = html.matchAll(/<a[^>]*href=["']([^"'#\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi);

    for (const tag of aTags) {
      const href = tag[1].trim();
      const text = tag[2].trim();

      if (CONTACT_LINK_RE.test(href) || CONTACT_LINK_RE.test(text)) {
        try {
          const resolved = new URL(href, baseUrl);
          // Only stay within the same domain
          if (resolved.origin === origin && resolved.href !== baseUrl) {
            return resolved.href;
          }
        } catch {
          // ignore invalid relative url
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function fetchWithTimeout(url: string, timeoutMs = 6000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return '';
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.includes('text/') && !contentType.includes('xml')) {
      return '';
    }
    return await response.text();
  } catch {
    clearTimeout(timer);
    return '';
  }
}

export async function crawlWebsite(rawUrl: string): Promise<IExtractedContact> {
  const startTime = Date.now();
  try {
    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    let html = await fetchWithTimeout(url, 6000);

    // If first attempt failed, attempt alternate protocol fallback (https <-> http)
    if (!html) {
      const altUrl = url.startsWith('https://')
        ? url.replace(/^https:\/\//i, 'http://')
        : url.replace(/^http:\/\//i, 'https://');
      html = await fetchWithTimeout(altUrl, 3500);
    }

    if (!html) {
      return {
        url: rawUrl,
        emails: [],
        phones: [],
        socials: [],
        _exec: Date.now() - startTime,
      };
    }

    let emails = extractEmailsFromHtml(html);
    const phones = extractPhonesFromHtml(html);
    const socials = extractSocialsFromHtml(html);

    // If no email found on homepage, crawl contact page if present
    if (emails.length === 0) {
      const contactUrl = findContactPageUrl(url, html);
      if (contactUrl) {
        const contactHtml = await fetchWithTimeout(contactUrl, 3500);
        if (contactHtml) {
          const contactEmails = extractEmailsFromHtml(contactHtml);
          const contactPhones = extractPhonesFromHtml(contactHtml);
          emails = Array.from(new Set([...emails, ...contactEmails]));
          for (const p of contactPhones) {
            if (!phones.includes(p)) phones.push(p);
          }
        }
      }
    }

    return {
      url: rawUrl,
      email: bestEmail(emails),
      emails,
      phones,
      socials,
      _exec: Date.now() - startTime,
    };
  } catch {
    return {
      url: rawUrl,
      emails: [],
      phones: [],
      socials: [],
      _exec: Date.now() - startTime,
    };
  }
}

/**
 * Concurrency worker pool: crawls multiple URLs concurrently with a maximum parallel limit.
 */
export async function crawlWebsitesConcurrently(
  urls: string[],
  concurrency = 8,
): Promise<{ data: IExtractedContact[]; results: number }> {
  const results: IExtractedContact[] = new Array(urls.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (cursor < urls.length) {
      const index = cursor++;
      try {
        results[index] = await crawlWebsite(urls[index]);
      } catch {
        results[index] = {
          url: urls[index],
          emails: [],
          phones: [],
          socials: [],
          _exec: 0,
        };
      }
    }
  });

  await Promise.all(workers);

  return {
    data: results,
    results: results.length,
  };
}
