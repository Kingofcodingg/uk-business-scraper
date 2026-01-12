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
}

// Calculate lead score
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

  const traditionalIndustries = [
    'plumber', 'electrician', 'builder', 'roofer', 'painter', 'garage',
    'locksmith', 'carpenter', 'landscaping', 'cleaning', 'farm',
    'manufacturer', 'wholesaler', 'distributor', 'tradesman'
  ];

  const industryLower = business.industry.toLowerCase();
  if (traditionalIndustries.some(ind => industryLower.includes(ind))) {
    score += 10;
    signals.push("Traditional trade - needs digital modernization");
  }

  const highValueIndustries = [
    'solicitor', 'accountant', 'architect', 'surveyor', 'dentist',
    'private hospital', 'medical', 'yacht', 'boat', 'marina',
    'hotel', 'property developer', 'investment', 'private equity',
    'law firm', 'consultant', 'engineering'
  ];

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
  const patterns = [
    /(?:\+44|0)[\s.-]?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}/,
    /(?:\+44|0)\s?\d{10,11}/,
    /\d{5}\s?\d{6}/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  return "";
}

function extractEmail(text: string): string {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (match) {
    const email = match[0].toLowerCase();
    if (!email.includes('example') && !email.includes('.png') && !email.includes('.jpg')) {
      return email;
    }
  }
  return "";
}

function extractWebsite(text: string): string {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i) ||
                text.match(/www\.[^\s"'<>]+/i);
  return match ? match[0] : "";
}

function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/<[^>]*>/g, '').replace(/\s+/g, " ").trim();
}

function createBusiness(data: Partial<Business>, source: string): Business {
  const baseBusiness = {
    name: data.name || "",
    email: data.email || "",
    phone: data.phone || "",
    website: data.website || "",
    address: data.address || "",
    postcode: data.postcode || "",
    industry: data.industry || "",
    description: data.description || "",
    rating: data.rating || "",
    review_count: data.review_count || "",
    source,
    scraped_at: new Date().toISOString(),
  };
  const { score, signals } = calculateLeadScore(baseBusiness);
  return { ...baseBusiness, lead_score: score, lead_signals: signals };
}

// ============================================================================
// YELL.COM - UK Yellow Pages (Most reliable)
// ============================================================================
async function scrapeYell(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://www.yell.com/ucs/UcsSearchAction.do?scrambleSeed=&keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&pageNum=${page}`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-GB,en;q=0.9",
        },
      });

      if (!response.ok) break;
      const html = await response.text();

      // Multiple regex patterns to capture listings
      const patterns = [
        /<article[^>]*businessCapsule[^>]*>([\s\S]*?)<\/article>/gi,
        /<div[^>]*class="[^"]*business-card[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi,
        /<li[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
      ];

      let listings: string[] = [];
      for (const pattern of patterns) {
        const matches = html.match(pattern);
        if (matches && matches.length > 0) {
          listings = matches;
          break;
        }
      }

      if (listings.length === 0) {
        // Try generic business extraction
        const nameMatches = html.matchAll(/<a[^>]*href="\/biz\/[^"]*"[^>]*>([^<]+)<\/a>/gi);
        for (const match of nameMatches) {
          const name = cleanText(match[1]);
          if (name && name.length > 2 && !name.includes('Yell')) {
            businesses.push(createBusiness({ name, industry: query }, "yell.com"));
          }
        }
      }

      for (const listing of listings) {
        const nameMatch = listing.match(/businessCapsule--name[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) ||
                          listing.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) ||
                          listing.match(/<a[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<\/a>/i);

        const name = nameMatch ? cleanText(nameMatch[1]) : "";
        if (!name || name.length < 2) continue;

        const addressMatch = listing.match(/businessCapsule--address[^>]*>([\s\S]*?)<\/(?:span|div)/i) ||
                            listing.match(/itemprop="address"[^>]*>([\s\S]*?)<\//i);
        const address = addressMatch ? cleanText(addressMatch[1]) : "";

        const phoneMatch = listing.match(/businessCapsule--phone[^>]*>([\s\S]*?)<\/(?:span|div)/i) ||
                          listing.match(/tel:([^"]+)"/i);
        const phone = phoneMatch ? cleanText(phoneMatch[1]) : extractPhone(listing);

        const categoryMatch = listing.match(/businessCapsule--category[^>]*>([\s\S]*?)<\/div>/i);
        const industry = categoryMatch ? cleanText(categoryMatch[1]) : query;

        const ratingMatch = listing.match(/starRating--average[^>]*>([0-9.]+)/i) ||
                           listing.match(/(\d+\.?\d*)\s*(?:star|rating)/i);
        const rating = ratingMatch ? ratingMatch[1] : "";

        const reviewMatch = listing.match(/(\d+)\s*review/i);
        const review_count = reviewMatch ? reviewMatch[1] : "";

        const websiteMatch = listing.match(/href="(https?:\/\/(?!www\.yell)[^"]+)"/i);
        const website = websiteMatch ? websiteMatch[1] : "";

        businesses.push(createBusiness({
          name, address, phone, industry, rating, review_count, website,
          postcode: extractPostcode(address),
        }, "yell.com"));
      }

      await new Promise(resolve => setTimeout(resolve, 800));
    } catch {
      break;
    }
  }
  return businesses;
}

// ============================================================================
// CHECKATRADE - Verified tradespeople
// ============================================================================
async function scrapeCheckatrade(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://www.checkatrade.com/Search?query=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&page=${page}`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!response.ok) break;
      const html = await response.text();

      // Extract business cards
      const cardPattern = /<div[^>]*class="[^"]*(?:search-result|trade-card|member-card)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
      const cards = html.match(cardPattern) || [];

      // Fallback: extract names directly
      if (cards.length === 0) {
        const namePattern = /<a[^>]*href="\/trades\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
        const matches = html.matchAll(namePattern);
        for (const match of matches) {
          const name = cleanText(match[1]);
          if (name && name.length > 2) {
            businesses.push(createBusiness({ name, industry: query }, "checkatrade"));
          }
        }
      }

      for (const card of cards) {
        const nameMatch = card.match(/<h[23][^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) ||
                         card.match(/class="[^"]*name[^"]*"[^>]*>([^<]+)</i);
        const name = nameMatch ? cleanText(nameMatch[1]) : "";
        if (!name) continue;

        const locationMatch = card.match(/class="[^"]*location[^"]*"[^>]*>([^<]+)/i);
        const address = locationMatch ? cleanText(locationMatch[1]) : location;

        const ratingMatch = card.match(/(\d+\.?\d*)\s*(?:\/\s*10|out of|rating)/i) ||
                           card.match(/class="[^"]*rating[^"]*"[^>]*>([0-9.]+)/i);
        const rating = ratingMatch ? ratingMatch[1] : "";

        const reviewMatch = card.match(/(\d+)\s*review/i);
        const review_count = reviewMatch ? reviewMatch[1] : "";

        const phone = extractPhone(card);

        businesses.push(createBusiness({
          name, address, rating, review_count, phone, industry: query,
          postcode: extractPostcode(address),
        }, "checkatrade"));
      }

      await new Promise(resolve => setTimeout(resolve, 800));
    } catch {
      break;
    }
  }
  return businesses;
}

// ============================================================================
// BARK - Service marketplace
// ============================================================================
async function scrapeBark(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://www.bark.com/en/gb/find/${encodeURIComponent(query.replace(/\s+/g, '-'))}/${encodeURIComponent(location.replace(/\s+/g, '-'))}/`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) break;
      const html = await response.text();

      // Extract professional cards
      const cardPattern = /<div[^>]*class="[^"]*(?:professional-card|pro-card|result-card)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
      const cards = html.match(cardPattern) || [];

      // Fallback
      if (cards.length === 0) {
        const namePattern = /<a[^>]*href="\/en\/gb\/company\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
        const matches = html.matchAll(namePattern);
        for (const match of matches) {
          const name = cleanText(match[1]);
          if (name && name.length > 2) {
            businesses.push(createBusiness({ name, industry: query, address: location }, "bark"));
          }
        }
      }

      for (const card of cards) {
        const nameMatch = card.match(/<h[234][^>]*>([^<]+)<\/h/i) ||
                         card.match(/class="[^"]*(?:name|title)[^"]*"[^>]*>([^<]+)</i);
        const name = nameMatch ? cleanText(nameMatch[1]) : "";
        if (!name) continue;

        const ratingMatch = card.match(/(\d+\.?\d*)\s*(?:star|rating)/i);
        const rating = ratingMatch ? ratingMatch[1] : "";

        const reviewMatch = card.match(/(\d+)\s*review/i);
        const review_count = reviewMatch ? reviewMatch[1] : "";

        businesses.push(createBusiness({
          name, industry: query, address: location, rating, review_count,
        }, "bark"));
      }

      await new Promise(resolve => setTimeout(resolve, 800));
    } catch {
      break;
    }
  }
  return businesses;
}

// ============================================================================
// TRUSTPILOT - Review platform
// ============================================================================
async function scrapeTrustpilot(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://uk.trustpilot.com/search?query=${encodeURIComponent(query + ' ' + location)}&page=${page}`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) break;
      const html = await response.text();

      // Extract business cards
      const cardPattern = /<div[^>]*class="[^"]*(?:business-unit-card|search-result)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
      const cards = html.match(cardPattern) || [];

      if (cards.length === 0) {
        const namePattern = /<a[^>]*href="\/review\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
        const matches = html.matchAll(namePattern);
        for (const match of matches) {
          const name = cleanText(match[1]);
          if (name && name.length > 2 && !name.toLowerCase().includes('trustpilot')) {
            businesses.push(createBusiness({ name, industry: query }, "trustpilot"));
          }
        }
      }

      for (const card of cards) {
        const nameMatch = card.match(/<a[^>]*>([^<]+)<\/a>/i);
        const name = nameMatch ? cleanText(nameMatch[1]) : "";
        if (!name || name.toLowerCase().includes('trustpilot')) continue;

        const ratingMatch = card.match(/TrustScore[^>]*>[\s\S]*?(\d+\.?\d*)/i) ||
                           card.match(/(\d+\.?\d*)\s*(?:out of|\/)\s*5/i);
        const rating = ratingMatch ? ratingMatch[1] : "";

        const reviewMatch = card.match(/([\d,]+)\s*review/i);
        const review_count = reviewMatch ? reviewMatch[1].replace(',', '') : "";

        const websiteMatch = card.match(/href="https?:\/\/(?!.*trustpilot)([^"]+)"/i);
        const website = websiteMatch ? `https://${websiteMatch[1]}` : "";

        businesses.push(createBusiness({
          name, rating, review_count, website, industry: query,
        }, "trustpilot"));
      }

      await new Promise(resolve => setTimeout(resolve, 800));
    } catch {
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

  for (let page = 0; page < maxPages; page++) {
    try {
      const start = page * 10;
      const url = `https://www.yelp.co.uk/search?find_desc=${encodeURIComponent(query)}&find_loc=${encodeURIComponent(location)}&start=${start}`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) break;
      const html = await response.text();

      // Extract from JSON-LD if available
      const jsonMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          if (data.itemListElement) {
            for (const item of data.itemListElement) {
              if (item.item?.name) {
                businesses.push(createBusiness({
                  name: item.item.name,
                  address: item.item.address?.streetAddress || location,
                  rating: item.item.aggregateRating?.ratingValue?.toString() || "",
                  review_count: item.item.aggregateRating?.reviewCount?.toString() || "",
                  industry: query,
                }, "yelp"));
              }
            }
          }
        } catch {}
      }

      // Fallback regex
      const namePattern = /<a[^>]*href="\/biz\/[^"]*"[^>]*class="[^"]*"[^>]*>([^<]+)<\/a>/gi;
      const matches = html.matchAll(namePattern);
      for (const match of matches) {
        const name = cleanText(match[1]);
        if (name && name.length > 2 && !businesses.some(b => b.name === name)) {
          businesses.push(createBusiness({ name, industry: query, address: location }, "yelp"));
        }
      }

      await new Promise(resolve => setTimeout(resolve, 800));
    } catch {
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

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://www.freeindex.co.uk/searchresults.htm?k=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&p=${page}`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) break;
      const html = await response.text();

      // Extract business listings
      const listingPattern = /<div[^>]*class="[^"]*li_[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
      const listings = html.match(listingPattern) || [];

      // Fallback
      const namePattern = /<a[^>]*href="\/profile\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
      const matches = html.matchAll(namePattern);
      for (const match of matches) {
        const name = cleanText(match[1]);
        if (name && name.length > 2 && !businesses.some(b => b.name === name)) {
          businesses.push(createBusiness({ name, industry: query, address: location }, "freeindex"));
        }
      }

      for (const listing of listings) {
        const nameMatch = listing.match(/<a[^>]*>([^<]+)<\/a>/i);
        const name = nameMatch ? cleanText(nameMatch[1]) : "";
        if (!name || businesses.some(b => b.name === name)) continue;

        const locationMatch = listing.match(/class="[^"]*location[^"]*"[^>]*>([^<]+)/i);
        const address = locationMatch ? cleanText(locationMatch[1]) : location;

        const phone = extractPhone(listing);
        const email = extractEmail(listing);
        const website = extractWebsite(listing);

        const ratingMatch = listing.match(/(\d+\.?\d*)\s*(?:star|rating|\/\s*5)/i);
        const rating = ratingMatch ? ratingMatch[1] : "";

        businesses.push(createBusiness({
          name, address, phone, email, website, rating, industry: query,
          postcode: extractPostcode(address),
        }, "freeindex"));
      }

      await new Promise(resolve => setTimeout(resolve, 800));
    } catch {
      break;
    }
  }
  return businesses;
}

// ============================================================================
// GOOGLE PLACES (via search)
// ============================================================================
async function scrapeGoogleSearch(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];

  try {
    const searchQuery = `${query} ${location} UK`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=lcl&num=20`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    });

    if (!response.ok) return businesses;
    const html = await response.text();

    // Extract local results
    const resultPattern = /<div[^>]*class="[^"]*(?:VkpGBb|rllt__details)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    const results = html.match(resultPattern) || [];

    // Direct name extraction
    const namePattern = /<div[^>]*class="[^"]*(?:dbg0pd|OSrXXb|BNeawe)[^"]*"[^>]*>([^<]+)<\/div>/gi;
    const nameMatches = html.matchAll(namePattern);
    for (const match of nameMatches) {
      const name = cleanText(match[1]);
      if (name && name.length > 2 && name.length < 100 && !name.includes('Google')) {
        businesses.push(createBusiness({ name, industry: query, address: location }, "google"));
      }
    }

    for (const result of results) {
      const nameMatch = result.match(/>([^<]{3,50})</);
      const name = nameMatch ? cleanText(nameMatch[1]) : "";
      if (!name || businesses.some(b => b.name === name)) continue;

      const ratingMatch = result.match(/(\d+\.?\d*)\s*\((\d+)\)/);
      const rating = ratingMatch ? ratingMatch[1] : "";
      const review_count = ratingMatch ? ratingMatch[2] : "";

      const phone = extractPhone(result);

      businesses.push(createBusiness({
        name, rating, review_count, phone, industry: query, address: location,
      }, "google"));
    }

  } catch {}

  return businesses;
}

// ============================================================================
// CYLEX UK Business Directory
// ============================================================================
async function scrapeCylex(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://www.cylex-uk.co.uk/search/${encodeURIComponent(query)}-${encodeURIComponent(location)}.html?p=${page}`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) break;
      const html = await response.text();

      const namePattern = /<a[^>]*class="[^"]*company-name[^"]*"[^>]*>([^<]+)<\/a>/gi;
      const matches = html.matchAll(namePattern);
      for (const match of matches) {
        const name = cleanText(match[1]);
        if (name && name.length > 2) {
          businesses.push(createBusiness({ name, industry: query, address: location }, "cylex"));
        }
      }

      await new Promise(resolve => setTimeout(resolve, 800));
    } catch {
      break;
    }
  }
  return businesses;
}

// ============================================================================
// HOTFROG UK
// ============================================================================
async function scrapeHotfrog(query: string, location: string, maxPages: number): Promise<Business[]> {
  const businesses: Business[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://www.hotfrog.co.uk/search/${encodeURIComponent(location)}/${encodeURIComponent(query)}?page=${page}`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) break;
      const html = await response.text();

      const namePattern = /<a[^>]*class="[^"]*(?:listing-name|business-name)[^"]*"[^>]*>([^<]+)<\/a>/gi;
      const matches = html.matchAll(namePattern);
      for (const match of matches) {
        const name = cleanText(match[1]);
        if (name && name.length > 2) {
          businesses.push(createBusiness({ name, industry: query, address: location }, "hotfrog"));
        }
      }

      await new Promise(resolve => setTimeout(resolve, 800));
    } catch {
      break;
    }
  }
  return businesses;
}

// ============================================================================
// MAIN API HANDLER
// ============================================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, location, sources = ["yell", "checkatrade", "freeindex"], max_pages = 3 } = body;

    if (!query || !location) {
      return NextResponse.json({ error: "Missing query or location" }, { status: 400 });
    }

    const maxPages = Math.min(max_pages, 15);
    const scraperPromises: Promise<Business[]>[] = [];

    // Map sources to scrapers
    const scraperMap: Record<string, (q: string, l: string, p: number) => Promise<Business[]>> = {
      yell: scrapeYell,
      checkatrade: scrapeCheckatrade,
      bark: scrapeBark,
      trustpilot: scrapeTrustpilot,
      yelp: scrapeYelp,
      freeindex: scrapeFreeIndex,
      google: scrapeGoogleSearch,
      cylex: scrapeCylex,
      hotfrog: scrapeHotfrog,
    };

    for (const source of sources) {
      if (scraperMap[source]) {
        scraperPromises.push(scraperMap[source](query, location, maxPages));
      }
    }

    const results = await Promise.all(scraperPromises);
    let allBusinesses: Business[] = [];
    for (const result of results) {
      allBusinesses.push(...result);
    }

    // Deduplicate by normalized name
    const seen = new Set<string>();
    const uniqueBusinesses = allBusinesses.filter(biz => {
      const key = biz.name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
      if (key && key.length > 2 && !seen.has(key)) {
        seen.add(key);
        return true;
      }
      return false;
    });

    // Sort by lead score
    uniqueBusinesses.sort((a, b) => b.lead_score - a.lead_score);

    return NextResponse.json({
      businesses: uniqueBusinesses,
      count: uniqueBusinesses.length,
      query,
      location,
      sources,
    });
  } catch (error) {
    console.error("Scrape error:", error);
    return NextResponse.json({ error: "Scraping failed" }, { status: 500 });
  }
}
