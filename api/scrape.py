"""
UK Business Scraper API - Vercel Serverless Function
"""

from http.server import BaseHTTPRequestHandler
import json
import requests
from bs4 import BeautifulSoup
import re
import random
import time
from urllib.parse import quote_plus
from dataclasses import dataclass, asdict, field
from typing import List, Dict, Optional
from datetime import datetime


@dataclass
class UKBusiness:
    """Data class for UK business information"""
    name: str = ""
    email: str = ""
    phone: str = ""
    website: str = ""
    address: str = ""
    city: str = ""
    county: str = ""
    postcode: str = ""
    country: str = "UK"
    industry: str = ""
    description: str = ""
    company_number: str = ""
    revenue: str = ""
    employees: str = ""
    year_founded: str = ""
    company_status: str = ""
    sic_codes: str = ""
    rating: str = ""
    review_count: str = ""
    opening_hours: str = ""
    social_media: Dict = field(default_factory=dict)
    source: str = ""
    scraped_at: str = field(default_factory=lambda: datetime.now().isoformat())


class UKBusinessScraper:
    """Main scraper for UK business directories"""

    def __init__(self, delay_range=(1.0, 2.0)):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-GB,en;q=0.9',
        })
        self.delay_range = delay_range
        self.results: List[UKBusiness] = []

    def _delay(self):
        """Respectful delay between requests"""
        time.sleep(random.uniform(*self.delay_range))

    def _extract_emails(self, text: str) -> List[str]:
        """Extract email addresses from text"""
        pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        emails = re.findall(pattern, text)
        filtered = [e for e in emails if not any(x in e.lower() for x in
            ['example.', 'domain.', 'email.', '.png', '.jpg', '.gif', 'sentry.io'])]
        return list(set(filtered))

    def _extract_uk_phones(self, text: str) -> List[str]:
        """Extract UK phone numbers"""
        patterns = [
            r'(?:\+44|0)[\s.-]?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}',
            r'(?:\+44|0)\s?\d{10,11}',
            r'\d{5}\s?\d{6}',
        ]
        phones = []
        for pattern in patterns:
            phones.extend(re.findall(pattern, text))
        return list(set(phones))

    def _extract_uk_postcode(self, text: str) -> str:
        """Extract UK postcode"""
        pattern = r'[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}'
        match = re.search(pattern, text, re.IGNORECASE)
        return match.group().upper() if match else ""

    def _clean_text(self, text: str) -> str:
        """Clean and normalize text"""
        if not text:
            return ""
        return ' '.join(text.split()).strip()

    def scrape_yell(self, query: str, location: str, max_pages: int = 3) -> List[UKBusiness]:
        """Scrape businesses from Yell.com"""
        businesses = []
        base_url = "https://www.yell.com"

        for page in range(1, max_pages + 1):
            search_url = f"{base_url}/ucs/UcsSearchAction.do?scrambleSeed=&keywords={quote_plus(query)}&location={quote_plus(location)}&pageNum={page}"

            try:
                response = self.session.get(search_url, timeout=15)
                response.raise_for_status()
                soup = BeautifulSoup(response.text, 'html.parser')

                listings = soup.select('.businessCapsule') or soup.select('[data-testid="business-card"]')

                if not listings:
                    break

                for listing in listings:
                    try:
                        business = UKBusiness(source="yell.com")

                        name_elem = listing.select_one('.businessCapsule--name a') or listing.select_one('h2 a')
                        if name_elem:
                            business.name = self._clean_text(name_elem.get_text())

                        address_elem = listing.select_one('.businessCapsule--address') or listing.select_one('[itemprop="address"]')
                        if address_elem:
                            full_address = self._clean_text(address_elem.get_text())
                            business.address = full_address
                            business.postcode = self._extract_uk_postcode(full_address)

                        phone_elem = listing.select_one('.businessCapsule--phone') or listing.select_one('[data-testid="phone-number"]')
                        if phone_elem:
                            business.phone = self._clean_text(phone_elem.get_text())

                        categories = listing.select('.businessCapsule--category a')
                        if categories:
                            business.industry = ', '.join([self._clean_text(c.get_text()) for c in categories])

                        rating_elem = listing.select_one('.starRating--average')
                        if rating_elem:
                            business.rating = self._clean_text(rating_elem.get_text())

                        desc_elem = listing.select_one('.businessCapsule--description')
                        if desc_elem:
                            business.description = self._clean_text(desc_elem.get_text())

                        if business.name:
                            businesses.append(business)

                    except Exception:
                        continue

                self._delay()

            except requests.RequestException:
                break

        return businesses

    def scrape_freeindex(self, query: str, location: str, max_pages: int = 3) -> List[UKBusiness]:
        """Scrape FreeIndex UK business directory"""
        businesses = []
        base_url = "https://www.freeindex.co.uk"

        for page in range(1, max_pages + 1):
            search_url = f"{base_url}/searchresults.htm?k={quote_plus(query)}&l={quote_plus(location)}&p={page}"

            try:
                response = self.session.get(search_url, timeout=15)
                response.raise_for_status()
                soup = BeautifulSoup(response.text, 'html.parser')

                listings = soup.select('.listing') or soup.select('.search-result-item')

                if not listings:
                    break

                for listing in listings:
                    try:
                        business = UKBusiness(source="freeindex")

                        name_elem = listing.select_one('.listing-title a') or listing.select_one('h3 a')
                        if name_elem:
                            business.name = self._clean_text(name_elem.get_text())

                        loc_elem = listing.select_one('.listing-location')
                        if loc_elem:
                            business.address = self._clean_text(loc_elem.get_text())
                            business.postcode = self._extract_uk_postcode(loc_elem.get_text())

                        cat_elem = listing.select_one('.listing-category')
                        if cat_elem:
                            business.industry = self._clean_text(cat_elem.get_text())

                        rating_elem = listing.select_one('.rating-value')
                        if rating_elem:
                            business.rating = self._clean_text(rating_elem.get_text())

                        if business.name:
                            businesses.append(business)

                    except Exception:
                        continue

                self._delay()

            except requests.RequestException:
                break

        return businesses

    def scrape_thomson_local(self, query: str, location: str, max_pages: int = 3) -> List[UKBusiness]:
        """Scrape Thomson Local directory"""
        businesses = []
        base_url = "https://www.thomsonlocal.com"

        for page in range(1, max_pages + 1):
            search_url = f"{base_url}/search/{quote_plus(query)}/{quote_plus(location)}?page={page}"

            try:
                response = self.session.get(search_url, timeout=15)
                response.raise_for_status()
                soup = BeautifulSoup(response.text, 'html.parser')

                listings = soup.select('.listing-item') or soup.select('.search-result')

                if not listings:
                    break

                for listing in listings:
                    try:
                        business = UKBusiness(source="thomson_local")

                        name_elem = listing.select_one('.listing-name a') or listing.select_one('h2 a')
                        if name_elem:
                            business.name = self._clean_text(name_elem.get_text())

                        address_elem = listing.select_one('.listing-address')
                        if address_elem:
                            business.address = self._clean_text(address_elem.get_text())
                            business.postcode = self._extract_uk_postcode(address_elem.get_text())

                        phone_elem = listing.select_one('.listing-phone') or listing.select_one('a[href^="tel:"]')
                        if phone_elem:
                            business.phone = self._clean_text(phone_elem.get_text())

                        if business.name:
                            businesses.append(business)

                    except Exception:
                        continue

                self._delay()

            except requests.RequestException:
                break

        return businesses

    def scrape_yelp_uk(self, query: str, location: str, max_pages: int = 3) -> List[UKBusiness]:
        """Scrape Yelp UK"""
        businesses = []
        base_url = "https://www.yelp.co.uk"

        for page in range(max_pages):
            start = page * 10
            search_url = f"{base_url}/search?find_desc={quote_plus(query)}&find_loc={quote_plus(location)}&start={start}"

            try:
                response = self.session.get(search_url, timeout=15)
                response.raise_for_status()
                soup = BeautifulSoup(response.text, 'html.parser')

                listings = soup.select('[data-testid="serp-ia-card"]') or soup.select('.container__09f24__FeTO6')

                for listing in listings:
                    try:
                        business = UKBusiness(source="yelp_uk")

                        name_elem = listing.select_one('a[href*="/biz/"]')
                        if name_elem:
                            business.name = self._clean_text(name_elem.get_text())

                        cats = listing.select('[class*="category"] a')
                        if cats:
                            business.industry = ', '.join([self._clean_text(c.get_text()) for c in cats])

                        if business.name:
                            businesses.append(business)

                    except Exception:
                        continue

                self._delay()

            except requests.RequestException:
                break

        return businesses

    def scrape_google_maps(self, query: str, location: str, max_results: int = 20) -> List[UKBusiness]:
        """Scrape Google Maps results (limited)"""
        businesses = []

        search_query = f"{query} in {location} UK"
        search_url = f"https://www.google.com/search?q={quote_plus(search_query)}&tbm=lcl"

        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-GB,en;q=0.9',
            }

            response = self.session.get(search_url, headers=headers, timeout=15)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')

            local_results = soup.select('.VkpGBb') or soup.select('[data-hveid]')

            for result in local_results[:max_results]:
                try:
                    business = UKBusiness(source="google_maps")

                    name_elem = result.select_one('.dbg0pd') or result.select_one('.OSrXXb')
                    if name_elem:
                        business.name = self._clean_text(name_elem.get_text())

                    text = result.get_text()

                    rating_match = re.search(r'(\d+\.?\d*)\s*\((\d+)\)', text)
                    if rating_match:
                        business.rating = rating_match.group(1)
                        business.review_count = rating_match.group(2)

                    address_elem = result.select_one('.rllt__details')
                    if address_elem:
                        business.address = self._clean_text(address_elem.get_text())
                        business.postcode = self._extract_uk_postcode(address_elem.get_text())

                    phones = self._extract_uk_phones(text)
                    if phones:
                        business.phone = phones[0]

                    if business.name:
                        businesses.append(business)

                except Exception:
                    continue

            self._delay()

        except requests.RequestException:
            pass

        return businesses

    def search(self, query: str, location: str,
               sources: List[str] = None,
               max_pages: int = 2) -> List[UKBusiness]:
        """Search for UK businesses across multiple directories"""

        if sources is None:
            sources = ['yell', 'freeindex']

        all_businesses = []

        source_methods = {
            'yell': lambda: self.scrape_yell(query, location, max_pages),
            'google': lambda: self.scrape_google_maps(query, location, max_pages * 10),
            'thomson': lambda: self.scrape_thomson_local(query, location, max_pages),
            'freeindex': lambda: self.scrape_freeindex(query, location, max_pages),
            'yelp': lambda: self.scrape_yelp_uk(query, location, max_pages),
        }

        for source in sources:
            if source in source_methods:
                try:
                    results = source_methods[source]()
                    all_businesses.extend(results)
                except Exception:
                    pass

        # Deduplicate by name
        seen_names = set()
        unique_businesses = []
        for biz in all_businesses:
            name_lower = biz.name.lower().strip()
            if name_lower and name_lower not in seen_names:
                seen_names.add(name_lower)
                unique_businesses.append(biz)

        self.results = unique_businesses
        return unique_businesses


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)

        try:
            data = json.loads(post_data.decode('utf-8'))

            query = data.get('query', '')
            location = data.get('location', '')
            sources = data.get('sources', ['yell', 'freeindex'])
            max_pages = min(data.get('max_pages', 2), 5)  # Cap at 5 pages

            if not query or not location:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Missing query or location'}).encode())
                return

            scraper = UKBusinessScraper(delay_range=(0.5, 1.5))
            businesses = scraper.search(
                query=query,
                location=location,
                sources=sources,
                max_pages=max_pages
            )

            result = {
                'businesses': [asdict(b) for b in businesses],
                'count': len(businesses),
                'query': query,
                'location': location,
                'sources': sources
            }

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
