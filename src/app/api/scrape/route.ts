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

// UK postcode to lat/lng approximation (center of postcode areas)
const POSTCODE_COORDS: Record<string, [number, number]> = {
  "SW": [51.4613, -0.1725], "SE": [51.4500, -0.0500], "NW": [51.5500, -0.1900],
  "N": [51.5800, -0.1000], "E": [51.5500, 0.0500], "W": [51.5200, -0.1800],
  "WC": [51.5150, -0.1200], "EC": [51.5150, -0.0900], "BR": [51.4000, 0.0500],
  "CR": [51.3700, -0.0900], "DA": [51.4500, 0.1400], "EN": [51.6500, -0.0800],
  "HA": [51.5800, -0.3300], "IG": [51.5700, 0.0800], "KT": [51.3900, -0.3000],
  "RM": [51.5600, 0.1800], "SM": [51.3600, -0.1700], "TW": [51.4500, -0.3500],
  "UB": [51.5400, -0.4500], "WD": [51.6900, -0.4200], "B": [52.4800, -1.9000],
  "CV": [52.4000, -1.5000], "DY": [52.5100, -2.0900], "WS": [52.5800, -1.9800],
  "WV": [52.5900, -2.1300], "M": [53.4800, -2.2400], "OL": [53.5400, -2.1100],
  "BL": [53.5800, -2.4300], "SK": [53.4000, -2.1600], "WN": [53.5500, -2.6300],
  "L": [53.4100, -2.9800], "CH": [53.2000, -2.9000], "PR": [53.7600, -2.7000],
  "FY": [53.8200, -3.0500], "BB": [53.7600, -2.4800], "LA": [54.0500, -2.8000],
  "LS": [53.8000, -1.5500], "BD": [53.7900, -1.7500], "HX": [53.7300, -1.8600],
  "HD": [53.6500, -1.7800], "WF": [53.6800, -1.5000], "HU": [53.7500, -0.3400],
  "DN": [53.5200, -1.1300], "S": [53.3800, -1.4700], "YO": [53.9600, -1.0800],
  "NE": [55.0000, -1.6000], "DH": [54.7600, -1.5700], "SR": [54.9100, -1.3800],
  "TS": [54.5700, -1.2400], "DL": [54.5300, -1.5600], "CA": [54.8900, -2.9400],
  "G": [55.8600, -4.2500], "EH": [55.9500, -3.2000], "FK": [56.0000, -3.7800],
  "KY": [56.2000, -3.0000], "DD": [56.4600, -2.9700], "PH": [56.7200, -4.0000],
  "AB": [57.1500, -2.1100], "IV": [57.4800, -4.2200], "PA": [55.8500, -4.4300],
  "KA": [55.4600, -4.6300], "ML": [55.7700, -3.9800], "CF": [51.4800, -3.1800],
  "SA": [51.6200, -3.9400], "LL": [53.1300, -3.6300], "SY": [52.4100, -2.7100],
  "LD": [52.2600, -3.3800], "NP": [51.5800, -2.9900], "BS": [51.4500, -2.5900],
  "BA": [51.3800, -2.3600], "GL": [51.8700, -2.2400], "SN": [51.5600, -1.7800],
  "SP": [51.0700, -1.7900], "DT": [50.7100, -2.4400], "BH": [50.7200, -1.8800],
  "SO": [50.9000, -1.4000], "PO": [50.8200, -1.0900], "GU": [51.2400, -0.7600],
  "RH": [51.1200, -0.2000], "TN": [51.1400, 0.2700], "CT": [51.2800, 1.0800],
  "ME": [51.2700, 0.5300], "BN": [50.8200, -0.1400], "RG": [51.4500, -1.0000],
  "OX": [51.7500, -1.2500], "HP": [51.7600, -0.7700], "MK": [52.0400, -0.7600],
  "LU": [51.8800, -0.4200], "AL": [51.7500, -0.3400], "SG": [51.9000, -0.2000],
  "CM": [51.7700, 0.4800], "CO": [51.8900, 0.9000], "IP": [52.0600, 1.1600],
  "CB": [52.2100, 0.1200], "NR": [52.6300, 1.3000], "PE": [52.5700, -0.2500],
  "NN": [52.2400, -0.9000], "LE": [52.6300, -1.1300], "DE": [52.9200, -1.4800],
  "NG": [52.9500, -1.1500], "LN": [53.2300, -0.5400],
};

function getPostcodeCoords(postcode: string): [number, number] | null {
  if (!postcode) return null;
  const clean = postcode.toUpperCase().replace(/\s+/g, '');
  // Try 2-letter prefix first, then 1-letter
  const prefix2 = clean.substring(0, 2);
  const prefix1 = clean.substring(0, 1);
  return POSTCODE_COORDS[prefix2] || POSTCODE_COORDS[prefix1] || null;
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

function getDistanceFromPostcodes(searchPostcode: string, businessPostcode: string): string {
  const searchCoords = getPostcodeCoords(searchPostcode);
  const bizCoords = getPostcodeCoords(businessPostcode);
  if (!searchCoords || !bizCoords) return "";
  const miles = calculateDistance(searchCoords[0], searchCoords[1], bizCoords[0], bizCoords[1]);
  if (miles < 1) return "< 1 mile";
  return `~${Math.round(miles)} miles`;
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
  const match = text.match(/(?:\+44|0)[\s.-]?\d{2,5}[\s.-]?\d{3,4}[\s.-]?\d{3,4}/);
  return match ? match[0].replace(/\s+/g, ' ').trim() : "";
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

function createBusiness(data: Partial<Business>, source: string, searchLocation?: string): Business | null {
  const name = cleanText(data.name) || "";

  // Validate business name
  if (!isValidBusinessName(name)) {
    return null;
  }

  // Clean and validate address
  const rawAddress = data.address || "";
  const address = cleanAddress(rawAddress) || "";

  const baseBusiness = {
    name,
    email: data.email || extractEmail(rawAddress + " " + (data.description || "")),
    phone: data.phone || "",
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
  const distance = searchLocation && baseBusiness.postcode
    ? getDistanceFromPostcodes(searchLocation, baseBusiness.postcode)
    : "";
  return { ...baseBusiness, lead_score: score, lead_signals: signals, distance };
}

// Helper to safely add a business to the array
function addBusiness(businesses: Business[], data: Partial<Business>, source: string, searchLocation?: string): boolean {
  const biz = createBusiness(data, source, searchLocation);
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
async function scrapeYell(query: string, location: string, maxPages: number, searchLocation?: string): Promise<Business[]> {
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
            }, "yell.com", searchLocation)) {
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
                }, "yell.com", searchLocation)) {
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
        }, "yell.com", searchLocation)) {
          found++;
        }
      }

      // Pattern 3: Direct href to /biz/ pages (fallback)
      if (found === 0) {
        const bizMatches = html.matchAll(/<a[^>]*href="\/biz\/([^"]+)"[^>]*>([^<]+)<\/a>/gi);
        for (const match of Array.from(bizMatches)) {
          const name = cleanText(match[2]);
          if (name && name.length > 2 && !name.toLowerCase().includes('yell') && !name.toLowerCase().includes('more info')) {
            if (addBusiness(businesses, { name, industry: query, address: location }, "yell.com", searchLocation)) {
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
async function scrapeScoot(query: string, location: string, maxPages: number, searchLocation?: string): Promise<Business[]> {
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
        }, "scoot", searchLocation)) {
          found++;
        }
      }

      // Fallback: any links with business-looking URLs
      if (found === 0) {
        const linkMatches = html.matchAll(/<a[^>]*href="\/[^"]*\/([^"\/]+)"[^>]*>([^<]{3,50})<\/a>/gi);
        for (const match of Array.from(linkMatches)) {
          const name = cleanText(match[2]);
          if (name && name.length > 3 && !name.toLowerCase().includes('scoot') && !name.toLowerCase().includes('page')) {
            if (addBusiness(businesses, { name, industry: query, address: location }, "scoot", searchLocation)) {
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
async function scrapeThomson(query: string, location: string, maxPages: number, searchLocation?: string): Promise<Business[]> {
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
        }, "thomson", searchLocation)) {
          found++;
        }
      }

      // Fallback
      if (found === 0) {
        const nameMatches = html.matchAll(/<h[23][^>]*>[\s\S]*?<a[^>]*>([^<]{3,50})<\/a>/gi);
        for (const match of Array.from(nameMatches)) {
          const name = cleanText(match[1]);
          if (name && name.length > 2 && !name.toLowerCase().includes('thomson')) {
            if (addBusiness(businesses, { name, industry: query, address: location }, "thomson", searchLocation)) {
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
async function scrapeYelp(query: string, location: string, maxPages: number, searchLocation?: string): Promise<Business[]> {
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
                }, "yelp", searchLocation)) {
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
            if (addBusiness(businesses, { name, industry: query, address: location }, "yelp", searchLocation)) {
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
async function scrapeFreeIndex(query: string, location: string, maxPages: number, searchLocation?: string): Promise<Business[]> {
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
          if (addBusiness(businesses, { name, industry: query, address: location }, "freeindex", searchLocation)) {
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

          if (addBusiness(businesses, { name, phone, industry: query, address: location }, "freeindex", searchLocation)) {
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
async function scrapeCheckatrade(query: string, location: string, maxPages: number, searchLocation?: string): Promise<Business[]> {
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
          if (addBusiness(businesses, { name, industry: query, address: location }, "checkatrade", searchLocation)) {
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
          }, "checkatrade", searchLocation)) {
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
async function scrapeTrustpilot(query: string, location: string, maxPages: number, searchLocation?: string): Promise<Business[]> {
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
          }, "trustpilot", searchLocation)) {
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
            }, "trustpilot", searchLocation)) {
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
async function scrapeGoogle(query: string, location: string, maxPages: number, searchLocation?: string): Promise<Business[]> {
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
            }, "google", searchLocation);
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
async function scrape118(query: string, location: string, maxPages: number, searchLocation?: string): Promise<Business[]> {
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
        }, "118118", searchLocation)) {
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
async function scrapeBark(query: string, location: string, maxPages: number, searchLocation?: string): Promise<Business[]> {
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
          if (addBusiness(businesses, { name, industry: query, address: location }, "bark", searchLocation)) {
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
          }, "bark", searchLocation)) {
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
// WEBSITE EMAIL ENRICHMENT - Crawl business websites to find emails
// ============================================================================
async function enrichBusinessWithEmail(business: Business): Promise<Business> {
  if (business.email || !business.website) {
    return business;
  }

  try {
    // Normalize website URL
    let websiteUrl = business.website;
    if (!websiteUrl.startsWith('http')) {
      websiteUrl = `https://${websiteUrl}`;
    }

    console.log(`[Enrich] Fetching ${websiteUrl} for ${business.name}`);
    const response = await fetch(websiteUrl, {
      headers: HEADERS,
      redirect: 'follow',
    });

    if (!response.ok) {
      return business;
    }

    const html = await response.text();

    // Extract email from website
    const emailPatterns = [
      // Mailto links
      /href="mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"/gi,
      // Email patterns in text
      /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(?:co\.uk|com|org|net|uk|io))\b/gi,
      // Contact email patterns
      /(?:email|contact|info|enquir|support|sales|hello|admin)[@:]\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    ];

    let foundEmail = "";
    for (const pattern of emailPatterns) {
      const matches = html.matchAll(pattern);
      for (const match of Array.from(matches)) {
        const email = (match[1] || match[0]).toLowerCase().trim();
        // Filter out common non-business emails
        if (email &&
            !email.includes('example.com') &&
            !email.includes('test.com') &&
            !email.includes('noreply') &&
            !email.includes('wixpress') &&
            !email.includes('sentry') &&
            !email.includes('protection') &&
            email.includes('@')) {
          foundEmail = email;
          break;
        }
      }
      if (foundEmail) break;
    }

    // Extract phone if not present
    let phone = business.phone;
    if (!phone) {
      const phoneMatch = extractPhone(html);
      if (phoneMatch) {
        phone = phoneMatch;
      }
    }

    // Extract description/about text
    let description = business.description;
    if (!description) {
      const descPatterns = [
        /<meta[^>]*name="description"[^>]*content="([^"]+)"/i,
        /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i,
        /<p[^>]*class="[^"]*(?:about|description|intro)[^"]*"[^>]*>([^<]{20,200})<\/p>/i,
      ];
      for (const pattern of descPatterns) {
        const match = html.match(pattern);
        if (match) {
          description = cleanText(match[1]).substring(0, 200);
          break;
        }
      }
    }

    // Extract address if not present
    let address = business.address;
    let postcode = business.postcode;
    if (!address || address === business.industry) {
      const addressPatterns = [
        /(?:address|location|find us)[^<]*?([^<]*[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}[^<]*)/i,
        /<address[^>]*>([\s\S]*?)<\/address>/i,
      ];
      for (const pattern of addressPatterns) {
        const match = html.match(pattern);
        if (match) {
          const extracted = cleanText(match[1]);
          if (extracted.length > 10 && extracted.length < 150) {
            address = extracted;
            postcode = extractPostcode(address) || postcode;
            break;
          }
        }
      }
    }

    if (foundEmail || description || (phone && !business.phone)) {
      console.log(`[Enrich] Found for ${business.name}: email=${foundEmail}, desc=${description?.substring(0, 30)}...`);
    }

    return {
      ...business,
      email: foundEmail || business.email,
      phone: phone || business.phone,
      description: description || business.description,
      address: address || business.address,
      postcode: postcode || business.postcode,
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

    const scraperMap: Record<string, (q: string, l: string, p: number, s?: string) => Promise<Business[]>> = {
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
    };

    for (const source of sources) {
      if (scraperMap[source]) {
        scraperPromises.push(
          scraperMap[source](query, location, maxPages, searchLocation).catch(err => {
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

    // Enrich businesses with emails from their websites
    let finalBusinesses = uniqueBusinesses;
    if (enrich_emails && uniqueBusinesses.length > 0) {
      console.log(`\nEnriching top businesses with email/description...`);
      finalBusinesses = await enrichBusinesses(uniqueBusinesses, 15);
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
