const fs = require('fs');
const puppeteer = require('puppeteer-core');
const path = require('path');

const refPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/original_logo_reference.jpg';
const refBase64 = fs.readFileSync(refPath).toString('base64');

// Exact 18 stripes from original_logo_reference.jpg:
// In original image (316x316), symbol center is at xc = 157.5, yc = 158.0, R = 58.0
// Let's refine the center and width of each stripe at equator so the silhouette matches the reference image exactly.

const stripesData = [
  { center: -0.968, w: 0.044, maxT: 0.28 },
  { center: -0.892, w: 0.062, maxT: 0.48 },
  { center: -0.782, w: 0.074, maxT: 0.65 },
  { center: -0.678, w: 0.078, maxT: 0.76 },
  { center: -0.560, w: 0.080, maxT: 0.84 },
  { center: -0.440, w: 0.082, maxT: 0.90 },
  { center: -0.325, w: 0.086, maxT: 0.94 },
  { center: -0.205, w: 0.086, maxT: 0.96 },
  { center: -0.090, w: 0.086, maxT: 0.97 },
  { center:  0.030, w: 0.086, maxT: 0.97 },
  { center:  0.150, w: 0.086, maxT: 0.96 },
  { center:  0.270, w: 0.086, maxT: 0.94 },
  { center:  0.390, w: 0.086, maxT: 0.90 },
  { center:  0.510, w: 0.082, maxT: 0.84 },
  { center:  0.635, w: 0.080, maxT: 0.76 },
  { center:  0.760, w: 0.074, maxT: 0.65 },
  { center:  0.880, w: 0.062, maxT: 0.48 },
  { center:  0.965, w: 0.044, maxT: 0.28 }
];

function buildSphereSvg(color = "currentColor", padding = 3.0) {
  // Box size 100x100.
  // Center (50, 50). Radius = 50 - padding = 47.0
  const cx = 50, cy = 50, R = 50 - padding;
  const paths = [];

  stripesData.forEach(s => {
    const leftU = s.center - s.w / 2;
    const rightU = s.center + s.w / 2;
    const maxSinPhi = s.maxT;

    const N = 40;
    const rightPts = [];
    const leftPts = [];

    for (let i = 0; i <= N; i++) {
      const t = (i / N) * 2 - 1; // -1 to +1
      const sinPhi = t * maxSinPhi;
      // Latitude cosPhi
      const cosPhi = Math.sqrt(Math.max(0, 1 - sinPhi * sinPhi));
      const y = cy + R * sinPhi;

      // Longitude curves
      const rawXR = cx + R * rightU * cosPhi;
      const rawXL = cx + R * leftU * cosPhi;

      // Silhouette boundary
      const circleDist = Math.sqrt(Math.max(0, R*R - (y-cy)*(y-cy)));
      const xR = Math.min(cx + circleDist, Math.max(cx - circleDist, rawXR));
      const xL = Math.min(cx + circleDist, Math.max(cx - circleDist, rawXL));

      if (xR > xL + 0.02) {
        rightPts.push({ x: +xR.toFixed(2), y: +y.toFixed(2) });
        leftPts.push({ x: +xL.toFixed(2), y: +y.toFixed(2) });
      }
    }

    if (rightPts.length >= 2) {
      let d = `M ${rightPts[0].x} ${rightPts[0].y} `;
      for (let i = 1; i < rightPts.length; i++) {
        d += `L ${rightPts[i].x} ${rightPts[i].y} `;
      }
      for (let i = leftPts.length - 1; i >= 0; i--) {
        d += `L ${leftPts[i].x} ${leftPts[i].y} `;
      }
      d += 'Z';
      paths.push(`<path d="${d}" fill="${color}" />`);
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">\n  <g fill="${color}">\n    ${paths.join('\n    ')}\n  </g>\n</svg>`;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });

  const svgBlack = buildSphereSvg('#0A1128', 2.0);
  const svgRed = buildSphereSvg('#FF0000', 2.0);

  // Overlay test: SVG in semi-transparent red over original image in black & white
  const html = `
    <!DOCTYPE html>
    <html>
    <body style="margin: 0; padding: 40px; background: #FAF9F5; font-family: sans-serif;">
      <h2>Direct Pixel Overlay Alignment Test</h2>
      <p>Original reference image underneath (greyscale) + Vector reconstruction overlaid in semi-transparent cyan (50% opacity).</p>
      
      <div style="display: flex; gap: 40px; align-items: center;">
        <div style="position: relative; width: 232px; height: 232px; border: 1px solid #ccc; background: #fff;">
          <!-- Original cropped reference -->
          <img src="data:image/jpeg;base64,${refBase64}" style="position: absolute; left: 0; top: 0; width: 632px; margin-left: -200px; margin-top: -200px; filter: grayscale(100%);" />
          <!-- Overlaid SVG scaled to exact 232px -->
          <div style="position: absolute; left: 0; top: 0; width: 232px; height: 232px; opacity: 0.65; mix-blend-mode: multiply;">
            ${svgRed}
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div>
            <strong>Reconstructed Vector SVG (Black):</strong>
            <div style="width: 116px; height: 116px; margin-top: 8px;">
              ${svgBlack}
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  await page.setContent(html);
  const outPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/05_overlay_alignment_test.png';
  await page.screenshot({ path: outPath });
  console.log('Saved overlay test to:', outPath);

  await browser.close();
})();

