// ============================================================================
// SOCIAL MEDIA SCRAPER
// Multi-platform social media discovery and extraction
// ============================================================================

import { SocialMedia } from './types';

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
};

// Platform-specific URL patterns
const SOCIAL_PATTERNS = {
  facebook: [
    /https?:\/\/(?:www\.)?facebook\.com\/(?!sharer|share|login|help|policies|business)([a-zA-Z0-9._-]+)\/?/gi,
    /https?:\/\/(?:www\.)?fb\.com\/([a-zA-Z0-9._-]+)\/?/gi,
  ],
  twitter: [
    /https?:\/\/(?:www\.)?twitter\.com\/(?!intent|share|search|login|i\/)([a-zA-Z0-9_]+)\/?/gi,
    /https?:\/\/(?:www\.)?x\.com\/(?!intent|share|search|login|i\/)([a-zA-Z0-9_]+)\/?/gi,
  ],
  instagram: [
    /https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel\/|explore\/|accounts\/)([a-zA-Z0-9._]+)\/?/gi,
  ],
  linkedin: [
    /https?:\/\/(?:www\.)?linkedin\.com\/company\/([a-zA-Z0-9-]+)\/?/gi,
    /https?:\/\/(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9-]+)\/?/gi,
  ],
  youtube: [
    /https?:\/\/(?:www\.)?youtube\.com\/(?:c\/|channel\/|user\/|@)([a-zA-Z0-9_-]+)\/?/gi,
    /https?:\/\/(?:www\.)?youtube\.com\/@([a-zA-Z0-9_-]+)\/?/gi,
  ],
  tiktok: [
    /https?:\/\/(?:www\.)?tiktok\.com\/@([a-zA-Z0-9._-]+)\/?/gi,
  ],
  pinterest: [
    /https?:\/\/(?:www\.)?pinterest\.(?:com|co\.uk)\/([a-zA-Z0-9_-]+)\/?/gi,
  ],
  github: [
    /https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)\/?/gi,
  ],
  trustpilot: [
    /https?:\/\/(?:www\.)?trustpilot\.com\/review\/([a-zA-Z0-9.-]+)\/?/gi,
  ],
  googleBusiness: [
    /https?:\/\/(?:www\.)?google\.com\/maps\/place\/[^/]+\/@[^/]+\/data=[^?]+/gi,
    /https?:\/\/g\.page\/([a-zA-Z0-9-]+)/gi,
  ],
};

// Skip these as they're not actual profiles
const SKIP_HANDLES = new Set([
  'share', 'sharer', 'login', 'help', 'about', 'terms', 'privacy',
  'settings', 'notifications', 'messages', 'home', 'explore', 'search',
  'intent', 'hashtag', 'i', 'policies', 'business', 'ads', 'developers',
]);

export interface SocialMediaResult extends SocialMedia {
  github?: string;
  trustpilot?: string;
  googleBusiness?: string;
  profiles: SocialMediaProfile[];
}

export interface SocialMediaProfile {
  platform: string;
  url: string;
  handle?: string;
  type?: 'company' | 'personal';
  followers?: number;
  verified?: boolean;
}

/**
 * Extract social media links from HTML content
 */
export function extractSocialFromHtml(html: string): SocialMediaResult {
  const result: SocialMediaResult = {
    profiles: [],
  };

  for (const [platform, patterns] of Object.entries(SOCIAL_PATTERNS)) {
    for (const pattern of patterns) {
      const matches = html.matchAll(pattern);

      for (const match of Array.from(matches)) {
        const fullUrl = match[0];
        const handle = match[1]?.toLowerCase();

        // Skip invalid handles
        if (!handle || SKIP_HANDLES.has(handle)) continue;
        if (handle.length < 2 || handle.length > 50) continue;

        // Store first match for each platform
        switch (platform) {
          case 'facebook':
            if (!result.facebook) {
              result.facebook = fullUrl;
              result.profiles.push({ platform: 'facebook', url: fullUrl, handle });
            }
            break;
          case 'twitter':
            if (!result.twitter) {
              result.twitter = fullUrl;
              result.profiles.push({ platform: 'twitter', url: fullUrl, handle });
            }
            break;
          case 'instagram':
            if (!result.instagram) {
              result.instagram = fullUrl;
              result.profiles.push({ platform: 'instagram', url: fullUrl, handle });
            }
            break;
          case 'linkedin':
            if (!result.linkedin) {
              result.linkedin = fullUrl;
              result.linkedinType = fullUrl.includes('/company/') ? 'company' : 'personal';
              result.profiles.push({
                platform: 'linkedin',
                url: fullUrl,
                handle,
                type: result.linkedinType,
              });
            }
            break;
          case 'youtube':
            if (!result.youtube) {
              result.youtube = fullUrl;
              result.profiles.push({ platform: 'youtube', url: fullUrl, handle });
            }
            break;
          case 'tiktok':
            if (!result.tiktok) {
              result.tiktok = fullUrl;
              result.profiles.push({ platform: 'tiktok', url: fullUrl, handle });
            }
            break;
          case 'pinterest':
            if (!result.pinterest) {
              result.pinterest = fullUrl;
              result.profiles.push({ platform: 'pinterest', url: fullUrl, handle });
            }
            break;
          case 'github':
            if (!result.github) {
              result.github = fullUrl;
              result.profiles.push({ platform: 'github', url: fullUrl, handle });
            }
            break;
          case 'trustpilot':
            if (!result.trustpilot) {
              result.trustpilot = fullUrl;
              result.profiles.push({ platform: 'trustpilot', url: fullUrl, handle });
            }
            break;
          case 'googleBusiness':
            if (!result.googleBusiness) {
              result.googleBusiness = fullUrl;
              result.profiles.push({ platform: 'googleBusiness', url: fullUrl });
            }
            break;
        }
      }
    }
  }

  return result;
}

/**
 * Search Google/Bing for social media profiles
 */
async function searchForSocialProfiles(
  companyName: string,
  platform: string,
  sitePrefix: string
): Promise<string | null> {
  try {
    const query = `site:${sitePrefix} "${companyName}"`;
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=5`;

    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Extract URLs from results
    const patterns = SOCIAL_PATTERNS[platform as keyof typeof SOCIAL_PATTERNS];
    if (!patterns) return null;

    for (const pattern of patterns) {
      const matches = html.matchAll(pattern);
      for (const match of Array.from(matches)) {
        const handle = match[1]?.toLowerCase();
        if (handle && !SKIP_HANDLES.has(handle)) {
          return match[0];
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Discover social media profiles for a company
 */
export async function discoverSocialMedia(
  companyName: string,
  website?: string,
  existingSocial?: Partial<SocialMedia>
): Promise<SocialMediaResult> {
  const result: SocialMediaResult = {
    ...existingSocial,
    profiles: [],
  };

  console.log(`[SocialMedia] Discovering profiles for: ${companyName}`);

  // First, try to extract from website if available
  if (website) {
    try {
      const response = await fetch(website, {
        headers: HEADERS,
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const html = await response.text();
        const extracted = extractSocialFromHtml(html);

        // Merge extracted social media
        result.facebook = result.facebook || extracted.facebook;
        result.twitter = result.twitter || extracted.twitter;
        result.instagram = result.instagram || extracted.instagram;
        result.linkedin = result.linkedin || extracted.linkedin;
        result.linkedinType = result.linkedinType || extracted.linkedinType;
        result.youtube = result.youtube || extracted.youtube;
        result.tiktok = result.tiktok || extracted.tiktok;
        result.pinterest = result.pinterest || extracted.pinterest;
        result.github = extracted.github;
        result.trustpilot = extracted.trustpilot;
        result.googleBusiness = extracted.googleBusiness;
        result.profiles.push(...extracted.profiles);
      }
    } catch (error) {
      console.log(`[SocialMedia] Website crawl error:`, error);
    }
  }

  // Search for missing platforms via Bing (less restrictive than Google)
  const searchTasks: Array<{ platform: string; sitePrefix: string }> = [];

  if (!result.facebook) {
    searchTasks.push({ platform: 'facebook', sitePrefix: 'facebook.com' });
  }
  if (!result.twitter) {
    searchTasks.push({ platform: 'twitter', sitePrefix: 'twitter.com OR x.com' });
  }
  if (!result.instagram) {
    searchTasks.push({ platform: 'instagram', sitePrefix: 'instagram.com' });
  }
  if (!result.linkedin) {
    searchTasks.push({ platform: 'linkedin', sitePrefix: 'linkedin.com/company' });
  }

  // Limit concurrent searches
  for (const task of searchTasks.slice(0, 3)) {
    try {
      const profileUrl = await searchForSocialProfiles(
        companyName,
        task.platform,
        task.sitePrefix
      );

      if (profileUrl) {
        switch (task.platform) {
          case 'facebook':
            result.facebook = profileUrl;
            result.profiles.push({ platform: 'facebook', url: profileUrl });
            break;
          case 'twitter':
            result.twitter = profileUrl;
            result.profiles.push({ platform: 'twitter', url: profileUrl });
            break;
          case 'instagram':
            result.instagram = profileUrl;
            result.profiles.push({ platform: 'instagram', url: profileUrl });
            break;
          case 'linkedin':
            result.linkedin = profileUrl;
            result.linkedinType = 'company';
            result.profiles.push({ platform: 'linkedin', url: profileUrl, type: 'company' });
            break;
        }
      }

      // Delay between searches
      await new Promise(resolve => setTimeout(resolve, 300));

    } catch (error) {
      console.log(`[SocialMedia] Search error for ${task.platform}:`, error);
    }
  }

  const foundCount = result.profiles.length;
  console.log(`[SocialMedia] Found ${foundCount} social profiles`);

  return result;
}

/**
 * Validate that a social media URL is accessible
 */
export async function validateSocialUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: HEADERS,
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    });

    // Check for 200 or redirect to valid page
    return response.ok || response.status === 302 || response.status === 301;
  } catch {
    return false;
  }
}

/**
 * Extract company info from Facebook page (basic - without login)
 */
export async function extractFacebookInfo(url: string): Promise<{
  name?: string;
  about?: string;
  website?: string;
  phone?: string;
  email?: string;
} | null> {
  try {
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Try to extract basic info from meta tags
    const result: {
      name?: string;
      about?: string;
      website?: string;
      phone?: string;
      email?: string;
    } = {};

    // Name from og:title
    const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    if (titleMatch) {
      result.name = titleMatch[1];
    }

    // Description from og:description
    const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
    if (descMatch) {
      result.about = descMatch[1];
    }

    // Try to find phone numbers in the page
    const phonePattern = /(?:0|\+44)(?:\d\s?){9,10}/g;
    const phones = html.match(phonePattern);
    if (phones && phones.length > 0) {
      result.phone = phones[0].replace(/\s/g, '');
    }

    // Try to find emails
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = html.match(emailPattern);
    if (emails) {
      const validEmail = emails.find(e =>
        !e.includes('facebook') &&
        !e.includes('example') &&
        !e.includes('sentry')
      );
      if (validEmail) {
        result.email = validEmail.toLowerCase();
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

/**
 * Get Trustpilot rating for a business
 */
export async function getTrustpilotRating(businessDomain: string): Promise<{
  rating?: number;
  reviewCount?: number;
  url?: string;
} | null> {
  try {
    const url = `https://www.trustpilot.com/review/${businessDomain}`;

    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const html = await response.text();

    const result: { rating?: number; reviewCount?: number; url?: string } = { url };

    // Extract rating from JSON-LD or data attributes
    const ratingMatch = html.match(/"ratingValue"\s*:\s*"?([0-9.]+)"?/);
    if (ratingMatch) {
      result.rating = parseFloat(ratingMatch[1]);
    }

    // Extract review count
    const countMatch = html.match(/"reviewCount"\s*:\s*"?(\d+)"?/);
    if (countMatch) {
      result.reviewCount = parseInt(countMatch[1]);
    }

    return result.rating ? result : null;
  } catch {
    return null;
  }
}

/**
 * Merge social media results
 */
export function mergeSocialMedia(
  existing: Partial<SocialMedia>,
  discovered: SocialMediaResult
): SocialMedia {
  return {
    linkedin: existing.linkedin || discovered.linkedin,
    linkedinType: existing.linkedinType || discovered.linkedinType,
    facebook: existing.facebook || discovered.facebook,
    twitter: existing.twitter || discovered.twitter,
    instagram: existing.instagram || discovered.instagram,
    youtube: existing.youtube || discovered.youtube,
    tiktok: existing.tiktok || discovered.tiktok,
    pinterest: existing.pinterest || discovered.pinterest,
  };
}
