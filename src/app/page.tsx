"use client";

import { useState } from "react";

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
];

export default function Home() {
  const [searchParams, setSearchParams] = useState<SearchParams>({
    query: "",
    postcode: "",
    radius: "10",
    sources: ["yell", "checkatrade", "freeindex", "trustpilot"],
    maxPages: 5,
  });
  const [customQuery, setCustomQuery] = useState("");
  const [results, setResults] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchComplete, setSearchComplete] = useState(false);

  const handleSourceToggle = (sourceId: string) => {
    setSearchParams((prev) => ({
      ...prev,
      sources: prev.sources.includes(sourceId)
        ? prev.sources.filter((s) => s !== sourceId)
        : [...prev.sources, sourceId],
    }));
  };

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
    if (searchParams.sources.length === 0) {
      setError("Please select at least one data source");
      return;
    }

    setError("");
    setLoading(true);
    setSearchComplete(false);
    setResults([]);

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          location: searchParams.postcode,
          radius: searchParams.radius,
          sources: searchParams.sources,
          max_pages: searchParams.maxPages,
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

  const exportCSV = () => {
    if (results.length === 0) return;

    const headers = [
      "Name",
      "Lead Score",
      "Lead Signals",
      "Distance",
      "Email",
      "Phone",
      "Website",
      "Address",
      "Postcode",
      "Industry",
      "Rating",
      "Reviews",
      "Source",
    ];
    const csvContent = [
      headers.join(","),
      ...results.map((b) =>
        [
          `"${b.name}"`,
          `"${b.lead_score}"`,
          `"${(b.lead_signals || []).join("; ")}"`,
          `"${b.distance || ""}"`,
          `"${b.email}"`,
          `"${b.phone}"`,
          `"${b.website}"`,
          `"${b.address}"`,
          `"${b.postcode}"`,
          `"${b.industry}"`,
          `"${b.rating}"`,
          `"${b.review_count}"`,
          `"${b.source}"`,
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

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          UK Business Scraper
        </h1>
        <p className="text-gray-600">
          Search local UK businesses across multiple directories
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

        {/* Data Sources */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Data Sources
          </label>
          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
            {DATA_SOURCES.map((source) => (
              <label
                key={source.id}
                className={`flex flex-col items-center p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  searchParams.sources.includes(source.id)
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={searchParams.sources.includes(source.id)}
                  onChange={() => handleSourceToggle(source.id)}
                  className="sr-only"
                />
                <span className="font-medium text-sm">{source.name}</span>
                <span className="text-xs text-gray-500">{source.description}</span>
              </label>
            ))}
          </div>
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

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Search Button */}
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
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">
              Found {results.length} businesses
            </h2>
            {results.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={exportCSV}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                >
                  Export CSV
                </button>
                <button
                  onClick={exportJSON}
                  className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
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
                  className={`border-2 rounded-lg p-4 hover:shadow-md transition-shadow ${
                    business.lead_score >= 80
                      ? "border-green-500 bg-green-50"
                      : business.lead_score >= 60
                      ? "border-yellow-500 bg-yellow-50"
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex justify-between items-start">
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
                            {business.distance} away
                          </span>
                        )}
                      </div>
                      {business.industry && (
                        <p className="text-sm text-blue-600">{business.industry}</p>
                      )}
                    </div>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                      {business.source}
                    </span>
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

                  <div className="mt-3 grid md:grid-cols-2 gap-2 text-sm text-gray-600">
                    {business.address && (
                      <p className="flex items-center gap-2">
                        <span className="text-gray-400">Address:</span>
                        {business.address}
                        {business.postcode && ` (${business.postcode})`}
                      </p>
                    )}
                    {business.phone && (
                      <p className="flex items-center gap-2">
                        <span className="text-gray-400">Phone:</span>
                        <a
                          href={`tel:${business.phone}`}
                          className="text-blue-600 hover:underline"
                        >
                          {business.phone}
                        </a>
                      </p>
                    )}
                    {business.email && (
                      <p className="flex items-center gap-2">
                        <span className="text-gray-400">Email:</span>
                        <a
                          href={`mailto:${business.email}`}
                          className="text-blue-600 hover:underline"
                        >
                          {business.email}
                        </a>
                      </p>
                    )}
                    {business.website && (
                      <p className="flex items-center gap-2">
                        <span className="text-gray-400">Website:</span>
                        <a
                          href={business.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline truncate max-w-xs"
                        >
                          {business.website}
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
                  </div>

                  {business.description && (
                    <p className="mt-2 text-sm text-gray-500 line-clamp-2">
                      {business.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
