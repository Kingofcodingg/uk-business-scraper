// ============================================================================
// LINKEDIN SCRAPING MODULE
// Advanced LinkedIn profile discovery and data extraction
// Uses Google and Bing to find profiles (no API required)
// ============================================================================

import { PersonInfo, EmailInfo } from './types';
import { parseName } from './email-guesser';

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
};

export interface LinkedInProfile {
  url: string;
  type: 'personal' | 'company';
  name?: string;
  title?: string;
  headline?: string;
  location?: string;
  company?: string;
  snippet?: string;
  imageUrl?: string;
}

export interface LinkedInSearchResult {
  profiles: LinkedInProfile[];
  companyPage?: LinkedInProfile;
  employees: LinkedInProfile[];
  decisionMakers: LinkedInProfile[];
}

// Decision maker titles to prioritize
const DECISION_MAKER_TITLES = [
  'owner', 'founder', 'co-founder', 'ceo', 'chief executive', 'managing director',
  'director', 'md', 'president', 'vp', 'vice president', 'partner', 'principal',
  'head of', 'general manager', 'gm', 'chairman', 'chief', 'cto', 'cfo', 'coo',
  'cmo', 'cio', 'executive', 'senior', 'lead', 'manager',
];

/**
 * Extract name from LinkedIn URL slug
 */
function extractNameFromUrl(url: string): string | null {
  const match = url.match(/linkedin\.com\/in\/([^/?]+)/);
  if (match) {
    // Convert slug to name: john-smith-12345 -> John Smith
    return match[1]
      .split('-')
      .filter(part => !/^\d+$/.test(part)) // Remove trailing ID numbers
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
      .trim();
  }
  return null;
}

/**
 * Extract company name from LinkedIn company URL
 */
function extractCompanyFromUrl(url: string): string | null {
  const match = url.match(/linkedin\.com\/company\/([^/?]+)/);
  if (match) {
    return match[1]
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
      .trim();
  }
  return null;
}

/**
 * Parse LinkedIn profile from search result snippet
 */
function parseProfileFromSnippet(url: string, snippet: string): LinkedInProfile {
  const isCompany = url.includes('/company/');

  const profile: LinkedInProfile = {
    url,
    type: isCompany ? 'company' : 'personal',
    snippet,
  };

  if (isCompany) {
    profile.name = extractCompanyFromUrl(url) || undefined;
  } else {
    profile.name = extractNameFromUrl(url) || undefined;

    // Try to extract title/headline from snippet
    // Common format: "Name - Title at Company | LinkedIn"
    // or "Name | Title | Company"
    const titlePatterns = [
      /^([^|]+)\s*-\s*([^|]+(?:at|@)[^|]+)/i,
      /^([^|]+)\s*\|\s*([^|]+)/i,
      /^([^-]+)\s*-\s*([^-]+)/i,
    ];

    for (const pattern of titlePatterns) {
      const match = snippet.match(pattern);
      if (match) {
        const potentialTitle = match[2].trim();
        // Check if it looks like a job title
        if (potentialTitle.length < 100 && !potentialTitle.includes('LinkedIn')) {
          profile.headline = potentialTitle;
          // Extract company if "at Company" format
          const atMatch = potentialTitle.match(/(?:at|@)\s*(.+)$/i);
          if (atMatch) {
            profile.company = atMatch[1].trim();
            profile.title = potentialTitle.replace(/\s*(?:at|@)\s*.+$/i, '').trim();
          } else {
            profile.title = potentialTitle;
          }
          break;
        }
      }
    }

    // Try to extract location
    const locationPatterns = [
      /(?:Greater\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s*(?:UK|United Kingdom|England|Scotland|Wales)/i,
      /(?:Greater\s+)?([A-Z][a-z]+\s+Area)/i,
    ];
    for (const pattern of locationPatterns) {
      const match = snippet.match(pattern);
      if (match) {
        profile.location = match[0].trim();
        break;
      }
    }
  }

  return profile;
}

/**
 * Check if profile appears to be a decision maker
 */
function isDecisionMaker(profile: LinkedInProfile): boolean {
  const searchText = `${profile.title || ''} ${profile.headline || ''} ${profile.snippet || ''}`.toLowerCase();
  return DECISION_MAKER_TITLES.some(title => searchText.includes(title));
}

/**
 * Search Google for LinkedIn profiles
 */
async function searchGoogleForLinkedIn(query: string): Promise<LinkedInProfile[]> {
  const profiles: LinkedInProfile[] = [];

  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=15`;
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return profiles;

    const html = await response.text();

    // Extract LinkedIn URLs from search results
    const urlPattern = /href="\/url\?q=(https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[^&"]+)/gi;
    const snippetPattern = /<div class="[^"]*VwiC3b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;

    const urlMatches = [...html.matchAll(urlPattern)];
    const snippetMatches = [...html.matchAll(snippetPattern)];

    const seenUrls = new Set<string>();

    for (let i = 0; i < urlMatches.length; i++) {
      const linkedinUrl = decodeURIComponent(urlMatches[i][1]).split('&')[0];

      // Skip duplicates
      if (seenUrls.has(linkedinUrl)) continue;
      seenUrls.add(linkedinUrl);

      // Get corresponding snippet if available
      const snippet = snippetMatches[i]
        ? snippetMatches[i][1]
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ')
            .trim()
        : '';

      const profile = parseProfileFromSnippet(linkedinUrl, snippet);
      profiles.push(profile);
    }
  } catch (error) {
    console.log(`[LinkedIn] Google search error:`, error);
  }

  return profiles;
}

/**
 * Search Brave for LinkedIn profiles (most reliable, no captcha)
 */
async function searchBraveForLinkedIn(query: string): Promise<LinkedInProfile[]> {
  const profiles: LinkedInProfile[] = [];

  try {
    const url = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
    const response = await fetch(url, {
      headers: {
        ...HEADERS,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-GB,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log(`[LinkedIn] Brave returned ${response.status}`);
      return profiles;
    }

    const html = await response.text();

    // Extract LinkedIn URLs
    const urlPattern = /(https?:\/\/(?:www\.)?(?:uk\.)?linkedin\.com\/(?:in|company)\/[\w-]+)/gi;
    const matches = html.match(urlPattern);

    if (matches) {
      const seenUrls = new Set<string>();
      for (const linkedinUrl of matches) {
        const cleanUrl = linkedinUrl.split('?')[0];
        if (!seenUrls.has(cleanUrl)) {
          seenUrls.add(cleanUrl);

          // Try to extract context around the URL
          const urlIndex = html.indexOf(linkedinUrl);
          const contextStart = Math.max(0, urlIndex - 400);
          const contextEnd = Math.min(html.length, urlIndex + 400);
          const context = html.substring(contextStart, contextEnd)
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ')
            .trim();

          profiles.push(parseProfileFromSnippet(cleanUrl, context));
        }
      }
    }

    console.log(`[LinkedIn] Brave found ${profiles.length} profiles`);
  } catch (error) {
    console.log(`[LinkedIn] Brave search error:`, error);
  }

  return profiles;
}

/**
 * Search Bing for LinkedIn profiles (fallback)
 */
async function searchBingForLinkedIn(query: string): Promise<LinkedInProfile[]> {
  const profiles: LinkedInProfile[] = [];

  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=30&setlang=en-GB&cc=GB`;
    const response = await fetch(url, {
      headers: {
        ...HEADERS,
        "Accept-Language": "en-GB,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log(`[LinkedIn] Bing returned ${response.status}`);
      return profiles;
    }

    const html = await response.text();

    // Extract LinkedIn URLs with surrounding context
    const urlPattern = /(https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[\w-]+)/gi;
    const matches = html.match(urlPattern);

    if (matches) {
      const seenUrls = new Set<string>();
      for (const linkedinUrl of matches) {
        // Normalize URL
        const cleanUrl = linkedinUrl.split('?')[0];
        if (!seenUrls.has(cleanUrl)) {
          seenUrls.add(cleanUrl);

          // Try to extract snippet context
          const urlIndex = html.indexOf(linkedinUrl);
          const contextStart = Math.max(0, urlIndex - 300);
          const contextEnd = Math.min(html.length, urlIndex + 300);
          const context = html.substring(contextStart, contextEnd)
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ')
            .trim();

          profiles.push(parseProfileFromSnippet(cleanUrl, context));
        }
      }
    }

    console.log(`[LinkedIn] Bing found ${profiles.length} profiles`);
  } catch (error) {
    console.log(`[LinkedIn] Bing search error:`, error);
  }

  return profiles;
}

/**
 * Search DuckDuckGo for LinkedIn profiles (no captcha, reliable)
 */
async function searchDuckDuckGoForLinkedIn(query: string): Promise<LinkedInProfile[]> {
  const profiles: LinkedInProfile[] = [];

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=uk-en`;
    const response = await fetch(url, {
      headers: {
        ...HEADERS,
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log(`[LinkedIn] DuckDuckGo returned ${response.status}`);
      return profiles;
    }

    const html = await response.text();

    // Extract LinkedIn URLs
    const urlPattern = /(https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[\w-]+)/gi;
    const matches = html.match(urlPattern);

    if (matches) {
      const seenUrls = new Set<string>();
      for (const linkedinUrl of matches) {
        const cleanUrl = linkedinUrl.split('?')[0];
        if (!seenUrls.has(cleanUrl)) {
          seenUrls.add(cleanUrl);
          profiles.push(parseProfileFromSnippet(cleanUrl, ''));
        }
      }
    }

    console.log(`[LinkedIn] DuckDuckGo found ${profiles.length} profiles`);
  } catch (error) {
    console.log(`[LinkedIn] DuckDuckGo search error:`, error);
  }

  return profiles;
}

/**
 * Main LinkedIn search function - searches for company and employees
 * Uses multiple search engines for better coverage
 */
export async function searchLinkedIn(
  companyName: string,
  location?: string,
  maxProfiles: number = 10
): Promise<LinkedInSearchResult> {
  const result: LinkedInSearchResult = {
    profiles: [],
    employees: [],
    decisionMakers: [],
  };

  const seenUrls = new Set<string>();

  console.log(`[LinkedIn] Searching for: ${companyName}`);

  // Clean company name for searching (remove Ltd, Limited, etc.)
  const cleanName = companyName
    .replace(/\b(ltd|limited|plc|llp|inc|corp|uk)\b\.?/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Build search queries - try both quoted and unquoted versions
  const queries = [
    // Company page searches
    `site:linkedin.com/company "${cleanName}"`,
    `site:linkedin.com/company ${cleanName}`,
    // People searches with role keywords
    `site:linkedin.com/in "${cleanName}" director`,
    `site:linkedin.com/in "${cleanName}" owner founder`,
    `site:linkedin.com/in ${cleanName} managing director`,
    `site:linkedin.com/in ${cleanName} accountant`, // For accountancy firms
    // General people search
    `linkedin.com/in "${cleanName}"`,
  ];

  // Add location-specific queries if provided
  if (location) {
    // Extract postcode area or city
    const locationClean = location.replace(/[^a-zA-Z\s]/g, ' ').trim().split(/\s+/)[0];
    if (locationClean && locationClean.length > 2) {
      queries.unshift(
        `site:linkedin.com/in "${cleanName}" "${locationClean}"`,
        `site:linkedin.com/company "${cleanName}" ${locationClean}`,
      );
    }
  }

  const processProfiles = (profiles: LinkedInProfile[]) => {
    for (const profile of profiles) {
      const normalizedUrl = profile.url.split('?')[0].replace(/\/$/, '');
      if (seenUrls.has(normalizedUrl)) continue;
      seenUrls.add(normalizedUrl);

      result.profiles.push(profile);

      if (profile.type === 'company' && !result.companyPage) {
        result.companyPage = profile;
      } else if (profile.type === 'personal') {
        result.employees.push(profile);
        if (isDecisionMaker(profile)) {
          result.decisionMakers.push(profile);
        }
      }
    }
  };

  // Run queries with multiple search engines
  const maxQueries = 5;
  for (let i = 0; i < Math.min(queries.length, maxQueries); i++) {
    const query = queries[i];

    if (result.profiles.length >= maxProfiles) break;

    try {
      // Try Brave first (most reliable, no captcha)
      let profiles = await searchBraveForLinkedIn(query);
      processProfiles(profiles);

      // If still need more, try Bing
      if (result.profiles.length < maxProfiles && profiles.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
        profiles = await searchBingForLinkedIn(query);
        processProfiles(profiles);
      }

      // If still need more, try DuckDuckGo
      if (result.profiles.length < maxProfiles && profiles.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
        profiles = await searchDuckDuckGoForLinkedIn(query);
        processProfiles(profiles);
      }

      // Delay between queries
      if (i < maxQueries - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }

    } catch (error) {
      console.log(`[LinkedIn] Query error:`, error);
    }
  }

  console.log(`[LinkedIn] Found: ${result.profiles.length} profiles, ${result.decisionMakers.length} decision makers`);

  return result;
}

/**
 * Convert LinkedIn profiles to PersonInfo format
 */
export function linkedInProfilesToPersons(
  profiles: LinkedInProfile[],
  options: { includeEmployees?: boolean } = {}
): PersonInfo[] {
  const persons: PersonInfo[] = [];

  for (const profile of profiles) {
    if (profile.type !== 'personal') continue;

    const name = profile.name || extractNameFromUrl(profile.url) || '';
    if (!name) continue;

    const { firstName, lastName } = parseName(name);

    persons.push({
      name,
      firstName,
      lastName,
      role: profile.title || profile.headline || 'Unknown',
      source: 'linkedin',
      emails: [],
      linkedin: profile.url,
    });
  }

  return persons;
}

/**
 * Search for a specific person on LinkedIn
 */
export async function findPersonOnLinkedIn(
  firstName: string,
  lastName: string,
  companyName?: string,
  location?: string
): Promise<LinkedInProfile | null> {
  const nameParts = [firstName, lastName].filter(Boolean);
  if (nameParts.length === 0) return null;

  const fullName = nameParts.join(' ');

  // Build targeted query
  let query = `site:linkedin.com/in "${fullName}"`;
  if (companyName) {
    query += ` "${companyName}"`;
  }
  if (location) {
    query += ` "${location}"`;
  }

  console.log(`[LinkedIn] Searching for person: ${fullName}`);

  try {
    // Search Google first
    let profiles = await searchGoogleForLinkedIn(query);

    // Fallback to Bing
    if (profiles.length === 0) {
      profiles = await searchBingForLinkedIn(query);
    }

    // Find best match
    for (const profile of profiles) {
      if (profile.type === 'personal') {
        const profileName = profile.name?.toLowerCase() || '';
        if (profileName.includes(firstName.toLowerCase()) ||
            profileName.includes(lastName.toLowerCase())) {
          return profile;
        }
      }
    }

    // Return first personal profile if no exact match
    return profiles.find(p => p.type === 'personal') || null;

  } catch (error) {
    console.log(`[LinkedIn] Person search error:`, error);
    return null;
  }
}

/**
 * Enrich person with LinkedIn profile
 */
export async function enrichPersonWithLinkedIn(
  person: PersonInfo,
  companyName?: string,
  location?: string
): Promise<PersonInfo> {
  if (person.linkedin) return person; // Already has LinkedIn

  const profile = await findPersonOnLinkedIn(
    person.firstName,
    person.lastName,
    companyName,
    location
  );

  if (profile) {
    return {
      ...person,
      linkedin: profile.url,
      role: person.role === 'Unknown' ? (profile.title || profile.headline || person.role) : person.role,
    };
  }

  return person;
}

/**
 * Batch enrich multiple people with LinkedIn profiles
 */
export async function enrichPeopleWithLinkedIn(
  people: PersonInfo[],
  companyName?: string,
  location?: string,
  maxConcurrent: number = 2
): Promise<PersonInfo[]> {
  const enriched: PersonInfo[] = [];

  // Only enrich people without LinkedIn profiles
  const toEnrich = people.filter(p => !p.linkedin);
  const alreadyHave = people.filter(p => p.linkedin);

  console.log(`[LinkedIn] Enriching ${toEnrich.length} people with LinkedIn profiles`);

  // Process in batches
  for (let i = 0; i < toEnrich.length; i += maxConcurrent) {
    const batch = toEnrich.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(p => enrichPersonWithLinkedIn(p, companyName, location))
    );
    enriched.push(...batchResults);

    // Delay between batches
    if (i + maxConcurrent < toEnrich.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return [...alreadyHave, ...enriched];
}

/**
 * Search for decision makers (directors) by name on LinkedIn
 * This is more targeted than the general company search
 */
export async function searchDirectorOnLinkedIn(
  directorName: string,
  companyName: string,
  location?: string
): Promise<LinkedInProfile | null> {
  console.log(`[LinkedIn] Searching for director: ${directorName} at ${companyName}`);

  // Clean names for searching
  const cleanDirectorName = directorName
    .replace(/\b(Mr|Mrs|Ms|Miss|Dr|Prof|Sir|Dame)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanCompanyName = companyName
    .replace(/\b(ltd|limited|plc|llp|inc|corp|uk)\b\.?/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Build targeted queries for this specific person
  const queries = [
    `site:linkedin.com/in "${cleanDirectorName}" "${cleanCompanyName}"`,
    `site:linkedin.com/in "${cleanDirectorName}" director ${cleanCompanyName}`,
    `linkedin.com/in "${cleanDirectorName}" ${cleanCompanyName}`,
  ];

  // Add location-specific query if available
  if (location) {
    const locationClean = location.replace(/[^a-zA-Z\s]/g, ' ').trim().split(/\s+/)[0];
    if (locationClean && locationClean.length > 2) {
      queries.unshift(`site:linkedin.com/in "${cleanDirectorName}" "${locationClean}"`);
    }
  }

  for (const query of queries) {
    try {
      // Try Brave first (most reliable)
      let profiles = await searchBraveForLinkedIn(query);

      // Fallback to Bing if needed
      if (profiles.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
        profiles = await searchBingForLinkedIn(query);
      }

      // Find best match for this director
      for (const profile of profiles) {
        if (profile.type === 'personal') {
          const profileName = (profile.name || '').toLowerCase();
          const searchName = cleanDirectorName.toLowerCase();

          // Check if names match reasonably
          const searchParts = searchName.split(' ').filter(p => p.length > 2);
          const matchCount = searchParts.filter(part => profileName.includes(part)).length;

          // At least 2 name parts should match (e.g., first and last name)
          if (matchCount >= 2 || profileName.includes(searchName)) {
            console.log(`[LinkedIn] Found profile for ${directorName}: ${profile.url}`);
            return profile;
          }
        }
      }

      // Short delay between queries
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.log(`[LinkedIn] Error searching for ${directorName}:`, error);
    }
  }

  console.log(`[LinkedIn] No profile found for ${directorName}`);
  return null;
}

/**
 * Batch search for multiple directors' LinkedIn profiles
 */
export async function searchDirectorsOnLinkedIn(
  directors: Array<{ name: string; role: string }>,
  companyName: string,
  location?: string,
  maxDirectors: number = 5
): Promise<Map<string, LinkedInProfile>> {
  const results = new Map<string, LinkedInProfile>();

  // Only search for top directors (limit to save time)
  const directorsToSearch = directors.slice(0, maxDirectors);

  console.log(`[LinkedIn] Searching LinkedIn for ${directorsToSearch.length} directors of ${companyName}`);

  // Search sequentially with short delays to avoid rate limiting
  for (const director of directorsToSearch) {
    const profile = await searchDirectorOnLinkedIn(director.name, companyName, location);
    if (profile) {
      results.set(director.name, profile);
    }
    // Short delay between director searches
    await new Promise(resolve => setTimeout(resolve, 400));
  }

  console.log(`[LinkedIn] Found ${results.size}/${directorsToSearch.length} director profiles`);
  return results;
}

/**
 * Extract company LinkedIn insights (employees count range, etc.)
 */
export async function getCompanyLinkedInInsights(companyUrl: string): Promise<{
  employeeRange?: string;
  industry?: string;
  followers?: number;
} | null> {
  // Note: This would require direct LinkedIn access which is blocked without auth
  // For now, return null - could be enhanced with LinkedIn API in future
  console.log(`[LinkedIn] Company insights not available without API access`);
  return null;
}
