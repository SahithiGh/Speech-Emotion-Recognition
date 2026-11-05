const fs = require('fs');
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

  const fitResults = await page.evaluate(() => {
    const img = document.querySelector('img');
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = idata.data;

    const xc = 157.5;
    const yc = 158.0;
    const R = 58.0;

    // Center stripe coordinates at midY (158):
    // From our previous analysis:
    const centers158 = [
      101.0, 105.5, 112.0, 118.0, 125.0, 132.0, 138.5, 145.5, 152.0,
      159.0, 166.5, 173.5, 180.5, 187.5, 194.5, 202.0, 209.0, 214.5
    ];

    // Compute sin(theta_i) for each stripe
    const sinThetas = centers158.map(x => (x - xc) / R);

    // Let's test how well the formula predicts stripe center at other Y values (e.g. y=120, y=140, y=175, y=195)
    const testYs = [120, 135, 158, 180, 195];
    const comparisons = {};

    testYs.forEach(y => {
      const dy = (y - yc) / R;
      const cosPhi = Math.sqrt(Math.max(0, 1 - dy*dy));
      const predCenters = sinThetas.map(st => +(xc + R * st * cosPhi).toFixed(1));
      comparisons[y] = { cosPhi: +cosPhi.toFixed(3), predCenters };
    });

    return { centers158, sinThetas, comparisons };
  });

  console.log('Fitted Sphere Longitudes (sin(theta)):');
  console.log(fitResults.sinThetas.map(s => +s.toFixed(3)).join(', '));
  console.log('\nPredicted centers at y=135 (cosPhi = ' + fitResults.comparisons[135].cosPhi + '):');
  console.log(fitResults.comparisons[135].predCenters.join(', '));
  console.log('\nPredicted centers at y=180 (cosPhi = ' + fitResults.comparisons[180].cosPhi + '):');
  console.log(fitResults.comparisons[180].predCenters.join(', '));

  await browser.close();
})();

