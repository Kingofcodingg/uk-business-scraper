import { NextRequest, NextResponse } from "next/server";
import {
  enrichBusiness,
  enrichBusinesses,
  searchCompaniesHouse,
  calculateLeadScore,
  generateLeadSignals,
} from "@/lib/enrichment";

// ============================================================================
// SINGLE BUSINESS ENRICHMENT API
// ============================================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessName, website, postcode, rating, review_count, phone, email, address, industry, distance } = body;

    if (!businessName) {
      return NextResponse.json({ error: "Missing businessName" }, { status: 400 });
    }

    console.log(`\n========== ENRICHING: ${businessName} ==========`);

    // Use the new enrichment service with full enrichment
    const enrichedLead = await enrichBusiness({
      name: businessName,
      website,
      postcode,
      rating,
      review_count,
      phone,
      email,
      address,
      industry,
      distance,
    }, {
      discoverWebsite: true,  // Find website via Google if missing
      crawlWebsite: true,     // Crawl website for emails/phones/people
      searchCompaniesHouse: true,
      guessEmails: true,
      searchLinkedIn: true,   // LinkedIn scraping enabled
    });

    // Convert to the format expected by the frontend
    const response = {
      success: true,
      enrichedData: {
        // Discovered/confirmed website
        website: enrichedLead.website,

        // Companies House data
        companyNumber: enrichedLead.companiesHouse?.companyNumber,
        companyStatus: enrichedLead.companiesHouse?.companyStatus,
        companyType: enrichedLead.companiesHouse?.companyType,
        incorporationDate: enrichedLead.companiesHouse?.incorporationDate,
        registeredAddress: enrichedLead.companiesHouse?.registeredAddress,
        sicCodes: enrichedLead.companiesHouse?.sicCodes,
        directors: enrichedLead.companiesHouse?.directors || enrichedLead.people.map(p => ({
          name: p.name,
          role: p.role,
          appointedOn: p.appointedDate || '',
        })),

        // Enhanced email data
        emails: enrichedLead.emails,

        // Social media
        socialMedia: enrichedLead.socialMedia,

        // Additional phones found
        phones: enrichedLead.phones,

        // People/decision makers
        people: enrichedLead.people,

        // Score breakdown
        scoreBreakdown: enrichedLead.leadScore.breakdown,

        // Enrichment metadata
        enrichmentStatus: enrichedLead.enrichment.status,
        enrichmentSources: enrichedLead.enrichment.sources,
      },
      newLeadScore: enrichedLead.leadScore.total,
      leadSignals: generateLeadSignals(enrichedLead.leadScore, {
        website: enrichedLead.website,
        emails: enrichedLead.emails,
        phones: enrichedLead.phones,
        people: enrichedLead.people,
        directors: enrichedLead.companiesHouse?.directors,
        socialMedia: enrichedLead.socialMedia,
        rating,
        reviewCount: review_count,
        companiesHouse: enrichedLead.companiesHouse,
        industry,
        distance,
      }),
      priorityRank: enrichedLead.leadScore.priorityRank,
    };

    console.log(`[Enrich] Complete: ${businessName}`);
    console.log(`  - Website: ${enrichedLead.website || 'Not found'}`);
    console.log(`  - Company: ${enrichedLead.companiesHouse?.companyNumber || 'Not found'}`);
    console.log(`  - Emails: ${enrichedLead.emails.length}`);
    console.log(`  - People: ${enrichedLead.people.length}`);
    console.log(`  - LinkedIn: ${enrichedLead.socialMedia.linkedin || 'Not found'}`);
    console.log(`  - Social: ${Object.values(enrichedLead.socialMedia).filter(Boolean).length} platforms`);
    console.log(`  - Score: ${enrichedLead.leadScore.total} (${enrichedLead.leadScore.priorityRank})`);

    return NextResponse.json(response);

  } catch (error) {
    console.error("Enrich error:", error);
    return NextResponse.json({ error: "Enrichment failed" }, { status: 500 });
  }
}

// ============================================================================
// BULK ENRICH API
// ============================================================================
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { businesses } = body;

    if (!businesses || !Array.isArray(businesses)) {
      return NextResponse.json({ error: "Missing businesses array" }, { status: 400 });
    }

    console.log(`\n========== BULK ENRICHING: ${businesses.length} businesses ==========`);

    // Limit to 20 at a time for rate limiting
    const toEnrich = businesses.slice(0, 20).map((b: Record<string, unknown>) => ({
      name: b.name as string,
      website: b.website as string | undefined,
      postcode: b.postcode as string | undefined,
      rating: b.rating as string | undefined,
      review_count: b.review_count as string | undefined,
      phone: b.phone as string | undefined,
      email: b.email as string | undefined,
      address: b.address as string | undefined,
      industry: b.industry as string | undefined,
      distance: b.distance as string | undefined,
    }));

    const enrichedLeads = await enrichBusinesses(toEnrich, {
      discoverWebsite: true,
      crawlWebsite: true,
      searchCompaniesHouse: true,
      guessEmails: true,
      searchLinkedIn: true,
    }, 6); // Process 6 at a time for faster bulk enrichment

    const results = enrichedLeads.map(lead => ({
      originalName: lead.businessName,
      enrichedData: {
        companyNumber: lead.companiesHouse?.companyNumber,
        companyStatus: lead.companiesHouse?.companyStatus,
        companyType: lead.companiesHouse?.companyType,
        incorporationDate: lead.companiesHouse?.incorporationDate,
        registeredAddress: lead.companiesHouse?.registeredAddress,
        sicCodes: lead.companiesHouse?.sicCodes,
        directors: lead.companiesHouse?.directors || lead.people.map(p => ({
          name: p.name,
          role: p.role,
          appointedOn: p.appointedDate || '',
        })),
        emails: lead.emails,
        socialMedia: lead.socialMedia,
        phones: lead.phones,
        people: lead.people,
        scoreBreakdown: lead.leadScore.breakdown,
      },
      newLeadScore: lead.leadScore.total,
      priorityRank: lead.leadScore.priorityRank,
    }));

    return NextResponse.json({
      success: true,
      results,
      enrichedCount: results.length,
    });

  } catch (error) {
    console.error("Bulk enrich error:", error);
    return NextResponse.json({ error: "Bulk enrichment failed" }, { status: 500 });
  }
}

// ============================================================================
// COMPANIES HOUSE LOOKUP API
// ============================================================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyName = searchParams.get('name');
    const postcode = searchParams.get('postcode');

    if (!companyName) {
      return NextResponse.json({ error: "Missing company name" }, { status: 400 });
    }

    console.log(`[API] Companies House lookup: ${companyName}`);

    const chData = await searchCompaniesHouse(companyName, postcode || undefined);

    if (!chData) {
      return NextResponse.json({
        success: false,
        message: "Company not found in Companies House",
      });
    }

    return NextResponse.json({
      success: true,
      data: chData,
    });

  } catch (error) {
    console.error("Companies House lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
