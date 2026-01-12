// ============================================================================
// ENRICHMENT SERVICE - Main entry point for all enrichment features
// ============================================================================

export * from './types';
export * from './email-guesser';
export * from './website-crawler';
export * from './companies-house';
export * from './lead-scorer';
export * from './google-dorking';
export * from './archive-scraper';
export * from './whois-scraper';
export * from './linkedin-scraper';
export * from './social-media-scraper';

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
import { combinedSearch, searchBingForLinkedIn, searchDirectContacts } from './google-dorking';
import { scrapeWaybackMachine, archiveResultsToEmails } from './archive-scraper';
import { lookupWhois, whoisToEmails, whoisToPersonInfo, getDomainAge } from './whois-scraper';
import {
  searchLinkedIn,
  linkedInProfilesToPersons,
  enrichPeopleWithLinkedIn,
  LinkedInSearchResult,
} from './linkedin-scraper';
import { discoverSocialMedia, mergeSocialMedia } from './social-media-scraper';

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
  discoverWebsite?: boolean;  // Search Google/Bing to find website if missing
  crawlWebsite?: boolean;     // Deep crawl website for emails/phones/people
  searchCompaniesHouse?: boolean;
  guessEmails?: boolean;      // Generate email patterns for people
  searchLinkedIn?: boolean;   // Search Google/Bing for LinkedIn profiles
  googleDork?: boolean;       // Advanced Google/Bing dorking for emails
  searchArchive?: boolean;    // Search Archive.org for historical emails
  lookupWhois?: boolean;      // WHOIS data extraction
  discoverSocialMedia?: boolean; // Multi-platform social media discovery

  // Limits
  maxEmailGuesses?: number;
  maxLinkedInProfiles?: number;
  maxDorkQueries?: number;
  maxArchiveSnapshots?: number;
}

const DEFAULT_OPTIONS: EnrichmentOptions = {
  discoverWebsite: true,  // Auto-discover website if missing
  crawlWebsite: true,
  searchCompaniesHouse: true,
  guessEmails: true,
  searchLinkedIn: true,   // Now enabled by default
  googleDork: false,      // Disabled - redundant with LinkedIn search
  searchArchive: false,   // Off by default (slow)
  lookupWhois: false,     // Disabled - slow and low value
  discoverSocialMedia: false, // Disabled - slow, use LinkedIn instead
  maxEmailGuesses: 3,
  maxLinkedInProfiles: 5,
  maxDorkQueries: 2,
  maxArchiveSnapshots: 2,
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

  // ========== PHASE 1: Run initial searches in PARALLEL ==========
  // Website discovery, Companies House, and LinkedIn search can all run at the same time
  let websiteToUse = business.website;
  const postcode = business.postcode || result.addresses[0]?.postcode || '';

  console.log(`[Enrich] Starting parallel searches...`);

  const parallelResults = await Promise.allSettled([
    // Task 1: Discover website if needed
    (!websiteToUse && opts.discoverWebsite)
      ? discoverWebsite(business.name, postcode)
      : Promise.resolve(null),

    // Task 2: Companies House search
    opts.searchCompaniesHouse
      ? searchCompaniesHouse(business.name, postcode)
      : Promise.resolve(null),

    // Task 3: LinkedIn search
    opts.searchLinkedIn
      ? searchLinkedIn(business.name, postcode, opts.maxLinkedInProfiles || 5)
      : Promise.resolve(null),
  ]);

  // Process website discovery result
  const websiteResult = parallelResults[0];
  if (websiteResult.status === 'fulfilled' && websiteResult.value) {
    websiteToUse = websiteResult.value;
    result.website = websiteResult.value;
    sources.push('website-discovery');
    console.log(`[Enrich] Discovered website: ${websiteResult.value}`);
  } else if (websiteResult.status === 'rejected') {
    errors.push(`Website discovery failed: ${websiteResult.reason}`);
  }

  // Process Companies House result
  const chResult = parallelResults[1];
  if (chResult.status === 'fulfilled' && chResult.value) {
    const chData = chResult.value;
    sources.push('companies-house');
    result.companiesHouse = chData;

    if (chData.registeredAddress) {
      result.addresses.push({
        full: chData.registeredAddress,
        postcode: extractPostcode(chData.registeredAddress),
        type: 'registered',
        source: 'companies-house',
      });
    }

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
    console.log(`[Enrich] Found Companies House data with ${chData.directors.length} directors`);

    // If we still don't have a website, try searching with the official company name
    if (!websiteToUse && chData.companyName) {
      console.log(`[Enrich] Trying website discovery with Companies House name: ${chData.companyName}`);
      const chPostcode = extractPostcode(chData.registeredAddress);
      const chWebsite = await discoverWebsite(chData.companyName, chPostcode || postcode);
      if (chWebsite) {
        websiteToUse = chWebsite;
        result.website = chWebsite;
        sources.push('website-discovery-ch');
        console.log(`[Enrich] Found website via CH name: ${chWebsite}`);
      }
    }
  } else if (chResult.status === 'rejected') {
    errors.push(`Companies House search failed: ${chResult.reason}`);
  }

  // Process LinkedIn result
  const linkedInResult = parallelResults[2];
  if (linkedInResult.status === 'fulfilled' && linkedInResult.value) {
    const liResults = linkedInResult.value as LinkedInSearchResult;
    if (liResults.profiles.length > 0) {
      sources.push('linkedin-search');

      if (liResults.companyPage && !result.socialMedia.linkedin) {
        result.socialMedia.linkedin = liResults.companyPage.url;
        result.socialMedia.linkedinType = 'company';
      }

      const decisionMakerPersons = linkedInProfilesToPersons(liResults.decisionMakers);
      for (const person of decisionMakerPersons) {
        if (!result.people.some(p => p.linkedin === person.linkedin || p.name.toLowerCase() === person.name.toLowerCase())) {
          result.people.push(person);
        }
      }

      const employeePersons = linkedInProfilesToPersons(liResults.employees);
      for (const person of employeePersons) {
        if (!result.people.some(p => p.linkedin === person.linkedin || p.name.toLowerCase() === person.name.toLowerCase())) {
          result.people.push(person);
        }
      }
      console.log(`[Enrich] Found ${liResults.profiles.length} LinkedIn profiles`);
    }
  } else if (linkedInResult.status === 'rejected') {
    errors.push(`LinkedIn search failed: ${linkedInResult.reason}`);
  }

  // ========== PHASE 2: Website crawl (needs website from Phase 1) ==========
  if (opts.crawlWebsite && websiteToUse) {
    try {
      console.log(`[Enrich] Crawling website: ${websiteToUse}`);
      const crawlResult = await crawlWebsite(websiteToUse);
      sources.push('website-crawl');

      for (const email of crawlResult.emails) {
        if (!result.emails.some(e => e.address === email.address)) {
          result.emails.push(email);
        }
      }

      for (const phone of crawlResult.phones) {
        const digits = phone.number.replace(/\D/g, '');
        if (!result.phones.some(p => p.number.replace(/\D/g, '') === digits)) {
          result.phones.push(phone);
        }
      }

      for (const person of crawlResult.people) {
        if (!result.people.some(p => p.name.toLowerCase() === person.name.toLowerCase())) {
          result.people.push(person);
        }
      }

      result.socialMedia = { ...result.socialMedia, ...crawlResult.socialMedia };

      if (crawlResult.address && !result.addresses.some(a => a.type === 'trading' && a.full)) {
        result.addresses = result.addresses.filter(a => a.type !== 'trading' || a.full);
        result.addresses.push({
          full: crawlResult.address,
          postcode: crawlResult.postcode,
          type: 'trading',
          source: 'website',
        });
      }

      for (const profile of crawlResult.linkedinProfiles) {
        if (!result.people.some(p => p.linkedin === profile)) {
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
      console.log(`[Enrich] Website crawl found ${crawlResult.emails.length} emails, ${crawlResult.phones.length} phones`);
    } catch (err) {
      errors.push(`Website crawl failed: ${err}`);
    }
  }

  // Step 3: Guess emails for people (if we have a domain) - FAST
  if (opts.guessEmails && websiteToUse && result.people.length > 0) {
    try {
      const domain = websiteToUse.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
      const existingEmails = result.emails.map(e => e.address);

      // Only guess for top 3 people to save time
      const topPeople = result.people.slice(0, 3);
      const emailGuesses = await guessEmailsForTeam(
        domain,
        topPeople.map(p => ({ firstName: p.firstName, lastName: p.lastName, role: p.role })),
        existingEmails
      );

      for (const person of topPeople) {
        const key = `${person.firstName} ${person.lastName}`;
        const guesses = emailGuesses.get(key);
        if (guesses && guesses.length > 0) {
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

          if ((topGuess.confidence === 'high' || topGuess.confidence === 'medium') &&
              !result.emails.some(e => e.address === topGuess.email)) {
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
      sources.push('email-guesser');
    } catch (err) {
      errors.push(`Email guessing failed: ${err}`);
    }
  }

  // Step 4: Google/Bing Dorking for additional emails (OPTIONAL - disabled by default for speed)
  if (opts.googleDork && websiteToUse) {
    try {
      const domain = websiteToUse.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
      const dorkResults = await combinedSearch(domain, business.name);

      for (const email of dorkResults.emails) {
        if (!result.emails.some(e => e.address === email.address)) {
          result.emails.push(email);
        }
      }

      for (const linkedinUrl of dorkResults.linkedinUrls) {
        if (!result.socialMedia.linkedin && linkedinUrl.includes('/company/')) {
          result.socialMedia.linkedin = linkedinUrl;
          result.socialMedia.linkedinType = 'company';
        }
      }

      if (dorkResults.emails.length > 0 || dorkResults.linkedinUrls.length > 0) {
        sources.push('google-dork');
      }
    } catch (err) {
      errors.push(`Google dorking failed: ${err}`);
    }
  }

  // Final Step: Calculate lead score
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

    // Minimal delay between batches (just to prevent rate limiting)
    if (i + maxConcurrent < businesses.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
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
