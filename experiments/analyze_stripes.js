const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const refPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/original_logo_reference.jpg';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  const refUrl = 'file:///' + refPath.replace(/\\/g, '/');
  await page.goto(refUrl);

  const analysis = await page.evaluate(() => {
    const img = document.querySelector('img');
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = idata.data;

    // Sample horizontal line across the center (y = 158)
    const midY = 158;
    const lineProfile = [];
    for (let x = 90; x <= 225; x++) {
      const idx = (midY * canvas.width + x) * 4;
      const r = data[idx], g = data[idx+1], b = data[idx+2];
      const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
      lineProfile.push({ x, lum: +lum.toFixed(3) });
    }

    // Count peaks / valleys (stripes vs gaps)
    let inStripe = false;
    let stripeCount = 0;
    const stripes = [];
    let currentStripe = null;

    for (let i = 0; i < lineProfile.length; i++) {
      const p = lineProfile[i];
      // Dark is stripe, light is gap. Beige background is ~0.85-0.90, dark stripe is < 0.35
      if (p.lum < 0.5) {
        if (!inStripe) {
          inStripe = true;
          currentStripe = { start: p.x, minLum: p.lum };
        } else {
          if (p.lum < currentStripe.minLum) currentStripe.minLum = p.lum;
        }
      } else {
        if (inStripe) {
          inStripe = false;
          currentStripe.end = lineProfile[i-1].x;
          currentStripe.width = currentStripe.end - currentStripe.start + 1;
          stripes.push(currentStripe);
        }
      }
    }
    if (inStripe) {
      currentStripe.end = lineProfile[lineProfile.length - 1].x;
      currentStripe.width = currentStripe.end - currentStripe.start + 1;
      stripes.push(currentStripe);
    }

    return {
      midY,
      stripeCount: stripes.length,
      stripes
    };
  });

  console.log('Stripe analysis at midY 158:');
  console.log('Total stripes detected:', analysis.stripeCount);
  console.log(JSON.stringify(analysis.stripes, null, 2));

  await browser.close();
})();

