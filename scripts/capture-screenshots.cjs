const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const routes = [
  ['panel', '/'],
  ['movimientos', '/movimientos'],
  ['deudas', '/deudas'],
  ['consejos', '/consejos'],
  ['ajustes', '/ajustes'],
];

(async () => {
  const outDir = path.join(__dirname, '../docs/screenshots');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  for (const [name, route] of routes) {
    await page.goto(`http://localhost:8081${route}`, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
  }

  await browser.close();
  console.log('Screenshots saved to', outDir);
})();
