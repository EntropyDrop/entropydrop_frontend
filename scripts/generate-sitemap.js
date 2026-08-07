import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOMAIN = 'https://entropydrop.com';

const staticRoutes = [
  '',
  '/skin',
  '/skin/generate',
  '/credits',
  '/pro',
  '/public/about',
  '/public/blog',
  '/public/roadmap',
  '/public/financials',
  '/public/fixed-assets',
  '/public/ledger',
];

const blogArticles = [
  'skin-reconstruction',
  'architecture',
  'skingen',
  'root-trust-governance',
];

const currentDate = new Date().toISOString().split('T')[0];

let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

// Add static routes
for (const route of staticRoutes) {
  sitemap += `  <url>
    <loc>${DOMAIN}${route}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${route === '' || route === '/skin' ? '1.0' : '0.8'}</priority>
  </url>\n`;
}

// Add blog articles
for (const article of blogArticles) {
  sitemap += `  <url>
    <loc>${DOMAIN}/public/blog/${article}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>\n`;
}

sitemap += `</urlset>`;

const outputPath = path.join(__dirname, '../public/sitemap.xml');
fs.writeFileSync(outputPath, sitemap, 'utf8');
console.log(`Sitemap generated successfully at: ${outputPath}`);
