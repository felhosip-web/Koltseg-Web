import { execSync } from 'child_process';
import fs from 'fs';

const defaultPagesUrl = 'https://felhosip-web.github.io/Koltseg-Web/';
const defaultPrUrl = 'http://localhost:3000/';

const pagesUrl = process.argv[2] || defaultPagesUrl;
const prUrl = process.argv[3] || defaultPrUrl;

const pagesReportPath = './pages-report.json';
const prReportPath = './pr-report.json';
const commentOutputPath = './lighthouse-comment.md';

function runLighthouse(targetUrl, outputPath) {
  try {
    console.log(`Lighthouse audit indítása a következő URL-re: ${targetUrl}`);
    const cmd = `npx --no-install lighthouse "${targetUrl}" --output=json --output-path="${outputPath}" --chrome-flags="--headless --no-sandbox --disable-gpu --disable-dev-shm-usage" --quiet`;
    execSync(cmd, { stdio: 'inherit' });
    if (fs.existsSync(outputPath)) {
      return JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    }
  } catch (err) {
    console.error(`Hiba a Lighthouse futtatása során (${targetUrl}):`, err.message);
  }
  return null;
}

function extractScores(report) {
  if (!report || !report.categories) {
    return null;
  }
  const cats = report.categories;
  return {
    performance: cats.performance ? Math.round(cats.performance.score * 100) : null,
    accessibility: cats.accessibility ? Math.round(cats.accessibility.score * 100) : null,
    bestPractices: cats['best-practices'] ? Math.round(cats['best-practices'].score * 100) : null,
    seo: cats.seo ? Math.round(cats.seo.score * 100) : null,
    pwa: cats.pwa ? Math.round(cats.pwa.score * 100) : null,
  };
}

function formatDiff(prScore, pagesScore) {
  if (prScore === null || pagesScore === null) return 'N/A';
  const diff = prScore - pagesScore;
  if (diff > 0) return `+${diff} 📈`;
  if (diff < 0) return `${diff} 📉`;
  return '0 ➖';
}

console.log('--- PR Lighthouse Audit Indítása ---');

// 1. Audit PR Build
const prReport = runLighthouse(prUrl, prReportPath);
const prScores = extractScores(prReport);

if (!prScores) {
  console.error('Kritikus hiba: A PR build Lighthouse elemzése sikertelen volt!');
  process.exit(1);
}

// 2. Audit Pages URL (élő verzió)
const pagesReport = runLighthouse(pagesUrl, pagesReportPath);
const pagesScores = extractScores(pagesReport);

if (!pagesScores) {
  console.error('Kritikus hiba: A GitHub Pages Lighthouse elemzése sikertelen volt! Nem szakítjuk meg a futást, mert a GitHub Pages elérhetősége instabil lehet.');
  // Hibás eset helyett beállítunk egy fallbacket, hogy a markdown ne omoljon össze
}

const categoryNames = [
  { key: 'performance', label: 'Teljesítmény (Performance)' },
  { key: 'accessibility', label: 'Akadálymentesítés (Accessibility)' },
  { key: 'bestPractices', label: 'Legjobb gyakorlatok (Best Practices)' },
  { key: 'seo', label: 'SEO' },
];

if (prScores.pwa !== null || (pagesScores && pagesScores.pwa !== null)) {
  categoryNames.push({ key: 'pwa', label: 'PWA (Progressive Web App)' });
}

let tableRows = '';
let totalDiff = 0;

categoryNames.forEach(({ key, label }) => {
  const pr = prScores[key] !== null ? prScores[key] : 'N/A';
  const pages = pagesScores && pagesScores[key] !== null ? pagesScores[key] : 'N/A';
  const diffStr = pagesScores && pagesScores[key] !== null ? formatDiff(prScores[key], pagesScores[key]) : 'N/A';
  if (pagesScores && pagesScores[key] !== null && prScores[key] !== null) {
    totalDiff += (prScores[key] - pagesScores[key]);
  }
  tableRows += '| **' + label + '** | ' + pages + ' | ' + pr + ' | ' + diffStr + ' |\n';
});

let statusText = '✅ Rendben (Megfelelő teljesítmény)';
if (totalDiff < -5) {
  statusText = '⚠️ Figyelem: A PR teljesítményromlást tartalmaz';
} else if (totalDiff > 0) {
  statusText = '🚀 Fejlődés: A PR javította a teljesítménymutatókat';
}

const markdownComment = '<!-- lighthouse-pr-comment -->\n' +
'## ⚡ Lighthouse Audit Jelentés\n\n' +
'A PR automatikus Lighthouse mérése elkészült. Az alábbi táblázat összehasonlítja a jelenlegi **GitHub Pages élő verziót** és a **PR buildet**.\n\n' +
'| Kategória | Élő Pages URL (`' + pagesUrl + '`) | PR Build | Változás |\n' +
'| :--- | :---: | :---: | :---: |\n' +
tableRows + '\n' +
'### 📊 Összegzés\n' +
'- **Állapot**: ' + statusText + '\n' +
'- **Tesztelt Pages URL**: [' + pagesUrl + '](' + pagesUrl + ')\n' +
'- **Tesztelt PR Build URL**: `' + prUrl + '`';

fs.writeFileSync(commentOutputPath, markdownComment, 'utf8');
console.log('Lighthouse komment sikeresen elmentve: ' + commentOutputPath);

// Clean up temporary json reports
try {
  if (fs.existsSync(pagesReportPath)) fs.unlinkSync(pagesReportPath);
  if (fs.existsSync(prReportPath)) fs.unlinkSync(prReportPath);
} catch (e) {}
