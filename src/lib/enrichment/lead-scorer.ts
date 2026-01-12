// ============================================================================
// ADVANCED LEAD SCORING ENGINE
// Calculates opportunity and quality scores for leads
// ============================================================================

import {
  LeadScore,
  LeadScoreBreakdown,
  EmailInfo,
  PersonInfo,
  SocialMedia,
  CompaniesHouseData
} from './types';

interface ScoringInput {
  // Contact availability
  website?: string;
  emails: EmailInfo[];
  phones: Array<{ number: string }>;

  // People/decision makers
  people: PersonInfo[];
  directors?: Array<{ name: string; role: string }>;

  // Social presence
  socialMedia: SocialMedia;

  // Reviews/reputation
  rating?: string | number;
  reviewCount?: string | number;

  // Company data
  companiesHouse?: CompaniesHouseData | null;

  // Industry
  industry?: string;

  // Location
  distance?: string;
}

/**
 * Calculate comprehensive lead score with breakdown
 */
export function calculateLeadScore(input: ScoringInput): LeadScore {
  const breakdown: LeadScoreBreakdown = {
    // Opportunity signals
    missingWebsite: 0,
    missingEmail: 0,
    onlyGenericEmail: 0,
    lowReviews: 0,
    noSocialPresence: 0,
    oldBusiness: 0,
    soleTrader: 0,

    // Quality signals
    hasDecisionMaker: 0,
    hasPersonalEmail: 0,
    hasLinkedIn: 0,
    verifiedEmail: 0,
    recentlyActive: 0,
    localBusiness: 0,
  };

  // ========== OPPORTUNITY SIGNALS ==========
  // (Higher score = more opportunity for your services)

  // No website: +20 points
  if (!input.website) {
    breakdown.missingWebsite = 20;
  }

  // No email found: +15 points
  if (input.emails.length === 0) {
    breakdown.missingEmail = 15;
  } else {
    // Only generic emails: +10 points
    const hasPersonal = input.emails.some(e => e.type === 'personal');
    if (!hasPersonal) {
      breakdown.onlyGenericEmail = 10;
    }
  }

  // Low/no reviews: +10 points
  const reviewCount = typeof input.reviewCount === 'string'
    ? parseInt(input.reviewCount) || 0
    : input.reviewCount || 0;
  if (reviewCount < 5) {
    breakdown.lowReviews = 10;
  }

  // No social media presence: +10 points
  const hasSocial = input.socialMedia.linkedin ||
                    input.socialMedia.facebook ||
                    input.socialMedia.twitter ||
                    input.socialMedia.instagram;
  if (!hasSocial) {
    breakdown.noSocialPresence = 10;
  }

  // Old established business (>10 years): +5 points
  // They may have outdated systems and need modernization
  if (input.companiesHouse?.incorporationDate) {
    const incDate = new Date(input.companiesHouse.incorporationDate);
    const yearsOld = (Date.now() - incDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
    if (yearsOld > 10) {
      breakdown.oldBusiness = 5;
    }
  }

  // Not on Companies House (sole trader): +5 points
  if (!input.companiesHouse || input.companiesHouse.companyStatus === 'not-found') {
    breakdown.soleTrader = 5;
  }

  // ========== QUALITY SIGNALS ==========
  // (Higher score = better/easier to contact)

  // Has decision maker identified: +15 points
  const hasDecisionMaker =
    (input.directors && input.directors.length > 0) ||
    (input.people && input.people.length > 0) ||
    (input.companiesHouse?.directors && input.companiesHouse.directors.length > 0);
  if (hasDecisionMaker) {
    breakdown.hasDecisionMaker = 15;
  }

  // Has personal email: +10 points
  const hasPersonalEmail = input.emails.some(e => e.type === 'personal');
  if (hasPersonalEmail) {
    breakdown.hasPersonalEmail = 10;
  }

  // Has LinkedIn: +5 points
  if (input.socialMedia.linkedin) {
    breakdown.hasLinkedIn = 5;
  }

  // Has verified email: +10 points
  const hasVerifiedEmail = input.emails.some(e => e.verified);
  if (hasVerifiedEmail) {
    breakdown.verifiedEmail = 10;
  }

  // Recently active (recent reviews): +5 points
  if (reviewCount >= 10) {
    breakdown.recentlyActive = 5;
  }

  // Local business (within 20 miles): +5 points
  if (input.distance) {
    const miles = parseFloat(input.distance.replace(/[^0-9.]/g, ''));
    if (!isNaN(miles) && miles <= 20) {
      breakdown.localBusiness = 5;
    }
  }

  // ========== CALCULATE TOTALS ==========

  // Opportunity score (how much they might need help)
  const opportunityScore =
    breakdown.missingWebsite +
    breakdown.missingEmail +
    breakdown.onlyGenericEmail +
    breakdown.lowReviews +
    breakdown.noSocialPresence +
    breakdown.oldBusiness +
    breakdown.soleTrader;

  // Quality score (how easy to contact/convert)
  const qualityScore =
    breakdown.hasDecisionMaker +
    breakdown.hasPersonalEmail +
    breakdown.hasLinkedIn +
    breakdown.verifiedEmail +
    breakdown.recentlyActive +
    breakdown.localBusiness;

  // Total score (weighted combination)
  // Opportunity is weighted higher as these are leads who need services
  const total = Math.min(100, Math.round(
    (opportunityScore * 0.7) + (qualityScore * 0.3) + 30 // Base score of 30
  ));

  // Determine priority rank
  let priorityRank: 'hot' | 'warm' | 'cold';
  if (total >= 75 && qualityScore >= 20) {
    priorityRank = 'hot';
  } else if (total >= 55) {
    priorityRank = 'warm';
  } else {
    priorityRank = 'cold';
  }

  return {
    total,
    breakdown,
    opportunityScore,
    qualityScore,
    priorityRank,
  };
}

/**
 * Generate lead signals (human-readable insights)
 */
export function generateLeadSignals(score: LeadScore, input: ScoringInput): string[] {
  const signals: string[] = [];

  // Opportunity signals
  if (score.breakdown.missingWebsite > 0) {
    signals.push("No website - needs web presence");
  }
  if (score.breakdown.missingEmail > 0) {
    signals.push("No email found - limited digital presence");
  }
  if (score.breakdown.onlyGenericEmail > 0) {
    signals.push("Only generic email - no direct contact");
  }
  if (score.breakdown.lowReviews > 0) {
    signals.push("Few reviews - needs reputation building");
  }
  if (score.breakdown.noSocialPresence > 0) {
    signals.push("No social media - needs digital marketing");
  }
  if (score.breakdown.oldBusiness > 0) {
    signals.push("Established business - may need modernization");
  }
  if (score.breakdown.soleTrader > 0) {
    signals.push("Sole trader - personal business opportunity");
  }

  // Quality signals (positive)
  if (score.breakdown.hasDecisionMaker > 0) {
    const directorCount = input.companiesHouse?.directors?.length ||
                          input.directors?.length ||
                          input.people?.length || 0;
    signals.push(`Decision maker identified (${directorCount} ${directorCount === 1 ? 'person' : 'people'})`);
  }
  if (score.breakdown.hasPersonalEmail > 0) {
    signals.push("Direct email contact available");
  }
  if (score.breakdown.hasLinkedIn > 0) {
    signals.push("LinkedIn profile found");
  }
  if (score.breakdown.localBusiness > 0) {
    signals.push("Local business - within target area");
  }

  // Industry-specific signals
  const industry = input.industry?.toLowerCase() || '';
  const traditionalIndustries = [
    'plumber', 'electrician', 'builder', 'roofer', 'painter',
    'garage', 'locksmith', 'carpenter', 'landscaping', 'cleaning',
    'farm', 'manufacturer', 'wholesaler', 'distributor'
  ];
  if (traditionalIndustries.some(ind => industry.includes(ind))) {
    signals.push("Traditional trade - likely needs digital help");
  }

  const highValueIndustries = [
    'solicitor', 'accountant', 'architect', 'surveyor', 'dentist',
    'medical', 'hotel', 'property', 'investment', 'law', 'consultant'
  ];
  if (highValueIndustries.some(ind => industry.includes(ind))) {
    signals.push("High-value industry - budget available");
  }

  return signals;
}

/**
 * Calculate a simple score for initial scraping (before full enrichment)
 */
export function calculateQuickScore(business: {
  website?: string;
  email?: string;
  phone?: string;
  rating?: string;
  review_count?: string;
  industry?: string;
}): { score: number; signals: string[] } {
  let score = 50; // Base score
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

  // Industry bonuses
  const industryLower = business.industry?.toLowerCase() || '';
  const traditionalIndustries = [
    'plumber', 'electrician', 'builder', 'roofer', 'painter',
    'garage', 'locksmith', 'carpenter', 'landscaping', 'cleaning'
  ];
  if (traditionalIndustries.some(ind => industryLower.includes(ind))) {
    score += 10;
    signals.push("Traditional trade - needs digital modernization");
  }

  return { score: Math.min(score, 100), signals };
}
