// ============================================================================
// ENRICHMENT TYPES - Shared types for the enrichment suite
// ============================================================================

export interface EmailInfo {
  address: string;
  type: 'personal' | 'generic';
  source: 'crawled' | 'guessed' | 'directory' | 'verified' | 'mailto' | 'deobfuscated' | 'data-attr' | 'cloudflare-decoded' | 'schema-org' | 'javascript' | 'js-concat' | 'google-dork' | 'whois' | 'archive' | 'bing-search';
  personName?: string;
  verified: boolean;
  verificationMethod?: 'mx' | 'smtp' | 'pattern-match' | 'found-on-site';
  confidence: 'high' | 'medium' | 'low';
}

export interface PhoneInfo {
  number: string;
  type: 'landline' | 'mobile' | 'freephone';
  source: string;
  verified: boolean;
}

export interface AddressInfo {
  full: string;
  street?: string;
  city?: string;
  county?: string;
  postcode: string;
  type: 'trading' | 'registered';
  source: string;
}

export interface PersonInfo {
  name: string;
  firstName: string;
  lastName: string;
  role: string;
  source: 'companies-house' | 'website' | 'linkedin' | 'whois' | 'google-dork';
  appointedDate?: string;
  emails: EmailInfo[];
  linkedin?: string;
  phone?: string;
}

export interface SocialMedia {
  linkedin?: string;
  linkedinType?: 'company' | 'personal';
  facebook?: string;
  twitter?: string;
  instagram?: string;
  youtube?: string;
  tiktok?: string;
  pinterest?: string;
}

export interface Director {
  name: string;
  role: string;
  appointedOn: string;
  resignedOn?: string;
  nationality?: string;
  occupation?: string;
}

export interface SicCode {
  code: string;
  description: string;
}

export interface CompaniesHouseData {
  companyNumber: string;
  companyName: string;
  companyStatus: 'active' | 'dissolved' | 'dormant' | 'liquidation' | 'not-found';
  companyType: string;
  incorporationDate: string;
  registeredAddress: string;
  sicCodes: SicCode[];
  directors: Director[];
  lastAccountsDate?: string;
  lastConfirmationStatement?: string;
}

export interface ReviewInfo {
  source: string;
  rating: number;
  count: number;
  url?: string;
}

export interface LeadScoreBreakdown {
  // Opportunity signals (higher = more opportunity)
  missingWebsite: number;
  missingEmail: number;
  onlyGenericEmail: number;
  lowReviews: number;
  noSocialPresence: number;
  oldBusiness: number;
  soleTrader: number;

  // Quality signals (higher = better lead)
  hasDecisionMaker: number;
  hasPersonalEmail: number;
  hasLinkedIn: number;
  verifiedEmail: number;
  recentlyActive: number;
  localBusiness: number;
}

export interface LeadScore {
  total: number;
  breakdown: LeadScoreBreakdown;
  opportunityScore: number;
  qualityScore: number;
  priorityRank: 'hot' | 'warm' | 'cold';
}

export interface EnrichmentStatus {
  status: 'pending' | 'partial' | 'complete' | 'failed';
  lastEnrichedAt?: Date;
  sources: string[];
  errors?: string[];
}

export interface FullyEnrichedLead {
  // Basic Info
  id: string;
  businessName: string;
  tradingNames?: string[];

  // Contact Info
  phones: PhoneInfo[];
  emails: EmailInfo[];

  // Location
  addresses: AddressInfo[];
  distance?: string;

  // Online Presence
  website?: string;
  websiteStatus?: 'active' | 'down' | 'parked' | 'none';
  socialMedia: SocialMedia;

  // Companies House Data
  companiesHouse?: CompaniesHouseData;

  // People / Decision Makers
  people: PersonInfo[];

  // Reputation
  reviews: ReviewInfo[];
  averageRating?: number;
  totalReviews?: number;

  // Enrichment Metadata
  enrichment: EnrichmentStatus;

  // Scoring
  leadScore: LeadScore;

  // Tracking
  createdAt: Date;
  updatedAt: Date;
}

// Email pattern configuration
export interface EmailPatternConfig {
  domain: string;
  firstName: string;
  lastName: string;
  companyName?: string;
}

export interface EmailGuessResult {
  email: string;
  pattern: string;
  confidence: 'high' | 'medium' | 'low';
  verified: boolean;
  verificationMethod?: 'mx' | 'smtp' | 'pattern-match';
}

// MX verification result
export interface MXVerificationResult {
  hasMX: boolean;
  mxRecords: string[];
  priority: number[];
}

// SMTP verification result
export interface SMTPVerificationResult {
  exists: boolean;
  catchAll: boolean;
  error?: string;
}
