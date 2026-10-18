import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1400, height: 600 } });
p.on('pageerror', (e) => console.error('pageerror', e.message));
await p.goto('http://localhost:8899/asset-sheet.html?' + process.argv[3]);
await p.waitForTimeout(6000);
await p.screenshot({ path: process.argv[2] });
await b.close();
