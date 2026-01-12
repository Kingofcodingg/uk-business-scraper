"use client";

import { useState, useCallback, useMemo } from "react";

// ============================================================================
// TYPE DEFINITIONS
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

interface EmailInfo {
  address: string;
  type: 'generic' | 'personal';
  source: string;
  confidence?: 'high' | 'medium' | 'low';
  verified?: boolean;
}

interface PersonInfo {
  name: string;
  role: string;
  email?: string;
  linkedin?: string;
}

interface SocialMedia {
  linkedin?: string;
  linkedinType?: 'company' | 'personal';
  facebook?: string;
  twitter?: string;
  instagram?: string;
  youtube?: string;
  tiktok?: string;
  pinterest?: string;
}

interface ScoreBreakdown {
  noWebsite: number;
  noEmail: number;
  genericEmailOnly: number;
  lowReviews: number;
  noSocial: number;
  establishedBusiness: number;
  hasDirectors: number;
  soleTrader: number;
}

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
  lead_score: number;
  lead_signals: string[];
  distance?: string;
  companyNumber?: string;
  companyStatus?: string;
  companyType?: string;
  incorporationDate?: string;
  registeredAddress?: string;
  sicCodes?: SicCode[];
  directors?: Director[];
  emails?: EmailInfo[];
  phones?: { number: string; type: string }[];
  people?: PersonInfo[];
  socialMedia?: SocialMedia;
  scoreBreakdown?: ScoreBreakdown;
  enriched?: boolean;
  enriching?: boolean;
}

interface SearchParams {
  query: string;
  postcode: string;
  radius: string;
  sources: string[];
  maxPages: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BUSINESS_CATEGORIES: Record<string, string[]> = {
  "Professional Services": [
    "Accountant", "Solicitor", "Architect", "Surveyor", "Financial Advisor",
    "Insurance Broker", "Management Consultant", "HR Consultant", "Recruitment Agency",
  ],
  "Technology & Software": [
    "Software Company", "IT Services", "Web Developer", "App Developer",
    "Cyber Security", "Cloud Services", "Data Analytics", "Tech Startup",
  ],
  "Corporate & Business": [
    "Corporate Services", "Business Consultant", "Investment Company", "Private Equity",
    "Venture Capital", "Holding Company", "Trading Company", "Import Export",
  ],
  "Marine & Boats": [
    "Yacht Broker", "Boat Sales", "Marina", "Yacht Charter",
    "Boat Repair", "Marine Services", "Sailing School", "Boat Storage",
  ],
  "Construction & Property": [
    "Builder", "Construction Company", "Property Developer", "Estate Agent",
    "Surveyor", "Interior Designer", "Landscape Architect", "Civil Engineer",
  ],
  "Manufacturing & Industrial": [
    "Manufacturer", "Engineering Company", "Factory", "Industrial Supplier",
    "Machinery", "Metal Fabrication", "Plastics", "Electronics Manufacturer",
  ],
  "Healthcare & Medical": [
    "Private Hospital", "Medical Clinic", "Dentist", "Physiotherapist",
    "Veterinarian", "Care Home", "Pharmacy", "Medical Equipment",
  ],
  "Hospitality & Leisure": [
    "Hotel", "Restaurant", "Catering", "Event Venue",
    "Golf Club", "Spa", "Gym", "Travel Agency",
  ],
  "Automotive": [
    "Car Dealer", "Garage", "Car Rental", "Auto Parts",
    "Car Wash", "MOT Centre", "Tyre Shop", "Vehicle Leasing",
  ],
  "Trades & Home Services": [
    "Plumber", "Electrician", "Roofer", "Painter",
    "Locksmith", "Carpet Cleaner", "Window Cleaner", "Gardener",
  ],
  "Creative & Media": [
    "Photographer", "Video Production", "Marketing Agency", "PR Agency",
    "Graphic Designer", "Printing Company", "Advertising Agency", "Branding Agency",
  ],
  "Retail & Wholesale": [
    "Wholesaler", "Distributor", "Retail Store", "E-commerce",
    "Fashion Retailer", "Furniture Store", "Electronics Retailer", "Florist",
  ],
  "Education & Training": [
    "Private School", "Training Provider", "Tutoring", "Language School",
    "Driving School", "Music School", "Dance School", "Nursery",
  ],
  "Energy & Utilities": [
    "Solar Panel Installer", "Electrician", "Gas Engineer", "Renewable Energy",
    "EV Charging", "Energy Consultant", "Waste Management", "Recycling",
  ],
  "Agriculture & Farming": [
    "Farm", "Agricultural Supplier", "Garden Centre", "Landscaping",
    "Tree Surgeon", "Pest Control", "Equestrian", "Veterinarian",
  ],
  "Commercial Property": [
    "Industrial Estate", "Business Park", "Office Space", "Warehouse",
    "Commercial Unit", "Retail Unit", "Factory Unit", "Distribution Centre",
  ],
};

const RADIUS_OPTIONS = [
  { value: "1", label: "1 mile" },
  { value: "5", label: "5 miles" },
  { value: "10", label: "10 miles" },
  { value: "25", label: "25 miles" },
  { value: "50", label: "50 miles" },
];

const DATA_SOURCES = [
  { id: "yell", name: "Yell.com", description: "UK Yellow Pages" },
  { id: "google", name: "Google", description: "Local Search" },
  { id: "checkatrade", name: "Checkatrade", description: "Verified Trades" },
  { id: "freeindex", name: "FreeIndex", description: "UK Directory" },
  { id: "trustpilot", name: "Trustpilot", description: "Reviews Platform" },
  { id: "bark", name: "Bark", description: "Service Marketplace" },
  { id: "yelp", name: "Yelp UK", description: "Reviews & Ratings" },
  { id: "thomson", name: "Thomson", description: "Thomson Local" },
  { id: "scoot", name: "Scoot", description: "UK Directory" },
  { id: "118", name: "118118", description: "UK Directory" },
  { id: "novaloca", name: "NovaLoca", description: "Commercial Property" },
];

const ALL_SOURCES = DATA_SOURCES.map(s => s.id);

// ============================================================================
// COMPONENTS
// ============================================================================

// Loading Spinner
const Spinner = () => (
  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

// Badge Component
const Badge = ({ children, variant = 'default', size = 'sm' }: { children: React.ReactNode; variant?: string; size?: string }) => {
  const variants: Record<string, string> = {
    default: 'bg-gray-100 text-gray-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-sky-100 text-sky-700',
    purple: 'bg-violet-100 text-violet-700',
    hot: 'bg-gradient-to-r from-orange-500 to-red-500 text-white',
    warm: 'bg-gradient-to-r from-amber-400 to-orange-400 text-white',
    cold: 'bg-gray-400 text-white',
  };
  const sizes: Record<string, string> = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };
  return (
    <span className={`inline-flex items-center font-medium rounded-full ${variants[variant] || variants.default} ${sizes[size] || sizes.sm}`}>
      {children}
    </span>
  );
};

// Social Icon
const SocialIcon = ({ platform, url }: { platform: string; url: string }) => {
  const icons: Record<string, string> = {
    linkedin: 'bg-[#0A66C2]',
    facebook: 'bg-[#1877F2]',
    twitter: 'bg-black',
    instagram: 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600',
    youtube: 'bg-[#FF0000]',
    tiktok: 'bg-black',
    pinterest: 'bg-[#E60023]',
  };
  const labels: Record<string, string> = {
    linkedin: 'in',
    facebook: 'f',
    twitter: 'X',
    instagram: 'ig',
    youtube: 'yt',
    tiktok: 'tk',
    pinterest: 'p',
  };
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`w-6 h-6 ${icons[platform] || 'bg-gray-500'} rounded flex items-center justify-center text-white text-[10px] font-bold hover:opacity-80 transition-opacity`}
      title={platform}
    >
      {labels[platform] || '?'}
    </a>
  );
};

// Lead Score Display
const LeadScore = ({ score }: { score: number }) => {
  const getScoreConfig = (s: number) => {
    if (s >= 80) return { variant: 'hot', label: 'Hot Lead', ring: 'ring-orange-400' };
    if (s >= 60) return { variant: 'warm', label: 'Warm Lead', ring: 'ring-amber-400' };
    return { variant: 'cold', label: 'Cold Lead', ring: 'ring-gray-300' };
  };
  const config = getScoreConfig(score);
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ring-2 ${config.ring} bg-white`}>
      <div className="relative w-8 h-8">
        <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="16" fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="16" fill="none" strokeWidth="3"
            stroke={score >= 80 ? '#f97316' : score >= 60 ? '#fbbf24' : '#9ca3af'}
            strokeDasharray={`${score} 100`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">{score}</span>
      </div>
      <Badge variant={config.variant} size="xs">{config.label}</Badge>
    </div>
  );
};

// Quick Action Button
const QuickAction = ({ icon, label, href, variant = 'default', onClick }: {
  icon: string;
  label: string;
  href?: string;
  variant?: string;
  onClick?: () => void;
}) => {
  const variants: Record<string, string> = {
    default: 'bg-gray-100 hover:bg-gray-200 text-gray-700',
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    linkedin: 'bg-[#0A66C2] hover:bg-[#084e96] text-white',
  };
  const className = `inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${variants[variant] || variants.default}`;

  if (href) {
    return (
      <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className={className}>
        <span>{icon}</span>
        <span>{label}</span>
      </a>
    );
  }
  return (
    <button onClick={onClick} className={className}>
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
};

// Business Card Component
const BusinessCard = ({
  business,
  isSelected,
  isExpanded,
  onToggleSelect,
  onToggleExpand,
  onEnrich,
}: {
  business: Business;
  index: number;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onEnrich: () => void;
}) => {
  const getStatusConfig = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return { variant: 'success', label: 'Active' };
      case 'dissolved': return { variant: 'danger', label: 'Dissolved' };
      case 'dormant': return { variant: 'warning', label: 'Dormant' };
      case 'liquidation': return { variant: 'danger', label: 'Liquidation' };
      default: return null;
    }
  };

  const statusConfig = getStatusConfig(business.companyStatus);
  const hasSocialMedia = business.socialMedia && Object.values(business.socialMedia).some(Boolean);
  const primaryEmail = business.emails?.[0]?.address || business.email;
  const emailCount = business.emails?.length || (business.email ? 1 : 0);
  const personalEmails = business.emails?.filter(e => e.type === 'personal') || [];
  const verifiedEmails = business.emails?.filter(e => e.verified) || [];

  return (
    <div
      className={`group relative bg-white rounded-xl border-2 transition-all duration-200 hover:shadow-lg cursor-pointer ${
        business.lead_score >= 80
          ? 'border-orange-300 bg-gradient-to-r from-orange-50 to-white'
          : business.lead_score >= 60
          ? 'border-amber-300 bg-gradient-to-r from-amber-50 to-white'
          : 'border-gray-200'
      } ${isExpanded ? 'ring-2 ring-blue-400 shadow-lg' : ''}`}
      onClick={onToggleExpand}
    >
      {/* Priority Indicator */}
      {business.lead_score >= 80 && (
        <div className="absolute -top-2 -right-2 w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center shadow-lg">
          <span className="text-white text-sm">!</span>
        </div>
      )}

      <div className="p-4">
        {/* Header Row */}
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => { e.stopPropagation(); onToggleSelect(); }}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Company Name & Status */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-semibold text-lg text-gray-900 truncate">{business.name}</h3>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {business.industry && <Badge variant="info">{business.industry}</Badge>}
                  {business.distance && <Badge>{business.distance}</Badge>}
                  {statusConfig && <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>}
                  {business.enriched && <Badge variant="purple">Enriched</Badge>}
                </div>
              </div>

              {/* Lead Score */}
              <LeadScore score={business.lead_score || 50} />
            </div>

            {/* Company Details */}
            {business.companyNumber && (
              <p className="mt-2 text-xs text-gray-500">
                Co. #{business.companyNumber}
                {business.companyType && ` | ${business.companyType}`}
                {business.incorporationDate && ` | Est. ${business.incorporationDate}`}
              </p>
            )}

            {/* Quick Info Grid */}
            <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
              {business.phone && (
                <a
                  href={`tel:${business.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 text-gray-600 hover:text-blue-600"
                >
                  <span className="text-gray-400">T</span>
                  <span className="truncate">{business.phone}</span>
                </a>
              )}
              {primaryEmail && (
                <a
                  href={`mailto:${primaryEmail}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 text-gray-600 hover:text-blue-600"
                >
                  <span className="text-gray-400">@</span>
                  <span className="truncate">{primaryEmail}</span>
                  {emailCount > 1 && <Badge size="xs">+{emailCount - 1}</Badge>}
                </a>
              )}
              {business.website && (
                <a
                  href={business.website.startsWith('http') ? business.website : `https://${business.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 text-gray-600 hover:text-blue-600"
                >
                  <span className="text-gray-400">W</span>
                  <span className="truncate">{business.website.replace(/^https?:\/\//, '')}</span>
                </a>
              )}
              {business.rating && (
                <div className="flex items-center gap-1.5 text-amber-600">
                  <span>*</span>
                  <span>{business.rating} ({business.review_count || 0})</span>
                </div>
              )}
            </div>

            {/* Social Media Icons */}
            {hasSocialMedia && (
              <div className="mt-3 flex gap-1" onClick={(e) => e.stopPropagation()}>
                {business.socialMedia?.linkedin && <SocialIcon platform="linkedin" url={business.socialMedia.linkedin} />}
                {business.socialMedia?.facebook && <SocialIcon platform="facebook" url={business.socialMedia.facebook} />}
                {business.socialMedia?.twitter && <SocialIcon platform="twitter" url={business.socialMedia.twitter} />}
                {business.socialMedia?.instagram && <SocialIcon platform="instagram" url={business.socialMedia.instagram} />}
                {business.socialMedia?.youtube && <SocialIcon platform="youtube" url={business.socialMedia.youtube} />}
                {business.socialMedia?.tiktok && <SocialIcon platform="tiktok" url={business.socialMedia.tiktok} />}
                {business.socialMedia?.pinterest && <SocialIcon platform="pinterest" url={business.socialMedia.pinterest} />}
              </div>
            )}

            {/* Lead Signals */}
            {business.lead_signals && business.lead_signals.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {business.lead_signals.slice(0, 3).map((signal, i) => (
                  <span key={i} className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                    {signal}
                  </span>
                ))}
                {business.lead_signals.length > 3 && (
                  <span className="text-xs text-gray-500">+{business.lead_signals.length - 3} more</span>
                )}
              </div>
            )}
          </div>

          {/* Actions Column */}
          <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onEnrich}
              disabled={business.enriched || business.enriching}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                business.enriched
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : business.enriching
                  ? 'bg-violet-100 text-violet-700'
                  : 'bg-violet-600 text-white hover:bg-violet-700'
              }`}
            >
              {business.enriching ? 'Enriching...' : business.enriched ? 'Enriched' : 'Enrich'}
            </button>
            <span className="text-xs text-gray-400">{business.source}</span>
            <span className="text-gray-400 text-sm">{isExpanded ? '^' : 'v'}</span>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div
          className="border-t-2 border-blue-100 bg-gradient-to-b from-blue-50 to-white px-4 py-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2 mb-4">
            {business.phone && (
              <QuickAction icon="T" label="Call" href={`tel:${business.phone}`} variant="success" />
            )}
            {primaryEmail && (
              <QuickAction icon="@" label="Email" href={`mailto:${primaryEmail}`} variant="primary" />
            )}
            {business.website && (
              <QuickAction
                icon="W"
                label="Website"
                href={business.website.startsWith('http') ? business.website : `https://${business.website}`}
              />
            )}
            {business.socialMedia?.linkedin && (
              <QuickAction icon="in" label="LinkedIn" href={business.socialMedia.linkedin} variant="linkedin" />
            )}
          </div>

          {/* Details Grid */}
          <div className="grid md:grid-cols-3 gap-4">
            {/* Contact Info */}
            <div className="bg-white rounded-lg p-3 border border-gray-100">
              <h4 className="font-medium text-gray-900 text-sm mb-2">Contact Details</h4>
              <div className="space-y-2 text-sm">
                {business.phone && (
                  <div>
                    <span className="text-xs text-gray-400">Phone</span>
                    <p className="text-gray-900">{business.phone}</p>
                  </div>
                )}
                {business.address && (
                  <div>
                    <span className="text-xs text-gray-400">Address</span>
                    <p className="text-gray-700">{business.address}</p>
                    {business.postcode && <p className="text-gray-600 font-mono">{business.postcode}</p>}
                  </div>
                )}
              </div>
            </div>

            {/* Company Info */}
            <div className="bg-white rounded-lg p-3 border border-gray-100">
              <h4 className="font-medium text-gray-900 text-sm mb-2">Company Info</h4>
              <div className="space-y-2 text-sm">
                {business.companyNumber && (
                  <div>
                    <span className="text-xs text-gray-400">Company #</span>
                    <p className="font-mono text-gray-900">{business.companyNumber}</p>
                  </div>
                )}
                {business.companyType && (
                  <div>
                    <span className="text-xs text-gray-400">Type</span>
                    <p className="text-gray-700">{business.companyType}</p>
                  </div>
                )}
                {business.incorporationDate && (
                  <div>
                    <span className="text-xs text-gray-400">Founded</span>
                    <p className="text-gray-700">{business.incorporationDate}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Opportunities */}
            <div className="bg-white rounded-lg p-3 border border-gray-100">
              <h4 className="font-medium text-gray-900 text-sm mb-2">Sales Opportunities</h4>
              {business.lead_signals && business.lead_signals.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {business.lead_signals.map((signal, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-gray-700">
                      <span className="text-orange-500 mt-0.5">*</span>
                      {signal}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">No specific opportunities identified</p>
              )}
            </div>
          </div>

          {/* Additional Details */}
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            {/* Directors */}
            {business.directors && business.directors.length > 0 && (
              <div className="bg-white rounded-lg p-3 border border-gray-100">
                <h4 className="font-medium text-gray-900 text-sm mb-2">
                  Directors ({business.directors.length})
                </h4>
                <div className="space-y-1">
                  {business.directors.slice(0, 5).map((director, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-900">{director.name}</span>
                      <span className="text-xs text-gray-500">{director.role}</span>
                    </div>
                  ))}
                  {business.directors.length > 5 && (
                    <p className="text-xs text-gray-400">+{business.directors.length - 5} more</p>
                  )}
                </div>
              </div>
            )}

            {/* People */}
            {business.people && business.people.length > 0 && (
              <div className="bg-white rounded-lg p-3 border border-gray-100">
                <h4 className="font-medium text-gray-900 text-sm mb-2">
                  People ({business.people.length})
                </h4>
                <div className="space-y-1">
                  {business.people.slice(0, 5).map((person, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900">{person.name}</span>
                        {person.linkedin && (
                          <a href={person.linkedin} target="_blank" rel="noopener noreferrer" className="text-[#0A66C2]">
                            in
                          </a>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">{person.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Emails */}
            {business.emails && business.emails.length > 0 && (
              <div className="bg-white rounded-lg p-3 border border-gray-100">
                <h4 className="font-medium text-gray-900 text-sm mb-2">
                  Emails ({business.emails.length})
                  {personalEmails.length > 0 && <Badge variant="success" size="xs">{personalEmails.length} personal</Badge>}
                  {verifiedEmails.length > 0 && <Badge variant="info" size="xs">{verifiedEmails.length} verified</Badge>}
                </h4>
                <div className="space-y-1">
                  {business.emails.slice(0, 5).map((email, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <a href={`mailto:${email.address}`} className="text-blue-600 hover:underline truncate">
                        {email.address}
                      </a>
                      <div className="flex gap-1">
                        <Badge variant={email.type === 'personal' ? 'success' : 'default'} size="xs">
                          {email.type}
                        </Badge>
                        {email.confidence && (
                          <Badge
                            variant={email.confidence === 'high' ? 'success' : email.confidence === 'medium' ? 'warning' : 'default'}
                            size="xs"
                          >
                            {email.confidence}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  {business.emails.length > 5 && (
                    <p className="text-xs text-gray-400">+{business.emails.length - 5} more</p>
                  )}
                </div>
              </div>
            )}

            {/* SIC Codes */}
            {business.sicCodes && business.sicCodes.length > 0 && (
              <div className="bg-white rounded-lg p-3 border border-gray-100">
                <h4 className="font-medium text-gray-900 text-sm mb-2">Industry Codes</h4>
                <div className="space-y-1">
                  {business.sicCodes.map((sic, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-mono text-gray-500 text-xs">{sic.code}</span>
                      <span className="text-gray-700 ml-2">{sic.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          {business.description && (
            <div className="mt-4 bg-white rounded-lg p-3 border border-gray-100">
              <h4 className="font-medium text-gray-900 text-sm mb-1">About</h4>
              <p className="text-sm text-gray-600">{business.description}</p>
            </div>
          )}

          {/* Registered Address */}
          {business.registeredAddress && business.registeredAddress !== business.address && (
            <div className="mt-4 bg-white rounded-lg p-3 border border-gray-100">
              <h4 className="font-medium text-gray-900 text-sm mb-1">Registered Office</h4>
              <p className="text-sm text-gray-600">{business.registeredAddress}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function Home() {
  // State
  const [searchParams, setSearchParams] = useState<SearchParams>({
    query: "",
    postcode: "",
    radius: "10",
    sources: ALL_SOURCES,
    maxPages: 5,
  });
  const [customQuery, setCustomQuery] = useState("");
  const [results, setResults] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchComplete, setSearchComplete] = useState(false);
  const [selectedBusinesses, setSelectedBusinesses] = useState<Set<number>>(new Set());
  const [bulkEnriching, setBulkEnriching] = useState(false);
  const [expandedBusiness, setExpandedBusiness] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'score' | 'name' | 'rating'>('score');

  // Sorted Results
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      switch (sortBy) {
        case 'score':
          return (b.lead_score || 0) - (a.lead_score || 0);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'rating':
          return parseFloat(b.rating || '0') - parseFloat(a.rating || '0');
        default:
          return 0;
      }
    });
  }, [results, sortBy]);

  // Stats
  const stats = useMemo(() => {
    const total = results.length;
    const hot = results.filter(b => b.lead_score >= 80).length;
    const warm = results.filter(b => b.lead_score >= 60 && b.lead_score < 80).length;
    const enriched = results.filter(b => b.enriched).length;
    const withEmail = results.filter(b => b.email || (b.emails && b.emails.length > 0)).length;
    const withPhone = results.filter(b => b.phone).length;
    return { total, hot, warm, enriched, withEmail, withPhone };
  }, [results]);

  // Handlers
  const handleSearch = useCallback(async () => {
    const query = customQuery || searchParams.query;
    if (!query) {
      setError("Please select or enter a business type");
      return;
    }
    if (!searchParams.postcode) {
      setError("Please enter a postcode or location");
      return;
    }

    setError("");
    setLoading(true);
    setSearchComplete(false);
    setResults([]);
    setSelectedBusinesses(new Set());

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          location: searchParams.postcode,
          radius: searchParams.radius,
          sources: ALL_SOURCES,
          max_pages: searchParams.maxPages,
          enrich_emails: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();
      setResults(data.businesses || []);
      setSearchComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [customQuery, searchParams]);

  const enrichBusiness = useCallback(async (index: number) => {
    const business = results[index];
    if (business.enriched || business.enriching) return;

    setResults(prev => prev.map((b, i) =>
      i === index ? { ...b, enriching: true } : b
    ));

    try {
      const response = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: business.name,
          website: business.website,
          postcode: business.postcode,
          rating: business.rating,
          review_count: business.review_count,
          phone: business.phone,
          email: business.email,
          address: business.address,
          industry: business.industry,
          distance: business.distance,
        }),
      });

      if (!response.ok) throw new Error("Enrichment failed");

      const data = await response.json();

      setResults(prev => prev.map((b, i) =>
        i === index ? {
          ...b,
          ...data.enrichedData,
          lead_score: data.newLeadScore || b.lead_score,
          lead_signals: data.leadSignals || b.lead_signals,
          enriched: true,
          enriching: false,
        } : b
      ));
    } catch {
      setResults(prev => prev.map((b, i) =>
        i === index ? { ...b, enriching: false } : b
      ));
    }
  }, [results]);

  const enrichSelected = useCallback(async () => {
    if (selectedBusinesses.size === 0) return;
    setBulkEnriching(true);

    const selectedIndices = Array.from(selectedBusinesses);
    const businessesToEnrich = selectedIndices.map(i => results[i]).filter(b => !b.enriched);

    try {
      const response = await fetch("/api/enrich", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businesses: businessesToEnrich.map(b => ({
            name: b.name,
            website: b.website,
            postcode: b.postcode,
            rating: b.rating,
            review_count: b.review_count,
            phone: b.phone,
            email: b.email,
            address: b.address,
            industry: b.industry,
            distance: b.distance,
          })),
        }),
      });

      if (!response.ok) throw new Error("Bulk enrichment failed");

      const data = await response.json();

      setResults(prev => {
        const updated = [...prev];
        for (const result of data.results) {
          const idx = updated.findIndex(b => b.name === result.originalName);
          if (idx !== -1 && result.enrichedData) {
            updated[idx] = {
              ...updated[idx],
              ...result.enrichedData,
              lead_score: result.newLeadScore || updated[idx].lead_score,
              enriched: true,
            };
          }
        }
        return updated;
      });
    } catch {
      setError("Bulk enrichment failed");
    } finally {
      setBulkEnriching(false);
    }
  }, [selectedBusinesses, results]);

  const toggleSelect = useCallback((index: number) => {
    setSelectedBusinesses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedBusinesses.size === results.length) {
      setSelectedBusinesses(new Set());
    } else {
      setSelectedBusinesses(new Set(results.map((_, i) => i)));
    }
  }, [selectedBusinesses.size, results.length]);

  const exportCSV = useCallback(() => {
    if (results.length === 0) return;

    const headers = [
      "Name", "Lead Score", "Lead Signals", "Distance", "Email", "All Emails",
      "Phone", "Website", "Address", "Postcode", "Industry", "Rating", "Reviews",
      "Source", "Company Number", "Company Status", "Company Type", "Incorporation Date",
      "Registered Address", "Directors", "SIC Codes", "LinkedIn", "Facebook", "Twitter", "Instagram",
    ];

    const csvContent = [
      headers.join(","),
      ...results.map((b) => [
        `"${(b.name || '').replace(/"/g, '""')}"`,
        `"${b.lead_score || ''}"`,
        `"${(b.lead_signals || []).join("; ")}"`,
        `"${b.distance || ''}"`,
        `"${b.email || ''}"`,
        `"${(b.emails || []).map(e => `${e.address} (${e.type})`).join("; ")}"`,
        `"${b.phone || ''}"`,
        `"${b.website || ''}"`,
        `"${(b.address || '').replace(/"/g, '""')}"`,
        `"${b.postcode || ''}"`,
        `"${b.industry || ''}"`,
        `"${b.rating || ''}"`,
        `"${b.review_count || ''}"`,
        `"${b.source || ''}"`,
        `"${b.companyNumber || ''}"`,
        `"${b.companyStatus || ''}"`,
        `"${b.companyType || ''}"`,
        `"${b.incorporationDate || ''}"`,
        `"${(b.registeredAddress || '').replace(/"/g, '""')}"`,
        `"${(b.directors || []).map(d => `${d.name} (${d.role})`).join("; ")}"`,
        `"${(b.sicCodes || []).map(s => `${s.code}: ${s.description}`).join("; ")}"`,
        `"${b.socialMedia?.linkedin || ''}"`,
        `"${b.socialMedia?.facebook || ''}"`,
        `"${b.socialMedia?.twitter || ''}"`,
        `"${b.socialMedia?.instagram || ''}"`,
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uk-businesses-${searchParams.postcode}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, searchParams.postcode]);

  const exportJSON = useCallback(() => {
    if (results.length === 0) return;

    const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uk-businesses-${searchParams.postcode}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, searchParams.postcode]);

  // Render
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                UK Business Lead Scraper
              </h1>
              <p className="text-sm text-gray-500">Advanced B2B Lead Generation & Enrichment</p>
            </div>
            {stats.total > 0 && (
              <div className="hidden md:flex items-center gap-4 text-sm">
                <div className="text-center">
                  <p className="font-bold text-gray-900">{stats.total}</p>
                  <p className="text-gray-500">Total</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-orange-500">{stats.hot}</p>
                  <p className="text-gray-500">Hot</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-amber-500">{stats.warm}</p>
                  <p className="text-gray-500">Warm</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-violet-500">{stats.enriched}</p>
                  <p className="text-gray-500">Enriched</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Search Form */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Business Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Business Type</label>
              <select
                value={searchParams.query}
                onChange={(e) => {
                  setSearchParams(prev => ({ ...prev, query: e.target.value }));
                  setCustomQuery("");
                }}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
              >
                <option value="">Select a business type...</option>
                {Object.entries(BUSINESS_CATEGORIES).map(([category, types]) => (
                  <optgroup key={category} label={category}>
                    {types.map((type) => (
                      <option key={type} value={type.toLowerCase()}>{type}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <input
                type="text"
                placeholder="Or enter custom type..."
                value={customQuery}
                onChange={(e) => {
                  setCustomQuery(e.target.value);
                  setSearchParams(prev => ({ ...prev, query: "" }));
                }}
                className="mt-2 w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
              <input
                type="text"
                placeholder="e.g. SW1A 1AA or London"
                value={searchParams.postcode}
                onChange={(e) => setSearchParams(prev => ({ ...prev, postcode: e.target.value.toUpperCase() }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
              />
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">Search Radius</label>
                <select
                  value={searchParams.radius}
                  onChange={(e) => setSearchParams(prev => ({ ...prev, radius: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
                >
                  {RADIUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Data Sources */}
          <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-violet-50 rounded-xl">
            <p className="text-sm text-gray-700">
              <span className="font-medium">Searching {DATA_SOURCES.length} sources:</span>{" "}
              {DATA_SOURCES.map(s => s.name).join(", ")}
            </p>
          </div>

          {/* Pages Slider */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pages per Source: {searchParams.maxPages} (~{searchParams.maxPages * 20} results per source)
            </label>
            <input
              type="range"
              min="1"
              max="15"
              value={searchParams.maxPages}
              onChange={(e) => setSearchParams(prev => ({ ...prev, maxPages: parseInt(e.target.value) }))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>1 (faster)</span>
              <span>15 (maximum)</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Search Button */}
          <button
            onClick={handleSearch}
            disabled={loading}
            className="mt-6 w-full py-3 px-6 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-medium rounded-xl hover:from-blue-700 hover:to-violet-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Spinner />
                Searching... This may take a minute
              </>
            ) : (
              "Search Businesses"
            )}
          </button>
        </div>

        {/* Results */}
        {searchComplete && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            {/* Results Header */}
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Found {results.length} businesses
                </h2>
                <p className="text-sm text-gray-500">
                  {stats.hot} hot leads, {stats.warm} warm leads, {stats.withEmail} with email
                </p>
              </div>

              {results.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {/* Sort */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-gray-50"
                  >
                    <option value="score">Sort by Score</option>
                    <option value="name">Sort by Name</option>
                    <option value="rating">Sort by Rating</option>
                  </select>

                  <button
                    onClick={selectAll}
                    className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
                  >
                    {selectedBusinesses.size === results.length ? "Deselect All" : "Select All"}
                  </button>
                  <button
                    onClick={enrichSelected}
                    disabled={selectedBusinesses.size === 0 || bulkEnriching}
                    className="px-3 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:bg-gray-400 flex items-center gap-1"
                  >
                    {bulkEnriching && <Spinner />}
                    {bulkEnriching ? "Enriching..." : `Enrich (${selectedBusinesses.size})`}
                  </button>
                  <button
                    onClick={exportCSV}
                    className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"
                  >
                    CSV
                  </button>
                  <button
                    onClick={exportJSON}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                  >
                    JSON
                  </button>
                </div>
              )}
            </div>

            {/* Results List */}
            {results.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No businesses found. Try different search criteria.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedResults.map((business, index) => (
                  <BusinessCard
                    key={index}
                    business={business}
                    index={index}
                    isSelected={selectedBusinesses.has(index)}
                    isExpanded={expandedBusiness === index}
                    onToggleSelect={() => toggleSelect(index)}
                    onToggleExpand={() => setExpandedBusiness(expandedBusiness === index ? null : index)}
                    onEnrich={() => enrichBusiness(index)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* API Notice */}
        <div className="mt-6 p-4 bg-white/50 rounded-xl text-center">
          <p className="text-sm text-gray-600">
            Enrichment powered by Companies House, Google, Bing, LinkedIn & more.
            <a
              href="https://developer.company-information.service.gov.uk/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline ml-1"
            >
              Get API Key
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
