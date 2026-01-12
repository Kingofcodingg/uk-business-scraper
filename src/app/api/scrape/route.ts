import { NextRequest, NextResponse } from "next/server";

interface Business {
  name: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  postcode: string;
  industry: string;
  description: string;
  rating: string;
  review_count: string;
  source: string;
  scraped_at: string;
  lead_score: number;
  lead_signals: string[];
  distance?: string;
}

// Cache for postcode coordinates (using postcodes.io free API)
const postcodeCache: Map<string, { lat: number; lng: number } | null> = new Map();

// Get coordinates from postcodes.io (free, no API key required)
async function getPostcodeCoords(postcode: string): Promise<{ lat: number; lng: number } | null> {
  if (!postcode) return null;

  const clean = postcode.toUpperCase().replace(/\s+/g, '');

  // Check cache first
  if (postcodeCache.has(clean)) {
    return postcodeCache.get(clean) || null;
  }

  try {
    const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      postcodeCache.set(clean, null);
      return null;
    }

    const data = await response.json();

    if (data.status === 200 && data.result) {
      const coords = { lat: data.result.latitude, lng: data.result.longitude };
      postcodeCache.set(clean, coords);
      return coords;
    }

    postcodeCache.set(clean, null);
    return null;
  } catch {
    postcodeCache.set(clean, null);
    return null;
  }
}

// Batch lookup multiple postcodes at once (more efficient)
async function batchGetPostcodeCoords(postcodes: string[]): Promise<Map<string, { lat: number; lng: number }>> {
  const results = new Map<string, { lat: number; lng: number }>();
  const toFetch: string[] = [];

  // Check cache first
  for (const pc of postcodes) {
    const clean = pc.toUpperCase().replace(/\s+/g, '');
    if (postcodeCache.has(clean)) {
      const cached = postcodeCache.get(clean);
      if (cached) results.set(clean, cached);
    } else if (clean.length >= 5) {
      toFetch.push(clean);
    }
  }

  // Batch fetch remaining (postcodes.io allows up to 100 at a time)
  if (toFetch.length > 0) {
    try {
      const response = await fetch('https://api.postcodes.io/postcodes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ postcodes: toFetch.slice(0, 100) }),
      });

      if (response.ok) {
        const data = await response.json();
        for (const item of (data.result || [])) {
          if (item.result) {
            const coords = { lat: item.result.latitude, lng: item.result.longitude };
            const clean = item.query.toUpperCase().replace(/\s+/g, '');
            postcodeCache.set(clean, coords);
            results.set(clean, coords);
          }
        }
      }
    } catch {
      // Ignore batch errors
    }
  }

  return results;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Calculate distance using cached coordinates
function getDistanceFromCoords(
  searchCoords: { lat: number; lng: number } | null,
  bizCoords: { lat: number; lng: number } | null
): string {
  if (!searchCoords || !bizCoords) return "";
  const miles = calculateDistance(searchCoords.lat, searchCoords.lng, bizCoords.lat, bizCoords.lng);
  if (miles < 1) return "< 1 mile";
  if (miles < 10) return `${miles.toFixed(1)} miles`;
  return `${Math.round(miles)} miles`;
}

function calculateLeadScore(business: Omit<Business, 'lead_score' | 'lead_signals'>): { score: number; signals: string[] } {
  let score = 50;
  const signals: string[] = [];

  if (!business.website) {
    score += 25;
    signals.push("No website - needs web presence");
  }
  if (!business.email) {
    score += 15;
    signals.push("No email - limited digital presence");
  }
  if (!business.phone) {
    score += 10;
    signals.push("No phone - minimal online info");
  }
  if (!business.rating) {
    score += 15;
    signals.push("No reviews - needs reputation building");
  } else {
    const ratingNum = parseFloat(business.rating);
    if (ratingNum < 3.5) {
      score += 20;
      signals.push("Low rating - needs reputation help");
    } else if (ratingNum < 4.0) {
      score += 10;
      signals.push("Average rating - room for growth");
    }
  }
  if (!business.review_count) {
    score += 10;
    signals.push("No review count - low engagement");
  } else {
    const reviewCount = parseInt(business.review_count);
    if (reviewCount < 5) {
      score += 15;
      signals.push("Few reviews - needs visibility");
    } else if (reviewCount < 20) {
      score += 8;
      signals.push("Limited reviews - needs exposure");
    }
  }

  const industryLower = business.industry.toLowerCase();
  const traditionalIndustries = ['plumber', 'electrician', 'builder', 'roofer', 'painter', 'garage', 'locksmith', 'carpenter', 'landscaping', 'cleaning', 'farm', 'manufacturer', 'wholesaler', 'distributor'];
  if (traditionalIndustries.some(ind => industryLower.includes(ind))) {
    score += 10;
    signals.push("Traditional trade - needs digital modernization");
  }

  const highValueIndustries = ['solicitor', 'accountant', 'architect', 'surveyor', 'dentist', 'private hospital', 'medical', 'yacht', 'boat', 'marina', 'hotel', 'property developer', 'investment', 'private equity', 'law firm', 'consultant', 'engineering'];
  if (highValueIndustries.some(ind => industryLower.includes(ind))) {
    score += 5;
    signals.push("High-value industry - budget available");
  }

  return { score: Math.min(score, 100), signals };
}

function extractPostcode(text: string): string {
  const match = text.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i);
  return match ? match[0].toUpperCase() : "";
}

function extractPhone(text: string): string {
  // Match UK phone numbers with strict digit count (10-11 digits after country code)
  const patterns = [
    // Standard UK format: 01onal or 02onal (landlines)
    /\b(0[1-9]\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4})\b/,
    // Mobile format: 07xxx
    /\b(07\d{3}[\s.-]?\d{3}[\s.-]?\d{3})\b/,
    // With +44: +44 xxx or +44 (0)xxx
    /\b(\+44[\s.-]?\(?\d?\)?[\s.-]?\d{2,4}[\s.-]?\d{3}[\s.-]?\d{3,4})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let phone = match[1].replace(/\s+/g, ' ').trim();
      // Validate total digit count (should be 10-11 for UK)
      const digits = phone.replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 13) {
        return phone;
      }
    }
  }
  return "";
}

function extractEmail(text: string): string {
  // Look for email patterns
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (match) {
    const email = match[0].toLowerCase();
    // Filter out common non-business emails
    if (!email.includes('example.com') && !email.includes('test.com') && !email.includes('noreply')) {
      return email;
    }
  }
  return "";
}

function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  let cleaned = text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}

function isValidBusinessName(name: string): boolean {
  if (!name || name.length < 3 || name.length > 100) return false;
  // Filter out garbage data patterns
  const garbagePatterns = [
    /^["']/, // Starts with quote (review text)
    /jsname=/i, // JavaScript attributes
    /data-/i, // Data attributes
    /href=/i, // HTML attributes
    /class=/i,
    /role=/i,
    /ping=/i,
    /ved=/i,
    /^\d+$/, // Just numbers
    /^\d+\s*(reviews?|ratings?)/i, // Review counts
    /^(more|less|see|view|show|hide|next|prev)/i, // UI elements
    /google/i,
    /search/i,
    /map/i,
    /directions/i,
    /website/i,
    /call/i,
    /^open/i,
    /^closed/i,
    /hours/i,
    /\.(com|co\.uk|org|net)$/i, // Domain names only
  ];
  return !garbagePatterns.some(pattern => pattern.test(name));
}

function cleanAddress(text: string): string {
  if (!text) return "";
  // Remove any HTML attributes or JavaScript that leaked through
  let cleaned = text
    .replace(/jsname="[^"]*"/gi, '')
    .replace(/data-[a-z-]+="[^"]*"/gi, '')
    .replace(/role="[^"]*"/gi, '')
    .replace(/class="[^"]*"/gi, '')
    .replace(/href="[^"]*"/gi, '')
    .replace(/ping="[^"]*"/gi, '')
    .replace(/ved="[^"]*"/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  // If it still contains HTML-like garbage, return empty
  if (cleaned.includes('=') || cleaned.includes('"') || cleaned.includes('<')) {
    return "";
  }
  return cleaned;
}

function createBusiness(data: Partial<Business>, source: string): Business | null {
  const name = cleanText(data.name) || "";

  // Validate business name
  if (!isValidBusinessName(name)) {
    return null;
  }

  // Clean and validate address
  const rawAddress = data.address || "";
  const address = cleanAddress(rawAddress) || "";

  // Clean and validate phone number
  let phone = data.phone || "";
  if (phone) {
    // Remove any non-phone characters and validate length
    const digits = phone.replace(/\D/g, '');
    // UK phone numbers should be 10-11 digits (or 12-13 with country code)
    if (digits.length < 10 || digits.length > 13) {
      phone = ""; // Invalid phone number
    } else {
      // Format nicely
      phone = phone.replace(/\s+/g, ' ').trim();
    }
  }

  const baseBusiness = {
    name,
    email: data.email || extractEmail(rawAddress + " " + (data.description || "")),
    phone,
    website: data.website || "",
    address,
    postcode: data.postcode || extractPostcode(address),
    industry: cleanText(data.industry) || "",
    description: cleanText(data.description) || "",
    rating: data.rating || "",
    review_count: data.review_count || "",
    source,
    scraped_at: new Date().toISOString(),
  };
  const { score, signals } = calculateLeadScore(baseBusiness);
  // Distance will be calculated later in batch
  return { ...baseBusiness, lead_score: score, lead_signals: signals, distance: "" };
}

// Calculate distances for all businesses using postcodes.io batch API
async function calculateDistances(businesses: Business[], searchLocation: string): Promise<Business[]> {
  if (!searchLocation || businesses.length === 0) return businesses;

  // Extract search postcode
  const searchPostcode = extractPostcode(searchLocation) || searchLocation.toUpperCase().replace(/\s+/g, '');

  // Get search location coordinates first
  const searchCoords = await getPostcodeCoords(searchPostcode);
  if (!searchCoords) {
    console.log(`[Distance] Could not geocode search location: ${searchLocation}`);
    return businesses;
  }

  console.log(`[Distance] Search location: ${searchPostcode} -> ${searchCoords.lat}, ${searchCoords.lng}`);

  // Collect all unique postcodes from businesses
  const businessPostcodes = [...new Set(
    businesses
      .map(b => b.postcode)
      .filter(pc => pc && pc.length >= 5)
  )];

  console.log(`[Distance] Geocoding ${businessPostcodes.length} business postcodes...`);

  // Batch geocode all postcodes
  const coordsMap = await batchGetPostcodeCoords(businessPostcodes);

  // Update businesses with distances
  return businesses.map(biz => {
    if (!biz.postcode) return biz;

    const cleanPostcode = biz.postcode.toUpperCase().replace(/\s+/g, '');
    const bizCoords = coordsMap.get(cleanPostcode);

    if (bizCoords) {
      const distance = getDistanceFromCoords(searchCoords, bizCoords);
      return { ...biz, distance };
    }

    return biz;
  });
}

// Helper to safely add a business to the array
function addBusiness(businesses: Business[], data: Partial<Business>, source: string): boolean {
  const biz = createBusiness(data, source);
  if (biz) {
    businesses.push(biz);
    return true;
  }
  return false;
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
};

// ============================================================================
// YELL.COM - Primary UK directory
// ============================================================================
async function scrapeYell(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];
  console.log(`[Yell] Starting scrape: ${query} in ${location}, ${maxPages} pages`);

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://www.yell.com/ucs/UcsSearchAction.do?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&pageNum=${page}`;
      console.log(`[Yell] Fetching page ${page}: ${url}`);

      const response = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      if (!response.ok) {
        console.log(`[Yell] Page ${page} failed: ${response.status}`);
        break;
      }

      const html = await response.text();
      console.log(`[Yell] Got ${html.length} bytes`);

      let found = 0;

      // Pattern 1: JSON-LD structured data (most reliable)
      const jsonLdMatches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
      for (const match of Array.from(jsonLdMatches)) {
        try {
          const data = JSON.parse(match[1]);
          if (data["@type"] === "LocalBusiness" || data["@type"] === "Organization") {
            if (addBusiness(businesses, {
              name: data.name,
              address: data.address?.streetAddress || "",
              postcode: data.address?.postalCode || extractPostcode(data.address?.streetAddress || ""),
              phone: data.telephone || "",
              website: data.url || "",
              rating: data.aggregateRating?.ratingValue?.toString() || "",
              review_count: data.aggregateRating?.reviewCount?.toString() || "",
              industry: query,
            }, "yell.com")) {
              found++;
            }
          }
          if (Array.isArray(data.itemListElement)) {
            for (const item of data.itemListElement) {
              if (item.item?.name) {
                if (addBusiness(businesses, {
                  name: item.item.name,
                  address: item.item.address?.streetAddress || "",
                  postcode: item.item.address?.postalCode || "",
                  phone: item.item.telephone || "",
                  website: item.item.url || "",
                  industry: query,
                }, "yell.com")) {
                  found++;
                }
              }
            }
          }
        } catch {}
      }

      // Pattern 2: Business capsule articles
      const articleMatches = html.matchAll(/<article[^>]*class="[^"]*businessCapsule[^"]*"[^>]*>([\s\S]*?)<\/article>/gi);
      for (const match of Array.from(articleMatches)) {
        const listing = match[0];
        const nameMatch = listing.match(/<a[^>]*class="[^"]*businessCapsule--name[^"]*"[^>]*>([^<]+)<\/a>/i) ||
                          listing.match(/businessCapsule--name[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) ||
                          listing.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
        if (!nameMatch) continue;

        const name = cleanText(nameMatch[1]);
        if (!name || name.length < 2) continue;

        // Extract full address
        const addressMatch = listing.match(/itemprop="streetAddress"[^>]*>([^<]+)/i) ||
                            listing.match(/businessCapsule--address[^>]*>([\s\S]*?)<\/(?:span|address|p)/i) ||
                            listing.match(/class="[^"]*address[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|p)/i);
        const address = addressMatch ? cleanText(addressMatch[1]) : "";

        // Extract postcode
        const postcodeMatch = listing.match(/itemprop="postalCode"[^>]*>([^<]+)/i);
        const postcode = postcodeMatch ? cleanText(postcodeMatch[1]) : extractPostcode(address);

        // Extract phone
        const phoneMatch = listing.match(/itemprop="telephone"[^>]*>([^<]+)/i) ||
                          listing.match(/businessCapsule--phone[^>]*>([^<]+)/i) ||
                          listing.match(/href="tel:([^"]+)"/i);
        const phone = phoneMatch ? cleanText(phoneMatch[1]) : extractPhone(listing);

        // Extract website
        const websiteMatch = listing.match(/href="(https?:\/\/(?!www\.yell)[^"]+)"/i);
        const website = websiteMatch ? websiteMatch[1] : "";

        const categoryMatch = listing.match(/businessCapsule--category[^>]*>([\s\S]*?)<\/(?:span|div)/i);
        const industry = categoryMatch ? cleanText(categoryMatch[1]) : query;

        const ratingMatch = listing.match(/starRating--average[^>]*>([0-9.]+)/i) ||
                           listing.match(/(\d+\.?\d*)\s*(?:star|\/5)/i);
        const rating = ratingMatch ? ratingMatch[1] : "";

        const reviewMatch = listing.match(/\((\d+)\s*review/i);
        const review_count = reviewMatch ? reviewMatch[1] : "";

        if (addBusiness(businesses, {
          name, address, phone, website, industry, rating, review_count, postcode,
        }, "yell.com")) {
          found++;
        }
      }

      // Pattern 3: Direct href to /biz/ pages (fallback)
      if (found === 0) {
        const bizMatches = html.matchAll(/<a[^>]*href="\/biz\/([^"]+)"[^>]*>([^<]+)<\/a>/gi);
        for (const match of Array.from(bizMatches)) {
          const name = cleanText(match[2]);
          if (name && name.length > 2 && !name.toLowerCase().includes('yell') && !name.toLowerCase().includes('more info')) {
            if (addBusiness(businesses, { name, industry: query, address: location }, "yell.com")) {
              found++;
            }
          }
        }
      }

      console.log(`[Yell] Page ${page}: found ${found} businesses`);
      if (found === 0) break;

      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`[Yell] Error on page ${page}:`, error);
      break;
    }
  }

  console.log(`[Yell] Total: ${businesses.length} businesses`);
  return businesses;
}

// ============================================================================
// SCOOT - UK Business Directory
// ============================================================================
async function scrapeScoot(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];
  console.log(`[Scoot] Starting scrape: ${query} in ${location}`);

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://www.scoot.co.uk/find/${encodeURIComponent(query)}/${encodeURIComponent(location)}?page=${page}`;
      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) break;

      const html = await response.text();
      let found = 0;

      // Extract business listings
      const listingMatches = html.matchAll(/<div[^>]*class="[^"]*listing[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi);
      for (const match of Array.from(listingMatches)) {
        const listing = match[0];
        const nameMatch = listing.match(/<h[23][^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) ||
                          listing.match(/<a[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/a>/i);
        if (!nameMatch) continue;

        const name = cleanText(nameMatch[1]);
        if (!name || name.length < 2) continue;

        const addressMatch = listing.match(/class="[^"]*address[^"]*"[^>]*>([^<]+)/i);
        const address = addressMatch ? cleanText(addressMatch[1]) : location;

        const phoneMatch = listing.match(/href="tel:([^"]+)"/i);
        const phone = phoneMatch ? cleanText(phoneMatch[1]) : extractPhone(listing);

        if (addBusiness(businesses, {
          name, address, phone, industry: query,
          postcode: extractPostcode(address),
        }, "scoot")) {
          found++;
        }
      }

      // Fallback: any links with business-looking URLs
      if (found === 0) {
        const linkMatches = html.matchAll(/<a[^>]*href="\/[^"]*\/([^"\/]+)"[^>]*>([^<]{3,50})<\/a>/gi);
        for (const match of Array.from(linkMatches)) {
          const name = cleanText(match[2]);
          if (name && name.length > 3 && !name.toLowerCase().includes('scoot') && !name.toLowerCase().includes('page')) {
            if (addBusiness(businesses, { name, industry: query, address: location }, "scoot")) {
              found++;
            }
            if (found >= 20) break;
          }
        }
      }

      console.log(`[Scoot] Page ${page}: found ${found} businesses`);
      if (found === 0) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`[Scoot] Error:`, error);
      break;
    }
  }

  return businesses;
}

// ============================================================================
// THOMSON LOCAL
// ============================================================================
async function scrapeThomson(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];
  console.log(`[Thomson] Starting scrape: ${query} in ${location}`);

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://www.thomsonlocal.com/search/${encodeURIComponent(query)}/${encodeURIComponent(location)}?page=${page}`;
      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) break;

      const html = await response.text();
      let found = 0;

      // Look for listing items
      const listingMatches = html.matchAll(/<(?:div|article)[^>]*class="[^"]*(?:listing|result|business)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article)>/gi);
      for (const match of Array.from(listingMatches)) {
        const listing = match[0];
        const nameMatch = listing.match(/<a[^>]*>([^<]{3,60})<\/a>/i);
        if (!nameMatch) continue;

        const name = cleanText(nameMatch[1]);
        if (!name || name.length < 2 || name.toLowerCase().includes('thomson')) continue;

        const phoneMatch = listing.match(/href="tel:([^"]+)"/i);
        const phone = phoneMatch ? cleanText(phoneMatch[1]) : extractPhone(listing);

        const addressMatch = listing.match(/class="[^"]*address[^"]*"[^>]*>([^<]+)/i);
        const address = addressMatch ? cleanText(addressMatch[1]) : location;

        if (addBusiness(businesses, {
          name, address, phone, industry: query,
          postcode: extractPostcode(address),
        }, "thomson")) {
          found++;
        }
      }

      // Fallback
      if (found === 0) {
        const nameMatches = html.matchAll(/<h[23][^>]*>[\s\S]*?<a[^>]*>([^<]{3,50})<\/a>/gi);
        for (const match of Array.from(nameMatches)) {
          const name = cleanText(match[1]);
          if (name && name.length > 2 && !name.toLowerCase().includes('thomson')) {
            if (addBusiness(businesses, { name, industry: query, address: location }, "thomson")) {
              found++;
            }
          }
        }
      }

      console.log(`[Thomson] Page ${page}: found ${found} businesses`);
      if (found === 0) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`[Thomson] Error:`, error);
      break;
    }
  }

  return businesses;
}

// ============================================================================
// YELP UK
// ============================================================================
async function scrapeYelp(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];
  console.log(`[Yelp] Starting scrape: ${query} in ${location}`);

  for (let page = 0; page < maxPages; page++) {
    try {
      const start = page * 10;
      const url = `https://www.yelp.co.uk/search?find_desc=${encodeURIComponent(query)}&find_loc=${encodeURIComponent(location)}&start=${start}`;
      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) break;

      const html = await response.text();
      let found = 0;

      // Try to find JSON-LD data first
      const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
      if (jsonLdMatch) {
        try {
          const data = JSON.parse(jsonLdMatch[1]);
          if (data.itemListElement) {
            for (const item of data.itemListElement) {
              if (item.item?.name) {
                if (addBusiness(businesses, {
                  name: item.item.name,
                  address: item.item.address?.streetAddress || location,
                  postcode: item.item.address?.postalCode || "",
                  rating: item.item.aggregateRating?.ratingValue?.toString() || "",
                  review_count: item.item.aggregateRating?.reviewCount?.toString() || "",
                  website: item.item.url || "",
                  industry: query,
                }, "yelp")) {
                  found++;
                }
              }
            }
          }
        } catch {}
      }

      // Fallback: regex for business links
      if (found === 0) {
        const bizMatches = html.matchAll(/<a[^>]*href="\/biz\/([^"?]+)[^"]*"[^>]*>([^<]+)<\/a>/gi);
        for (const match of Array.from(bizMatches)) {
          const name = cleanText(match[2]);
          if (name && name.length > 2 && !name.toLowerCase().includes('yelp') && !businesses.some(b => b.name === name)) {
            if (addBusiness(businesses, { name, industry: query, address: location }, "yelp")) {
              found++;
            }
          }
        }
      }

      console.log(`[Yelp] Page ${page + 1}: found ${found} businesses`);
      if (found === 0) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`[Yelp] Error:`, error);
      break;
    }
  }

  return businesses;
}

// ============================================================================
// FREEINDEX
// ============================================================================
async function scrapeFreeIndex(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];
  console.log(`[FreeIndex] Starting scrape: ${query} in ${location}`);

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://www.freeindex.co.uk/searchresults.htm?k=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&p=${page}`;
      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) break;

      const html = await response.text();
      let found = 0;

      // Look for profile links
      const profileMatches = html.matchAll(/<a[^>]*href="(\/profile\/[^"]+)"[^>]*>([^<]+)<\/a>/gi);
      for (const match of Array.from(profileMatches)) {
        const name = cleanText(match[2]);
        if (name && name.length > 2 && !businesses.some(b => b.name === name)) {
          if (addBusiness(businesses, { name, industry: query, address: location }, "freeindex")) {
            found++;
          }
        }
      }

      // Also try listing containers
      const listingMatches = html.matchAll(/<div[^>]*class="[^"]*li_[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi);
      for (const match of Array.from(listingMatches)) {
        const listing = match[0];
        const nameMatch = listing.match(/<a[^>]*>([^<]+)<\/a>/i);
        if (!nameMatch) continue;

        const name = cleanText(nameMatch[1]);
        if (name && name.length > 2 && !businesses.some(b => b.name === name)) {
          const phoneMatch = listing.match(/href="tel:([^"]+)"/i);
          const phone = phoneMatch ? cleanText(phoneMatch[1]) : extractPhone(listing);

          if (addBusiness(businesses, { name, phone, industry: query, address: location }, "freeindex")) {
            found++;
          }
        }
      }

      console.log(`[FreeIndex] Page ${page}: found ${found} businesses`);
      if (found === 0) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`[FreeIndex] Error:`, error);
      break;
    }
  }

  return businesses;
}

// ============================================================================
// CHECKATRADE
// ============================================================================
async function scrapeCheckatrade(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];
  console.log(`[Checkatrade] Starting scrape: ${query} in ${location}`);

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://www.checkatrade.com/Search/?what=${encodeURIComponent(query)}&where=${encodeURIComponent(location)}&page=${page}`;
      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) break;

      const html = await response.text();
      let found = 0;

      // Look for trade links
      const tradeMatches = html.matchAll(/<a[^>]*href="\/trades\/([^"]+)"[^>]*>([^<]*)<\/a>/gi);
      for (const match of Array.from(tradeMatches)) {
        const name = cleanText(match[2]);
        if (name && name.length > 2 && !businesses.some(b => b.name === name)) {
          if (addBusiness(businesses, { name, industry: query, address: location }, "checkatrade")) {
            found++;
          }
        }
      }

      // Try card containers
      const cardMatches = html.matchAll(/<div[^>]*class="[^"]*(?:SearchResult|TradeCard)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi);
      for (const match of Array.from(cardMatches)) {
        const card = match[0];
        const nameMatch = card.match(/<h[23][^>]*>([^<]+)<\/h/i) ||
                         card.match(/<a[^>]*>([^<]{3,50})<\/a>/i);
        if (!nameMatch) continue;

        const name = cleanText(nameMatch[1]);
        if (name && name.length > 2 && !businesses.some(b => b.name === name)) {
          const ratingMatch = card.match(/(\d+\.?\d*)\s*(?:\/\s*10|out of)/i);
          const rating = ratingMatch ? ratingMatch[1] : "";

          const reviewMatch = card.match(/(\d+)\s*review/i);
          const review_count = reviewMatch ? reviewMatch[1] : "";

          if (addBusiness(businesses, {
            name, rating, review_count, industry: query, address: location,
          }, "checkatrade")) {
            found++;
          }
        }
      }

      console.log(`[Checkatrade] Page ${page}: found ${found} businesses`);
      if (found === 0) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`[Checkatrade] Error:`, error);
      break;
    }
  }

  return businesses;
}

// ============================================================================
// TRUSTPILOT
// ============================================================================
async function scrapeTrustpilot(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];
  console.log(`[Trustpilot] Starting scrape: ${query} in ${location}`);

  for (let page = 1; page <= maxPages; page++) {
    try {
      const searchTerm = `${query} ${location}`;
      const url = `https://uk.trustpilot.com/search?query=${encodeURIComponent(searchTerm)}&page=${page}`;
      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) break;

      const html = await response.text();
      let found = 0;

      // Look for review links
      const reviewMatches = html.matchAll(/<a[^>]*href="\/review\/([^"]+)"[^>]*>([^<]*)<\/a>/gi);
      for (const match of Array.from(reviewMatches)) {
        const name = cleanText(match[2]);
        const domain = match[1];
        if (name && name.length > 2 && !name.toLowerCase().includes('trustpilot') && !businesses.some(b => b.name === name)) {
          if (addBusiness(businesses, {
            name,
            website: domain.includes('.') ? `https://${domain}` : "",
            industry: query,
          }, "trustpilot")) {
            found++;
          }
        }
      }

      // Try business unit cards
      const cardMatches = html.matchAll(/<div[^>]*data-business-unit-json='([^']+)'/gi);
      for (const match of Array.from(cardMatches)) {
        try {
          const data = JSON.parse(match[1]);
          if (data.displayName && !businesses.some(b => b.name === data.displayName)) {
            if (addBusiness(businesses, {
              name: data.displayName,
              website: data.websiteUrl || "",
              rating: data.trustScore?.toString() || "",
              review_count: data.numberOfReviews?.toString() || "",
              industry: query,
            }, "trustpilot")) {
              found++;
            }
          }
        } catch {}
      }

      console.log(`[Trustpilot] Page ${page}: found ${found} businesses`);
      if (found === 0) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`[Trustpilot] Error:`, error);
      break;
    }
  }

  return businesses;
}

// ============================================================================
// GOOGLE LOCAL SEARCH - Enhanced with multiple search patterns
// ============================================================================
async function scrapeGoogle(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];
  console.log(`[Google] Starting scrape: ${query} in ${location}`);

  // Try multiple search queries to get more results
  const searchQueries = [
    `${query} near ${location} UK`,
    `${query} in ${location}`,
    `${query} ${location} business`,
  ];

  for (let i = 0; i < Math.min(maxPages, searchQueries.length); i++) {
    try {
      const url = `https://www.google.com/search?q=${encodeURIComponent(searchQueries[i])}&tbm=lcl&num=40`;
      console.log(`[Google] Searching: ${searchQueries[i]}`);
      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) continue;

      const html = await response.text();

      // Pattern 1: Local business names in various div structures
      const patterns = [
        /<div[^>]*class="[^"]*(?:dbg0pd|OSrXXb|rllt__details|VkpGBb|BNeawe)[^"]*"[^>]*>([^<]+)<\/div>/gi,
        /<span[^>]*class="[^"]*(?:OSrXXb|dbg0pd|BNeawe)[^"]*"[^>]*>([^<]+)<\/span>/gi,
        /<a[^>]*class="[^"]*(?:yYlJEf|dbg0pd)[^"]*"[^>]*>([^<]+)<\/a>/gi,
        /<div[^>]*role="heading"[^>]*>([^<]+)<\/div>/gi,
      ];

      for (const pattern of patterns) {
        const matches = html.matchAll(pattern);
        for (const match of Array.from(matches)) {
          const name = cleanText(match[1]);
          if (name && name.length > 2 && name.length < 80 &&
              !name.toLowerCase().includes('google') &&
              !name.toLowerCase().includes('map') &&
              !name.toLowerCase().includes('search') &&
              !name.toLowerCase().includes('result') &&
              !name.match(/^\d/) &&
              !businesses.some(b => b.name.toLowerCase() === name.toLowerCase())) {

            // Get context around match for additional data
            const contextStart = Math.max(0, (match.index || 0) - 500);
            const contextEnd = Math.min(html.length, (match.index || 0) + 500);
            const context = html.substring(contextStart, contextEnd);

            const ratingMatch = context.match(/(\d+\.?\d*)\s*\((\d+)\)/);
            const phone = extractPhone(context);
            const addressMatch = context.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i);
            const postcode = addressMatch ? addressMatch[1].toUpperCase() : "";

            // Try to extract address
            const fullAddressMatch = context.match(/(?:Address|Located at|at)\s*:?\s*([^<]{10,80})/i);
            const address = fullAddressMatch ? cleanText(fullAddressMatch[1]) : location;

            addBusiness(businesses, {
              name,
              rating: ratingMatch ? ratingMatch[1] : "",
              review_count: ratingMatch ? ratingMatch[2] : "",
              phone,
              industry: query,
              address,
              postcode,
            }, "google");
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.log(`[Google] Error:`, error);
    }
  }

  console.log(`[Google] Found ${businesses.length} businesses`);
  return businesses;
}

// ============================================================================
// 118118 UK Directory
// ============================================================================
async function scrape118(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];
  console.log(`[118118] Starting scrape: ${query} in ${location}`);

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://www.118118.com/businesses/${encodeURIComponent(query)}/${encodeURIComponent(location)}/?page=${page}`;
      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) break;

      const html = await response.text();
      let found = 0;

      // Look for business listings
      const listingMatches = html.matchAll(/<(?:div|article)[^>]*class="[^"]*(?:listing|result|business)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article)>/gi);
      for (const match of Array.from(listingMatches)) {
        const listing = match[0];
        const nameMatch = listing.match(/<h[234][^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) ||
                          listing.match(/<a[^>]*class="[^"]*(?:title|name)[^"]*"[^>]*>([^<]+)<\/a>/i);
        if (!nameMatch) continue;

        const name = cleanText(nameMatch[1]);
        if (!name || name.length < 2) continue;

        const phoneMatch = listing.match(/href="tel:([^"]+)"/i);
        const phone = phoneMatch ? cleanText(phoneMatch[1]) : extractPhone(listing);

        const addressMatch = listing.match(/class="[^"]*address[^"]*"[^>]*>([^<]+)/i);
        const address = addressMatch ? cleanText(addressMatch[1]) : location;

        if (addBusiness(businesses, {
          name, phone, address, industry: query,
          postcode: extractPostcode(address),
        }, "118118")) {
          found++;
        }
      }

      console.log(`[118118] Page ${page}: found ${found} businesses`);
      if (found === 0) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`[118118] Error:`, error);
      break;
    }
  }

  return businesses;
}

// ============================================================================
// BARK
// ============================================================================
async function scrapeBark(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];
  console.log(`[Bark] Starting scrape: ${query} in ${location}`);

  for (let page = 1; page <= Math.min(maxPages, 3); page++) {
    try {
      const querySlug = query.toLowerCase().replace(/\s+/g, '-');
      const locationSlug = location.toLowerCase().replace(/\s+/g, '-');
      const url = page === 1
        ? `https://www.bark.com/en/gb/find/${querySlug}/${locationSlug}/`
        : `https://www.bark.com/en/gb/find/${querySlug}/${locationSlug}/?page=${page}`;
      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) break;

      const html = await response.text();
      let found = 0;

      // Look for professional cards
      const proMatches = html.matchAll(/<a[^>]*href="\/en\/gb\/company\/([^"]+)"[^>]*>([^<]*)<\/a>/gi);
      for (const match of Array.from(proMatches)) {
        const name = cleanText(match[2]);
        if (name && name.length > 2 && !businesses.some(b => b.name === name)) {
          if (addBusiness(businesses, { name, industry: query, address: location }, "bark")) {
            found++;
          }
        }
      }

      // Try card containers
      const cardMatches = html.matchAll(/<div[^>]*class="[^"]*(?:ProCard|professional)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi);
      for (const match of Array.from(cardMatches)) {
        const card = match[0];
        const nameMatch = card.match(/<h[234][^>]*>([^<]+)<\/h/i);
        if (!nameMatch) continue;

        const name = cleanText(nameMatch[1]);
        if (name && name.length > 2 && !businesses.some(b => b.name === name)) {
          const ratingMatch = card.match(/(\d+\.?\d*)\s*star/i);
          const rating = ratingMatch ? ratingMatch[1] : "";

          if (addBusiness(businesses, {
            name, rating, industry: query, address: location,
          }, "bark")) {
            found++;
          }
        }
      }

      console.log(`[Bark] Page ${page}: found ${found} businesses`);
      if (found === 0) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`[Bark] Error:`, error);
      break;
    }
  }

  console.log(`[Bark] Total: ${businesses.length} businesses`);
  return businesses;
}

// ============================================================================
// NOVALOCA - Industrial Estates and Business Parks
// ============================================================================
async function scrapeNovaloca(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];
  console.log(`[Novaloca] Starting scrape: ${query} in ${location}`);

  // Convert location to Novaloca format (County_Town)
  const locationParts = location.split(/[,\s]+/).filter(p => p.length > 2);
  const locationSlug = locationParts.length >= 2
    ? `${locationParts[0]}_${locationParts.slice(1).join('_')}`
    : location.replace(/\s+/g, '_');

  for (let page = 1; page <= maxPages; page++) {
    try {
      // Try different URL patterns
      const urls = [
        `https://www.novaloca.com/business-parks-industrial-estates/town/${encodeURIComponent(locationSlug)}`,
        `https://www.novaloca.com/business-parks-industrial-estates/search?location=${encodeURIComponent(location)}`,
        `https://www.novaloca.com/commercial-property/search?q=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&page=${page}`,
      ];

      for (const url of urls) {
        try {
          console.log(`[Novaloca] Trying: ${url}`);
          const response = await fetch(url, { headers: HEADERS });
          if (!response.ok) continue;

          const html = await response.text();
          let found = 0;

          // Pattern 1: h3 headings with links to details pages
          const h3Matches = html.matchAll(/<h3[^>]*>\s*<a[^>]*href="\/business-parks-industrial-estates\/details\/([^"]+)"[^>]*>([^<]+)<\/a>/gi);
          for (const match of Array.from(h3Matches)) {
            const name = cleanText(match[2]);
            if (name && name.length > 2 && !businesses.some(b => b.name === name)) {
              if (addBusiness(businesses, {
                name,
                industry: "Industrial Estate / Business Park",
                address: location,
                description: `Business park / industrial estate in ${location}`,
              }, "novaloca")) {
                found++;
              }
            }
          }

          // Pattern 2: Property listings with class patterns
          const listingMatches = html.matchAll(/<(?:div|article)[^>]*class="[^"]*(?:property|listing|result|park)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article)>/gi);
          for (const match of Array.from(listingMatches)) {
            const listing = match[0];
            const nameMatch = listing.match(/<h[234][^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) ||
                              listing.match(/<a[^>]*class="[^"]*(?:title|name)[^"]*"[^>]*>([^<]+)<\/a>/i);
            if (!nameMatch) continue;

            const name = cleanText(nameMatch[1]);
            if (name && name.length > 2 && !businesses.some(b => b.name === name)) {
              // Extract description
              const descMatch = listing.match(/<p[^>]*>([^<]{20,200})<\/p>/i);
              const description = descMatch ? cleanText(descMatch[1]) : "";

              // Extract size info
              const sizeMatch = listing.match(/(\d[\d,]*)\s*(?:sq\s*ft|sqft|square\s*f)/i);
              const size = sizeMatch ? `${sizeMatch[1]} sq ft` : "";

              if (addBusiness(businesses, {
                name,
                industry: "Industrial Estate / Business Park",
                address: location,
                description: description || (size ? `Available: ${size}` : `Commercial property in ${location}`),
              }, "novaloca")) {
                found++;
              }
            }
          }

          // Pattern 3: Generic links to details pages
          const detailMatches = html.matchAll(/<a[^>]*href="\/(?:business-parks-industrial-estates|commercial-property)\/details\/[^"]*"[^>]*>([^<]{3,60})<\/a>/gi);
          for (const match of Array.from(detailMatches)) {
            const name = cleanText(match[1]);
            if (name && name.length > 3 &&
                !name.toLowerCase().includes('more') &&
                !name.toLowerCase().includes('view') &&
                !name.toLowerCase().includes('details') &&
                !businesses.some(b => b.name === name)) {
              if (addBusiness(businesses, {
                name,
                industry: "Industrial Estate / Business Park",
                address: location,
              }, "novaloca")) {
                found++;
              }
            }
          }

          if (found > 0) {
            console.log(`[Novaloca] Found ${found} properties`);
            break; // Found results, don't try other URL patterns
          }
        } catch {}
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`[Novaloca] Error:`, error);
      break;
    }
  }

  console.log(`[Novaloca] Total: ${businesses.length} properties`);
  return businesses;
}

// ============================================================================
// WEBSITE SCRAPING - Extract detailed info from business websites
// ============================================================================

interface WebsiteData {
  emails: { address: string; type: 'personal' | 'generic'; source: string }[];
  phones: string[];
  description: string;
  address: string;
  postcode: string;
  socialMedia: {
    linkedin?: string;
    facebook?: string;
    twitter?: string;
    instagram?: string;
    youtube?: string;
  };
  openingHours?: string;
  services?: string[];
}

// Pages to crawl for contact info
const PAGES_TO_CRAWL = [
  '', // Homepage
  '/contact',
  '/contact-us',
  '/contactus',
  '/about',
  '/about-us',
  '/aboutus',
  '/team',
  '/our-team',
  '/meet-the-team',
];

async function scrapeWebsite(websiteUrl: string): Promise<WebsiteData> {
  const data: WebsiteData = {
    emails: [],
    phones: [],
    description: '',
    address: '',
    postcode: '',
    socialMedia: {},
    services: [],
  };

  if (!websiteUrl) return data;

  // Normalize URL
  let baseUrl = websiteUrl;
  if (!baseUrl.startsWith('http')) {
    baseUrl = `https://${baseUrl}`;
  }
  baseUrl = baseUrl.replace(/\/$/, '');

  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  // Crawl multiple pages
  for (const page of PAGES_TO_CRAWL) {
    try {
      const url = `${baseUrl}${page}`;
      const response = await fetch(url, {
        headers: HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) continue;

      const html = await response.text();
      const pageName = page || 'homepage';

      // Extract emails
      extractEmails(html, pageName, data.emails, seenEmails);

      // Extract phone numbers
      extractPhones(html, data.phones, seenPhones);

      // Extract description (prefer from homepage)
      if (!data.description && page === '') {
        data.description = extractDescription(html);
      }

      // Extract address
      if (!data.address) {
        const addrResult = extractAddress(html);
        if (addrResult.address) {
          data.address = addrResult.address;
          data.postcode = addrResult.postcode || data.postcode;
        }
      }

      // Extract social media links
      extractSocialMedia(html, data.socialMedia);

      // Extract opening hours
      if (!data.openingHours) {
        data.openingHours = extractOpeningHours(html);
      }

      // Extract services (from about/services pages)
      if (page.includes('about') || page.includes('service')) {
        const services = extractServices(html);
        data.services = [...new Set([...data.services!, ...services])];
      }

      // Small delay between requests to be polite
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch {
      // Continue to next page on error
      continue;
    }
  }

  // Sort emails - personal first
  data.emails.sort((a, b) => {
    if (a.type === 'personal' && b.type !== 'personal') return -1;
    if (a.type !== 'personal' && b.type === 'personal') return 1;
    return 0;
  });

  return data;
}

function extractEmails(
  html: string,
  pageName: string,
  emails: WebsiteData['emails'],
  seen: Set<string>
): void {
  const patterns = [
    // Mailto links (highest confidence)
    /href="mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?:\?[^"]*)?"[^>]*>/gi,
    // Email in text
    /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(?:co\.uk|com|org|net|uk|io|biz|info))\b/gi,
  ];

  // Invalid email patterns to skip
  const invalidPatterns = [
    /example\.com/i,
    /test\.com/i,
    /noreply/i,
    /no-reply/i,
    /wixpress/i,
    /sentry\.io/i,
    /cloudflare/i,
    /@w\.org/i,
    /@schema\.org/i,
    /@sentry/i,
    /\.png$/i,
    /\.jpg$/i,
    /\.gif$/i,
    /\.svg$/i,
  ];

  for (const pattern of patterns) {
    const matches = html.matchAll(pattern);
    for (const match of Array.from(matches)) {
      const email = (match[1] || match[0]).toLowerCase().trim();

      // Skip invalid emails
      if (!email.includes('@') || seen.has(email)) continue;
      if (invalidPatterns.some(p => p.test(email))) continue;

      seen.add(email);

      // Categorize email
      const type = categorizeEmail(email);

      emails.push({
        address: email,
        type,
        source: pageName,
      });
    }
  }
}

function categorizeEmail(email: string): 'personal' | 'generic' {
  const genericPrefixes = [
    'info', 'hello', 'contact', 'enquiries', 'enquiry', 'sales', 'support',
    'admin', 'office', 'mail', 'help', 'general', 'reception', 'bookings',
    'team', 'customer', 'service', 'services', 'accounts', 'finance',
    'careers', 'jobs', 'press', 'media', 'marketing', 'feedback',
  ];

  const localPart = email.split('@')[0].toLowerCase();

  // Generic if matches known prefix
  if (genericPrefixes.some(prefix => localPart === prefix || localPart.startsWith(prefix + '.'))) {
    return 'generic';
  }

  // Personal if looks like a name (contains dot or is a single word > 3 chars)
  if (localPart.includes('.') && !genericPrefixes.some(p => localPart.includes(p))) {
    return 'personal';
  }

  // Single word that's not a generic prefix - likely personal
  if (/^[a-z]{3,}$/.test(localPart) && !genericPrefixes.includes(localPart)) {
    return 'personal';
  }

  return 'generic';
}

function extractPhones(html: string, phones: string[], seen: Set<string>): void {
  const patterns = [
    // Tel links
    /href="tel:([^"]+)"/gi,
    // UK formats
    /\b(0[1-9]\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4})\b/g,
    /\b(07\d{3}[\s.-]?\d{3}[\s.-]?\d{3})\b/g,
    /\b(\+44[\s.-]?\(?\d?\)?[\s.-]?\d{2,4}[\s.-]?\d{3}[\s.-]?\d{3,4})\b/g,
  ];

  for (const pattern of patterns) {
    const matches = html.matchAll(pattern);
    for (const match of Array.from(matches)) {
      let phone = (match[1] || match[0]).replace(/\s+/g, ' ').trim();

      // Clean up tel: prefix if present
      phone = phone.replace(/^tel:/i, '');

      // Validate digit count
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 13) continue;

      // Normalize for deduplication
      const normalized = digits;
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      phones.push(phone);
    }
  }
}

function extractDescription(html: string): string {
  const patterns = [
    // Meta description (most reliable)
    /<meta[^>]*name="description"[^>]*content="([^"]+)"/i,
    /<meta[^>]*content="([^"]+)"[^>]*name="description"/i,
    // Open Graph
    /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i,
    // Twitter
    /<meta[^>]*name="twitter:description"[^>]*content="([^"]+)"/i,
    // Schema.org
    /"description"\s*:\s*"([^"]{20,300})"/i,
    // About section
    /<(?:p|div)[^>]*class="[^"]*(?:about|intro|description|summary)[^"]*"[^>]*>([^<]{30,300})</i,
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

function extractAddress(html: string): { address: string; postcode: string } {
  const result = { address: '', postcode: '' };

  const patterns = [
    // Schema.org address
    /"streetAddress"\s*:\s*"([^"]+)"/i,
    // Address tag
    /<address[^>]*>([\s\S]{10,200}?)<\/address>/i,
    // Common address classes
    /<(?:div|span|p)[^>]*class="[^"]*(?:address|location|contact-address)[^"]*"[^>]*>([\s\S]{10,200}?)<\/(?:div|span|p)>/i,
    // Text with postcode
    /(?:address|location|find us|visit us)[:\s]*([^<]{10,150}[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const addr = cleanText(match[1]);
      if (addr.length >= 10 && addr.length <= 200 && !addr.includes('=')) {
        result.address = addr;
        result.postcode = extractPostcode(addr);
        break;
      }
    }
  }

  // Try to extract just postcode if no full address found
  if (!result.postcode) {
    const postcodeMatch = html.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
    if (postcodeMatch) {
      result.postcode = postcodeMatch[1].toUpperCase();
    }
  }

  return result;
}

function extractSocialMedia(html: string, social: WebsiteData['socialMedia']): void {
  if (!social.linkedin) {
    const match = html.match(/href="(https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^"?#]+)/i);
    if (match) social.linkedin = match[1];
  }

  if (!social.facebook) {
    const match = html.match(/href="(https?:\/\/(?:www\.)?facebook\.com\/[^"?#]+)/i);
    if (match && !match[1].includes('sharer')) social.facebook = match[1];
  }

  if (!social.twitter) {
    const match = html.match(/href="(https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^"?#]+)/i);
    if (match && !match[1].includes('intent')) social.twitter = match[1];
  }

  if (!social.instagram) {
    const match = html.match(/href="(https?:\/\/(?:www\.)?instagram\.com\/[^"?#]+)/i);
    if (match) social.instagram = match[1];
  }

  if (!social.youtube) {
    const match = html.match(/href="(https?:\/\/(?:www\.)?youtube\.com\/(?:channel|c|user)\/[^"?#]+)/i);
    if (match) social.youtube = match[1];
  }
}

function extractOpeningHours(html: string): string {
  const patterns = [
    // Schema.org
    /"openingHours"\s*:\s*"([^"]+)"/i,
    /"openingHours"\s*:\s*\[([^\]]+)\]/i,
    // Common patterns
    /(?:opening\s*hours?|hours\s*of\s*operation|business\s*hours)[:\s]*([^<]{10,150})/i,
    /<(?:div|span|p)[^>]*class="[^"]*(?:hours|opening|times)[^"]*"[^>]*>([\s\S]{10,150}?)<\/(?:div|span|p)>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const hours = cleanText(match[1]);
      if (hours.length >= 5 && hours.length <= 200) {
        return hours;
      }
    }
  }

  return '';
}

function extractServices(html: string): string[] {
  const services: string[] = [];

  // Look for service lists
  const listPatterns = [
    /<(?:ul|ol)[^>]*class="[^"]*(?:service|offering)[^"]*"[^>]*>([\s\S]*?)<\/(?:ul|ol)>/gi,
    /<h[234][^>]*>(?:our\s+)?services?<\/h[234]>[\s\S]*?<(?:ul|ol)[^>]*>([\s\S]*?)<\/(?:ul|ol)>/gi,
  ];

  for (const pattern of listPatterns) {
    const listMatches = html.matchAll(pattern);
    for (const listMatch of Array.from(listMatches)) {
      const listHtml = listMatch[1];
      const itemMatches = listHtml.matchAll(/<li[^>]*>([^<]{3,50})/gi);
      for (const itemMatch of Array.from(itemMatches)) {
        const service = cleanText(itemMatch[1]);
        if (service && service.length >= 3 && service.length <= 50) {
          services.push(service);
        }
      }
    }
  }

  return services.slice(0, 10); // Limit to 10 services
}

// Main enrichment function that uses the website scraper
async function enrichBusinessWithEmail(business: Business): Promise<Business> {
  if (!business.website) {
    return business;
  }

  try {
    console.log(`[Enrich] Scraping website for ${business.name}: ${business.website}`);

    const websiteData = await scrapeWebsite(business.website);

    // Get best email (prefer personal, then first available)
    const bestEmail = websiteData.emails.find(e => e.type === 'personal')?.address
      || websiteData.emails[0]?.address
      || business.email;

    // Get best phone
    const bestPhone = websiteData.phones[0] || business.phone;

    // Build description from extracted data
    let description = websiteData.description || business.description;
    if (websiteData.services && websiteData.services.length > 0 && !description) {
      description = `Services: ${websiteData.services.slice(0, 5).join(', ')}`;
    }

    // Log what was found
    const found: string[] = [];
    if (websiteData.emails.length > 0) found.push(`${websiteData.emails.length} emails`);
    if (websiteData.phones.length > 0) found.push(`${websiteData.phones.length} phones`);
    if (websiteData.description) found.push('description');
    if (Object.values(websiteData.socialMedia).some(Boolean)) found.push('social');
    if (websiteData.address) found.push('address');

    if (found.length > 0) {
      console.log(`[Enrich] Found for ${business.name}: ${found.join(', ')}`);
    }

    return {
      ...business,
      email: bestEmail,
      phone: bestPhone,
      description: description,
      address: websiteData.address || business.address,
      postcode: websiteData.postcode || business.postcode,
      // Store additional data in a way the frontend can use
      // The frontend already handles these fields from the enrich API
    };
  } catch (error) {
    console.log(`[Enrich] Failed for ${business.name}:`, error);
    return business;
  }
}

// Enrich multiple businesses in parallel (with rate limiting)
async function enrichBusinesses(businesses: Business[], maxEnrich: number = 20): Promise<Business[]> {
  // Only enrich businesses with websites but no email
  const toEnrich = businesses
    .filter(b => b.website && !b.email)
    .slice(0, maxEnrich);

  if (toEnrich.length === 0) {
    return businesses;
  }

  console.log(`[Enrich] Enriching ${toEnrich.length} businesses...`);

  // Process in batches of 5 to avoid overwhelming servers
  const batchSize = 5;
  const enrichedMap = new Map<string, Business>();

  for (let i = 0; i < toEnrich.length; i += batchSize) {
    const batch = toEnrich.slice(i, i + batchSize);
    const enrichedBatch = await Promise.all(
      batch.map(b => enrichBusinessWithEmail(b).catch(() => b))
    );
    for (const enriched of enrichedBatch) {
      enrichedMap.set(enriched.name, enriched);
    }
    // Small delay between batches
    if (i + batchSize < toEnrich.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Merge enriched data back
  return businesses.map(b => enrichedMap.get(b.name) || b);
}

// ============================================================================
// MAIN API HANDLER
// ============================================================================
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { query, location, sources = ["yell", "freeindex", "thomson", "google"], max_pages = 5, enrich_emails = true } = body;

    if (!query || !location) {
      return NextResponse.json({ error: "Missing query or location" }, { status: 400 });
    }

    console.log(`\n========== NEW SEARCH ==========`);
    console.log(`Query: ${query}, Location: ${location}, Pages: ${max_pages}`);
    console.log(`Sources: ${sources.join(', ')}`);

    const maxPages = Math.min(max_pages, 15);
    const scraperPromises: Promise<Business[]>[] = [];
    const searchLocation = location; // Save for distance calculation

    const scraperMap: Record<string, (q: string, l: string, p: number) => Promise<Business[]>> = {
      yell: scrapeYell,
      freeindex: scrapeFreeIndex,
      thomson: scrapeThomson,
      checkatrade: scrapeCheckatrade,
      trustpilot: scrapeTrustpilot,
      yelp: scrapeYelp,
      google: scrapeGoogle,
      bark: scrapeBark,
      scoot: scrapeScoot,
      "118": scrape118,
      novaloca: scrapeNovaloca,
    };

    for (const source of sources) {
      if (scraperMap[source]) {
        scraperPromises.push(
          scraperMap[source](query, location, maxPages).catch(err => {
            console.log(`[${source}] Failed:`, err.message);
            return [];
          })
        );
      }
    }

    const results = await Promise.all(scraperPromises);
    let allBusinesses: Business[] = [];
    for (const result of results) {
      allBusinesses.push(...result);
    }

    console.log(`\nTotal scraped: ${allBusinesses.length}`);

    // Deduplicate by normalized name
    const seen = new Set<string>();
    const uniqueBusinesses = allBusinesses.filter(biz => {
      const key = biz.name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 25);
      if (key && key.length > 2 && !seen.has(key)) {
        seen.add(key);
        return true;
      }
      return false;
    });

    // Sort by lead score
    uniqueBusinesses.sort((a, b) => b.lead_score - a.lead_score);

    // Calculate distances using postcodes.io API
    console.log(`\nCalculating distances from ${searchLocation}...`);
    let businessesWithDistance = await calculateDistances(uniqueBusinesses, searchLocation);

    // Enrich businesses with emails from their websites
    let finalBusinesses = businessesWithDistance;
    if (enrich_emails && businessesWithDistance.length > 0) {
      console.log(`\nEnriching top businesses with email/description...`);
      finalBusinesses = await enrichBusinesses(businessesWithDistance, 15);
    }

    const elapsed = Date.now() - startTime;
    console.log(`Unique businesses: ${finalBusinesses.length}`);
    console.log(`Time: ${elapsed}ms`);
    console.log(`================================\n`);

    return NextResponse.json({
      businesses: finalBusinesses,
      count: finalBusinesses.length,
      query,
      location,
      sources,
      elapsed_ms: elapsed,
    });
  } catch (error) {
    console.error("Scrape error:", error);
    return NextResponse.json({ error: "Scraping failed" }, { status: 500 });
  }
}
