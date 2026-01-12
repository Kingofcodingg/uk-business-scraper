// ============================================================================
// ENRICHMENT SERVICE - Main entry point for all enrichment features
// ============================================================================

export * from './types';
export * from './email-guesser';
export * from './website-crawler';
export * from './companies-house';
export * from './lead-scorer';

import {
  EmailInfo,
  PersonInfo,
  SocialMedia,
  CompaniesHouseData,
  LeadScore,
  FullyEnrichedLead,
  EnrichmentStatus,
  PhoneInfo,
  AddressInfo,
} from './types';

import { guessEmails, guessEmailsForTeam, parseName } from './email-guesser';
import { crawlWebsite, searchLinkedInProfiles, discoverWebsite } from './website-crawler';
import { searchCompaniesHouse } from './companies-house';
import { calculateLeadScore, generateLeadSignals } from './lead-scorer';

interface BasicBusiness {
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  postcode?: string;
  industry?: string;
  description?: string;
  rating?: string;
  review_count?: string;
  source?: string;
  distance?: string;
}

interface EnrichmentOptions {
  // Which features to run
  discoverWebsite?: boolean;  // Search Google to find website if missing
  crawlWebsite?: boolean;
  searchCompaniesHouse?: boolean;
  guessEmails?: boolean;
  searchLinkedIn?: boolean;

  // Limits
  maxEmailGuesses?: number;
  maxLinkedInProfiles?: number;
}

const DEFAULT_OPTIONS: EnrichmentOptions = {
  discoverWebsite: true,  // Auto-discover website if missing
  crawlWebsite: true,
  searchCompaniesHouse: true,
  guessEmails: true,
  searchLinkedIn: true,  // Now enabled by default
  maxEmailGuesses: 5,
  maxLinkedInProfiles: 5,
};

/**
 * Fully enrich a single business lead
 */
export async function enrichBusiness(
  business: BasicBusiness,
  options: EnrichmentOptions = {}
): Promise<FullyEnrichedLead> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  const errors: string[] = [];
  const sources: string[] = ['initial'];

  console.log(`\n[Enrich] Starting enrichment for: ${business.name}`);

  // Initialize result
  const result: FullyEnrichedLead = {
    id: generateId(),
    businessName: business.name,
    phones: [],
    emails: [],
    addresses: [],
    distance: business.distance,
    website: business.website,
    socialMedia: {},
    people: [],
    reviews: [],
    enrichment: {
      status: 'pending',
      sources: [],
    },
    leadScore: {
      total: 0,
      breakdown: {
        missingWebsite: 0,
        missingEmail: 0,
        onlyGenericEmail: 0,
        lowReviews: 0,
        noSocialPresence: 0,
        oldBusiness: 0,
        soleTrader: 0,
        hasDecisionMaker: 0,
        hasPersonalEmail: 0,
        hasLinkedIn: 0,
        verifiedEmail: 0,
        recentlyActive: 0,
        localBusiness: 0,
      },
      opportunityScore: 0,
      qualityScore: 0,
      priorityRank: 'cold',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Add initial data
  if (business.phone) {
    result.phones.push({
      number: business.phone,
      type: business.phone.startsWith('07') ? 'mobile' : 'landline',
      source: business.source || 'directory',
      verified: false,
    });
  }

  if (business.email) {
    result.emails.push({
      address: business.email,
      type: categorizeEmail(business.email),
      source: 'directory',
      verified: false,
      confidence: 'medium',
    });
  }

  if (business.address || business.postcode) {
    result.addresses.push({
      full: business.address || '',
      postcode: business.postcode || '',
      type: 'trading',
      source: business.source || 'directory',
    });
  }

  if (business.rating) {
    result.reviews.push({
      source: business.source || 'directory',
      rating: parseFloat(business.rating) || 0,
      count: parseInt(business.review_count || '0') || 0,
    });
    result.averageRating = parseFloat(business.rating);
    result.totalReviews = parseInt(business.review_count || '0');
  }

  // Step 0: Discover website if we don't have one
  let websiteToUse = business.website;
  if (opts.discoverWebsite && !websiteToUse) {
    try {
      console.log(`[Enrich] No website provided - searching Google...`);
      const discoveredSite = await discoverWebsite(
        business.name,
        business.postcode || result.addresses[0]?.postcode || ''
      );
      if (discoveredSite) {
        websiteToUse = discoveredSite;
        result.website = discoveredSite;
        sources.push('website-discovery');
        console.log(`[Enrich] Discovered website: ${discoveredSite}`);
      }
    } catch (err) {
      errors.push(`Website discovery failed: ${err}`);
    }
  }

  // Step 1: Crawl website for detailed info
  if (opts.crawlWebsite && websiteToUse) {
    try {
      console.log(`[Enrich] Crawling website: ${websiteToUse}`);
      const crawlResult = await crawlWebsite(websiteToUse);
      sources.push('website-crawl');

      // Add emails
      for (const email of crawlResult.emails) {
        if (!result.emails.some(e => e.address === email.address)) {
          result.emails.push(email);
        }
      }

      // Add phones
      for (const phone of crawlResult.phones) {
        const digits = phone.number.replace(/\D/g, '');
        if (!result.phones.some(p => p.number.replace(/\D/g, '') === digits)) {
          result.phones.push(phone);
        }
      }

      // Add people
      for (const person of crawlResult.people) {
        if (!result.people.some(p => p.name.toLowerCase() === person.name.toLowerCase())) {
          result.people.push(person);
        }
      }

      // Merge social media
      result.socialMedia = { ...result.socialMedia, ...crawlResult.socialMedia };

      // Update address if found better one
      if (crawlResult.address && !result.addresses.some(a => a.type === 'trading' && a.full)) {
        result.addresses = result.addresses.filter(a => a.type !== 'trading' || a.full);
        result.addresses.push({
          full: crawlResult.address,
          postcode: crawlResult.postcode,
          type: 'trading',
          source: 'website',
        });
      }

      // Add LinkedIn profiles as potential people
      for (const profile of crawlResult.linkedinProfiles) {
        if (!result.people.some(p => p.linkedin === profile)) {
          // Extract name from LinkedIn URL if possible
          const nameMatch = profile.match(/linkedin\.com\/in\/([^/?]+)/);
          if (nameMatch) {
            const urlName = nameMatch[1].replace(/-/g, ' ');
            const { firstName, lastName } = parseName(urlName);
            if (firstName) {
              result.people.push({
                name: urlName,
                firstName,
                lastName,
                role: 'Unknown',
                source: 'linkedin',
                emails: [],
                linkedin: profile,
              });
            }
          }
        }
      }

    } catch (err) {
      errors.push(`Website crawl failed: ${err}`);
    }
  }

  // Step 2: Search Companies House
  if (opts.searchCompaniesHouse) {
    try {
      console.log(`[Enrich] Searching Companies House...`);
      const chData = await searchCompaniesHouse(
        business.name,
        business.postcode || result.addresses[0]?.postcode
      );

      if (chData) {
        sources.push('companies-house');
        result.companiesHouse = chData;

        // Add registered address
        if (chData.registeredAddress) {
          result.addresses.push({
            full: chData.registeredAddress,
            postcode: extractPostcode(chData.registeredAddress),
            type: 'registered',
            source: 'companies-house',
          });
        }

        // Add directors as people
        for (const director of chData.directors) {
          const { firstName, lastName } = parseName(director.name);
          if (!result.people.some(p => p.name.toLowerCase() === director.name.toLowerCase())) {
            result.people.push({
              name: director.name,
              firstName,
              lastName,
              role: director.role,
              source: 'companies-house',
              appointedDate: director.appointedOn,
              emails: [],
            });
          }
        }
      }
    } catch (err) {
      errors.push(`Companies House search failed: ${err}`);
    }
  }

  // Step 3: Guess emails for people (if we have a domain)
  if (opts.guessEmails && websiteToUse && result.people.length > 0) {
    try {
      console.log(`[Enrich] Guessing emails for ${result.people.length} people...`);

      // Extract domain from website
      const domain = websiteToUse
        .replace(/^(https?:\/\/)?(www\.)?/, '')
        .split('/')[0];

      // Get existing emails for pattern detection
      const existingEmails = result.emails.map(e => e.address);

      // Guess emails for team
      const emailGuesses = await guessEmailsForTeam(
        domain,
        result.people.map(p => ({ firstName: p.firstName, lastName: p.lastName, role: p.role })),
        existingEmails
      );

      // Add guessed emails to people and main email list
      for (const person of result.people) {
        const key = `${person.firstName} ${person.lastName}`;
        const guesses = emailGuesses.get(key);
        if (guesses && guesses.length > 0) {
          // Add top guess to person
          const topGuess = guesses[0];
          person.emails.push({
            address: topGuess.email,
            type: 'personal',
            source: 'guessed',
            personName: person.name,
            verified: topGuess.verified,
            confidence: topGuess.confidence,
            verificationMethod: topGuess.verificationMethod,
          });

          // Add to main email list if high confidence
          if (topGuess.confidence === 'high' || topGuess.confidence === 'medium') {
            if (!result.emails.some(e => e.address === topGuess.email)) {
              result.emails.push({
                address: topGuess.email,
                type: 'personal',
                source: 'guessed',
                personName: person.name,
                verified: false,
                confidence: topGuess.confidence,
                verificationMethod: topGuess.verificationMethod,
              });
            }
          }
        }
      }

      sources.push('email-guesser');
    } catch (err) {
      errors.push(`Email guessing failed: ${err}`);
    }
  }

  // Step 4: Search for LinkedIn profiles (optional, can be slow)
  if (opts.searchLinkedIn && !result.socialMedia.linkedin) {
    try {
      console.log(`[Enrich] Searching for LinkedIn profiles...`);
      const profiles = await searchLinkedInProfiles(
        business.name,
        business.postcode || result.addresses[0]?.postcode || ''
      );

      if (profiles.length > 0) {
        sources.push('linkedin-search');

        // Add company LinkedIn if found
        const companyProfile = profiles.find(p => p.includes('/company/'));
        if (companyProfile) {
          result.socialMedia.linkedin = companyProfile;
          result.socialMedia.linkedinType = 'company';
        }

        // Add personal profiles as people
        for (const profile of profiles.filter(p => p.includes('/in/')).slice(0, opts.maxLinkedInProfiles)) {
          if (!result.people.some(p => p.linkedin === profile)) {
            const nameMatch = profile.match(/linkedin\.com\/in\/([^/?]+)/);
            if (nameMatch) {
              const urlName = nameMatch[1].replace(/-/g, ' ');
              const { firstName, lastName } = parseName(urlName);
              result.people.push({
                name: urlName,
                firstName,
                lastName,
                role: 'Unknown',
                source: 'linkedin',
                emails: [],
                linkedin: profile,
              });
            }
          }
        }
      }
    } catch (err) {
      errors.push(`LinkedIn search failed: ${err}`);
    }
  }

  // Step 5: Calculate final lead score
  console.log(`[Enrich] Calculating lead score...`);
  result.leadScore = calculateLeadScore({
    website: result.website,
    emails: result.emails,
    phones: result.phones,
    people: result.people,
    directors: result.companiesHouse?.directors,
    socialMedia: result.socialMedia,
    rating: result.averageRating?.toString(),
    reviewCount: result.totalReviews?.toString(),
    companiesHouse: result.companiesHouse,
    industry: business.industry,
    distance: result.distance,
  });

  // Set enrichment status
  result.enrichment = {
    status: errors.length > 0 ? 'partial' : 'complete',
    lastEnrichedAt: new Date(),
    sources,
    errors: errors.length > 0 ? errors : undefined,
  };

  const elapsed = Date.now() - startTime;
  console.log(`[Enrich] Completed in ${elapsed}ms - Score: ${result.leadScore.total} (${result.leadScore.priorityRank})`);
  console.log(`[Enrich] Found: ${result.emails.length} emails, ${result.phones.length} phones, ${result.people.length} people`);

  return result;
}

/**
 * Enrich multiple businesses in batch
 */
export async function enrichBusinesses(
  businesses: BasicBusiness[],
  options: EnrichmentOptions = {},
  maxConcurrent: number = 3
): Promise<FullyEnrichedLead[]> {
  const results: FullyEnrichedLead[] = [];

  // Process in batches
  for (let i = 0; i < businesses.length; i += maxConcurrent) {
    const batch = businesses.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(b => enrichBusiness(b, options).catch(err => {
        console.error(`[Enrich] Failed for ${b.name}:`, err);
        // Return basic lead on error
        return createBasicLead(b);
      }))
    );
    results.push(...batchResults);

    // Delay between batches
    if (i + maxConcurrent < businesses.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateId(): string {
  return `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function categorizeEmail(email: string): 'personal' | 'generic' {
  const genericPrefixes = [
    'info', 'hello', 'contact', 'enquiries', 'enquiry', 'sales', 'support',
    'admin', 'office', 'mail', 'help', 'general', 'reception', 'bookings',
  ];
  const localPart = email.split('@')[0].toLowerCase();
  return genericPrefixes.some(p => localPart === p || localPart.startsWith(p + '.'))
    ? 'generic'
    : 'personal';
}

function extractPostcode(text: string): string {
  const match = text.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  return match ? match[1].toUpperCase() : '';
}

function createBasicLead(business: BasicBusiness): FullyEnrichedLead {
  return {
    id: generateId(),
    businessName: business.name,
    phones: business.phone ? [{
      number: business.phone,
      type: business.phone.startsWith('07') ? 'mobile' : 'landline',
      source: business.source || 'directory',
      verified: false,
    }] : [],
    emails: business.email ? [{
      address: business.email,
      type: categorizeEmail(business.email),
      source: 'directory',
      verified: false,
      confidence: 'medium',
    }] : [],
    addresses: business.address ? [{
      full: business.address,
      postcode: business.postcode || '',
      type: 'trading',
      source: business.source || 'directory',
    }] : [],
    distance: business.distance,
    website: business.website,
    socialMedia: {},
    people: [],
    reviews: business.rating ? [{
      source: business.source || 'directory',
      rating: parseFloat(business.rating) || 0,
      count: parseInt(business.review_count || '0') || 0,
    }] : [],
    averageRating: business.rating ? parseFloat(business.rating) : undefined,
    totalReviews: business.review_count ? parseInt(business.review_count) : undefined,
    enrichment: {
      status: 'failed',
      sources: ['initial'],
      errors: ['Enrichment failed'],
    },
    leadScore: {
      total: 50,
      breakdown: {
        missingWebsite: 0,
        missingEmail: 0,
        onlyGenericEmail: 0,
        lowReviews: 0,
        noSocialPresence: 0,
        oldBusiness: 0,
        soleTrader: 0,
        hasDecisionMaker: 0,
        hasPersonalEmail: 0,
        hasLinkedIn: 0,
        verifiedEmail: 0,
        recentlyActive: 0,
        localBusiness: 0,
      },
      opportunityScore: 0,
      qualityScore: 0,
      priorityRank: 'cold',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
