// Builds a PDF from a Markdown document with the same layout as the Phase 1 PDFs.
//
// Usage (from docs/build):
//   npm install
//   npm run pdf -- ../phase2/04-implementation-details.md
// Output: the same path with a .pdf extension.
//
// The Markdown file starts with a front matter block:
//   ---
//   eyebrow: PHASE 2 · SECTION 04
//   title: Implementation Details
//   subtitle: One-line description
//   footer: UNIMENTOR / PHASE 2
//   ---
//
// Chrome or Edge must be installed. Set CHROME_PATH if it is not in a standard location.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));

const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

function findBrowser() {
  const found = BROWSER_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error('Chrome/Edge not found. Set the CHROME_PATH environment variable.');
  }
  return found;
}

function parseFrontMatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    return { meta: {}, body: source };
  }
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator > 0) {
      meta[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  }
  return { meta, body: source.slice(match[0].length) };
}

function escapeHtml(text = '') {
  return text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

async function build(inputPath) {
  const absoluteInput = path.resolve(inputPath);
  const outputPath = absoluteInput.replace(/\.md$/, '.pdf');
  const { meta, body } = parseFrontMatter(fs.readFileSync(absoluteInput, 'utf8'));
  const css = fs.readFileSync(path.join(here, 'style.css'), 'utf8');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(meta.title)}</title>
<style>${css}</style></head>
<body>
  <p class="eyebrow">${escapeHtml(meta.eyebrow)}</p>
  <h1 class="title">${escapeHtml(meta.title)}</h1>
  <p class="subtitle">${escapeHtml(meta.subtitle)}</p>
  <hr class="title-rule">
  ${marked.parse(body)}
</body></html>`;

  const footerStyle =
    'width:100%;margin:0 20mm;display:flex;justify-content:space-between;' +
    'font-family:Segoe UI,sans-serif;font-size:7pt;font-weight:700;color:#2b2f36;';
  const footerTemplate = `<div style="${footerStyle}">
    <span>${escapeHtml(meta.footer || 'UNIMENTOR')}</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`;

  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
  console.log(`PDF written: ${outputPath}`);
}

const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run pdf -- <file.md>');
  process.exit(1);
}
await build(input);
