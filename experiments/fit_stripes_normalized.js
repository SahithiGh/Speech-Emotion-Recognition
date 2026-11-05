const fs = require('fs');
const puppeteer = require('puppeteer-core');
const path = require('path');

const refPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/original_logo_reference.jpg';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  const refUrl = 'file:///' + refPath.replace(/\\/g, '/');
  await page.goto(refUrl);

  const scriptResult = await page.evaluate(() => {
    const img = document.querySelector('img');
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; // 316
    canvas.height = img.naturalHeight; // 316
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = idata.data;

    // Center and radius in original image:
    const xc = 157.5;
    const yc = 158.0;
    const R = 58.0;

    // For each of the 18 stripes, let's find the exact left and right edge at y = 158
    // We already measured:
    const stripes158 = [
      { start: 100.0, end: 102.8 },
      { start: 104.0, end: 107.5 },
      { start: 109.8, end: 114.2 },
      { start: 116.0, end: 120.2 },
      { start: 122.8, end: 127.2 },
      { start: 129.8, end: 134.2 },
      { start: 136.2, end: 141.2 },
      { start: 143.0, end: 148.0 },
      { start: 149.8, end: 154.8 },
      { start: 156.8, end: 161.8 },
      { start: 163.8, end: 168.8 },
      { start: 170.8, end: 175.8 },
      { start: 177.8, end: 182.8 },
      { start: 184.8, end: 189.8 },
      { start: 191.8, end: 196.8 },
      { start: 199.5, end: 204.0 },
      { start: 206.5, end: 210.5 },
      { start: 213.2, end: 215.0 }
    ];

    // Normalize to viewBox 0 0 100 100
    // Target center = 50, Target radius = 46.5 (giving 3.5% padding so nothing touches viewBox edge)
    const scale = 46.5 / R;
    const normStripes = stripes158.map(s => {
      const leftRel = (s.start - xc) / R;
      const rightRel = (s.end - xc) / R;
      return { leftRel, rightRel };
    });

    return { scale, normStripes };
  });

  console.log('Normalized stripe longitudes:');
  console.log(JSON.stringify(scriptResult.normStripes, null, 2));

  await browser.close();
})();

