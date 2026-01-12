// ============================================================================
// GOOGLE DORKING MODULE
// Advanced email discovery through Google search operators
// ============================================================================

import { EmailInfo } from './types';

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
};

interface DorkResult {
  url: string;
  title: string;
  snippet: string;
  emails: string[];
  source: 'google-dork';
}

/**
 * Generate Google dork queries for finding emails
 */
export function generateDorkQueries(domain: string, companyName: string): string[] {
  const queries = [
    // Direct email searches
    `"@${domain}"`,
    `"@${domain}" contact`,
    `"@${domain}" email`,
    `site:${domain} email`,
    `site:${domain} "@${domain}"`,
    `site:${domain} contact`,

    // Company name searches
    `"${companyName}" "@${domain}"`,
    `"${companyName}" email contact`,

    // File type searches (PDFs, docs often have emails)
    `filetype:pdf site:${domain}`,
    `filetype:pdf "${companyName}" email`,
    `filetype:pdf "${companyName}" "@"`,

    // Press releases / news (often have contact emails)
    `"${companyName}" press release contact`,
    `"${companyName}" news "@${domain}"`,

    // Job postings (often have HR emails)
    `"${companyName}" careers email`,
    `"${companyName}" jobs contact`,
    `site:indeed.com "${companyName}"`,
    `site:glassdoor.com "${companyName}"`,
    `site:reed.co.uk "${companyName}"`,

    // Industry directories
    `"${companyName}" directory email`,
    `"${companyName}" listing contact`,

    // Social media
    `site:twitter.com "${companyName}" email`,

    // UK specific searches
    `"${companyName}" UK contact email`,
  ];

  return queries;
}

/**
 * Extract emails from text/snippet
 */
function extractEmailsFromText(text: string): string[] {
  const emails: string[] = [];
  const seen = new Set<string>();

  // Standard email pattern
  const pattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
  const matches = text.match(pattern);

  if (matches) {
    for (const email of matches) {
      const lower = email.toLowerCase();
      // Skip invalid emails
      if (
        !seen.has(lower) &&
        !lower.includes('example.com') &&
        !lower.includes('test.com') &&
        !lower.includes('noreply') &&
        !lower.includes('sentry.io') &&
        !lower.includes('.png') &&
        !lower.includes('.jpg')
      ) {
        seen.add(lower);
        emails.push(lower);
      }
    }
  }

  return emails;
}

/**
 * Scrape Google search results for a query
 */
async function scrapeGoogleSearch(query: string): Promise<DorkResult[]> {
  const results: DorkResult[] = [];

  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log(`[GoogleDork] Search failed: ${response.status}`);
      return results;
    }

    const html = await response.text();

    // Extract search result snippets
    // Google wraps snippets in various ways, try multiple patterns
    const snippetPatterns = [
      /<div class="[^"]*VwiC3b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      /<span class="[^"]*st[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
      /data-content-feature="1"[^>]*>([\s\S]*?)<\/div>/gi,
    ];

    for (const pattern of snippetPatterns) {
      const matches = html.matchAll(pattern);
      for (const match of Array.from(matches)) {
        const snippet = match[1]
          .replace(/<[^>]*>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();

        const emails = extractEmailsFromText(snippet);
        if (emails.length > 0) {
          results.push({
            url: '',
            title: '',
            snippet,
            emails,
            source: 'google-dork',
          });
        }
      }
    }

    // Also search the entire response for emails
    const pageEmails = extractEmailsFromText(html);
    if (pageEmails.length > 0) {
      results.push({
        url: query,
        title: 'Full page scan',
        snippet: '',
        emails: pageEmails,
        source: 'google-dork',
      });
    }

  } catch (error) {
    console.log(`[GoogleDork] Search error:`, error);
  }

  return results;
}

/**
 * Run Google dork queries to find emails
 */
export async function runGoogleDorks(
  domain: string,
  companyName: string,
  maxQueries: number = 3
): Promise<EmailInfo[]> {
  const allEmails: EmailInfo[] = [];
  const seenEmails = new Set<string>();

  const queries = generateDorkQueries(domain, companyName);
  console.log(`[GoogleDork] Running ${Math.min(maxQueries, queries.length)} queries for ${domain}`);

  // Only run first few queries to avoid rate limiting
  for (const query of queries.slice(0, maxQueries)) {
    try {
      const results = await scrapeGoogleSearch(query);

      for (const result of results) {
        for (const email of result.emails) {
          if (!seenEmails.has(email)) {
            seenEmails.add(email);

            // Categorize the email
            const localPart = email.split('@')[0].toLowerCase();
            const genericPrefixes = [
              'info', 'contact', 'hello', 'enquiries', 'sales', 'support',
              'admin', 'office', 'mail', 'help', 'general', 'reception',
            ];

            const type = genericPrefixes.some(p =>
              localPart === p || localPart.startsWith(p + '.')
            ) ? 'generic' : 'personal';

            allEmails.push({
              address: email,
              type,
              source: 'google-dork',
              verified: false,
              confidence: 'medium',
            });
          }
        }
      }

      // Delay between queries to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.log(`[GoogleDork] Query error:`, error);
    }
  }

  console.log(`[GoogleDork] Found ${allEmails.length} emails from dork queries`);
  return allEmails;
}

/**
 * Search for company information via Google
 */
export async function searchCompanyInfo(
  companyName: string,
  location?: string
): Promise<{
  website?: string;
  emails: string[];
  phone?: string;
}> {
  const result = {
    website: undefined as string | undefined,
    emails: [] as string[],
    phone: undefined as string | undefined,
  };

  try {
    const query = location
      ? `"${companyName}" ${location} contact`
      : `"${companyName}" UK contact`;

    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return result;

    const html = await response.text();

    // Extract emails
    result.emails = extractEmailsFromText(html);

    // Extract UK phone numbers
    const phonePattern = /(?:0|\+44)(?:\d\s?){9,10}/g;
    const phones = html.match(phonePattern);
    if (phones && phones.length > 0) {
      result.phone = phones[0].replace(/\s/g, '');
    }

    // Try to find website URL
    const urlPattern = /href="\/url\?q=(https?:\/\/(?!www\.google|maps\.google|support\.google)[^&"]+)/gi;
    const urlMatches = html.matchAll(urlPattern);

    const skipDomains = [
      'facebook.com', 'linkedin.com', 'twitter.com', 'instagram.com',
      'youtube.com', 'yelp.com', 'yell.com', 'tripadvisor.com', 'trustpilot.com',
      'wikipedia.org', 'gov.uk',
    ];

    for (const match of Array.from(urlMatches)) {
      const candidateUrl = decodeURIComponent(match[1]).split('&')[0];
      if (!skipDomains.some(d => candidateUrl.includes(d))) {
        result.website = candidateUrl;
        break;
      }
    }

  } catch (error) {
    console.log(`[GoogleDork] Company search error:`, error);
  }

  return result;
}

// ============================================================================
// BING SEARCH (Less Restrictive than Google)
// ============================================================================

/**
 * Search Bing for emails and LinkedIn profiles (less restrictive than Google)
 */
export async function searchBing(
  query: string
): Promise<{ emails: string[]; linkedinUrls: string[]; snippets: string[] }> {
  const result = {
    emails: [] as string[],
    linkedinUrls: [] as string[],
    snippets: [] as string[],
  };

  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=20`;
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log(`[Bing] Search failed: ${response.status}`);
      return result;
    }

    const html = await response.text();

    // Extract emails from entire page
    result.emails = extractEmailsFromText(html);

    // Extract LinkedIn URLs
    const linkedinPattern = /https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[\w-]+/gi;
    const linkedinMatches = html.match(linkedinPattern);
    if (linkedinMatches) {
      result.linkedinUrls = [...new Set(linkedinMatches)];
    }

    // Extract snippets from Bing results
    const snippetPatterns = [
      /<p class="b_algoSlug"[^>]*>([\s\S]*?)<\/p>/gi,
      /<div class="b_caption"[^>]*>([\s\S]*?)<\/div>/gi,
    ];

    for (const pattern of snippetPatterns) {
      const matches = html.matchAll(pattern);
      for (const match of Array.from(matches)) {
        const snippet = match[1]
          .replace(/<[^>]*>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ')
          .trim();
        if (snippet.length > 20) {
          result.snippets.push(snippet);
        }
      }
    }

  } catch (error) {
    console.log(`[Bing] Search error:`, error);
  }

  return result;
}

/**
 * Search Bing for LinkedIn profiles for a company
 */
export async function searchBingForLinkedIn(
  companyName: string,
  location?: string
): Promise<string[]> {
  const profiles: string[] = [];

  const queries = [
    `site:linkedin.com/in "${companyName}" director`,
    `site:linkedin.com/in "${companyName}" owner`,
    `site:linkedin.com/in "${companyName}" founder`,
    `site:linkedin.com/in "${companyName}" managing director`,
    `site:linkedin.com/in "${companyName}" CEO`,
    `site:linkedin.com/company "${companyName}"`,
    ...(location ? [`site:linkedin.com/in "${companyName}" "${location}"`] : []),
  ];

  // Run first 3 queries
  for (const query of queries.slice(0, 3)) {
    try {
      const result = await searchBing(query);
      profiles.push(...result.linkedinUrls);

      // Delay between queries
      await new Promise(resolve => setTimeout(resolve, 300));

    } catch (error) {
      console.log(`[Bing] LinkedIn search error:`, error);
    }
  }

  return [...new Set(profiles)]; // Deduplicate
}

/**
 * Search Bing for company emails
 */
export async function searchBingForEmails(
  domain: string,
  companyName: string
): Promise<EmailInfo[]> {
  const emails: EmailInfo[] = [];
  const seen = new Set<string>();

  const queries = [
    `"@${domain}"`,
    `"${companyName}" email contact`,
    `site:${domain} email`,
  ];

  for (const query of queries.slice(0, 2)) {
    try {
      const result = await searchBing(query);

      for (const email of result.emails) {
        if (seen.has(email)) continue;
        seen.add(email);

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
          source: 'google-dork', // Using same source type
          verified: false,
          confidence: 'medium',
        });
      }

      await new Promise(resolve => setTimeout(resolve, 300));

    } catch (error) {
      console.log(`[Bing] Email search error:`, error);
    }
  }

  console.log(`[Bing] Found ${emails.length} emails`);
  return emails;
}

/**
 * Combined search using both Google and Bing
 */
export async function combinedSearch(
  domain: string,
  companyName: string
): Promise<{
  emails: EmailInfo[];
  linkedinUrls: string[];
}> {
  const allEmails: EmailInfo[] = [];
  const allLinkedIn: string[] = [];
  const seenEmails = new Set<string>();

  console.log(`[CombinedSearch] Searching Google and Bing for ${companyName}`);

  // Google search
  try {
    const googleEmails = await runGoogleDorks(domain, companyName, 2);
    for (const email of googleEmails) {
      if (!seenEmails.has(email.address)) {
        seenEmails.add(email.address);
        allEmails.push(email);
      }
    }
  } catch (error) {
    console.log(`[CombinedSearch] Google error:`, error);
  }

  // Bing search (less restrictive)
  try {
    const bingEmails = await searchBingForEmails(domain, companyName);
    for (const email of bingEmails) {
      if (!seenEmails.has(email.address)) {
        seenEmails.add(email.address);
        allEmails.push(email);
      }
    }

    const bingLinkedIn = await searchBingForLinkedIn(companyName);
    allLinkedIn.push(...bingLinkedIn);
  } catch (error) {
    console.log(`[CombinedSearch] Bing error:`, error);
  }

  return {
    emails: allEmails,
    linkedinUrls: [...new Set(allLinkedIn)],
  };
}

// UK phone number patterns
const UK_PHONE_PATTERNS = [
  // Mobile: 07xxx xxx xxx
  /\b(07\d{3}[\s.-]?\d{3}[\s.-]?\d{3})\b/g,
  // UK landlines with area codes
  /\b(0[1-9]\d{2,4}[\s.-]?\d{3}[\s.-]?\d{3,4})\b/g,
  // Freephone
  /\b(0800[\s.-]?\d{3}[\s.-]?\d{4})\b/g,
  /\b(0808[\s.-]?\d{3}[\s.-]?\d{4})\b/g,
  // +44 format
  /\b(\+44[\s.-]?\(?0?\)?[\s.-]?[1-9]\d{2,4}[\s.-]?\d{3}[\s.-]?\d{3,4})\b/g,
];

/**
 * Extract UK phone numbers from text
 */
function extractPhonesFromText(text: string): string[] {
  const phones: string[] = [];
  const seen = new Set<string>();

  for (const pattern of UK_PHONE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        // Normalize phone number
        const normalized = match.replace(/[\s.-]/g, '');

        // Validate length (UK numbers are 10-11 digits after 0 or +44)
        const digitsOnly = normalized.replace(/\D/g, '');
        if (digitsOnly.length >= 10 && digitsOnly.length <= 13) {
          if (!seen.has(normalized)) {
            seen.add(normalized);
            phones.push(match.trim());
          }
        }
      }
    }
  }

  return phones;
}

export interface DirectContactResult {
  emails: EmailInfo[];
  phones: Array<{
    number: string;
    type: 'mobile' | 'landline' | 'freephone';
    source: string;
  }>;
  website?: string;
}

/**
 * Search Bing directly for business contact details (when no website found)
 * This is useful for businesses without websites but listed in directories
 */
export async function searchDirectContacts(
  companyName: string,
  location?: string
): Promise<DirectContactResult> {
  const result: DirectContactResult = {
    emails: [],
    phones: [],
  };

  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  console.log(`[DirectSearch] Searching for contacts: ${companyName}`);

  // Search queries targeting contact info
  const queries = [
    `"${companyName}" ${location || 'UK'} phone email contact`,
    `"${companyName}" ${location || 'UK'} telephone`,
    `"${companyName}" contact number email`,
  ];

  for (const query of queries.slice(0, 2)) {
    try {
      const searchResult = await searchBing(query);

      // Extract emails
      for (const email of searchResult.emails) {
        if (!seenEmails.has(email)) {
          seenEmails.add(email);

          const localPart = email.split('@')[0].toLowerCase();
          const genericPrefixes = [
            'info', 'contact', 'hello', 'enquiries', 'sales', 'support',
            'admin', 'office', 'mail', 'help', 'general', 'reception',
          ];

          const type = genericPrefixes.some(p =>
            localPart === p || localPart.startsWith(p + '.')
          ) ? 'generic' : 'personal';

          result.emails.push({
            address: email,
            type,
            source: 'bing-search',
            verified: false,
            confidence: 'medium',
          });
        }
      }

      // Extract phones from snippets
      for (const snippet of searchResult.snippets) {
        const phones = extractPhonesFromText(snippet);
        for (const phone of phones) {
          const normalized = phone.replace(/[\s.-]/g, '');
          if (!seenPhones.has(normalized)) {
            seenPhones.add(normalized);

            let phoneType: 'mobile' | 'landline' | 'freephone' = 'landline';
            if (normalized.startsWith('07') || normalized.startsWith('+447')) {
              phoneType = 'mobile';
            } else if (normalized.startsWith('0800') || normalized.startsWith('0808')) {
              phoneType = 'freephone';
            }

            result.phones.push({
              number: phone,
              type: phoneType,
              source: 'bing-search',
            });
          }
        }
      }

      // Also search the raw HTML for phones
      const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=15`;
      const response = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const html = await response.text();
        const htmlPhones = extractPhonesFromText(html);

        for (const phone of htmlPhones) {
          const normalized = phone.replace(/[\s.-]/g, '');
          if (!seenPhones.has(normalized)) {
            seenPhones.add(normalized);

            let phoneType: 'mobile' | 'landline' | 'freephone' = 'landline';
            if (normalized.startsWith('07') || normalized.startsWith('+447')) {
              phoneType = 'mobile';
            } else if (normalized.startsWith('0800') || normalized.startsWith('0808')) {
              phoneType = 'freephone';
            }

            result.phones.push({
              number: phone,
              type: phoneType,
              source: 'bing-search',
            });
          }
        }

        // Try to find a website URL in results
        if (!result.website) {
          const urlPattern = /href="(https?:\/\/(?!www\.bing|www\.microsoft|www\.google|linkedin\.com|facebook\.com|twitter\.com|yell\.com|checkatrade\.com)[^"]+)"/gi;
          const urlMatches = html.matchAll(urlPattern);

          const companyWords = companyName.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2 && !['the', 'and', 'ltd', 'limited'].includes(w));

          for (const match of Array.from(urlMatches).slice(0, 20)) {
            const candidateUrl = match[1].split('?')[0];
            const urlLower = candidateUrl.toLowerCase();

            // Check if URL contains company name words
            const matchingWords = companyWords.filter(word => urlLower.includes(word));
            if (matchingWords.length >= Math.min(2, companyWords.length)) {
              if (candidateUrl.match(/\.(co\.uk|uk|com|org|net)\/?$/i)) {
                result.website = candidateUrl;
                console.log(`[DirectSearch] Found website: ${candidateUrl}`);
                break;
              }
            }
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 300));

    } catch (error) {
      console.log(`[DirectSearch] Error:`, error);
    }
  }

  console.log(`[DirectSearch] Found ${result.emails.length} emails, ${result.phones.length} phones`);
  return result;
}
