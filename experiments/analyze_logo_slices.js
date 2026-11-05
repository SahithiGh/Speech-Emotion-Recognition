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

  const data = await page.evaluate(() => {
    const img = document.querySelector('img');
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = idata.data;

    // Check beige background color distribution in outer margin
    const bgSamples = [];
    for (let x = 10; x < 50; x += 5) {
      for (let y = 10; y < 50; y += 5) {
        const i = (y * canvas.width + x) * 4;
        bgSamples.push({ r: d[i], g: d[i+1], b: d[i+2] });
      }
    }
    const avgBg = {
      r: Math.round(bgSamples.reduce((a, b) => a + b.r, 0) / bgSamples.length),
      g: Math.round(bgSamples.reduce((a, b) => a + b.g, 0) / bgSamples.length),
      b: Math.round(bgSamples.reduce((a, b) => a + b.b, 0) / bgSamples.length),
    };

    // Analyze multiple horizontal slices to see how stripes curve and taper
    const slices = [115, 130, 145, 158, 175, 190, 200];
    const sliceData = {};

    slices.forEach(y => {
      const row = [];
      for (let x = 95; x <= 220; x++) {
        const i = (y * canvas.width + x) * 4;
        const br = (d[i] + d[i+1] + d[i+2]) / 3;
        row.push(Math.round(br));
      }
      sliceData[y] = row;
    });

    return {
      width: canvas.width,
      height: canvas.height,
      avgBg,
      sliceData
    };
  });

  console.log('Image dimensions:', data.width, data.height);
  console.log('Average background color:', data.avgBg);
  console.log('Sample row at midY (158):');
  console.log(data.sliceData[158].join(' '));

  await browser.close();
})();

