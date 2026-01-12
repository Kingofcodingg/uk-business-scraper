// ============================================================================
// WHOIS DATA EXTRACTION MODULE
// Extract registrant/contact info from domain WHOIS records
// ============================================================================

import { EmailInfo } from './types';

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
};

export interface WhoisData {
  domain: string;
  registrar?: string;
  creationDate?: string;
  expirationDate?: string;
  updatedDate?: string;
  registrantName?: string;
  registrantOrg?: string;
  registrantEmail?: string;
  registrantPhone?: string;
  registrantAddress?: string;
  registrantCity?: string;
  registrantPostcode?: string;
  registrantCountry?: string;
  adminName?: string;
  adminEmail?: string;
  adminPhone?: string;
  techName?: string;
  techEmail?: string;
  techPhone?: string;
  nameServers?: string[];
  status?: string[];
  dnssec?: string;
  emails: string[];
  phones: string[];
  rawText?: string;
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  return url
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .split('/')[0]
    .split(':')[0]
    .toLowerCase();
}

/**
 * Query WHOIS via public API (who-dat.as93.net - free, no auth needed)
 */
async function queryWhoisApi(domain: string): Promise<WhoisData | null> {
  try {
    // Using who-dat.as93.net - free public WHOIS API
    const url = `https://who-dat.as93.net/${encodeURIComponent(domain)}`;

    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log(`[WHOIS] API failed: ${response.status}`);
      return null;
    }

    const data = await response.json();

    return parseWhoisApiResponse(domain, data);
  } catch (error) {
    console.log(`[WHOIS] API error:`, error);
    return null;
  }
}

/**
 * Parse WHOIS API response into our format
 */
function parseWhoisApiResponse(domain: string, data: Record<string, unknown>): WhoisData {
  const result: WhoisData = {
    domain,
    emails: [],
    phones: [],
  };

  // Extract registrar info
  if (data.registrar) {
    const registrar = data.registrar as Record<string, unknown>;
    result.registrar = registrar.name as string | undefined;
  }

  // Extract dates
  if (data.domain) {
    const domainInfo = data.domain as Record<string, unknown>;
    result.creationDate = domainInfo.created_date as string | undefined;
    result.expirationDate = domainInfo.expiration_date as string | undefined;
    result.updatedDate = domainInfo.updated_date as string | undefined;
    result.status = domainInfo.status as string[] | undefined;
    result.nameServers = domainInfo.name_servers as string[] | undefined;
  }

  // Extract registrant info
  if (data.registrant) {
    const registrant = data.registrant as Record<string, unknown>;
    result.registrantName = registrant.name as string | undefined;
    result.registrantOrg = registrant.organization as string | undefined;
    result.registrantEmail = registrant.email as string | undefined;
    result.registrantPhone = registrant.phone as string | undefined;
    result.registrantAddress = registrant.street as string | undefined;
    result.registrantCity = registrant.city as string | undefined;
    result.registrantPostcode = registrant.postal_code as string | undefined;
    result.registrantCountry = registrant.country as string | undefined;

    if (result.registrantEmail && isValidEmail(result.registrantEmail)) {
      result.emails.push(result.registrantEmail);
    }
    if (result.registrantPhone) {
      result.phones.push(result.registrantPhone);
    }
  }

  // Extract admin contact
  if (data.administrative) {
    const admin = data.administrative as Record<string, unknown>;
    result.adminName = admin.name as string | undefined;
    result.adminEmail = admin.email as string | undefined;
    result.adminPhone = admin.phone as string | undefined;

    if (result.adminEmail && isValidEmail(result.adminEmail) && !result.emails.includes(result.adminEmail)) {
      result.emails.push(result.adminEmail);
    }
    if (result.adminPhone && !result.phones.includes(result.adminPhone)) {
      result.phones.push(result.adminPhone);
    }
  }

  // Extract tech contact
  if (data.technical) {
    const tech = data.technical as Record<string, unknown>;
    result.techName = tech.name as string | undefined;
    result.techEmail = tech.email as string | undefined;
    result.techPhone = tech.phone as string | undefined;

    if (result.techEmail && isValidEmail(result.techEmail) && !result.emails.includes(result.techEmail)) {
      result.emails.push(result.techEmail);
    }
    if (result.techPhone && !result.phones.includes(result.techPhone)) {
      result.phones.push(result.techPhone);
    }
  }

  return result;
}

/**
 * Fallback: Scrape WHOIS from web-based lookup services
 */
async function scrapeWhoisWeb(domain: string): Promise<WhoisData | null> {
  const result: WhoisData = {
    domain,
    emails: [],
    phones: [],
  };

  try {
    // Try who.is lookup
    const url = `https://who.is/whois/${encodeURIComponent(domain)}`;

    const response = await fetch(url, {
      headers: {
        ...HEADERS,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    result.rawText = html;

    // Extract from raw WHOIS block
    const rawBlockMatch = html.match(/<pre[^>]*class="[^"]*df-raw[^"]*"[^>]*>([\s\S]*?)<\/pre>/i);
    if (rawBlockMatch) {
      const rawText = rawBlockMatch[1]
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');

      // Parse key fields from raw text
      result.registrar = extractField(rawText, ['Registrar:', 'Sponsoring Registrar:']);
      result.creationDate = extractField(rawText, ['Creation Date:', 'Created:', 'Registered:', 'Registration Date:']);
      result.expirationDate = extractField(rawText, ['Expiration Date:', 'Expires:', 'Registry Expiry Date:']);
      result.registrantName = extractField(rawText, ['Registrant Name:', 'Registrant:']);
      result.registrantOrg = extractField(rawText, ['Registrant Organization:', 'Registrant Organisation:']);
      result.registrantEmail = extractField(rawText, ['Registrant Email:', 'Registrant Contact Email:']);
      result.adminEmail = extractField(rawText, ['Admin Email:', 'Administrative Email:']);
      result.techEmail = extractField(rawText, ['Tech Email:', 'Technical Email:']);

      // Extract emails from raw text
      const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = rawText.match(emailPattern);
      if (emails) {
        for (const email of emails) {
          const lower = email.toLowerCase();
          if (isValidEmail(lower) && !result.emails.includes(lower)) {
            result.emails.push(lower);
          }
        }
      }

      // Extract UK phone numbers
      const phonePattern = /(?:0|\+44)[\d\s.-]{9,12}/g;
      const phones = rawText.match(phonePattern);
      if (phones) {
        for (const phone of phones) {
          const cleaned = phone.replace(/[\s.-]/g, '');
          if (!result.phones.includes(cleaned)) {
            result.phones.push(cleaned);
          }
        }
      }
    }

    return result;

  } catch (error) {
    console.log(`[WHOIS] Web scrape error:`, error);
    return null;
  }
}

/**
 * Extract a field value from raw WHOIS text
 */
function extractField(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*([^\\n]+)`, 'i');
    const match = text.match(pattern);
    if (match && match[1]) {
      const value = match[1].trim();
      if (value && value !== 'REDACTED' && value !== 'REDACTED FOR PRIVACY' &&
          !value.includes('GDPR') && !value.includes('protected')) {
        return value;
      }
    }
  }
  return undefined;
}

/**
 * Validate email address
 */
function isValidEmail(email: string): boolean {
  if (!email || email.length < 5) return false;

  const lower = email.toLowerCase();

  // Skip privacy/proxy emails
  const skipPatterns = [
    'privacy', 'proxy', 'whois', 'protect', 'redacted', 'gdpr',
    'abuse@', 'hostmaster@', 'postmaster@', 'noreply@', 'no-reply@',
    'example.com', 'test.com', 'domain.com', 'email.com',
    'contactprivacy', 'domainprivacy', 'privacyguard',
  ];

  if (skipPatterns.some(p => lower.includes(p))) {
    return false;
  }

  // Basic email pattern check
  const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return pattern.test(email);
}

/**
 * Main WHOIS lookup function
 */
export async function lookupWhois(websiteOrDomain: string): Promise<WhoisData | null> {
  const domain = extractDomain(websiteOrDomain);

  console.log(`[WHOIS] Looking up: ${domain}`);

  // Try API first (faster and more structured)
  let result = await queryWhoisApi(domain);

  // Fallback to web scraping if API fails
  if (!result || (result.emails.length === 0 && !result.registrantName)) {
    console.log(`[WHOIS] API returned no data, trying web scrape...`);
    const webResult = await scrapeWhoisWeb(domain);
    if (webResult) {
      result = webResult;
    }
  }

  if (result) {
    console.log(`[WHOIS] Found: ${result.emails.length} emails, registrant: ${result.registrantOrg || result.registrantName || 'Unknown'}`);
  }

  return result;
}

/**
 * Convert WHOIS data to EmailInfo format
 */
export function whoisToEmails(whoisData: WhoisData): EmailInfo[] {
  const emails: EmailInfo[] = [];

  for (const email of whoisData.emails) {
    emails.push({
      address: email.toLowerCase(),
      type: email.includes('admin') || email.includes('tech') ? 'generic' : 'personal',
      source: 'whois',
      verified: false,
      confidence: 'medium',
    });
  }

  return emails;
}

/**
 * Extract registrant info as a potential person
 */
export function whoisToPersonInfo(whoisData: WhoisData): {
  name?: string;
  organization?: string;
  email?: string;
  phone?: string;
  address?: string;
} | null {
  if (!whoisData.registrantName && !whoisData.registrantOrg) {
    return null;
  }

  return {
    name: whoisData.registrantName,
    organization: whoisData.registrantOrg,
    email: whoisData.registrantEmail,
    phone: whoisData.registrantPhone,
    address: [
      whoisData.registrantAddress,
      whoisData.registrantCity,
      whoisData.registrantPostcode,
      whoisData.registrantCountry,
    ].filter(Boolean).join(', ') || undefined,
  };
}

/**
 * Check domain age (useful for lead scoring)
 */
export function getDomainAge(whoisData: WhoisData): number | null {
  if (!whoisData.creationDate) return null;

  try {
    const created = new Date(whoisData.creationDate);
    const now = new Date();
    const years = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24 * 365);
    return Math.round(years * 10) / 10; // Round to 1 decimal
  } catch {
    return null;
  }
}

/**
 * Check if domain is expiring soon (useful for renewal marketing)
 */
export function isExpiringWithin(whoisData: WhoisData, months: number = 3): boolean {
  if (!whoisData.expirationDate) return false;

  try {
    const expires = new Date(whoisData.expirationDate);
    const now = new Date();
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + months);

    return expires > now && expires < futureDate;
  } catch {
    return false;
  }
}
