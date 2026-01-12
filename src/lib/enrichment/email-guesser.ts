// ============================================================================
// EMAIL PATTERN GUESSING ENGINE
// Generates and verifies possible email combinations from names + domain
// ============================================================================

import { EmailGuessResult, EmailPatternConfig, MXVerificationResult } from './types';

// Common UK business email patterns in priority order (comprehensive from prompt)
const EMAIL_PATTERNS = [
  // Most common UK business patterns (priority order)
  { pattern: '{first}.{last}', name: 'firstname.lastname', priority: 1 },
  { pattern: '{first}', name: 'firstname', priority: 2 },
  { pattern: '{first}{last}', name: 'firstnamelastname', priority: 3 },
  { pattern: '{fi}.{last}', name: 'initial.lastname', priority: 4 },
  { pattern: '{fi}{last}', name: 'initiallastname', priority: 5 },
  { pattern: '{last}', name: 'lastname', priority: 6 },
  { pattern: '{first}.{li}', name: 'firstname.initial', priority: 7 },
  { pattern: '{fi}{li}', name: 'initials', priority: 8 },
  { pattern: '{first}_{last}', name: 'firstname_lastname', priority: 9 },
  { pattern: '{first}-{last}', name: 'firstname-lastname', priority: 10 },
  { pattern: '{last}.{first}', name: 'lastname.firstname', priority: 11 },
  { pattern: '{last}{first}', name: 'lastnamefirstname', priority: 12 },
  { pattern: '{last}.{fi}', name: 'lastname.initial', priority: 13 },
  // With numbers (common for duplicate names)
  { pattern: '{first}.{last}1', name: 'firstname.lastname1', priority: 14 },
  { pattern: '{first}{last}1', name: 'firstnamelastname1', priority: 15 },
  { pattern: '{fi}{last}1', name: 'initiallastname1', priority: 16 },
];

// Generic email prefixes that are always worth trying (expanded)
const GENERIC_PREFIXES = [
  'info',
  'contact',
  'hello',
  'enquiries',
  'enquiry',
  'sales',
  'admin',
  'office',
  'mail',
  'help',
  'general',
  'reception',
  'bookings',
  'booking',
  'appointments',
  'team',
  'support',
  'quotes',
  'jobs',
  'careers',
  'hr',
  'accounts',
  'billing',
  'finance',
  'press',
  'media',
  'marketing',
  'customer',
  'service',
  'services',
];

/**
 * Parse a full name into first and last name
 * Handles multiple formats including Companies House (SURNAME, Firstname)
 */
export function parseName(fullName: string): { firstName: string; lastName: string } {
  if (!fullName) {
    return { firstName: '', lastName: '' };
  }

  // Handle Companies House format: "SURNAME, Firstname Middlename"
  if (fullName.includes(',')) {
    const parts = fullName.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      const lastName = parts[0];
      const firstNames = parts[1].split(/\s+/);
      return {
        firstName: firstNames[0] || '',
        lastName: lastName.charAt(0) + lastName.slice(1).toLowerCase(),
      };
    }
  }

  const parts = fullName.trim().split(/\s+/);

  // Handle titles
  const titles = ['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'sir', 'lord', 'lady', 'professor'];
  const suffixes = ['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md', 'esq', 'obe', 'mbe', 'cbe'];

  const filtered = parts.filter(p => {
    const clean = p.toLowerCase().replace(/[.,]/g, '');
    return !titles.includes(clean) && !suffixes.includes(clean);
  });

  if (filtered.length === 0) {
    return { firstName: '', lastName: '' };
  }

  if (filtered.length === 1) {
    return { firstName: filtered[0], lastName: '' };
  }

  // Handle hyphenated last names
  const lastName = filtered[filtered.length - 1];

  // First name is first word, last name is last word
  return {
    firstName: filtered[0],
    lastName: lastName,
  };
}

/**
 * Clean and normalize a name for email generation
 */
function cleanNamePart(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z-]/g, '') // Keep hyphens for hyphenated names
    .replace(/-/g, ''); // Then remove hyphens for email
}

/**
 * Generate email variations for a person + domain
 * Comprehensive pattern generation including hyphenated names
 */
export function generateEmailPatterns(config: EmailPatternConfig): string[] {
  const { domain, firstName, lastName } = config;

  if (!domain || !firstName) {
    return [];
  }

  // Clean names, removing non-alpha characters
  const f = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const l = lastName?.toLowerCase().replace(/[^a-z]/g, '') || '';
  const fi = f[0] || '';
  const li = l[0] || '';

  // Also handle hyphenated names by keeping them cleaned
  const fClean = firstName.toLowerCase().replace(/[-\s]/g, '');
  const lClean = lastName?.toLowerCase().replace(/[-\s]/g, '') || '';

  const emails: string[] = [];

  // Personal patterns (require at least first name)
  if (f) {
    for (const { pattern } of EMAIL_PATTERNS) {
      // Skip patterns that need last name if we don't have one
      if (!l && (pattern.includes('{last}') || pattern.includes('{li}'))) {
        continue;
      }

      const email = pattern
        .replace('{first}', f)
        .replace('{last}', l)
        .replace('{fi}', fi)
        .replace('{li}', li);

      if (email && !email.includes('{')) {
        emails.push(`${email}@${domain}`);
      }
    }

    // Add hyphenated name variations if name differs when cleaned
    if (fClean !== f || lClean !== l) {
      emails.push(`${fClean}.${lClean}@${domain}`);
      emails.push(`${fClean}@${domain}`);
      emails.push(`${fClean[0]}.${lClean}@${domain}`);
    }
  }

  // Add generic fallbacks
  for (const prefix of GENERIC_PREFIXES) {
    emails.push(`${prefix}@${domain}`);
  }

  return [...new Set(emails)]; // Remove duplicates
}

/**
 * Check if a domain has valid MX records (can receive email)
 */
export async function checkMXRecords(domain: string): Promise<MXVerificationResult> {
  const result: MXVerificationResult = {
    hasMX: false,
    mxRecords: [],
    priority: [],
  };

  try {
    // Use DNS-over-HTTPS for browser/serverless compatibility
    const response = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
      { headers: { 'Accept': 'application/dns-json' } }
    );

    if (!response.ok) {
      return result;
    }

    const data = await response.json();

    if (data.Answer && Array.isArray(data.Answer)) {
      for (const record of data.Answer) {
        if (record.type === 15) { // MX record type
          // Parse MX data: "10 mail.example.com."
          const parts = record.data.split(' ');
          if (parts.length >= 2) {
            result.priority.push(parseInt(parts[0]) || 0);
            result.mxRecords.push(parts[1].replace(/\.$/, ''));
          }
        }
      }
      result.hasMX = result.mxRecords.length > 0;
    }

    return result;
  } catch {
    return result;
  }
}

/**
 * Detect email pattern from existing emails found on site
 */
export function detectPatternFromExisting(
  foundEmails: string[],
  knownPeople: Array<{ firstName: string; lastName: string }>
): string | null {
  for (const email of foundEmails) {
    const [localPart, domain] = email.toLowerCase().split('@');
    if (!localPart || !domain) continue;

    for (const person of knownPeople) {
      const f = person.firstName.toLowerCase();
      const l = person.lastName.toLowerCase();
      const fi = f[0] || '';
      const li = l[0] || '';

      // Check each pattern
      if (localPart === `${f}.${l}`) return '{first}.{last}';
      if (localPart === `${f}${l}`) return '{first}{last}';
      if (localPart === f) return '{first}';
      if (localPart === l) return '{last}';
      if (localPart === `${fi}.${l}`) return '{fi}.{last}';
      if (localPart === `${fi}${l}`) return '{fi}{last}';
      if (localPart === `${f}.${li}`) return '{first}.{li}';
      if (localPart === `${l}.${f}`) return '{last}.{first}';
      if (localPart === `${l}${f}`) return '{last}{first}';
      if (localPart === `${f}_${l}`) return '{first}_{last}';
      if (localPart === `${f}-${l}`) return '{first}-{last}';
    }
  }

  return null;
}

/**
 * Apply detected pattern to generate email for a person
 */
export function applyPattern(
  pattern: string,
  firstName: string,
  lastName: string,
  domain: string
): string {
  const f = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const l = lastName.toLowerCase().replace(/[^a-z]/g, '');
  const fi = f[0] || '';
  const li = l[0] || '';

  const localPart = pattern
    .replace('{first}', f)
    .replace('{last}', l)
    .replace('{fi}', fi)
    .replace('{li}', li);

  return `${localPart}@${domain}`;
}

/**
 * Calculate confidence score for a guessed email
 */
export function calculateEmailConfidence(
  email: string,
  hasMX: boolean,
  patternMatched: boolean,
  isCommonPattern: boolean
): 'high' | 'medium' | 'low' {
  // HIGH: MX verified + matches pattern found on site
  if (hasMX && patternMatched) {
    return 'high';
  }

  // MEDIUM: MX exists + common pattern
  if (hasMX && isCommonPattern) {
    return 'medium';
  }

  // LOW: Just a guess
  return 'low';
}

/**
 * Main function: Generate and verify email guesses for a person
 */
export async function guessEmails(
  config: EmailPatternConfig,
  existingEmails: string[] = [],
  knownPeople: Array<{ firstName: string; lastName: string }> = []
): Promise<EmailGuessResult[]> {
  const results: EmailGuessResult[] = [];
  const domain = config.domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];

  if (!domain) {
    return results;
  }

  // Check if domain can receive email
  const mxResult = await checkMXRecords(domain);
  if (!mxResult.hasMX) {
    console.log(`[EmailGuesser] No MX records for ${domain}`);
    return results;
  }

  // Detect pattern from existing emails if available
  const detectedPattern = detectPatternFromExisting(
    existingEmails,
    [...knownPeople, { firstName: config.firstName, lastName: config.lastName }]
  );

  // Generate email patterns
  const emails = generateEmailPatterns({
    ...config,
    domain,
  });

  // Score each email
  const commonPatterns = ['{first}.{last}', '{first}', '{fi}.{last}', '{first}{last}'];

  for (const email of emails) {
    // Extract the pattern used
    const localPart = email.split('@')[0];
    const f = config.firstName.toLowerCase();
    const l = config.lastName.toLowerCase();

    let patternName = 'generic';
    if (localPart === `${f}.${l}`) patternName = '{first}.{last}';
    else if (localPart === f) patternName = '{first}';
    else if (localPart === `${f}${l}`) patternName = '{first}{last}';
    else if (localPart.includes('.')) patternName = 'dotted';

    const patternMatched = detectedPattern === patternName;
    const isCommon = commonPatterns.includes(patternName) || GENERIC_PREFIXES.includes(localPart);

    results.push({
      email,
      pattern: patternName,
      confidence: calculateEmailConfidence(email, mxResult.hasMX, patternMatched, isCommon),
      verified: false, // Would need SMTP check for full verification
      verificationMethod: 'mx',
    });
  }

  // Sort by confidence (high first)
  results.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.confidence] - order[b.confidence];
  });

  return results;
}

/**
 * Guess emails for multiple people from same company
 */
export async function guessEmailsForTeam(
  domain: string,
  people: Array<{ firstName: string; lastName: string; role?: string }>,
  existingEmails: string[] = []
): Promise<Map<string, EmailGuessResult[]>> {
  const results = new Map<string, EmailGuessResult[]>();

  // First detect pattern from any existing emails
  const detectedPattern = detectPatternFromExisting(existingEmails, people);

  for (const person of people) {
    const key = `${person.firstName} ${person.lastName}`;

    if (detectedPattern) {
      // Use detected pattern directly
      const email = applyPattern(detectedPattern, person.firstName, person.lastName, domain);
      results.set(key, [{
        email,
        pattern: detectedPattern,
        confidence: 'high',
        verified: false,
        verificationMethod: 'pattern-match',
      }]);
    } else {
      // Generate all possible patterns
      const guesses = await guessEmails(
        { domain, firstName: person.firstName, lastName: person.lastName },
        existingEmails,
        people
      );
      results.set(key, guesses.slice(0, 5)); // Top 5 guesses per person
    }
  }

  return results;
}
