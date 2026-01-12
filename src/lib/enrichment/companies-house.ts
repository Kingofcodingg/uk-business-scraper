// ============================================================================
// COMPANIES HOUSE API INTEGRATION
// Free UK company data including directors, SIC codes, and company details
// ============================================================================

import { CompaniesHouseData, Director, SicCode } from './types';

// SIC code descriptions lookup
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
  "66110": "Administration of financial markets",
  "66190": "Other activities auxiliary to financial services",
  "66220": "Activities of insurance agents and brokers",
  "68100": "Buying and selling of own real estate",
  "68209": "Other letting and operating of own or leased real estate",
  "68310": "Real estate agencies",
  "68320": "Management of real estate on a fee or contract basis",
  "69101": "Barristers at law",
  "69102": "Solicitors",
  "69201": "Accounting and auditing activities",
  "69202": "Bookkeeping activities",
  "69203": "Tax consultancy",
  "70100": "Activities of head offices",
  "70210": "Public relations and communications activities",
  "70229": "Management consultancy activities other than financial",
  "71111": "Architectural activities",
  "71121": "Engineering design activities for industrial process",
  "71122": "Engineering related scientific and technical consulting",
  "71129": "Other engineering activities",
  "71200": "Technical testing and analysis",
  "73110": "Advertising agencies",
  "73120": "Media representation services",
  "73200": "Market research and public opinion polling",
  "74100": "Specialised design activities",
  "74201": "Portrait photographic activities",
  "74209": "Other photographic activities",
  "74300": "Translation and interpretation activities",
  "74909": "Other professional, scientific and technical activities",
  "77110": "Renting and leasing of cars and light motor vehicles",
  "78101": "Activities of employment placement agencies",
  "78200": "Temporary employment agency activities",
  "79110": "Travel agency activities",
  "79120": "Tour operator activities",
  "80100": "Private security activities",
  "81100": "Combined facilities support activities",
  "81210": "General cleaning of buildings",
  "81221": "Window cleaning services",
  "81222": "Specialised cleaning services",
  "81229": "Other building and industrial cleaning activities",
  "81300": "Landscape service activities",
  "82110": "Combined office administrative service activities",
  "82190": "Photocopying, document preparation and other office support",
  "82200": "Activities of call centres",
  "82990": "Other business support service activities",
  "85100": "Pre-primary education",
  "85200": "Primary education",
  "85310": "General secondary education",
  "85410": "Post-secondary non-tertiary education",
  "85510": "Sports and recreation education",
  "85520": "Cultural education",
  "85530": "Driving school activities",
  "85590": "Other education",
  "86101": "Hospital activities",
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
  "93110": "Operation of sports facilities",
  "93120": "Activities of sport clubs",
  "93130": "Fitness facilities",
  "93199": "Other sports activities",
  "93290": "Other amusement and recreation activities",
  "95110": "Repair of computers and peripheral equipment",
  "95120": "Repair of communication equipment",
  "95210": "Repair of consumer electronics",
  "95220": "Repair of household appliances",
  "95290": "Repair of other personal and household goods",
  "96010": "Washing and (dry-)cleaning of textile and fur products",
  "96020": "Hairdressing and other beauty treatment",
  "96040": "Physical well-being activities",
  "96090": "Other personal service activities",
};

/**
 * Format address from Companies House response
 */
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

/**
 * Map Companies House status to our status type
 */
function mapCompanyStatus(status: string): CompaniesHouseData['companyStatus'] {
  if (!status) return 'not-found';
  const s = status.toLowerCase();
  if (s.includes('active')) return 'active';
  if (s.includes('dissolved')) return 'dissolved';
  if (s.includes('dormant')) return 'dormant';
  if (s.includes('liquidation') || s.includes('insolvency')) return 'liquidation';
  return 'active';
}

// Common UK business suffixes to normalize
const BUSINESS_SUFFIXES = [
  'limited', 'ltd', 'llp', 'plc', 'inc', 'corp', 'company', 'co',
  'uk', 'holdings', 'group', 'services', 'solutions', 'international',
  '& co', 'and co', '& sons', 'and sons', '& partners', 'and partners',
];

/**
 * Normalize company name for comparison
 */
function normalizeCompanyName(name: string): string {
  let normalized = name.toLowerCase().trim();

  // Remove punctuation except spaces
  normalized = normalized.replace(/[^\w\s]/g, ' ');

  // Remove common suffixes
  for (const suffix of BUSINESS_SUFFIXES) {
    const pattern = new RegExp(`\\b${suffix}\\b`, 'gi');
    normalized = normalized.replace(pattern, '');
  }

  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Create matrix
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate word overlap score
 */
function wordOverlapScore(str1: string, str2: string): number {
  const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 1));
  const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 1));

  if (words1.size === 0 || words2.size === 0) return 0;

  let matches = 0;
  for (const word of words1) {
    if (words2.has(word)) {
      matches++;
    } else {
      // Partial match check
      for (const word2 of words2) {
        if (word.includes(word2) || word2.includes(word)) {
          matches += 0.5;
          break;
        }
      }
    }
  }

  return matches / Math.max(words1.size, words2.size);
}

/**
 * Calculate comprehensive name similarity score
 * Returns a value between 0 (no match) and 1 (perfect match)
 */
function calculateSimilarity(str1: string, str2: string): number {
  // Normalize both strings
  const n1 = normalizeCompanyName(str1);
  const n2 = normalizeCompanyName(str2);

  // Exact match after normalization
  if (n1 === n2) return 1.0;

  // Empty check
  if (n1.length === 0 || n2.length === 0) return 0;

  // One contains the other
  if (n1.includes(n2)) {
    return 0.9 + (0.1 * n2.length / n1.length);
  }
  if (n2.includes(n1)) {
    return 0.9 + (0.1 * n1.length / n2.length);
  }

  // Calculate Levenshtein-based similarity
  const maxLen = Math.max(n1.length, n2.length);
  const distance = levenshteinDistance(n1, n2);
  const levenshteinSim = 1 - (distance / maxLen);

  // Calculate word overlap similarity
  const wordSim = wordOverlapScore(n1, n2);

  // Combine scores (word overlap is often more meaningful for company names)
  const combinedScore = (levenshteinSim * 0.4) + (wordSim * 0.6);

  return combinedScore;
}

/**
 * Generate search variations for better matching
 */
function generateSearchVariations(businessName: string): string[] {
  const variations: string[] = [businessName];
  const normalized = normalizeCompanyName(businessName);

  // Add the normalized version
  if (normalized !== businessName.toLowerCase()) {
    variations.push(normalized);
  }

  // Try removing "The" prefix
  if (businessName.toLowerCase().startsWith('the ')) {
    variations.push(businessName.substring(4));
  }

  // Try first word only (for cases like "John's Plumbing" -> "Johns Plumbing Ltd")
  const firstWord = normalized.split(/\s+/)[0];
  if (firstWord && firstWord.length >= 4) {
    variations.push(firstWord);
  }

  // Remove possessives
  const withoutPossessive = businessName.replace(/'s?\s/g, ' ');
  if (withoutPossessive !== businessName) {
    variations.push(withoutPossessive);
  }

  return [...new Set(variations)];
}

/**
 * Minimum similarity threshold for a valid match
 */
const MIN_SIMILARITY_THRESHOLD = 0.5;

/**
 * Search Companies House for a company with fuzzy matching
 */
export async function searchCompaniesHouse(
  businessName: string,
  postcode?: string
): Promise<CompaniesHouseData | null> {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;

  if (!apiKey) {
    console.log("[CompaniesHouse] No API key configured - set COMPANIES_HOUSE_API_KEY env var");
    console.log("[CompaniesHouse] Get a free API key from: https://developer.company-information.service.gov.uk");
    return null;
  }

  console.log(`[CompaniesHouse] Searching for: ${businessName}`);

  // Generate search variations for better matching
  const searchVariations = generateSearchVariations(businessName);
  console.log(`[CompaniesHouse] Trying ${searchVariations.length} search variations`);

  // Collect all results from all variations
  const allItems: Array<{ item: Record<string, unknown>; searchTerm: string }> = [];

  for (const searchTerm of searchVariations.slice(0, 3)) { // Limit to 3 variations
    try {
      const searchUrl = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(searchTerm)}&items_per_page=10`;

      const searchResponse = await fetch(searchUrl, {
        headers: {
          "Authorization": `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
          "Accept": "application/json",
        },
      });

      if (!searchResponse.ok) {
        const status = searchResponse.status;
        if (status === 401) {
          console.log("[CompaniesHouse] Invalid API key - check your COMPANIES_HOUSE_API_KEY");
          return null;
        } else if (status === 429) {
          console.log("[CompaniesHouse] Rate limited - waiting...");
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        continue;
      }

      const searchData = await searchResponse.json();

      if (searchData.items && searchData.items.length > 0) {
        for (const item of searchData.items) {
          allItems.push({ item, searchTerm });
        }
      }

      // Small delay between requests
      if (searchVariations.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.log(`[CompaniesHouse] Search variation failed:`, error);
    }
  }

  if (allItems.length === 0) {
    console.log(`[CompaniesHouse] No results for: ${businessName}`);
    return null;
  }

  // Deduplicate by company number
  const uniqueItems = new Map<string, Record<string, unknown>>();
  for (const { item } of allItems) {
    const companyNumber = item.company_number as string;
    if (!uniqueItems.has(companyNumber)) {
      uniqueItems.set(companyNumber, item);
    }
  }

  console.log(`[CompaniesHouse] Found ${uniqueItems.size} unique companies`);

  // Find best match with fuzzy scoring
  let bestMatch: Record<string, unknown> | null = null;
  let bestScore = 0;

  for (const item of uniqueItems.values()) {
    const title = (item.title as string) || '';
    let score = calculateSimilarity(businessName, title);

    // Bonus for matching postcode (strong signal)
    if (postcode) {
      const postcodePrefix = postcode.toUpperCase().replace(/\s+/g, '').substring(0, 4);
      const itemAddress = item.address as Record<string, string> | undefined;
      const itemPostcode = itemAddress?.postal_code?.toUpperCase().replace(/\s+/g, '') || '';

      if (itemPostcode === postcode.toUpperCase().replace(/\s+/g, '')) {
        score += 0.4; // Exact postcode match
      } else if (itemPostcode.startsWith(postcodePrefix)) {
        score += 0.25; // Outward code match
      } else if (itemPostcode.substring(0, 2) === postcodePrefix.substring(0, 2)) {
        score += 0.1; // Area match
      }
    }

    // Bonus for active status
    if (item.company_status === 'active') {
      score += 0.1;
    }

    // Penalty for dissolved companies
    if ((item.company_status as string)?.includes('dissolved')) {
      score -= 0.2;
    }

    // Penalty for very old dissolutions
    const dissolvedDate = item.date_of_cessation as string | undefined;
    if (dissolvedDate) {
      const years = (Date.now() - new Date(dissolvedDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
      if (years > 5) {
        score -= 0.3;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = item;
    }
  }

  // Check if match meets minimum threshold
  if (!bestMatch || bestScore < MIN_SIMILARITY_THRESHOLD) {
    console.log(`[CompaniesHouse] No good match found (best score: ${bestScore.toFixed(2)} < ${MIN_SIMILARITY_THRESHOLD})`);
    return null;
  }

  const companyNumber = bestMatch.company_number as string;
  console.log(`[CompaniesHouse] Best match: ${bestMatch.title} (${companyNumber}) - score: ${bestScore.toFixed(2)}`);

  try {
    // Get full company profile
    const profileUrl = `https://api.company-information.service.gov.uk/company/${companyNumber}`;
    const profileResponse = await fetch(profileUrl, {
      headers: {
        "Authorization": `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
        "Accept": "application/json",
      },
    });

    let profileData: Record<string, unknown> | null = null;
    if (profileResponse.ok) {
      profileData = await profileResponse.json();
    }

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
          // Only include active officers
          if (!officer.resigned_on) {
            directors.push({
              name: officer.name || '',
              role: officer.officer_role || '',
              appointedOn: officer.appointed_on || '',
              resignedOn: officer.resigned_on,
              nationality: officer.nationality,
              occupation: officer.occupation,
            });
          }
        }
      }
    } catch (err) {
      console.log(`[CompaniesHouse] Officers fetch failed:`, err);
    }

    // Map SIC codes to descriptions
    const rawSicCodes = (profileData?.sic_codes as string[]) || [];
    const sicCodes: SicCode[] = rawSicCodes.map((code: string) => ({
      code,
      description: SIC_DESCRIPTIONS[code] || `Industry code ${code}`,
    }));

    // Get accounts date if available
    const accounts = profileData?.accounts as Record<string, Record<string, unknown>> | undefined;
    const lastAccountsDate = (accounts?.last_accounts?.made_up_to as string) || undefined;

    // Get confirmation statement date if available
    const confStatement = profileData?.confirmation_statement as Record<string, unknown> | undefined;
    const lastConfirmationStatement = (confStatement?.last_made_up_to as string) || undefined;

    return {
      companyNumber,
      companyName: (profileData?.company_name as string) || (bestMatch.title as string),
      companyStatus: mapCompanyStatus((profileData?.company_status as string) || (bestMatch.company_status as string)),
      companyType: (profileData?.type as string) || (bestMatch.company_type as string) || '',
      incorporationDate: (profileData?.date_of_creation as string) || (bestMatch.date_of_creation as string) || '',
      registeredAddress: formatAddress(
        (profileData?.registered_office_address as Record<string, string>) || (bestMatch.address as Record<string, string>)
      ),
      sicCodes,
      directors,
      lastAccountsDate,
      lastConfirmationStatement,
    };
  } catch (error) {
    console.log(`[CompaniesHouse] Error:`, error);
    return null;
  }
}

/**
 * Get company by number directly
 */
export async function getCompanyByNumber(companyNumber: string): Promise<CompaniesHouseData | null> {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;

  if (!apiKey) {
    return null;
  }

  try {
    const profileUrl = `https://api.company-information.service.gov.uk/company/${companyNumber}`;
    const profileResponse = await fetch(profileUrl, {
      headers: {
        "Authorization": `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
        "Accept": "application/json",
      },
    });

    if (!profileResponse.ok) {
      return null;
    }

    const profileData = await profileResponse.json();

    // Get officers
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
          if (!officer.resigned_on) {
            directors.push({
              name: officer.name || '',
              role: officer.officer_role || '',
              appointedOn: officer.appointed_on || '',
              nationality: officer.nationality,
              occupation: officer.occupation,
            });
          }
        }
      }
    } catch {}

    const sicCodes: SicCode[] = (profileData.sic_codes || []).map((code: string) => ({
      code,
      description: SIC_DESCRIPTIONS[code] || `Industry code ${code}`,
    }));

    return {
      companyNumber,
      companyName: profileData.company_name,
      companyStatus: mapCompanyStatus(profileData.company_status),
      companyType: profileData.type || '',
      incorporationDate: profileData.date_of_creation || '',
      registeredAddress: formatAddress(profileData.registered_office_address),
      sicCodes,
      directors,
      lastAccountsDate: profileData.accounts?.last_accounts?.made_up_to,
      lastConfirmationStatement: profileData.confirmation_statement?.last_made_up_to,
    };
  } catch {
    return null;
  }
}
