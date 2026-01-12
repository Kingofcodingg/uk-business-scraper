// ============================================================================
// ARCHIVE.ORG SCRAPER
// Extract historical emails from Wayback Machine snapshots
// Old websites often had emails visible that are now hidden
// ============================================================================

import { EmailInfo } from './types';

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

interface ArchiveSnapshot {
  timestamp: string;
  url: string;
  statusCode: string;
}

interface ArchiveResult {
  url: string;
  timestamp: string;
  emails: string[];
  phones: string[];
}

/**
 * Get list of archived snapshots for a domain
 */
async function getArchiveSnapshots(domain: string): Promise<ArchiveSnapshot[]> {
  const snapshots: ArchiveSnapshot[] = [];

  try {
    // Wayback Machine CDX API
    const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}/*&output=json&filter=statuscode:200&collapse=urlkey&limit=50`;

    const response = await fetch(cdxUrl, {
      headers: HEADERS,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.log(`[Archive] CDX API failed: ${response.status}`);
      return snapshots;
    }

    const data = await response.json();

    // First row is headers: urlkey, timestamp, original, mimetype, statuscode, digest, length
    if (Array.isArray(data) && data.length > 1) {
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row.length >= 5) {
          snapshots.push({
            timestamp: row[1],
            url: row[2],
            statusCode: row[4],
          });
        }
      }
    }

  } catch (error) {
    console.log(`[Archive] CDX error:`, error);
  }

  return snapshots;
}

/**
 * Fetch archived page content
 */
async function fetchArchivedPage(timestamp: string, url: string): Promise<string | null> {
  try {
    // Wayback Machine URL format
    const archiveUrl = `https://web.archive.org/web/${timestamp}/${url}`;

    const response = await fetch(archiveUrl, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return null;
    }

    return await response.text();

  } catch {
    return null;
  }
}

/**
 * Extract emails from HTML content
 */
function extractEmailsFromHtml(html: string): string[] {
  const emails: string[] = [];
  const seen = new Set<string>();

  // Patterns to find emails
  const patterns = [
    // Standard email
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(?:co\.uk|com|org|net|uk|io)/gi,
    // Mailto links
    /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    // Obfuscated
    /(\w+)\s*\[\s*at\s*\]\s*(\w+)\s*\[\s*dot\s*\]\s*(\w+)/gi,
    /(\w+)\s*\(\s*at\s*\)\s*(\w+)\s*\(\s*dot\s*\)\s*(\w+)/gi,
  ];

  // Invalid patterns to skip
  const invalidPatterns = [
    /example\.com/i, /test\.com/i, /noreply/i, /no-reply/i,
    /wixpress/i, /sentry\.io/i, /cloudflare/i, /@w\.org/i,
    /@archive\.org/i, /web\.archive\.org/i,
  ];

  for (const pattern of patterns) {
    const matches = html.matchAll(pattern);
    for (const match of Array.from(matches)) {
      let email = '';

      // Handle different pattern captures
      if (match[1] && match[2] && match[3]) {
        // Obfuscated pattern
        email = `${match[1]}@${match[2]}.${match[3]}`.toLowerCase();
      } else if (match[1]) {
        email = match[1].toLowerCase();
      } else {
        email = match[0].toLowerCase();
      }

      if (!email.includes('@')) continue;
      if (seen.has(email)) continue;
      if (invalidPatterns.some(p => p.test(email))) continue;
      if (email.length < 6 || email.length > 100) continue;

      seen.add(email);
      emails.push(email);
    }
  }

  return emails;
}

/**
 * Extract phone numbers from HTML
 */
function extractPhonesFromHtml(html: string): string[] {
  const phones: string[] = [];
  const seen = new Set<string>();

  const patterns = [
    /(?:0|\+44)(?:\d\s?){9,10}/g,
    /\b07\d{3}\s?\d{6}\b/g,
    /\b0800\s?\d{3}\s?\d{4}\b/g,
    /\b0[1-9]\d{2,4}[-\s]?\d{3,4}[-\s]?\d{3,4}\b/g,
  ];

  for (const pattern of patterns) {
    const matches = html.match(pattern);
    if (matches) {
      for (const phone of matches) {
        const digits = phone.replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 12 && !seen.has(digits)) {
          seen.add(digits);
          phones.push(phone.trim());
        }
      }
    }
  }

  return phones;
}

/**
 * Pages most likely to contain contact information
 */
const TARGET_PAGES = [
  '/contact',
  '/contact-us',
  '/about',
  '/about-us',
  '/team',
  '/privacy',
  '/terms',
  '',  // Homepage
];

/**
 * Scrape Wayback Machine for historical emails
 */
export async function scrapeWaybackMachine(
  domain: string,
  maxSnapshots: number = 5
): Promise<ArchiveResult[]> {
  const results: ArchiveResult[] = [];

  console.log(`[Archive] Searching Wayback Machine for: ${domain}`);

  // Get available snapshots
  const snapshots = await getArchiveSnapshots(domain);

  if (snapshots.length === 0) {
    console.log(`[Archive] No snapshots found for ${domain}`);
    return results;
  }

  console.log(`[Archive] Found ${snapshots.length} total snapshots`);

  // Filter for contact/about pages
  const targetSnapshots = snapshots.filter(s => {
    const url = s.url.toLowerCase();
    return TARGET_PAGES.some(page => url.endsWith(page) || url.includes(page + '.'));
  });

  // Sort by timestamp (newest first) and take limited number
  targetSnapshots.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const toProcess = targetSnapshots.slice(0, maxSnapshots);

  // If no target pages found, use any pages
  if (toProcess.length === 0) {
    const anySnapshots = snapshots.slice(0, maxSnapshots);
    toProcess.push(...anySnapshots);
  }

  console.log(`[Archive] Processing ${toProcess.length} snapshots`);

  for (const snapshot of toProcess) {
    try {
      const html = await fetchArchivedPage(snapshot.timestamp, snapshot.url);

      if (html) {
        const emails = extractEmailsFromHtml(html);
        const phones = extractPhonesFromHtml(html);

        if (emails.length > 0 || phones.length > 0) {
          results.push({
            url: snapshot.url,
            timestamp: snapshot.timestamp,
            emails,
            phones,
          });

          console.log(`[Archive] Found ${emails.length} emails from ${snapshot.timestamp}`);
        }
      }

      // Delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.log(`[Archive] Snapshot error:`, error);
    }
  }

  return results;
}

/**
 * Convert archive results to EmailInfo format
 */
export function archiveResultsToEmails(results: ArchiveResult[]): EmailInfo[] {
  const emails: EmailInfo[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    for (const email of result.emails) {
      if (seen.has(email)) continue;
      seen.add(email);

      // Categorize email
      const localPart = email.split('@')[0].toLowerCase();
      const genericPrefixes = [
        'info', 'contact', 'hello', 'enquiries', 'sales', 'support',
        'admin', 'office', 'mail', 'help', 'general', 'reception',
      ];

      const type = genericPrefixes.some(p =>
        localPart === p || localPart.startsWith(p + '.')
      ) ? 'generic' : 'personal';

      emails.push({
        address: email,
        type,
        source: 'archive',
        verified: false,
        confidence: 'low', // Historical data, may be outdated
      });
    }
  }

  return emails;
}
