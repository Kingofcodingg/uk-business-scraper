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
import { combinedSearch, searchBingForLinkedIn } from './google-dorking';
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
  googleDork: true,       // Enable Google/Bing dorking
  searchArchive: false,   // Off by default (slow)
  lookupWhois: true,      // WHOIS lookup enabled
  discoverSocialMedia: true, // Social media discovery enabled
  maxEmailGuesses: 5,
  maxLinkedInProfiles: 5,
  maxDorkQueries: 3,
  maxArchiveSnapshots: 3,
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

  // Step 4: Enhanced LinkedIn search with profile extraction
  if (opts.searchLinkedIn) {
    try {
      console.log(`[Enrich] Searching for LinkedIn profiles (enhanced)...`);
      const location = business.postcode || result.addresses[0]?.postcode || '';

      // Use enhanced LinkedIn scraper
      const linkedInResults: LinkedInSearchResult = await searchLinkedIn(
        business.name,
        location,
        opts.maxLinkedInProfiles || 10
      );

      if (linkedInResults.profiles.length > 0) {
        sources.push('linkedin-search');

        // Set company LinkedIn page
        if (linkedInResults.companyPage && !result.socialMedia.linkedin) {
          result.socialMedia.linkedin = linkedInResults.companyPage.url;
          result.socialMedia.linkedinType = 'company';
        }

        // Add decision makers first (higher priority)
        const decisionMakerPersons = linkedInProfilesToPersons(linkedInResults.decisionMakers);
        for (const person of decisionMakerPersons) {
          if (!result.people.some(p =>
            p.linkedin === person.linkedin ||
            p.name.toLowerCase() === person.name.toLowerCase()
          )) {
            result.people.push(person);
          }
        }

        // Add other employees
        const employeePersons = linkedInProfilesToPersons(linkedInResults.employees);
        for (const person of employeePersons) {
          if (!result.people.some(p =>
            p.linkedin === person.linkedin ||
            p.name.toLowerCase() === person.name.toLowerCase()
          )) {
            result.people.push(person);
          }
        }

        console.log(`[Enrich] Added ${decisionMakerPersons.length} decision makers, ${employeePersons.length} employees from LinkedIn`);
      }

      // Also enrich existing people without LinkedIn profiles
      if (result.people.length > 0) {
        const peopleWithoutLinkedIn = result.people.filter(p => !p.linkedin);
        if (peopleWithoutLinkedIn.length > 0 && peopleWithoutLinkedIn.length <= 3) {
          console.log(`[Enrich] Enriching ${peopleWithoutLinkedIn.length} people with LinkedIn profiles...`);
          const enrichedPeople = await enrichPeopleWithLinkedIn(
            result.people,
            business.name,
            location,
            2
          );
          result.people = enrichedPeople;
        }
      }
    } catch (err) {
      errors.push(`LinkedIn search failed: ${err}`);
    }
  }

  // Step 5: Google/Bing Dorking for additional emails
  if (opts.googleDork && websiteToUse) {
    try {
      const domain = websiteToUse
        .replace(/^(https?:\/\/)?(www\.)?/, '')
        .split('/')[0];

      console.log(`[Enrich] Running Google/Bing dorking for: ${domain}`);
      const dorkResults = await combinedSearch(domain, business.name);

      // Add discovered emails
      for (const email of dorkResults.emails) {
        if (!result.emails.some(e => e.address === email.address)) {
          result.emails.push(email);
        }
      }

      // Add LinkedIn profiles from Bing search
      for (const linkedinUrl of dorkResults.linkedinUrls) {
        if (!result.socialMedia.linkedin && linkedinUrl.includes('/company/')) {
          result.socialMedia.linkedin = linkedinUrl;
          result.socialMedia.linkedinType = 'company';
        }
        if (linkedinUrl.includes('/in/') && !result.people.some(p => p.linkedin === linkedinUrl)) {
          const nameMatch = linkedinUrl.match(/linkedin\.com\/in\/([^/?]+)/);
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
              linkedin: linkedinUrl,
            });
          }
        }
      }

      if (dorkResults.emails.length > 0 || dorkResults.linkedinUrls.length > 0) {
        sources.push('google-dork');
      }
    } catch (err) {
      errors.push(`Google dorking failed: ${err}`);
    }
  }

  // Step 6: Archive.org Historical Search (optional - can be slow)
  if (opts.searchArchive && websiteToUse) {
    try {
      const domain = websiteToUse
        .replace(/^(https?:\/\/)?(www\.)?/, '')
        .split('/')[0];

      console.log(`[Enrich] Searching Archive.org for: ${domain}`);
      const archiveResults = await scrapeWaybackMachine(domain, opts.maxArchiveSnapshots || 3);
      const archiveEmails = archiveResultsToEmails(archiveResults);

      // Add historical emails (lower confidence)
      for (const email of archiveEmails) {
        if (!result.emails.some(e => e.address === email.address)) {
          result.emails.push(email);
        }
      }

      if (archiveEmails.length > 0) {
        sources.push('archive');
        console.log(`[Enrich] Found ${archiveEmails.length} historical emails from Archive.org`);
      }
    } catch (err) {
      errors.push(`Archive search failed: ${err}`);
    }
  }

  // Step 7: WHOIS Data Extraction
  if (opts.lookupWhois && websiteToUse) {
    try {
      console.log(`[Enrich] Looking up WHOIS data...`);
      const whoisData = await lookupWhois(websiteToUse);

      if (whoisData) {
        // Add emails from WHOIS
        const whoisEmails = whoisToEmails(whoisData);
        for (const email of whoisEmails) {
          if (!result.emails.some(e => e.address === email.address)) {
            result.emails.push(email);
          }
        }

        // Add registrant as potential contact
        const registrantInfo = whoisToPersonInfo(whoisData);
        if (registrantInfo && registrantInfo.name) {
          // Only add if it looks like a person name (not a company)
          const nameParts = registrantInfo.name.split(/\s+/);
          if (nameParts.length >= 2 && !registrantInfo.name.includes('Ltd') &&
              !registrantInfo.name.includes('Limited') && !registrantInfo.name.includes('LLC')) {
            const { firstName, lastName } = parseName(registrantInfo.name);
            if (!result.people.some(p => p.name.toLowerCase() === registrantInfo.name!.toLowerCase())) {
              result.people.push({
                name: registrantInfo.name,
                firstName,
                lastName,
                role: 'Domain Registrant',
                source: 'whois',
                emails: registrantInfo.email ? [{
                  address: registrantInfo.email,
                  type: 'personal',
                  source: 'whois',
                  verified: false,
                  confidence: 'medium',
                }] : [],
              });
            }
          }
        }

        // Store domain age for potential scoring use
        const domainAge = getDomainAge(whoisData);
        if (domainAge !== null) {
          console.log(`[Enrich] Domain age: ${domainAge} years`);
        }

        if (whoisEmails.length > 0 || registrantInfo) {
          sources.push('whois');
        }
      }
    } catch (err) {
      errors.push(`WHOIS lookup failed: ${err}`);
    }
  }

  // Step 8: Enhanced Social Media Discovery
  if (opts.discoverSocialMedia) {
    try {
      console.log(`[Enrich] Discovering social media profiles...`);
      const socialResults = await discoverSocialMedia(
        business.name,
        websiteToUse,
        result.socialMedia
      );

      // Merge with existing social media data
      result.socialMedia = mergeSocialMedia(result.socialMedia, socialResults);

      if (socialResults.profiles.length > 0) {
        sources.push('social-media');
        console.log(`[Enrich] Found ${socialResults.profiles.length} social profiles`);
      }
    } catch (err) {
      errors.push(`Social media discovery failed: ${err}`);
    }
  }

  // Step 9: Calculate final lead score
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
