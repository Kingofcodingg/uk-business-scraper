"use client";

import { useState } from "react";

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
}

interface SocialMedia {
  linkedin?: string;
  facebook?: string;
  twitter?: string;
  instagram?: string;
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
  // Enriched fields
  companyNumber?: string;
  companyStatus?: string;
  companyType?: string;
  incorporationDate?: string;
  registeredAddress?: string;
  sicCodes?: SicCode[];
  directors?: Director[];
  emails?: EmailInfo[];
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

const BUSINESS_CATEGORIES = {
  "Professional Services": [
    "Accountant",
    "Solicitor",
    "Architect",
    "Surveyor",
    "Financial Advisor",
    "Insurance Broker",
    "Management Consultant",
    "HR Consultant",
    "Recruitment Agency",
  ],
  "Technology & Software": [
    "Software Company",
    "IT Services",
    "Web Developer",
    "App Developer",
    "Cyber Security",
    "Cloud Services",
    "Data Analytics",
    "Tech Startup",
  ],
  "Corporate & Business": [
    "Corporate Services",
    "Business Consultant",
    "Investment Company",
    "Private Equity",
    "Venture Capital",
    "Holding Company",
    "Trading Company",
    "Import Export",
  ],
  "Marine & Boats": [
    "Yacht Broker",
    "Boat Sales",
    "Marina",
    "Yacht Charter",
    "Boat Repair",
    "Marine Services",
    "Sailing School",
    "Boat Storage",
  ],
  "Construction & Property": [
    "Builder",
    "Construction Company",
    "Property Developer",
    "Estate Agent",
    "Surveyor",
    "Interior Designer",
    "Landscape Architect",
    "Civil Engineer",
  ],
  "Manufacturing & Industrial": [
    "Manufacturer",
    "Engineering Company",
    "Factory",
    "Industrial Supplier",
    "Machinery",
    "Metal Fabrication",
    "Plastics",
    "Electronics Manufacturer",
  ],
  "Healthcare & Medical": [
    "Private Hospital",
    "Medical Clinic",
    "Dentist",
    "Physiotherapist",
    "Veterinarian",
    "Care Home",
    "Pharmacy",
    "Medical Equipment",
  ],
  "Hospitality & Leisure": [
    "Hotel",
    "Restaurant",
    "Catering",
    "Event Venue",
    "Golf Club",
    "Spa",
    "Gym",
    "Travel Agency",
  ],
  "Automotive": [
    "Car Dealer",
    "Garage",
    "Car Rental",
    "Auto Parts",
    "Car Wash",
    "MOT Centre",
    "Tyre Shop",
    "Vehicle Leasing",
  ],
  "Trades & Home Services": [
    "Plumber",
    "Electrician",
    "Roofer",
    "Painter",
    "Locksmith",
    "Carpet Cleaner",
    "Window Cleaner",
    "Gardener",
  ],
  "Creative & Media": [
    "Photographer",
    "Video Production",
    "Marketing Agency",
    "PR Agency",
    "Graphic Designer",
    "Printing Company",
    "Advertising Agency",
    "Branding Agency",
  ],
  "Retail & Wholesale": [
    "Wholesaler",
    "Distributor",
    "Retail Store",
    "E-commerce",
    "Fashion Retailer",
    "Furniture Store",
    "Electronics Retailer",
    "Florist",
  ],
  "Education & Training": [
    "Private School",
    "Training Provider",
    "Tutoring",
    "Language School",
    "Driving School",
    "Music School",
    "Dance School",
    "Nursery",
  ],
  "Energy & Utilities": [
    "Solar Panel Installer",
    "Electrician",
    "Gas Engineer",
    "Renewable Energy",
    "EV Charging",
    "Energy Consultant",
    "Waste Management",
    "Recycling",
  ],
  "Agriculture & Farming": [
    "Farm",
    "Agricultural Supplier",
    "Garden Centre",
    "Landscaping",
    "Tree Surgeon",
    "Pest Control",
    "Equestrian",
    "Veterinarian",
  ],
  "Commercial Property": [
    "Industrial Estate",
    "Business Park",
    "Office Space",
    "Warehouse",
    "Commercial Unit",
    "Retail Unit",
    "Factory Unit",
    "Distribution Centre",
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

export default function Home() {
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

  const handleSearch = async () => {
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
  };

  const enrichBusiness = async (index: number) => {
    const business = results[index];
    if (business.enriched || business.enriching) return;

    // Mark as enriching
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
        }),
      });

      if (!response.ok) {
        throw new Error("Enrichment failed");
      }

      const data = await response.json();

      setResults(prev => prev.map((b, i) =>
        i === index ? {
          ...b,
          ...data.enrichedData,
          lead_score: data.newLeadScore || b.lead_score,
          enriched: true,
          enriching: false,
        } : b
      ));
    } catch (err) {
      setResults(prev => prev.map((b, i) =>
        i === index ? { ...b, enriching: false } : b
      ));
    }
  };

  const enrichSelected = async () => {
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
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("Bulk enrichment failed");
      }

      const data = await response.json();

      // Update results with enriched data
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
    } catch (err) {
      setError("Bulk enrichment failed");
    } finally {
      setBulkEnriching(false);
    }
  };

  const toggleSelect = (index: number) => {
    setSelectedBusinesses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    if (selectedBusinesses.size === results.length) {
      setSelectedBusinesses(new Set());
    } else {
      setSelectedBusinesses(new Set(results.map((_, i) => i)));
    }
  };

  const exportCSV = () => {
    if (results.length === 0) return;

    const headers = [
      "Name",
      "Lead Score",
      "Lead Signals",
      "Distance",
      "Email",
      "All Emails",
      "Phone",
      "Website",
      "Address",
      "Postcode",
      "Industry",
      "Rating",
      "Reviews",
      "Source",
      "Company Number",
      "Company Status",
      "Company Type",
      "Incorporation Date",
      "Registered Address",
      "Directors",
      "SIC Codes",
      "LinkedIn",
      "Facebook",
      "Twitter",
      "Instagram",
    ];

    const csvContent = [
      headers.join(","),
      ...results.map((b) =>
        [
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
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uk-businesses-${searchParams.postcode}-${Date.now()}.csv`;
    a.click();
  };

  const exportJSON = () => {
    if (results.length === 0) return;

    const blob = new Blob([JSON.stringify(results, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uk-businesses-${searchParams.postcode}-${Date.now()}.json`;
    a.click();
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'dissolved': return 'bg-red-100 text-red-800';
      case 'dormant': return 'bg-yellow-100 text-yellow-800';
      case 'liquidation': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          UK Business Lead Scraper
        </h1>
        <p className="text-gray-600">
          Search UK businesses with Companies House enrichment
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Business Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Business Type
            </label>
            <select
              value={searchParams.query}
              onChange={(e) => {
                setSearchParams((prev) => ({ ...prev, query: e.target.value }));
                setCustomQuery("");
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select a business type...</option>
              {Object.entries(BUSINESS_CATEGORIES).map(([category, types]) => (
                <optgroup key={category} label={category}>
                  {types.map((type: string) => (
                    <option key={type} value={type.toLowerCase()}>
                      {type}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div className="mt-2">
              <input
                type="text"
                placeholder="Or enter custom type..."
                value={customQuery}
                onChange={(e) => {
                  setCustomQuery(e.target.value);
                  setSearchParams((prev) => ({ ...prev, query: "" }));
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Postcode / Location
            </label>
            <input
              type="text"
              placeholder="e.g. SW1A 1AA or London"
              value={searchParams.postcode}
              onChange={(e) =>
                setSearchParams((prev) => ({
                  ...prev,
                  postcode: e.target.value.toUpperCase(),
                }))
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="mt-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search Radius
              </label>
              <select
                value={searchParams.radius}
                onChange={(e) =>
                  setSearchParams((prev) => ({ ...prev, radius: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {RADIUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Data Sources Info */}
        <div className="mt-6 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Searching {DATA_SOURCES.length} sources:</strong>{" "}
            {DATA_SOURCES.map(s => s.name).join(", ")}
          </p>
        </div>

        {/* Max Pages */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Pages per Source: {searchParams.maxPages} (~{searchParams.maxPages * 20} results per source)
          </label>
          <input
            type="range"
            min="1"
            max="15"
            value={searchParams.maxPages}
            onChange={(e) =>
              setSearchParams((prev) => ({
                ...prev,
                maxPages: parseInt(e.target.value),
              }))
            }
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>1 (faster)</span>
            <span>15 (maximum results)</span>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleSearch}
          disabled={loading}
          className="mt-6 w-full py-3 px-6 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Searching... This may take a minute
            </span>
          ) : (
            "Search Businesses"
          )}
        </button>
      </div>

      {/* Results */}
      {searchComplete && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <h2 className="text-xl font-semibold">
              Found {results.length} businesses
            </h2>
            {results.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={selectAll}
                  className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
                >
                  {selectedBusinesses.size === results.length ? "Deselect All" : "Select All"}
                </button>
                <button
                  onClick={enrichSelected}
                  disabled={selectedBusinesses.size === 0 || bulkEnriching}
                  className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:bg-gray-400"
                >
                  {bulkEnriching ? "Enriching..." : `Enrich Selected (${selectedBusinesses.size})`}
                </button>
                <button
                  onClick={exportCSV}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                >
                  Export CSV
                </button>
                <button
                  onClick={exportJSON}
                  className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
                >
                  Export JSON
                </button>
              </div>
            )}
          </div>

          {results.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No businesses found. Try different search criteria.
            </p>
          ) : (
            <div className="space-y-4">
              {results.map((business, index) => (
                <div
                  key={index}
                  className={`border-2 rounded-lg overflow-hidden hover:shadow-lg transition-all cursor-pointer ${
                    business.lead_score >= 80
                      ? "border-green-500 bg-green-50"
                      : business.lead_score >= 60
                      ? "border-yellow-500 bg-yellow-50"
                      : "border-gray-200 bg-white"
                  } ${expandedBusiness === index ? "ring-2 ring-blue-400" : ""}`}
                  onClick={() => setExpandedBusiness(expandedBusiness === index ? null : index)}
                >
                  <div className="p-4">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedBusinesses.has(index)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelect(index);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1.5 h-4 w-4 rounded border-gray-300"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="font-semibold text-lg text-gray-900">
                              {business.name}
                            </h3>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-bold ${
                                business.lead_score >= 80
                                  ? "bg-green-600 text-white"
                                  : business.lead_score >= 60
                                  ? "bg-yellow-500 text-white"
                                  : "bg-gray-400 text-white"
                              }`}
                            >
                              {business.lead_score}% Match
                            </span>
                            {business.distance && (
                              <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
                                ~{business.distance} away
                              </span>
                            )}
                            {business.companyStatus && (
                              <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(business.companyStatus)}`}>
                                {business.companyStatus}
                              </span>
                            )}
                            {business.enriched && (
                              <span className="px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-700">
                                Enriched
                              </span>
                            )}
                          </div>
                          {business.industry && (
                            <p className="text-sm text-blue-600">{business.industry}</p>
                          )}
                          {business.companyNumber && (
                            <p className="text-xs text-gray-500">
                              Co. #{business.companyNumber} | {business.companyType}
                              {business.incorporationDate && ` | Inc. ${business.incorporationDate}`}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => enrichBusiness(index)}
                          disabled={business.enriched || business.enriching}
                          className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                            business.enriched
                              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                              : business.enriching
                              ? "bg-indigo-200 text-indigo-700"
                              : "bg-indigo-600 text-white hover:bg-indigo-700"
                          }`}
                        >
                          {business.enriching ? "Enriching..." : business.enriched ? "Enriched" : "Enrich"}
                        </button>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          {business.source}
                        </span>
                        <span className="text-xs text-gray-400">
                          {expandedBusiness === index ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Lead Signals */}
                  {business.lead_signals && business.lead_signals.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {business.lead_signals.map((signal, i) => (
                        <span
                          key={i}
                          className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded"
                        >
                          {signal}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Basic Info */}
                  <div className="mt-3 grid md:grid-cols-2 gap-2 text-sm text-gray-600">
                    {business.address && (
                      <p className="flex items-start gap-2">
                        <span className="text-gray-400 shrink-0">Address:</span>
                        <span>{business.address}{business.postcode && ` (${business.postcode})`}</span>
                      </p>
                    )}
                    {business.phone && (
                      <p className="flex items-center gap-2">
                        <span className="text-gray-400">Phone:</span>
                        <a href={`tel:${business.phone}`} className="text-blue-600 hover:underline">
                          {business.phone}
                        </a>
                      </p>
                    )}
                    {(business.email || (business.emails && business.emails.length > 0)) && (
                      <p className="flex items-center gap-2">
                        <span className="text-gray-400">Email:</span>
                        <a
                          href={`mailto:${business.emails?.[0]?.address || business.email}`}
                          className="text-blue-600 hover:underline"
                        >
                          {business.emails?.[0]?.address || business.email}
                        </a>
                        {business.emails && business.emails.length > 1 && (
                          <span className="text-xs text-gray-500">+{business.emails.length - 1} more</span>
                        )}
                      </p>
                    )}
                    {business.website && (
                      <p className="flex items-center gap-2">
                        <span className="text-gray-400">Website:</span>
                        <a
                          href={business.website.startsWith('http') ? business.website : `https://${business.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline truncate max-w-xs"
                        >
                          {business.website.replace(/^https?:\/\//, '')}
                        </a>
                      </p>
                    )}
                    {business.rating && (
                      <p className="flex items-center gap-2">
                        <span className="text-gray-400">Rating:</span>
                        <span className="text-yellow-600">
                          {business.rating}
                          {business.review_count && ` (${business.review_count} reviews)`}
                        </span>
                      </p>
                    )}
                    {/* Social Media */}
                    {business.socialMedia && (
                      <p className="flex items-center gap-2">
                        <span className="text-gray-400">Social:</span>
                        <span className="flex gap-2">
                          {business.socialMedia.linkedin && (
                            <a href={business.socialMedia.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              LinkedIn
                            </a>
                          )}
                          {business.socialMedia.facebook && (
                            <a href={business.socialMedia.facebook} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              Facebook
                            </a>
                          )}
                          {business.socialMedia.twitter && (
                            <a href={business.socialMedia.twitter} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              Twitter
                            </a>
                          )}
                          {business.socialMedia.instagram && (
                            <a href={business.socialMedia.instagram} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              Instagram
                            </a>
                          )}
                        </span>
                      </p>
                    )}
                  </div>

                  {business.description && (
                    <p className="mt-2 text-sm text-gray-500 line-clamp-2">
                      {business.description}
                    </p>
                  )}

                  {/* Expanded Details - Sales-Focused Info Panel */}
                  {expandedBusiness === index && (
                    <div className="mt-4 pt-4 border-t-2 border-blue-200 bg-blue-50/30 -mx-4 px-4 pb-4" onClick={(e) => e.stopPropagation()}>
                      {/* Quick Actions Bar */}
                      <div className="flex flex-wrap gap-2 mb-4 pb-3 border-b border-gray-200">
                        <h4 className="text-sm font-semibold text-gray-700 w-full mb-1">Quick Actions:</h4>
                        {business.phone && (
                          <a
                            href={`tel:${business.phone}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                          >
                            📞 Call Now
                          </a>
                        )}
                        {(business.email || business.emails?.[0]?.address) && (
                          <a
                            href={`mailto:${business.emails?.[0]?.address || business.email}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                          >
                            ✉️ Send Email
                          </a>
                        )}
                        {business.website && (
                          <a
                            href={business.website.startsWith('http') ? business.website : `https://${business.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
                          >
                            🌐 Visit Website
                          </a>
                        )}
                        {business.socialMedia?.linkedin && (
                          <a
                            href={business.socialMedia.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800"
                          >
                            💼 LinkedIn
                          </a>
                        )}
                      </div>

                      <div className="grid md:grid-cols-3 gap-4">
                        {/* Contact Info Column */}
                        <div className="bg-white p-3 rounded-lg border border-gray-200">
                          <h4 className="font-semibold text-gray-900 mb-2 text-sm border-b pb-1">📇 Contact Details</h4>
                          <div className="space-y-2 text-sm">
                            {business.phone && (
                              <div>
                                <span className="text-gray-500 text-xs">Phone:</span>
                                <p className="font-medium text-gray-900">{business.phone}</p>
                              </div>
                            )}
                            {(business.email || business.emails?.[0]?.address) && (
                              <div>
                                <span className="text-gray-500 text-xs">Primary Email:</span>
                                <p className="font-medium text-blue-600 break-all">{business.emails?.[0]?.address || business.email}</p>
                              </div>
                            )}
                            {business.address && (
                              <div>
                                <span className="text-gray-500 text-xs">Address:</span>
                                <p className="text-gray-700">{business.address}</p>
                                {business.postcode && <p className="font-mono text-gray-600">{business.postcode}</p>}
                              </div>
                            )}
                            {business.website && (
                              <div>
                                <span className="text-gray-500 text-xs">Website:</span>
                                <p className="text-blue-600 truncate">{business.website.replace(/^https?:\/\//, '')}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Company Info Column */}
                        <div className="bg-white p-3 rounded-lg border border-gray-200">
                          <h4 className="font-semibold text-gray-900 mb-2 text-sm border-b pb-1">🏢 Company Info</h4>
                          <div className="space-y-2 text-sm">
                            {business.companyNumber && (
                              <div>
                                <span className="text-gray-500 text-xs">Company #:</span>
                                <p className="font-mono text-gray-900">{business.companyNumber}</p>
                              </div>
                            )}
                            {business.companyType && (
                              <div>
                                <span className="text-gray-500 text-xs">Type:</span>
                                <p className="text-gray-700">{business.companyType}</p>
                              </div>
                            )}
                            {business.companyStatus && (
                              <div>
                                <span className="text-gray-500 text-xs">Status:</span>
                                <p className={`font-medium ${business.companyStatus === 'active' ? 'text-green-600' : 'text-red-600'}`}>
                                  {business.companyStatus.toUpperCase()}
                                </p>
                              </div>
                            )}
                            {business.incorporationDate && (
                              <div>
                                <span className="text-gray-500 text-xs">Founded:</span>
                                <p className="text-gray-700">{business.incorporationDate}</p>
                              </div>
                            )}
                            {business.rating && (
                              <div>
                                <span className="text-gray-500 text-xs">Rating:</span>
                                <p className="text-yellow-600 font-medium">
                                  ⭐ {business.rating} {business.review_count && `(${business.review_count} reviews)`}
                                </p>
                              </div>
                            )}
                            {business.industry && (
                              <div>
                                <span className="text-gray-500 text-xs">Industry:</span>
                                <p className="text-gray-700">{business.industry}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Sales Opportunity Column */}
                        <div className="bg-white p-3 rounded-lg border border-gray-200">
                          <h4 className="font-semibold text-gray-900 mb-2 text-sm border-b pb-1">🎯 Sales Opportunities</h4>
                          <div className="space-y-2">
                            {business.lead_signals && business.lead_signals.length > 0 ? (
                              <div className="space-y-1">
                                {business.lead_signals.map((signal, i) => (
                                  <div key={i} className="flex items-start gap-2 text-xs">
                                    <span className="text-orange-500">•</span>
                                    <span className="text-gray-700">{signal}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-500">No specific opportunities identified</p>
                            )}
                            {business.description && (
                              <div className="mt-2 pt-2 border-t border-gray-100">
                                <span className="text-gray-500 text-xs block mb-1">About:</span>
                                <p className="text-xs text-gray-600">{business.description}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Additional Details Row */}
                      <div className="grid md:grid-cols-2 gap-4 mt-4">
                        {/* Directors */}
                        {business.directors && business.directors.length > 0 && (
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <h4 className="font-semibold text-gray-900 mb-2 text-sm border-b pb-1">👥 Key People / Directors</h4>
                            <div className="space-y-1">
                              {business.directors.map((director, i) => (
                                <div key={i} className="text-sm flex justify-between">
                                  <span className="font-medium text-gray-900">{director.name}</span>
                                  <span className="text-gray-500 text-xs">{director.role}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* All Emails Found */}
                        {business.emails && business.emails.length > 0 && (
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <h4 className="font-semibold text-gray-900 mb-2 text-sm border-b pb-1">📧 All Emails Found ({business.emails.length})</h4>
                            <div className="space-y-1">
                              {business.emails.map((email, i) => (
                                <div key={i} className="text-sm flex items-center justify-between gap-2">
                                  <a href={`mailto:${email.address}`} className="text-blue-600 hover:underline truncate">
                                    {email.address}
                                  </a>
                                  <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                                    email.type === 'personal' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {email.type}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* SIC Codes */}
                        {business.sicCodes && business.sicCodes.length > 0 && (
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <h4 className="font-semibold text-gray-900 mb-2 text-sm border-b pb-1">📊 Industry Codes (SIC)</h4>
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

                        {/* Social Media */}
                        {business.socialMedia && Object.values(business.socialMedia).some(Boolean) && (
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <h4 className="font-semibold text-gray-900 mb-2 text-sm border-b pb-1">📱 Social Media</h4>
                            <div className="flex flex-wrap gap-2">
                              {business.socialMedia.linkedin && (
                                <a href={business.socialMedia.linkedin} target="_blank" rel="noopener noreferrer"
                                   className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200">
                                  LinkedIn
                                </a>
                              )}
                              {business.socialMedia.facebook && (
                                <a href={business.socialMedia.facebook} target="_blank" rel="noopener noreferrer"
                                   className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200">
                                  Facebook
                                </a>
                              )}
                              {business.socialMedia.twitter && (
                                <a href={business.socialMedia.twitter} target="_blank" rel="noopener noreferrer"
                                   className="px-2 py-1 bg-sky-100 text-sky-700 rounded text-xs hover:bg-sky-200">
                                  Twitter/X
                                </a>
                              )}
                              {business.socialMedia.instagram && (
                                <a href={business.socialMedia.instagram} target="_blank" rel="noopener noreferrer"
                                   className="px-2 py-1 bg-pink-100 text-pink-700 rounded text-xs hover:bg-pink-200">
                                  Instagram
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Registered Address if different */}
                      {business.registeredAddress && business.registeredAddress !== business.address && (
                        <div className="mt-4 bg-white p-3 rounded-lg border border-gray-200">
                          <h4 className="font-semibold text-gray-900 mb-1 text-sm">🏛️ Registered Office Address</h4>
                          <p className="text-sm text-gray-600">{business.registeredAddress}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* API Key Notice */}
      <div className="mt-8 p-4 bg-gray-100 rounded-lg">
        <h3 className="font-medium text-gray-900 mb-2">Companies House Integration</h3>
        <p className="text-sm text-gray-600">
          To enable Companies House data enrichment (company registration, directors, SIC codes), add your API key to the environment variables:
        </p>
        <code className="mt-2 block text-xs bg-gray-200 p-2 rounded">
          COMPANIES_HOUSE_API_KEY=your_api_key_here
        </code>
        <p className="text-sm text-gray-500 mt-2">
          Get a free API key at{" "}
          <a
            href="https://developer.company-information.service.gov.uk/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            developer.company-information.service.gov.uk
          </a>
        </p>
      </div>
    </main>
  );
}
