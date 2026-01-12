import { NextRequest, NextResponse } from "next/server";

// ============================================================================
// COMPANIES HOUSE API INTEGRATION
// ============================================================================

interface Director {
  name: string;
  role: string;
  appointedOn: string;
  resignedOn?: string;
}

interface SicCode {
  code: string;
  description: string;
}

interface CompaniesHouseData {
  companyNumber: string;
  companyName: string;
  companyStatus: 'active' | 'dissolved' | 'dormant' | 'liquidation' | 'not-found';
  companyType: string;
  incorporationDate: string;
  registeredAddress: string;
  sicCodes: SicCode[];
  directors: Director[];
}

interface EmailInfo {
  address: string;
  type: 'generic' | 'personal';
  source: string;
}

interface SocialMedia {
  linkedin?: string;
  facebook?: string;
  twitter?: string;
  instagram?: string;
}

interface EnrichedBusiness {
  // Companies House data
  companyNumber?: string;
  companyStatus?: string;
  companyType?: string;
  incorporationDate?: string;
  registeredAddress?: string;
  sicCodes?: SicCode[];
  directors?: Director[];

  // Enhanced email data
  emails: EmailInfo[];

  // Social media
  socialMedia: SocialMedia;

  // Score breakdown
  scoreBreakdown: {
    noWebsite: number;
    noEmail: number;
    genericEmailOnly: number;
    lowReviews: number;
    noSocial: number;
    establishedBusiness: number;
    hasDirectors: number;
    soleTrader: number;
  };
}

// SIC code descriptions lookup (common ones)
const SIC_DESCRIPTIONS: Record<string, string> = {
  "01110": "Growing of cereals",
  "41100": "Development of building projects",
  "41201": "Construction of commercial buildings",
  "41202": "Construction of domestic buildings",
  "43210": "Electrical installation",
  "43220": "Plumbing, heating and air conditioning",
  "43290": "Other construction installation",
  "43310": "Plastering",
  "43320": "Joinery installation",
  "43330": "Floor and wall covering",
  "43341": "Painting",
  "43342": "Glazing",
  "43390": "Other building completion and finishing",
  "43991": "Scaffold erection",
  "43999": "Other specialised construction activities",
  "45111": "Sale of new cars and light motor vehicles",
  "45112": "Sale of used cars and light motor vehicles",
  "45200": "Maintenance and repair of motor vehicles",
  "46110": "Agents selling agricultural raw materials",
  "46120": "Agents selling fuels, ores, metals and industrial chemicals",
  "46900": "Non-specialised wholesale trade",
  "47110": "Retail sale in non-specialised stores with food",
  "47190": "Other retail sale in non-specialised stores",
  "47910": "Retail sale via mail order houses or via Internet",
  "55100": "Hotels and similar accommodation",
  "56101": "Licensed restaurants",
  "56102": "Unlicensed restaurants and cafes",
  "56103": "Take-away food shops and mobile food stands",
  "56210": "Event catering activities",
  "56301": "Licensed clubs",
  "56302": "Public houses and bars",
  "62011": "Ready-made interactive leisure software development",
  "62012": "Business and domestic software development",
  "62020": "Information technology consultancy activities",
  "62090": "Other information technology service activities",
  "63110": "Data processing, hosting and related activities",
  "63120": "Web portals",
  "64110": "Central banking",
  "64191": "Banks",
  "64209": "Activities of other holding companies",
  "64301": "Activities of investment trusts",
  "64302": "Activities of unit trusts",
  "66110": "Administration of financial markets",
  "66120": "Security and commodity contracts dealing activities",
  "66190": "Other activities auxiliary to financial services",
  "66220": "Activities of insurance agents and brokers",
  "68100": "Buying and selling of own real estate",
  "68201": "Renting and operating of Housing Association real estate",
  "68202": "Letting and operating of conference and exhibition centres",
  "68209": "Other letting and operating of own or leased real estate",
  "68310": "Real estate agencies",
  "68320": "Management of real estate on a fee or contract basis",
  "69101": "Barristers at law",
  "69102": "Solicitors",
  "69109": "Activities of patent and copyright agents",
  "69201": "Accounting and auditing activities",
  "69202": "Bookkeeping activities",
  "69203": "Tax consultancy",
  "70100": "Activities of head offices",
  "70210": "Public relations and communications activities",
  "70221": "Financial management",
  "70229": "Management consultancy activities other than financial",
  "71111": "Architectural activities",
  "71112": "Urban planning and landscape architectural activities",
  "71121": "Engineering design activities for industrial process",
  "71122": "Engineering related scientific and technical consulting",
  "71129": "Other engineering activities",
  "71200": "Technical testing and analysis",
  "73110": "Advertising agencies",
  "73120": "Media representation services",
  "73200": "Market research and public opinion polling",
  "74100": "Specialised design activities",
  "74201": "Portrait photographic activities",
  "74202": "Other specialist photography",
  "74209": "Other photographic activities",
  "74300": "Translation and interpretation activities",
  "74901": "Environmental consulting activities",
  "74902": "Quantity surveying activities",
  "74909": "Other professional, scientific and technical activities",
  "77110": "Renting and leasing of cars and light motor vehicles",
  "77299": "Renting and leasing of other personal and household goods",
  "78101": "Activities of employment placement agencies",
  "78109": "Other activities of employment placement agencies",
  "78200": "Temporary employment agency activities",
  "79110": "Travel agency activities",
  "79120": "Tour operator activities",
  "80100": "Private security activities",
  "81100": "Combined facilities support activities",
  "81210": "General cleaning of buildings",
  "81221": "Window cleaning services",
  "81222": "Specialised cleaning services",
  "81223": "Furnace and chimney cleaning services",
  "81229": "Other building and industrial cleaning activities",
  "81300": "Landscape service activities",
  "82110": "Combined office administrative service activities",
  "82190": "Photocopying, document preparation and other office support",
  "82200": "Activities of call centres",
  "82990": "Other business support service activities",
  "85100": "Pre-primary education",
  "85200": "Primary education",
  "85310": "General secondary education",
  "85320": "Technical and vocational secondary education",
  "85410": "Post-secondary non-tertiary education",
  "85421": "First-degree level higher education",
  "85422": "Post-graduate level higher education",
  "85510": "Sports and recreation education",
  "85520": "Cultural education",
  "85530": "Driving school activities",
  "85590": "Other education",
  "85600": "Educational support activities",
  "86101": "Hospital activities",
  "86102": "Medical nursing home activities",
  "86210": "General medical practice activities",
  "86220": "Specialist medical practice activities",
  "86230": "Dental practice activities",
  "86900": "Other human health activities",
  "88100": "Social work activities without accommodation for elderly",
  "88910": "Child day-care activities",
  "88990": "Other social work activities without accommodation",
  "90010": "Performing arts",
  "90020": "Support activities to performing arts",
  "90030": "Artistic creation",
  "90040": "Operation of arts facilities",
  "93110": "Operation of sports facilities",
  "93120": "Activities of sport clubs",
  "93130": "Fitness facilities",
  "93199": "Other sports activities",
  "93210": "Activities of amusement parks and theme parks",
  "93290": "Other amusement and recreation activities",
  "94110": "Activities of business and employers membership organisations",
  "94120": "Activities of professional membership organisations",
  "95110": "Repair of computers and peripheral equipment",
  "95120": "Repair of communication equipment",
  "95210": "Repair of consumer electronics",
  "95220": "Repair of household appliances",
  "95230": "Repair of footwear and leather goods",
  "95240": "Repair of furniture and home furnishings",
  "95290": "Repair of other personal and household goods",
  "96010": "Washing and (dry-)cleaning of textile and fur products",
  "96020": "Hairdressing and other beauty treatment",
  "96040": "Physical well-being activities",
  "96090": "Other personal service activities",
};

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
};

// ============================================================================
// COMPANIES HOUSE SEARCH
// ============================================================================
async function searchCompaniesHouse(businessName: string, postcode?: string): Promise<CompaniesHouseData | null> {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;

  if (!apiKey) {
    console.log("[CompaniesHouse] No API key configured");
    return null;
  }

  try {
    // Search for company by name
    const searchUrl = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(businessName)}&items_per_page=5`;

    const searchResponse = await fetch(searchUrl, {
      headers: {
        "Authorization": `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
        "Accept": "application/json",
      },
    });

    if (!searchResponse.ok) {
      console.log(`[CompaniesHouse] Search failed: ${searchResponse.status}`);
      return null;
    }

    const searchData = await searchResponse.json();

    if (!searchData.items || searchData.items.length === 0) {
      console.log(`[CompaniesHouse] No results for: ${businessName}`);
      return null;
    }

    // Find best match - prefer matching postcode if provided
    let bestMatch = searchData.items[0];
    if (postcode) {
      const postcodePrefix = postcode.toUpperCase().replace(/\s+/g, '').substring(0, 3);
      for (const item of searchData.items) {
        const itemPostcode = item.address?.postal_code?.toUpperCase().replace(/\s+/g, '') || '';
        if (itemPostcode.startsWith(postcodePrefix)) {
          bestMatch = item;
          break;
        }
      }
    }

    const companyNumber = bestMatch.company_number;
    console.log(`[CompaniesHouse] Found: ${bestMatch.title} (${companyNumber})`);

    // Get full company profile
    const profileUrl = `https://api.company-information.service.gov.uk/company/${companyNumber}`;
    const profileResponse = await fetch(profileUrl, {
      headers: {
        "Authorization": `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
        "Accept": "application/json",
      },
    });

    if (!profileResponse.ok) {
      console.log(`[CompaniesHouse] Profile fetch failed: ${profileResponse.status}`);
      return {
        companyNumber,
        companyName: bestMatch.title,
        companyStatus: bestMatch.company_status || 'active',
        companyType: bestMatch.company_type || '',
        incorporationDate: bestMatch.date_of_creation || '',
        registeredAddress: formatAddress(bestMatch.address),
        sicCodes: [],
        directors: [],
      };
    }

    const profileData = await profileResponse.json();

    // Get officers (directors)
    const directors: Director[] = [];
    try {
      const officersUrl = `https://api.company-information.service.gov.uk/company/${companyNumber}/officers`;
      const officersResponse = await fetch(officersUrl, {
        headers: {
          "Authorization": `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
          "Accept": "application/json",
        },
      });

      if (officersResponse.ok) {
        const officersData = await officersResponse.json();
        for (const officer of (officersData.items || []).slice(0, 10)) {
          if (!officer.resigned_on) { // Only active officers
            directors.push({
              name: officer.name || '',
              role: officer.officer_role || '',
              appointedOn: officer.appointed_on || '',
              resignedOn: officer.resigned_on,
            });
          }
        }
      }
    } catch (err) {
      console.log(`[CompaniesHouse] Officers fetch failed:`, err);
    }

    // Map SIC codes to descriptions
    const sicCodes: SicCode[] = (profileData.sic_codes || []).map((code: string) => ({
      code,
      description: SIC_DESCRIPTIONS[code] || `Industry code ${code}`,
    }));

    return {
      companyNumber,
      companyName: profileData.company_name || bestMatch.title,
      companyStatus: mapCompanyStatus(profileData.company_status),
      companyType: profileData.type || bestMatch.company_type || '',
      incorporationDate: profileData.date_of_creation || '',
      registeredAddress: formatAddress(profileData.registered_office_address),
      sicCodes,
      directors,
    };
  } catch (error) {
    console.log(`[CompaniesHouse] Error:`, error);
    return null;
  }
}

function mapCompanyStatus(status: string): 'active' | 'dissolved' | 'dormant' | 'liquidation' | 'not-found' {
  if (!status) return 'not-found';
  const s = status.toLowerCase();
  if (s.includes('active')) return 'active';
  if (s.includes('dissolved')) return 'dissolved';
  if (s.includes('dormant')) return 'dormant';
  if (s.includes('liquidation') || s.includes('insolvency')) return 'liquidation';
  return 'active';
}

function formatAddress(addr: Record<string, string> | undefined): string {
  if (!addr) return '';
  const parts = [
    addr.premises,
    addr.address_line_1,
    addr.address_line_2,
    addr.locality,
    addr.region,
    addr.postal_code,
    addr.country,
  ].filter(Boolean);
  return parts.join(', ');
}

// ============================================================================
// ENHANCED EMAIL SCRAPING
// ============================================================================
async function scrapeWebsiteForEmails(websiteUrl: string): Promise<{ emails: EmailInfo[]; socialMedia: SocialMedia }> {
  const emails: EmailInfo[] = [];
  const socialMedia: SocialMedia = {};
  const seenEmails = new Set<string>();

  if (!websiteUrl) {
    return { emails, socialMedia };
  }

  // Normalize URL
  let baseUrl = websiteUrl;
  if (!baseUrl.startsWith('http')) {
    baseUrl = `https://${baseUrl}`;
  }

  // Remove trailing slash
  baseUrl = baseUrl.replace(/\/$/, '');

  // Pages to crawl for contact info
  const pagesToCrawl = [
    '', // Homepage
    '/contact',
    '/contact-us',
    '/about',
    '/about-us',
    '/team',
    '/our-team',
    '/staff',
    '/people',
    '/leadership',
    '/management',
  ];

  for (const page of pagesToCrawl) {
    try {
      const url = `${baseUrl}${page}`;
      console.log(`[EmailScrape] Fetching: ${url}`);

      const response = await fetch(url, {
        headers: HEADERS,
        redirect: 'follow',
      });

      if (!response.ok) continue;

      const html = await response.text();

      // Extract emails
      const emailPatterns = [
        // Mailto links (highest confidence)
        /href="mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"/gi,
        // Email patterns in visible text
        /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(?:co\.uk|com|org|net|uk|io|biz))\b/gi,
      ];

      for (const pattern of emailPatterns) {
        const matches = html.matchAll(pattern);
        for (const match of Array.from(matches)) {
          const email = (match[1] || match[0]).toLowerCase().trim();

          // Skip invalid/common non-business emails
          if (!email.includes('@') ||
              email.includes('example.com') ||
              email.includes('test.com') ||
              email.includes('noreply') ||
              email.includes('wixpress') ||
              email.includes('sentry') ||
              email.includes('protection') ||
              email.includes('cloudflare') ||
              email.includes('@w.org') ||
              email.includes('@schema.org') ||
              seenEmails.has(email)) {
            continue;
          }

          seenEmails.add(email);

          // Categorize email
          const type = categorizeEmail(email);

          emails.push({
            address: email,
            type,
            source: page || 'homepage',
          });
        }
      }

      // Extract social media links
      extractSocialMedia(html, socialMedia);

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (err) {
      // Continue to next page on error
      continue;
    }
  }

  // Sort emails - personal first, then generic
  emails.sort((a, b) => {
    if (a.type === 'personal' && b.type !== 'personal') return -1;
    if (a.type !== 'personal' && b.type === 'personal') return 1;
    return 0;
  });

  return { emails, socialMedia };
}

function categorizeEmail(email: string): 'generic' | 'personal' {
  const genericPrefixes = [
    'info', 'hello', 'contact', 'enquiries', 'enquiry', 'sales', 'support',
    'admin', 'office', 'mail', 'help', 'general', 'reception', 'bookings',
    'team', 'customer', 'service', 'services', 'accounts', 'finance',
  ];

  const localPart = email.split('@')[0].toLowerCase();

  // Check if it's a generic email
  if (genericPrefixes.some(prefix => localPart === prefix || localPart.startsWith(prefix + '.'))) {
    return 'generic';
  }

  // Check for personal name patterns (firstname, firstname.lastname, f.lastname)
  if (localPart.includes('.') || /^[a-z]+$/.test(localPart) && localPart.length > 3) {
    return 'personal';
  }

  return 'generic';
}

function extractSocialMedia(html: string, socialMedia: SocialMedia): void {
  // LinkedIn
  const linkedinMatch = html.match(/href="(https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^"]+)"/i);
  if (linkedinMatch && !socialMedia.linkedin) {
    socialMedia.linkedin = linkedinMatch[1];
  }

  // Facebook
  const facebookMatch = html.match(/href="(https?:\/\/(?:www\.)?facebook\.com\/[^"]+)"/i);
  if (facebookMatch && !socialMedia.facebook) {
    socialMedia.facebook = facebookMatch[1];
  }

  // Twitter/X
  const twitterMatch = html.match(/href="(https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^"]+)"/i);
  if (twitterMatch && !socialMedia.twitter) {
    socialMedia.twitter = twitterMatch[1];
  }

  // Instagram
  const instagramMatch = html.match(/href="(https?:\/\/(?:www\.)?instagram\.com\/[^"]+)"/i);
  if (instagramMatch && !socialMedia.instagram) {
    socialMedia.instagram = instagramMatch[1];
  }
}

// ============================================================================
// ENHANCED LEAD SCORING
// ============================================================================
function calculateEnhancedLeadScore(
  business: {
    website?: string;
    emails: EmailInfo[];
    rating?: string;
    review_count?: string;
    socialMedia: SocialMedia;
    directors?: Director[];
    companyStatus?: string;
    incorporationDate?: string;
  }
): { score: number; breakdown: EnrichedBusiness['scoreBreakdown'] } {
  const breakdown: EnrichedBusiness['scoreBreakdown'] = {
    noWebsite: 0,
    noEmail: 0,
    genericEmailOnly: 0,
    lowReviews: 0,
    noSocial: 0,
    establishedBusiness: 0,
    hasDirectors: 0,
    soleTrader: 0,
  };

  let score = 0;

  // No website: +20 points
  if (!business.website) {
    breakdown.noWebsite = 20;
    score += 20;
  }

  // No email found: +20 points
  if (business.emails.length === 0) {
    breakdown.noEmail = 20;
    score += 20;
  } else {
    // Only generic email (no personal): +10 points
    const hasPersonalEmail = business.emails.some(e => e.type === 'personal');
    if (!hasPersonalEmail) {
      breakdown.genericEmailOnly = 10;
      score += 10;
    }
  }

  // Low/no reviews: +15 points
  const reviewCount = parseInt(business.review_count || '0');
  if (reviewCount < 5) {
    breakdown.lowReviews = 15;
    score += 15;
  }

  // No social media presence: +10 points
  const hasSocial = business.socialMedia.linkedin ||
                    business.socialMedia.facebook ||
                    business.socialMedia.twitter ||
                    business.socialMedia.instagram;
  if (!hasSocial) {
    breakdown.noSocial = 10;
    score += 10;
  }

  // Established business (incorporated > 5 years ago): +5 points
  if (business.incorporationDate) {
    const incDate = new Date(business.incorporationDate);
    const yearsOld = (Date.now() - incDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
    if (yearsOld > 5) {
      breakdown.establishedBusiness = 5;
      score += 5;
    }
  }

  // Has directors listed (decision makers identified): +10 points
  if (business.directors && business.directors.length > 0) {
    breakdown.hasDirectors = 10;
    score += 10;
  }

  // Missing from Companies House (sole trader opportunity): +10 points
  if (business.companyStatus === 'not-found') {
    breakdown.soleTrader = 10;
    score += 10;
  }

  // Cap at 100
  return { score: Math.min(score, 100), breakdown };
}

// ============================================================================
// MAIN API HANDLER - Enrich a single business
// ============================================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessName, website, postcode, rating, review_count } = body;

    if (!businessName) {
      return NextResponse.json({ error: "Missing businessName" }, { status: 400 });
    }

    console.log(`\n========== ENRICHING: ${businessName} ==========`);

    // 1. Search Companies House
    const companiesHouseData = await searchCompaniesHouse(businessName, postcode);

    // 2. Enhanced email scraping
    const { emails, socialMedia } = website
      ? await scrapeWebsiteForEmails(website)
      : { emails: [], socialMedia: {} };

    // 3. Calculate enhanced lead score
    const { score, breakdown } = calculateEnhancedLeadScore({
      website,
      emails,
      rating,
      review_count,
      socialMedia,
      directors: companiesHouseData?.directors,
      companyStatus: companiesHouseData?.companyStatus || 'not-found',
      incorporationDate: companiesHouseData?.incorporationDate,
    });

    const enrichedData: EnrichedBusiness = {
      companyNumber: companiesHouseData?.companyNumber,
      companyStatus: companiesHouseData?.companyStatus,
      companyType: companiesHouseData?.companyType,
      incorporationDate: companiesHouseData?.incorporationDate,
      registeredAddress: companiesHouseData?.registeredAddress,
      sicCodes: companiesHouseData?.sicCodes,
      directors: companiesHouseData?.directors,
      emails,
      socialMedia,
      scoreBreakdown: breakdown,
    };

    console.log(`[Enrich] Complete: ${businessName}`);
    console.log(`  - Company: ${companiesHouseData?.companyNumber || 'Not found'}`);
    console.log(`  - Emails: ${emails.length}`);
    console.log(`  - Social: ${Object.values(socialMedia).filter(Boolean).length} platforms`);
    console.log(`  - Score: ${score}`);

    return NextResponse.json({
      success: true,
      enrichedData,
      newLeadScore: score,
    });

  } catch (error) {
    console.error("Enrich error:", error);
    return NextResponse.json({ error: "Enrichment failed" }, { status: 500 });
  }
}

// ============================================================================
// BULK ENRICH - Enrich multiple businesses
// ============================================================================
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { businesses } = body;

    if (!businesses || !Array.isArray(businesses)) {
      return NextResponse.json({ error: "Missing businesses array" }, { status: 400 });
    }

    console.log(`\n========== BULK ENRICHING: ${businesses.length} businesses ==========`);

    const results = [];

    // Process in sequence to respect rate limits (Companies House: 600/5min)
    for (const business of businesses.slice(0, 20)) { // Limit to 20 at a time
      try {
        // Search Companies House
        const companiesHouseData = await searchCompaniesHouse(business.name, business.postcode);

        // Enhanced email scraping
        const { emails, socialMedia } = business.website
          ? await scrapeWebsiteForEmails(business.website)
          : { emails: [], socialMedia: {} };

        // Calculate enhanced lead score
        const { score, breakdown } = calculateEnhancedLeadScore({
          website: business.website,
          emails,
          rating: business.rating,
          review_count: business.review_count,
          socialMedia,
          directors: companiesHouseData?.directors,
          companyStatus: companiesHouseData?.companyStatus || 'not-found',
          incorporationDate: companiesHouseData?.incorporationDate,
        });

        results.push({
          originalName: business.name,
          enrichedData: {
            companyNumber: companiesHouseData?.companyNumber,
            companyStatus: companiesHouseData?.companyStatus,
            companyType: companiesHouseData?.companyType,
            incorporationDate: companiesHouseData?.incorporationDate,
            registeredAddress: companiesHouseData?.registeredAddress,
            sicCodes: companiesHouseData?.sicCodes,
            directors: companiesHouseData?.directors,
            emails,
            socialMedia,
            scoreBreakdown: breakdown,
          },
          newLeadScore: score,
        });

        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (err) {
        results.push({
          originalName: business.name,
          error: 'Enrichment failed',
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
      enrichedCount: results.filter(r => !('error' in r)).length,
    });

  } catch (error) {
    console.error("Bulk enrich error:", error);
    return NextResponse.json({ error: "Bulk enrichment failed" }, { status: 500 });
  }
}
