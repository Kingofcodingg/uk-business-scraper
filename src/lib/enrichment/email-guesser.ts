// ============================================================================
// EMAIL PATTERN GUESSING ENGINE
// Generates and verifies possible email combinations from names + domain
// ============================================================================

import { EmailGuessResult, EmailPatternConfig, MXVerificationResult } from './types';

// Common UK business email patterns in priority order
const EMAIL_PATTERNS = [
  // Most common UK business patterns
  { pattern: '{first}.{last}', name: 'firstname.lastname' },
  { pattern: '{first}', name: 'firstname' },
  { pattern: '{first}{last}', name: 'firstnamelastname' },
  { pattern: '{fi}.{last}', name: 'initial.lastname' },
  { pattern: '{fi}{last}', name: 'initiallastname' },
  { pattern: '{last}', name: 'lastname' },
  { pattern: '{first}.{li}', name: 'firstname.initial' },
  { pattern: '{first}_{last}', name: 'firstname_lastname' },
  { pattern: '{first}-{last}', name: 'firstname-lastname' },
  { pattern: '{last}.{first}', name: 'lastname.firstname' },
  { pattern: '{last}{first}', name: 'lastnamefirstname' },
  { pattern: '{fi}{li}', name: 'initials' },
];

// Generic email prefixes that are always worth trying
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
  'team',
  'support',
];

/**
 * Parse a full name into first and last name
 */
export function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);

  // Handle titles
  const titles = ['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'sir', 'lord', 'lady'];
  const filtered = parts.filter(p => !titles.includes(p.toLowerCase().replace('.', '')));

  if (filtered.length === 0) {
    return { firstName: '', lastName: '' };
  }

  if (filtered.length === 1) {
    return { firstName: filtered[0], lastName: '' };
  }

  // First name is first word, last name is last word
  return {
    firstName: filtered[0],
    lastName: filtered[filtered.length - 1],
  };
}

/**
 * Generate email variations for a person + domain
 */
export function generateEmailPatterns(config: EmailPatternConfig): string[] {
  const { domain, firstName, lastName } = config;

  if (!domain || !firstName) {
    return [];
  }

  const f = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const l = lastName?.toLowerCase().replace(/[^a-z]/g, '') || '';
  const fi = f[0] || '';
  const li = l[0] || '';

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
