// ============================================================================
// ENHANCED WEBSITE CRAWLER
// Deep crawling for emails, phones, people, and social media
// ============================================================================

import { EmailInfo, PersonInfo, PhoneInfo, SocialMedia } from './types';
import { parseName } from './email-guesser';

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
};

// Comprehensive list of pages to crawl (from prompt spec)
const PAGES_TO_CRAWL = [
  // Standard pages
  '', // Homepage
  '/contact',
  '/contact-us',
  '/contactus',
  '/get-in-touch',
  '/reach-us',
  '/enquiries',
  '/about',
  '/about-us',
  '/aboutus',

  // Team/People pages (critical for finding decision makers)
  '/team',
  '/our-team',
  '/the-team',
  '/meet-the-team',
  '/staff',
  '/our-staff',
  '/people',
  '/our-people',
  '/leadership',
  '/management',
  '/directors',
  '/founders',
  '/who-we-are',
  '/about-us/team',
  '/about/team',
  '/about/our-team',
  '/company/team',

  // Legal pages (often have emails for compliance)
  '/privacy',
  '/privacy-policy',
  '/terms',
  '/terms-and-conditions',
  '/legal',
  '/disclaimer',
  '/gdpr',
  '/cookies',
  '/cookie-policy',
  '/data-protection',
  '/compliance',

  // Support/Help
  '/support',
  '/help',
  '/faq',
  '/customer-service',
  '/customer-support',
  '/helpdesk',

  // Business pages
  '/careers',
  '/jobs',
  '/work-with-us',
  '/join-us',
  '/press',
  '/media',
  '/news',
  '/blog',
  '/partners',
  '/affiliates',
  '/investors',

  // Service pages
  '/services',
  '/what-we-do',
  '/solutions',
  '/pricing',
  '/plans',
  '/packages',

  // Footer/Sitemap
  '/sitemap',
  '/site-map',
];

// Obfuscated email patterns (comprehensive)
const OBFUSCATED_PATTERNS = [
  /(\w+)\s*\[\s*at\s*\]\s*(\w+)\s*\[\s*dot\s*\]\s*(\w+)/gi,
  /(\w+)\s*\(\s*at\s*\)\s*(\w+)\s*\(\s*dot\s*\)\s*(\w+)/gi,
  /(\w+)\s*\{at\}\s*(\w+)\s*\{dot\}\s*(\w+)/gi,
  /(\w+)\s+at\s+(\w+)\s+dot\s+(\w+)/gi,
  /(\w+)\s*@\s*(\w+)\s*\.\s*(\w+)/gi, // Spaced out email
];

// Additional email extraction patterns
const ADVANCED_EMAIL_PATTERNS = {
  // Data attributes (common anti-scraping technique)
  dataEmail: /data-email=["']([^"']+)["']/gi,
  dataUser: /data-user=["']([^"']+)["'].*?data-domain=["']([^"']+)["']/gi,
  dataCfemail: /data-cfemail=["']([^"']+)["']/gi, // Cloudflare obfuscation

  // JavaScript variables
  jsEmail: /(?:email|mail|contact)\s*[=:]\s*["']([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})["']/gi,
  jsConcat: /["']([a-zA-Z0-9._%+-]+)["']\s*\+\s*["']@["']\s*\+\s*["']([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})["']/gi,

  // Schema.org structured data
  schemaEmail: /"email"\s*:\s*["']([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})["']/gi,

  // Contact schema
  contactPoint: /"contactType"\s*:\s*"[^"]+"\s*,\s*"email"\s*:\s*"([^"]+)"/gi,
};

// UK phone patterns
const UK_PHONE_PATTERNS = [
  // Tel links
  /href="tel:([^"]+)"/gi,
  // Mobile: 07xxx xxx xxx (11 digits)
  /\b(07\d{3}[\s.-]?\d{3}[\s.-]?\d{3})\b/g,
  // UK landlines: 01xxx xxxxxx, 02x xxxx xxxx
  /\b(0[1-9]\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4})\b/g,
  // Freephone: 0800, 0808
  /\b(0800[\s.-]?\d{3}[\s.-]?\d{4})\b/g,
  /\b(0808[\s.-]?\d{3}[\s.-]?\d{4})\b/g,
  // +44 format
  /\b(\+44[\s.-]?\(?0?\)?[\s.-]?[1-9]\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4})\b/g,
];

// Social media patterns (comprehensive)
const SOCIAL_PATTERNS = {
  linkedin: [
    /href="(https?:\/\/(?:www\.)?linkedin\.com\/company\/[^"?#]+)/gi,
    /href="(https?:\/\/(?:www\.)?linkedin\.com\/in\/[^"?#]+)/gi,
    /(https?:\/\/(?:www\.)?linkedin\.com\/company\/[\w-]+)/gi,
    /(https?:\/\/(?:www\.)?linkedin\.com\/in\/[\w-]+)/gi,
  ],
  facebook: [
    /href="(https?:\/\/(?:www\.)?facebook\.com\/(?!sharer|share|dialog)[^"?#]+)/gi,
    /href="(https?:\/\/(?:www\.)?fb\.com\/[^"?#]+)/gi,
    /(https?:\/\/(?:www\.)?facebook\.com\/[\w.-]+)/gi,
  ],
  twitter: [
    /href="(https?:\/\/(?:www\.)?twitter\.com\/(?!intent|share)[^"?#]+)/gi,
    /href="(https?:\/\/(?:www\.)?x\.com\/(?!intent|share)[^"?#]+)/gi,
    /(https?:\/\/(?:www\.)?twitter\.com\/[\w]+)/gi,
  ],
  instagram: [
    /href="(https?:\/\/(?:www\.)?instagram\.com\/[^"?#]+)/gi,
    /(https?:\/\/(?:www\.)?instagram\.com\/[\w.-]+)/gi,
  ],
  youtube: [
    /href="(https?:\/\/(?:www\.)?youtube\.com\/(?:channel|c|user|@)[^"?#]+)/gi,
    /(https?:\/\/(?:www\.)?youtube\.com\/(?:channel|c|user|@)[\w-]+)/gi,
  ],
  tiktok: [
    /href="(https?:\/\/(?:www\.)?tiktok\.com\/@[^"?#]+)/gi,
    /(https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+)/gi,
  ],
  pinterest: [
    /href="(https?:\/\/(?:www\.)?pinterest\.(?:com|co\.uk)\/[^"?#]+)/gi,
    /(https?:\/\/(?:www\.)?pinterest\.(?:com|co\.uk)\/[\w]+)/gi,
  ],
};

interface CrawlResult {
  emails: EmailInfo[];
  phones: PhoneInfo[];
  people: PersonInfo[];
  socialMedia: SocialMedia;
  description: string;
  address: string;
  postcode: string;
  openingHours?: string;
  services: string[];
  linkedinProfiles: string[];
  teamPageFound: boolean;
}

/**
 * Clean text by removing HTML and normalizing whitespace
 */
function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Decode Cloudflare email protection
 */
function decodeCfEmail(encoded: string): string | null {
  try {
    const r = parseInt(encoded.substr(0, 2), 16);
    let email = '';
    for (let i = 2; i < encoded.length; i += 2) {
      const c = parseInt(encoded.substr(i, 2), 16) ^ r;
      email += String.fromCharCode(c);
    }
    return email;
  } catch {
    return null;
  }
}

/**
 * Extract emails from HTML with comprehensive deobfuscation
 */
function extractEmails(html: string, pageName: string): EmailInfo[] {
  const emails: EmailInfo[] = [];
  const seen = new Set<string>();

  // Invalid patterns to skip
  const invalidPatterns = [
    /example\.com/i, /test\.com/i, /noreply/i, /no-reply/i,
    /wixpress/i, /sentry\.io/i, /cloudflare/i, /@w\.org/i,
    /@schema\.org/i, /@sentry/i, /\.png$/i, /\.jpg$/i, /\.gif$/i,
    /placeholder/i, /yourname/i, /youremail/i, /user@/i,
  ];

  type EmailSource = EmailInfo['source'];

  const addEmail = (email: string, source: EmailSource, confidence: 'high' | 'medium' | 'low' = 'high') => {
    email = email.toLowerCase().trim();
    if (!email.includes('@') || seen.has(email)) return;
    if (invalidPatterns.some(p => p.test(email))) return;
    if (email.length < 6 || email.length > 100) return;

    seen.add(email);
    emails.push({
      address: email,
      type: categorizeEmail(email),
      source,
      verified: false,
      confidence,
    });
  };

  // 1. Mailto links (most reliable)
  const mailtoPattern = /href="mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?:\?[^"]*)?"[^>]*>/gi;
  for (const match of Array.from(html.matchAll(mailtoPattern))) {
    addEmail(match[1], 'mailto', 'high');
  }

  // 2. Standard email patterns
  const standardPattern = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(?:co\.uk|com|org|net|uk|io|biz|info|ac\.uk|gov\.uk))\b/gi;
  for (const match of Array.from(html.matchAll(standardPattern))) {
    addEmail(match[1], 'crawled', 'high');
  }

  // 3. Obfuscated patterns
  for (const pattern of OBFUSCATED_PATTERNS) {
    const matches = html.matchAll(pattern);
    for (const match of Array.from(matches)) {
      if (match[1] && match[2] && match[3]) {
        const email = `${match[1]}@${match[2]}.${match[3]}`;
        addEmail(email, 'deobfuscated', 'high');
      }
    }
  }

  // 4. Data attribute emails
  for (const match of Array.from(html.matchAll(ADVANCED_EMAIL_PATTERNS.dataEmail))) {
    addEmail(match[1], 'data-attr', 'high');
  }

  // 5. Cloudflare email protection
  for (const match of Array.from(html.matchAll(ADVANCED_EMAIL_PATTERNS.dataCfemail))) {
    const decoded = decodeCfEmail(match[1]);
    if (decoded) addEmail(decoded, 'cloudflare-decoded', 'high');
  }

  // 6. Schema.org structured data
  for (const match of Array.from(html.matchAll(ADVANCED_EMAIL_PATTERNS.schemaEmail))) {
    addEmail(match[1], 'schema-org', 'high');
  }

  // 7. JavaScript variables
  for (const match of Array.from(html.matchAll(ADVANCED_EMAIL_PATTERNS.jsEmail))) {
    addEmail(match[1], 'javascript', 'medium');
  }

  // 8. JavaScript concatenation patterns
  for (const match of Array.from(html.matchAll(ADVANCED_EMAIL_PATTERNS.jsConcat))) {
    if (match[1] && match[2]) {
      const email = `${match[1]}@${match[2]}`;
      addEmail(email, 'js-concat', 'medium');
    }
  }

  return emails;
}

/**
 * Categorize email as personal or generic
 */
function categorizeEmail(email: string): 'personal' | 'generic' {
  const genericPrefixes = [
    'info', 'hello', 'contact', 'enquiries', 'enquiry', 'sales', 'support',
    'admin', 'office', 'mail', 'help', 'general', 'reception', 'bookings',
    'team', 'customer', 'service', 'services', 'accounts', 'finance',
    'careers', 'jobs', 'press', 'media', 'marketing', 'feedback',
  ];

  const localPart = email.split('@')[0].toLowerCase();

  if (genericPrefixes.some(p => localPart === p || localPart.startsWith(p + '.'))) {
    return 'generic';
  }

  // Personal if looks like a name
  if (localPart.includes('.') && !genericPrefixes.some(p => localPart.includes(p))) {
    return 'personal';
  }

  if (/^[a-z]{3,}$/.test(localPart) && !genericPrefixes.includes(localPart)) {
    return 'personal';
  }

  return 'generic';
}

/**
 * Extract phone numbers from HTML
 */
function extractPhones(html: string): PhoneInfo[] {
  const phones: PhoneInfo[] = [];
  const seen = new Set<string>();

  for (const pattern of UK_PHONE_PATTERNS) {
    const matches = html.matchAll(pattern);
    for (const match of Array.from(matches)) {
      let phone = (match[1] || match[0]).replace(/\s+/g, ' ').trim();
      phone = phone.replace(/^tel:/i, '');

      const digits = phone.replace(/\D/g, '');

      // Validate UK format
      let isValid = false;
      let type: 'landline' | 'mobile' | 'freephone' = 'landline';

      if (digits.startsWith('44') && digits.length === 12) {
        isValid = true;
        type = digits.startsWith('447') ? 'mobile' : 'landline';
      } else if (digits.startsWith('07') && digits.length === 11) {
        isValid = true;
        type = 'mobile';
      } else if (digits.startsWith('0800') || digits.startsWith('0808')) {
        isValid = digits.length === 11;
        type = 'freephone';
      } else if (digits.startsWith('0') && (digits.length === 10 || digits.length === 11)) {
        isValid = true;
        type = 'landline';
      }

      if (!isValid || seen.has(digits)) continue;
      seen.add(digits);

      phones.push({
        number: phone,
        type,
        source: 'website',
        verified: false,
      });
    }
  }

  return phones;
}

/**
 * Extract social media links
 */
function extractSocialMedia(html: string): SocialMedia {
  const social: SocialMedia = {};

  for (const [platform, patterns] of Object.entries(SOCIAL_PATTERNS)) {
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        if (platform === 'linkedin' && !social.linkedin) {
          social.linkedin = match[1];
          social.linkedinType = match[1].includes('/company/') ? 'company' : 'personal';
        } else if (platform === 'facebook' && !social.facebook) {
          social.facebook = match[1];
        } else if (platform === 'twitter' && !social.twitter) {
          social.twitter = match[1];
        } else if (platform === 'instagram' && !social.instagram) {
          social.instagram = match[1];
        } else if (platform === 'youtube' && !social.youtube) {
          social.youtube = match[1];
        } else if (platform === 'tiktok' && !social.tiktok) {
          social.tiktok = match[1];
        } else if (platform === 'pinterest' && !social.pinterest) {
          social.pinterest = match[1];
        }
        break;
      }
    }
  }

  return social;
}

/**
 * Extract LinkedIn profile URLs
 */
function extractLinkedInProfiles(html: string): string[] {
  const profiles: string[] = [];
  const seen = new Set<string>();

  const pattern = /href="(https?:\/\/(?:www\.)?linkedin\.com\/in\/[^"?#]+)/gi;
  const matches = html.matchAll(pattern);

  for (const match of Array.from(matches)) {
    const url = match[1];
    if (!seen.has(url)) {
      seen.add(url);
      profiles.push(url);
    }
  }

  return profiles;
}

/**
 * Extract people/team members from HTML
 */
function extractPeople(html: string): PersonInfo[] {
  const people: PersonInfo[] = [];
  const seen = new Set<string>();

  // Common team page patterns
  const patterns = [
    // Card-based layouts
    /<(?:div|article)[^>]*class="[^"]*(?:team|staff|member|person|director|profile)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article)>/gi,
    // List items
    /<li[^>]*class="[^"]*(?:team|staff|member|person)[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
  ];

  for (const pattern of patterns) {
    const matches = html.matchAll(pattern);
    for (const match of Array.from(matches)) {
      const block = match[1];

      // Extract name (usually in h3, h4, strong, or specific class)
      const namePatterns = [
        /<h[234][^>]*>([^<]{2,50})<\/h[234]>/i,
        /<(?:strong|b)[^>]*>([^<]{2,50})<\/(?:strong|b)>/i,
        /<(?:span|p|div)[^>]*class="[^"]*name[^"]*"[^>]*>([^<]{2,50})/i,
        /itemprop="name"[^>]*>([^<]{2,50})/i,
      ];

      let name = '';
      for (const np of namePatterns) {
        const nm = block.match(np);
        if (nm) {
          name = cleanText(nm[1]);
          break;
        }
      }

      if (!name || name.length < 3 || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());

      // Extract role
      const rolePatterns = [
        /<(?:span|p|div)[^>]*class="[^"]*(?:role|title|position|job)[^"]*"[^>]*>([^<]{2,100})/i,
        /itemprop="jobTitle"[^>]*>([^<]{2,100})/i,
        /<(?:small|em)[^>]*>([^<]{2,50})<\/(?:small|em)>/i,
      ];

      let role = '';
      for (const rp of rolePatterns) {
        const rm = block.match(rp);
        if (rm) {
          role = cleanText(rm[1]);
          break;
        }
      }

      // Parse name
      const { firstName, lastName } = parseName(name);

      // Extract email if in block
      const emailMatch = block.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
      const emails: EmailInfo[] = [];
      if (emailMatch) {
        emails.push({
          address: emailMatch[1].toLowerCase(),
          type: 'personal',
          source: 'crawled',
          verified: false,
          confidence: 'high',
          personName: name,
        });
      }

      // Extract LinkedIn
      const linkedinMatch = block.match(/href="(https?:\/\/(?:www\.)?linkedin\.com\/in\/[^"]+)"/i);

      people.push({
        name,
        firstName,
        lastName,
        role,
        source: 'website',
        emails,
        linkedin: linkedinMatch?.[1],
      });
    }
  }

  return people;
}

/**
 * Extract meta description
 */
function extractDescription(html: string): string {
  const patterns = [
    /<meta[^>]*name="description"[^>]*content="([^"]+)"/i,
    /<meta[^>]*content="([^"]+)"[^>]*name="description"/i,
    /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i,
    /<meta[^>]*name="twitter:description"[^>]*content="([^"]+)"/i,
    /"description"\s*:\s*"([^"]{20,300})"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const desc = cleanText(match[1]);
      if (desc.length >= 20 && desc.length <= 500) {
        return desc.substring(0, 300);
      }
    }
  }

  return '';
}

/**
 * Extract address and postcode
 */
function extractAddress(html: string): { address: string; postcode: string } {
  const patterns = [
    /"streetAddress"\s*:\s*"([^"]+)"/i,
    /<address[^>]*>([\s\S]{10,200}?)<\/address>/i,
    /<(?:div|span|p)[^>]*class="[^"]*(?:address|location|contact-address)[^"]*"[^>]*>([\s\S]{10,200}?)<\/(?:div|span|p)>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const addr = cleanText(match[1]);
      if (addr.length >= 10 && addr.length <= 200 && !addr.includes('=')) {
        const postcodeMatch = addr.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
        return {
          address: addr,
          postcode: postcodeMatch ? postcodeMatch[1].toUpperCase() : '',
        };
      }
    }
  }

  // Try to extract just postcode
  const postcodeMatch = html.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  return {
    address: '',
    postcode: postcodeMatch ? postcodeMatch[1].toUpperCase() : '',
  };
}

/**
 * Extract services from HTML
 */
function extractServices(html: string): string[] {
  const services: string[] = [];

  const listPatterns = [
    /<(?:ul|ol)[^>]*class="[^"]*(?:service|offering)[^"]*"[^>]*>([\s\S]*?)<\/(?:ul|ol)>/gi,
    /<h[234][^>]*>(?:our\s+)?services?<\/h[234]>[\s\S]*?<(?:ul|ol)[^>]*>([\s\S]*?)<\/(?:ul|ol)>/gi,
  ];

  for (const pattern of listPatterns) {
    const listMatches = html.matchAll(pattern);
    for (const listMatch of Array.from(listMatches)) {
      const itemMatches = listMatch[1].matchAll(/<li[^>]*>([^<]{3,50})/gi);
      for (const itemMatch of Array.from(itemMatches)) {
        const service = cleanText(itemMatch[1]);
        if (service && service.length >= 3 && service.length <= 50) {
          services.push(service);
        }
      }
    }
  }

  return [...new Set(services)].slice(0, 10);
}

/**
 * Main crawler function
 */
export async function crawlWebsite(websiteUrl: string): Promise<CrawlResult> {
  const result: CrawlResult = {
    emails: [],
    phones: [],
    people: [],
    socialMedia: {},
    description: '',
    address: '',
    postcode: '',
    services: [],
    linkedinProfiles: [],
    teamPageFound: false,
  };

  if (!websiteUrl) return result;

  // Normalize URL
  let baseUrl = websiteUrl;
  if (!baseUrl.startsWith('http')) {
    baseUrl = `https://${baseUrl}`;
  }
  baseUrl = baseUrl.replace(/\/$/, '');

  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  // Track pages successfully crawled
  let pagesCrawled = 0;
  const maxPages = 15; // Limit to avoid excessive requests

  for (const page of PAGES_TO_CRAWL) {
    if (pagesCrawled >= maxPages) break;

    try {
      const url = `${baseUrl}${page}`;
      const response = await fetch(url, {
        headers: HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) continue;

      const html = await response.text();
      pagesCrawled++;

      // Check if this is a team page
      const isTeamPage = page.includes('team') || page.includes('staff') ||
        page.includes('people') || page.includes('leadership') ||
        page.includes('director') || page.includes('management');

      if (isTeamPage) {
        result.teamPageFound = true;
      }

      // Extract emails
      const emails = extractEmails(html, page || 'homepage');
      for (const email of emails) {
        if (!seenEmails.has(email.address)) {
          seenEmails.add(email.address);
          result.emails.push(email);
        }
      }

      // Extract phones
      const phones = extractPhones(html);
      for (const phone of phones) {
        const digits = phone.number.replace(/\D/g, '');
        if (!seenPhones.has(digits)) {
          seenPhones.add(digits);
          result.phones.push(phone);
        }
      }

      // Extract people (especially on team pages)
      if (isTeamPage) {
        const people = extractPeople(html);
        for (const person of people) {
          if (!result.people.some(p => p.name.toLowerCase() === person.name.toLowerCase())) {
            result.people.push(person);
          }
        }
      }

      // Extract social media
      const social = extractSocialMedia(html);
      result.socialMedia = { ...result.socialMedia, ...social };

      // Extract LinkedIn profiles
      const profiles = extractLinkedInProfiles(html);
      result.linkedinProfiles.push(...profiles);

      // Extract description (prefer homepage)
      if (!result.description && page === '') {
        result.description = extractDescription(html);
      }

      // Extract address
      if (!result.address) {
        const addrResult = extractAddress(html);
        if (addrResult.address) {
          result.address = addrResult.address;
          result.postcode = addrResult.postcode || result.postcode;
        }
      }

      // Extract services
      if (page.includes('about') || page.includes('service')) {
        const services = extractServices(html);
        result.services = [...new Set([...result.services, ...services])];
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch {
      // Continue to next page on error
      continue;
    }
  }

  // Deduplicate LinkedIn profiles
  result.linkedinProfiles = [...new Set(result.linkedinProfiles)];

  // Sort emails - personal first
  result.emails.sort((a, b) => {
    if (a.type === 'personal' && b.type !== 'personal') return -1;
    if (a.type !== 'personal' && b.type === 'personal') return 1;
    return 0;
  });

  console.log(`[Crawler] Crawled ${pagesCrawled} pages from ${baseUrl}`);
  console.log(`[Crawler] Found: ${result.emails.length} emails, ${result.phones.length} phones, ${result.people.length} people`);

  return result;
}

/**
 * Search Google to discover a business website
 */
export async function discoverWebsite(
  businessName: string,
  location: string
): Promise<string | null> {
  console.log(`[WebDiscovery] Searching for website: ${businessName} in ${location}`);

  // Build search query
  const query = location
    ? `"${businessName}" ${location} site:uk OR site:co.uk`
    : `"${businessName}" UK website`;

  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log(`[WebDiscovery] Google search failed: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Extract URLs from Google results
    const urlPatterns = [
      // Direct href links
      /href="\/url\?q=(https?:\/\/(?!www\.google|maps\.google|support\.google|accounts\.google)[^&"]+)/gi,
      // Visible URLs in results
      /<cite[^>]*>([a-z0-9][\w.-]*\.[a-z]{2,})/gi,
    ];

    const candidateUrls: string[] = [];

    for (const pattern of urlPatterns) {
      const matches = html.matchAll(pattern);
      for (const match of Array.from(matches)) {
        let candidateUrl = decodeURIComponent(match[1]).split('&')[0];

        // Skip unwanted domains
        const skipDomains = [
          'google.com', 'facebook.com', 'linkedin.com', 'twitter.com', 'instagram.com',
          'youtube.com', 'yelp.com', 'yell.com', 'tripadvisor.com', 'trustpilot.com',
          'checkatrade.com', 'mybuilder.com', 'bark.com', 'freeindex.co.uk',
          'cylex-uk.co.uk', 'scoot.co.uk', 'hotfrog.co.uk', 'brownbook.net',
          'wikipedia.org', 'gov.uk', 'companieshouse.gov.uk', 'amazon.', 'ebay.',
        ];

        if (skipDomains.some(d => candidateUrl.includes(d))) continue;

        // Normalize URL
        if (!candidateUrl.startsWith('http')) {
          candidateUrl = `https://${candidateUrl}`;
        }

        // Only accept UK-relevant domains or .com
        if (candidateUrl.match(/\.(co\.uk|uk|com|org|net)\/?/i)) {
          candidateUrls.push(candidateUrl);
        }
      }
    }

    // Check if any URL contains the business name (fuzzy match)
    const businessWords = businessName.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !['the', 'and', 'ltd', 'limited', 'plc', 'uk'].includes(w));

    for (const candidateUrl of candidateUrls) {
      const urlLower = candidateUrl.toLowerCase();

      // Check if URL contains business name words
      const matchingWords = businessWords.filter(word => urlLower.includes(word));
      if (matchingWords.length >= Math.min(2, businessWords.length)) {
        console.log(`[WebDiscovery] Found likely website: ${candidateUrl}`);
        return candidateUrl;
      }
    }

    // Return first candidate if no name match
    if (candidateUrls.length > 0) {
      console.log(`[WebDiscovery] Using first candidate: ${candidateUrls[0]}`);
      return candidateUrls[0];
    }

    console.log(`[WebDiscovery] No website found for: ${businessName}`);
    return null;

  } catch (error) {
    console.log(`[WebDiscovery] Search error:`, error);
    return null;
  }
}

/**
 * Search Google for LinkedIn profiles for a company
 */
export async function searchLinkedInProfiles(
  companyName: string,
  location: string
): Promise<string[]> {
  const profiles: string[] = [];

  const searchQueries = [
    `site:linkedin.com/in "${companyName}" "${location}" director`,
    `site:linkedin.com/in "${companyName}" owner`,
    `site:linkedin.com/in "${companyName}" founder`,
    `site:linkedin.com/in "${companyName}" managing director`,
    `site:linkedin.com/company "${companyName}"`,
  ];

  for (const query of searchQueries.slice(0, 2)) { // Limit to 2 queries
    try {
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=5`;
      const response = await fetch(url, { headers: HEADERS });

      if (!response.ok) continue;

      const html = await response.text();

      // Extract LinkedIn URLs
      const pattern = /href="\/url\?q=(https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[^&"]+)/gi;
      const matches = html.matchAll(pattern);

      for (const match of Array.from(matches)) {
        const linkedinUrl = decodeURIComponent(match[1]).split('&')[0];
        if (!profiles.includes(linkedinUrl)) {
          profiles.push(linkedinUrl);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    } catch {
      continue;
    }
  }

  return profiles.slice(0, 10); // Limit to 10 profiles
}
