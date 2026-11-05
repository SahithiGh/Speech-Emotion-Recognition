const fs = require('fs');
const puppeteer = require('puppeteer-core');
const path = require('path');

const refPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/original_logo_reference.jpg';
const refBase64 = fs.readFileSync(refPath).toString('base64');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();

  const extracted = await page.evaluate((b64) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        const getLum = (x, y) => {
          if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return 230;
          const idx = (y * canvas.width + x) * 4;
          return 0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2];
        };

        // Center is (157.5, 158.0), radius ~ 58.5
        // At midY 158, let's find the 18 valleys (stripes)
        const midY = 158;
        const row = [];
        for (let x = 95; x <= 220; x++) {
          row.push({ x, lum: getLum(x, midY) });
        }

        // Find valleys (local minima < 120)
        const valleys = [];
        for (let i = 1; i < row.length - 1; i++) {
          if (row[i].lum < 110 && row[i].lum <= row[i-1].lum && row[i].lum <= row[i+1].lum) {
            if (valleys.length > 0 && (row[i].x - valleys[valleys.length - 1].x) <= 2) {
              if (row[i].lum < valleys[valleys.length - 1].lum) {
                valleys[valleys.length - 1] = row[i];
              }
            } else {
              valleys.push(row[i]);
            }
          }
        }

        // For each of the 18 stripes, track vertically up and down from midY
        // To build a smooth, high-fidelity subpixel polygon
        const stripePolygons = valleys.map((v, sIdx) => {
          const topPts = [];
          const btmPts = [];

          // Go up from midY to top
          let currX = v.x;
          for (let y = midY; y >= 95; y--) {
            // Find local minimum near currX
            let bestX = currX;
            let minL = 999;
            for (let dx = -3; dx <= 3; dx++) {
              const testX = Math.round(currX + dx);
              const l = getLum(testX, y);
              if (l < minL) {
                minL = l;
                bestX = testX;
              }
            }

            // If minL is still a dark stripe (< 160)
            if (minL < 165) {
              currX = bestX;
              // Find left and right edges where lum crosses threshold (e.g. 145)
              let leftX = currX;
              while (leftX > currX - 6 && getLum(Math.floor(leftX), y) < 145) {
                leftX -= 0.5;
              }
              let rightX = currX;
              while (rightX < currX + 6 && getLum(Math.ceil(rightX), y) < 145) {
                rightX += 0.5;
              }
              if (rightX > leftX + 0.2) {
                topPts.push({ y, leftX, rightX });
              }
            } else {
              break;
            }
          }

          // Go down from midY + 1 to bottom
          currX = v.x;
          for (let y = midY + 1; y <= 222; y++) {
            let bestX = currX;
            let minL = 999;
            for (let dx = -3; dx <= 3; dx++) {
              const testX = Math.round(currX + dx);
              const l = getLum(testX, y);
              if (l < minL) {
                minL = l;
                bestX = testX;
              }
            }

            if (minL < 165) {
              currX = bestX;
              let leftX = currX;
              while (leftX > currX - 6 && getLum(Math.floor(leftX), y) < 145) {
                leftX -= 0.5;
              }
              let rightX = currX;
              while (rightX < currX + 6 && getLum(Math.ceil(rightX), y) < 145) {
                rightX += 0.5;
              }
              if (rightX > leftX + 0.2) {
                btmPts.push({ y, leftX, rightX });
              }
            } else {
              break;
            }
          }

          // Combine into full stripe points
          const allPts = [...topPts.reverse(), ...btmPts];
          return allPts;
        });

        resolve({
          valleysCount: valleys.length,
          stripePolygons: stripePolygons.map(p => ({
            count: p.length,
            minY: p[0]?.y,
            maxY: p[p.length - 1]?.y,
            midW: +(p.find(pt => pt.y === 158)?.rightX - p.find(pt => pt.y === 158)?.leftX).toFixed(2)
          }))
        });
      };
      img.src = 'data:image/jpeg;base64,' + b64;
    });
  }, refBase64);

  console.log('Valleys (Stripes) found:', extracted.valleysCount);
  console.log('Stripe heights and widths at equator:');
  console.log(JSON.stringify(extracted.stripePolygons, null, 2));

  await browser.close();
})();

