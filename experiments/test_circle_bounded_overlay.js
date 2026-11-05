const fs = require('fs');
const puppeteer = require('puppeteer-core');

const refPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/original_logo_reference.jpg';
const refBase64 = fs.readFileSync(refPath).toString('base64');

// Exact 18 stripes. Each stripe extends until it touches the sphere circle radius R.
const stripesData = [
  { center: -0.968, w: 0.038 },
  { center: -0.892, w: 0.054 },
  { center: -0.782, w: 0.068 },
  { center: -0.678, w: 0.076 },
  { center: -0.560, w: 0.082 },
  { center: -0.440, w: 0.086 },
  { center: -0.325, w: 0.088 },
  { center: -0.205, w: 0.088 },
  { center: -0.090, w: 0.088 },
  { center:  0.030, w: 0.088 },
  { center:  0.150, w: 0.088 },
  { center:  0.270, w: 0.088 },
  { center:  0.390, w: 0.088 },
  { center:  0.510, w: 0.086 },
  { center:  0.635, w: 0.082 },
  { center:  0.760, w: 0.076 },
  { center:  0.880, w: 0.068 },
  { center:  0.965, w: 0.038 }
];

function buildSphereSvg(color = "currentColor", R = 48.0) {
  const cx = 50, cy = 50;
  const paths = [];

  stripesData.forEach(s => {
    const leftU = s.center - s.w / 2;
    const rightU = s.center + s.w / 2;

    // At horizontal position s.center * R, the circle boundary is at:
    // maxY = cy + sqrt(R^2 - (center*R)^2)
    const circleHalfHeight = Math.sqrt(Math.max(0, R*R - Math.pow(Math.abs(s.center) * R, 2)));

    // Let the stripe extend almost to the circle boundary (tapering to a fine tip)
    const N = 48;
    const rightPts = [];
    const leftPts = [];

    for (let i = 0; i <= N; i++) {
      const t = (i / N) * 2 - 1; // -1 to +1
      const y = cy + circleHalfHeight * t * 0.99; // 99% of circle half-height for needle tip
      const dy = (y - cy) / R;
      const cosPhi = Math.sqrt(Math.max(0, 1 - dy * dy));

      const rawXR = cx + R * rightU * cosPhi;
      const rawXL = cx + R * leftU * cosPhi;

      // Bound strictly within the sphere circle
      const maxCircleX = Math.sqrt(Math.max(0, R*R - (y-cy)*(y-cy)));
      const xR = Math.min(cx + maxCircleX, Math.max(cx - maxCircleX, rawXR));
      const xL = Math.min(cx + maxCircleX, Math.max(cx - maxCircleX, rawXL));

      if (xR > xL + 0.05) {
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

  const svgRed = buildSphereSvg('#FF0000', 48.0);
  const svgBlack = buildSphereSvg('#0A1128', 48.0);

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="margin: 0; padding: 40px; background: #FAF9F5; font-family: sans-serif;">
      <h2>Circle-Bounded Spindle Overlay Alignment Test</h2>
      
      <div style="display: flex; gap: 40px; align-items: center;">
        <div style="position: relative; width: 232px; height: 232px; border: 1px solid #ccc; background: #fff;">
          <img src="data:image/jpeg;base64,${refBase64}" style="position: absolute; left: 0; top: 0; width: 632px; margin-left: -200px; margin-top: -200px; filter: grayscale(100%);" />
          <div style="position: absolute; left: 0; top: 0; width: 232px; height: 232px; opacity: 0.65; mix-blend-mode: multiply;">
            ${svgRed}
          </div>
        </div>

        <div>
          <strong>Reconstructed Vector SVG (Black):</strong>
          <div style="width: 140px; height: 140px; margin-top: 8px;">
            ${svgBlack}
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  await page.setContent(html);
  const outPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/06_circle_bounded_overlay.png';
  await page.screenshot({ path: outPath });
  console.log('Saved circle bounded overlay to:', outPath);

  await browser.close();
})();

