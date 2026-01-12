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
  // Lead scoring fields
  lead_score: number;
  lead_signals: string[];
}

// Calculate lead score - higher score = more likely to need marketing/tech services
function calculateLeadScore(business: Omit<Business, 'lead_score' | 'lead_signals'>): { score: number; signals: string[] } {
  let score = 50; // Base score
  const signals: string[] = [];

  // No website = needs web development (HIGH priority)
  if (!business.website) {
    score += 25;
    signals.push("No website - needs web presence");
  }

  // No email = needs digital setup
  if (!business.email) {
    score += 15;
    signals.push("No email listed - limited digital presence");
  }

  // No phone = very limited online presence
  if (!business.phone) {
    score += 10;
    signals.push("No phone listed - minimal online info");
  }

  // Low or no rating = needs reputation management
  if (!business.rating) {
    score += 15;
    signals.push("No reviews - needs reputation building");
  } else {
    const ratingNum = parseFloat(business.rating);
    if (ratingNum < 3.5) {
      score += 20;
      signals.push("Low rating - needs reputation management");
    } else if (ratingNum < 4.0) {
      score += 10;
      signals.push("Average rating - room for improvement");
    }
  }

  // Low review count = needs visibility
  if (business.review_count) {
    const reviewCount = parseInt(business.review_count);
    if (reviewCount < 5) {
      score += 15;
      signals.push("Few reviews - needs marketing visibility");
    } else if (reviewCount < 20) {
      score += 8;
      signals.push("Limited reviews - could use more exposure");
    }
  } else {
    score += 10;
    signals.push("No review count - low online engagement");
  }

  // Traditional industries that often need modernization
  const traditionalIndustries = [
    'plumber', 'electrician', 'builder', 'roofer', 'painter',
    'garage', 'locksmith', 'carpenter', 'landscaping', 'cleaning',
    'farm', 'manufacturer', 'wholesaler', 'distributor'
  ];

  const industryLower = business.industry.toLowerCase();
  if (traditionalIndustries.some(ind => industryLower.includes(ind))) {
    score += 10;
    signals.push("Traditional industry - likely needs digital modernization");
  }

  // High-value industries (can afford services)
  const highValueIndustries = [
    'solicitor', 'accountant', 'architect', 'surveyor', 'dentist',
    'private hospital', 'medical', 'yacht', 'boat', 'marina',
    'hotel', 'property developer', 'investment', 'private equity'
  ];

  if (highValueIndustries.some(ind => industryLower.includes(ind))) {
    score += 5;
    signals.push("High-value industry - budget for services");
  }

  // Cap score at 100
  score = Math.min(score, 100);

  return { score, signals };
}

// Extract UK postcode from text
function extractPostcode(text: string): string {
  const match = text.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i);
  return match ? match[0].toUpperCase() : "";
}

// Extract UK phone numbers
function extractPhones(text: string): string[] {
  const patterns = [
    /(?:\+44|0)[\s.-]?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g,
    /(?:\+44|0)\s?\d{10,11}/g,
  ];
  const phones: string[] = [];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) phones.push(...matches);
  }
  return Array.from(new Set(phones));
}

// Clean text
function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

// Scrape Yell.com
async function scrapeYell(
  query: string,
  location: string,
  maxPages: number
): Promise<Business[]> {
  const businesses: Business[] = [];
  const baseUrl = "https://www.yell.com";

  for (let page = 1; page <= maxPages; page++) {
    try {
      const searchUrl = `${baseUrl}/ucs/UcsSearchAction.do?scrambleSeed=&keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&pageNum=${page}`;

      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-GB,en;q=0.9",
        },
      });

      if (!response.ok) break;

      const html = await response.text();

      // Parse business listings using regex (simpler than full HTML parser)
      const listingPattern =
        /<article[^>]*class="[^"]*businessCapsule[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
      const listings = html.match(listingPattern) || [];

      if (listings.length === 0) break;

      for (const listing of listings) {
        try {
          // Extract name
          const nameMatch = listing.match(
            /class="[^"]*businessCapsule--name[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i
          );
          const name = nameMatch ? cleanText(nameMatch[1]) : "";

          if (!name) continue;

          // Extract address
          const addressMatch = listing.match(
            /class="[^"]*businessCapsule--address[^"]*"[^>]*>([\s\S]*?)<\/span>/i
          );
          const address = addressMatch
            ? cleanText(addressMatch[1].replace(/<[^>]*>/g, ""))
            : "";

          // Extract phone
          const phoneMatch = listing.match(
            /class="[^"]*businessCapsule--phone[^"]*"[^>]*>([\s\S]*?)<\/span>/i
          );
          const phone = phoneMatch
            ? cleanText(phoneMatch[1].replace(/<[^>]*>/g, ""))
            : "";

          // Extract category
          const categoryMatch = listing.match(
            /class="[^"]*businessCapsule--category[^"]*"[^>]*>([\s\S]*?)<\/div>/i
          );
          const industry = categoryMatch
            ? cleanText(categoryMatch[1].replace(/<[^>]*>/g, ""))
            : "";

          // Extract rating
          const ratingMatch = listing.match(
            /class="[^"]*starRating--average[^"]*"[^>]*>([^<]+)/i
          );
          const rating = ratingMatch ? cleanText(ratingMatch[1]) : "";

          const baseBusiness = {
            name,
            email: "",
            phone,
            website: "",
            address,
            postcode: extractPostcode(address),
            industry,
            description: "",
            rating,
            review_count: "",
            source: "yell.com",
            scraped_at: new Date().toISOString(),
          };
          const { score, signals } = calculateLeadScore(baseBusiness);
          businesses.push({
            ...baseBusiness,
            lead_score: score,
            lead_signals: signals,
          });
        } catch {
          continue;
        }
      }

      // Delay between pages
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch {
      break;
    }
  }

  return businesses;
}

// Scrape FreeIndex
async function scrapeFreeIndex(
  query: string,
  location: string,
  maxPages: number
): Promise<Business[]> {
  const businesses: Business[] = [];
  const baseUrl = "https://www.freeindex.co.uk";

  for (let page = 1; page <= maxPages; page++) {
    try {
      const searchUrl = `${baseUrl}/searchresults.htm?k=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&p=${page}`;

      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!response.ok) break;

      const html = await response.text();

      // Parse listings
      const listingPattern =
        /<div[^>]*class="[^"]*listing[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
      const listings = html.match(listingPattern) || [];

      if (listings.length === 0) break;

      for (const listing of listings) {
        try {
          const nameMatch = listing.match(/<a[^>]*class="[^"]*listing-title[^"]*"[^>]*>([^<]+)<\/a>/i) ||
                           listing.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
          const name = nameMatch ? cleanText(nameMatch[1]) : "";

          if (!name) continue;

          const locationMatch = listing.match(
            /class="[^"]*listing-location[^"]*"[^>]*>([^<]+)/i
          );
          const address = locationMatch ? cleanText(locationMatch[1]) : "";

          const categoryMatch = listing.match(
            /class="[^"]*listing-category[^"]*"[^>]*>([^<]+)/i
          );
          const industry = categoryMatch ? cleanText(categoryMatch[1]) : "";

          const baseBusiness = {
            name,
            email: "",
            phone: "",
            website: "",
            address,
            postcode: extractPostcode(address),
            industry,
            description: "",
            rating: "",
            review_count: "",
            source: "freeindex",
            scraped_at: new Date().toISOString(),
          };
          const { score, signals } = calculateLeadScore(baseBusiness);
          businesses.push({
            ...baseBusiness,
            lead_score: score,
            lead_signals: signals,
          });
        } catch {
          continue;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch {
      break;
    }
  }

  return businesses;
}

// Scrape Thomson Local
async function scrapeThomson(
  query: string,
  location: string,
  maxPages: number
): Promise<Business[]> {
  const businesses: Business[] = [];
  const baseUrl = "https://www.thomsonlocal.com";

  for (let page = 1; page <= maxPages; page++) {
    try {
      const searchUrl = `${baseUrl}/search/${encodeURIComponent(query)}/${encodeURIComponent(location)}?page=${page}`;

      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) break;

      const html = await response.text();

      const nameMatches = html.match(
        /<h2[^>]*class="[^"]*listing-name[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/gi
      ) || [];

      for (const match of nameMatches) {
        const nameMatch = match.match(/>([^<]+)<\/a>/i);
        const name = nameMatch ? cleanText(nameMatch[1]) : "";

        if (!name) continue;

        const baseBusiness = {
          name,
          email: "",
          phone: "",
          website: "",
          address: location,
          postcode: "",
          industry: query,
          description: "",
          rating: "",
          review_count: "",
          source: "thomson_local",
          scraped_at: new Date().toISOString(),
        };
        const { score, signals } = calculateLeadScore(baseBusiness);
        businesses.push({
          ...baseBusiness,
          lead_score: score,
          lead_signals: signals,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch {
      break;
    }
  }

  return businesses;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, location, sources = ["yell", "freeindex"], max_pages = 2 } = body;

    if (!query || !location) {
      return NextResponse.json(
        { error: "Missing query or location" },
        { status: 400 }
      );
    }

    const maxPages = Math.min(max_pages, 15);
    let allBusinesses: Business[] = [];

    // Run scrapers based on selected sources
    const scraperPromises: Promise<Business[]>[] = [];

    if (sources.includes("yell")) {
      scraperPromises.push(scrapeYell(query, location, maxPages));
    }
    if (sources.includes("freeindex")) {
      scraperPromises.push(scrapeFreeIndex(query, location, maxPages));
    }
    if (sources.includes("thomson")) {
      scraperPromises.push(scrapeThomson(query, location, maxPages));
    }

    const results = await Promise.all(scraperPromises);
    for (const result of results) {
      allBusinesses.push(...result);
    }

    // Deduplicate by name
    const seen = new Set<string>();
    const uniqueBusinesses = allBusinesses.filter((biz) => {
      const key = biz.name.toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        return true;
      }
      return false;
    });

    // Sort by lead score (highest first)
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
    return NextResponse.json(
      { error: "Scraping failed" },
      { status: 500 }
    );
  }
}
