# Pop N Lock Wristbands — Website

A 6-page static website for Pop N Lock Wristbands (Centurion, South Africa).

## Pages
- `index.html` — Home
- `about.html` — About Us
- `wristbands.html` — Wristbands (Tyvek, Satin/Polyester, Vinyl, Thermal)
- `lanyards.html` — Lanyards (Accreditation)
- `services.html` — Other Services (Accreditation, Party Cups, Correx Signage)
- `contact.html` — Contact Us (quote form + map)
- `404.html` — Not found page

## Structure
```
/css/style.css      Global stylesheet
/js/main.js          Nav toggle, scroll effects, form handling
/assets/             Logo (SVG), favicon
/robots.txt
/sitemap.xml
/site.webmanifest
```

No build step — pure HTML/CSS/JS. Deploy by uploading the folder as-is to any static host.

## Deploy options
- **cPanel / shared hosting (e.g. via your domain registrar):** upload all files to `public_html/`.
- **Netlify / Vercel / GitHub Pages:** connect the repo and deploy the root folder — no build command needed.

## Before going live
1. **Contact form:** The quote form on `contact.html` posts to [FormSubmit](https://formsubmit.co/) (`sales@popnlockwristbands.co.za`), which requires no backend. The **first submission** after the site goes live on `www.popnlockwristbands.co.za` will trigger a confirmation email to `sales@popnlockwristbands.co.za` — that link must be clicked once to activate the form for the domain.
2. **Office hours:** placeholder hours (Mon–Fri 08:00–17:00) are set in `contact.html` and its schema markup — update if different.
3. **Domain:** all canonical URLs, Open Graph tags and `sitemap.xml`/`robots.txt` assume `https://www.popnlockwristbands.co.za`. Update these if the final domain differs.
4. **Google Search Console:** once live, submit `sitemap.xml` in Search Console and verify domain ownership to start ranking.
5. **Google Business Profile:** create/claim a Google Business Profile with the same NAP (Name, Address, Phone) used on the Contact page — this is the single biggest factor for local Centurion/Pretoria search ranking.

## SEO included
- Unique title/description/keywords per page
- Open Graph + Twitter card tags
- Canonical URLs
- JSON-LD structured data (LocalBusiness, BreadcrumbList, Product list)
- Semantic HTML headings, descriptive alt text
- `sitemap.xml` + `robots.txt`
- Mobile-responsive, fast-loading (no external font/JS dependencies)
