const fs = require('fs');
const puppeteer = require('puppeteer-core');
const path = require('path');

const refPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/original_logo_reference.jpg';
const refBase64 = fs.readFileSync(refPath).toString('base64');

// We have 18 stripes. Let's calibrate the exact 18 longitudes and widths
// Measured from original_logo_reference.jpg (116px diameter, centered at 0):
// Center coords relative to radius R=1:
// [-0.965, -0.895, -0.785, -0.680, -0.560, -0.440, -0.325, -0.207, -0.095, 
//   0.026,  0.150,  0.272,  0.395,  0.515,  0.635,  0.760,  0.885,  0.970]

const stripesData = [
  { center: -0.965, w: 0.045 },
  { center: -0.890, w: 0.065 },
  { center: -0.780, w: 0.075 },
  { center: -0.675, w: 0.080 },
  { center: -0.560, w: 0.080 },
  { center: -0.440, w: 0.080 },
  { center: -0.325, w: 0.086 },
  { center: -0.205, w: 0.086 },
  { center: -0.090, w: 0.086 },
  { center:  0.030, w: 0.086 },
  { center:  0.150, w: 0.086 },
  { center:  0.270, w: 0.086 },
  { center:  0.390, w: 0.086 },
  { center:  0.510, w: 0.086 },
  { center:  0.635, w: 0.080 },
  { center:  0.760, w: 0.080 },
  { center:  0.880, w: 0.070 },
  { center:  0.965, w: 0.045 }
];

function buildSphereSvg(color = "currentColor") {
  const cx = 50, cy = 50, R = 47.0;
  const paths = [];

  stripesData.forEach(s => {
    const leftU = s.center - s.w / 2;
    const rightU = s.center + s.w / 2;

    // How far vertically does this stripe extend?
    // It extends until it reaches the sphere boundary or near the pole.
    // In the reference image, the inner stripes reach almost to the pole (sinPhi ~ 0.96)
    // The outer stripes reach where their center meets the circle: cosPhi = sqrt(1 - center^2)
    // For outer stripes, maxSinPhi is sqrt(1 - center^2)
    const maxSinPhi = Math.min(0.965, Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(s.center) * 0.96, 2))));

    const N = 36;
    const rightPts = [];
    const leftPts = [];

    for (let i = 0; i <= N; i++) {
      const t = (i / N) * 2 - 1; // -1 to +1
      const sinPhi = t * maxSinPhi;
      const cosPhi = Math.sqrt(Math.max(0, 1 - sinPhi * sinPhi));
      const y = cy + R * sinPhi;

      const rawXR = cx + R * rightU * cosPhi;
      const rawXL = cx + R * leftU * cosPhi;

      // Bound within circle
      const maxCircleDist = Math.sqrt(Math.max(0, R*R - (y-cy)*(y-cy)));
      const xR = Math.min(cx + maxCircleDist, Math.max(cx - maxCircleDist, rawXR));
      const xL = Math.min(cx + maxCircleDist, Math.max(cx - maxCircleDist, rawXL));

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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">\n${paths.join('\n')}\n</svg>`;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });

  const svgBlack = buildSphereSvg('#0A1128');
  const svgWhite = buildSphereSvg('#FAF9F5');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 40px; font-family: -apple-system, sans-serif; background: #F1EFEA; }
        .card { background: #FAF9F5; padding: 28px; border-radius: 12px; margin-bottom: 24px; border: 1px solid #E2E8F0; }
        .card.dark { background: #0A1128; color: #FAF9F5; border-color: #1E293B; }
        .comparison-header { display: flex; align-items: center; gap: 40px; }
        .ref-box { width: 140px; height: 140px; overflow: hidden; border-radius: 8px; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; background: #ECE3D4; }
        .sizes-flex { display: flex; align-items: flex-end; gap: 28px; margin-top: 20px; }
        .size-unit { display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 13px; font-family: monospace; }
        .nav-bar { display: flex; align-items: center; height: 68px; padding: 0 24px; border-radius: 8px; margin-top: 16px; font-weight: 600; font-size: 17px; }
        .nav-bar.light { background: #FAF9F5; color: #0A1128; border: 1px solid #E2E8F0; }
        .nav-bar.dark { background: #0A1128; color: #FAF9F5; border: 1px solid #1E293B; }
        .brand-link { display: flex; align-items: center; gap: 12px; text-decoration: none; color: inherit; }
      </style>
    </head>
    <body>
      <h2>Refined Vector Logo: 18 Tapered Spindle Stripes</h2>

      <div class="card">
        <h3>Side-by-Side: Reference Image vs Vector Reconstruction (Large)</h3>
        <div class="comparison-header">
          <div style="text-align: center;">
            <div class="ref-box">
              <img src="data:image/jpeg;base64,${refBase64}" style="width: 270px; margin-left: -53px; margin-top: -53px;" />
            </div>
            <span style="font-size: 12px; font-weight: 600;">Original Reference (116px)</span>
          </div>
          <div style="text-align: center;">
            <div style="width: 140px; height: 140px; display: flex; align-items: center; justify-content: center; background: #ECE3D4; border-radius: 8px; border: 1px solid #ccc;">
              <div style="width: 116px; height: 116px;">${svgBlack}</div>
            </div>
            <span style="font-size: 12px; font-weight: 600;">Vector SVG (116px, Exact Size)</span>
          </div>
          <div style="text-align: center;">
            <div style="width: 140px; height: 140px; display: flex; align-items: center; justify-content: center; background: #FAF9F5; border-radius: 8px; border: 1px solid #ccc;">
              <div style="width: 116px; height: 116px;">${svgBlack}</div>
            </div>
            <span style="font-size: 12px; font-weight: 600;">Transparent on Website Light (#FAF9F5)</span>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Light Theme Navbar Sizes (28px vs 32px vs 36px vs 38px vs 40px)</h3>
        <div class="sizes-flex">
          <div class="size-unit">
            <div style="width: 28px; height: 28px;">${svgBlack}</div>
            <span>28px</span>
          </div>
          <div class="size-unit">
            <div style="width: 32px; height: 32px;">${svgBlack}</div>
            <span>32px</span>
          </div>
          <div class="size-unit">
            <div style="width: 36px; height: 36px;">${svgBlack}</div>
            <span>36px</span>
          </div>
          <div class="size-unit" style="border: 2px solid #2563EB; padding: 4px; border-radius: 6px;">
            <div style="width: 38px; height: 38px;">${svgBlack}</div>
            <span style="font-weight: bold; color: #2563EB;">38px (Optimal)</span>
          </div>
          <div class="size-unit">
            <div style="width: 40px; height: 40px;">${svgBlack}</div>
            <span>40px</span>
          </div>
        </div>

        <h4 style="margin-top: 24px; margin-bottom: 8px;">Navbar Simulation (Light Mode, 38px Logo)</h4>
        <div class="nav-bar light">
          <div class="brand-link">
            <div style="width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;">${svgBlack}</div>
            <span>Speech Emotion Recognition</span>
          </div>
        </div>
      </div>

      <div class="card dark">
        <h3>Dark Theme Navbar Sizes (38px Logo)</h3>
        <div class="sizes-flex">
          <div class="size-unit">
            <div style="width: 28px; height: 28px;">${svgWhite}</div>
            <span>28px</span>
          </div>
          <div class="size-unit">
            <div style="width: 32px; height: 32px;">${svgWhite}</div>
            <span>32px</span>
          </div>
          <div class="size-unit">
            <div style="width: 36px; height: 36px;">${svgWhite}</div>
            <span>36px</span>
          </div>
          <div class="size-unit" style="border: 2px solid #60A5FA; padding: 4px; border-radius: 6px;">
            <div style="width: 38px; height: 38px;">${svgWhite}</div>
            <span style="font-weight: bold; color: #60A5FA;">38px (Optimal)</span>
          </div>
          <div class="size-unit">
            <div style="width: 40px; height: 40px;">${svgWhite}</div>
            <span>40px</span>
          </div>
        </div>

        <h4 style="margin-top: 24px; margin-bottom: 8px;">Navbar Simulation (Dark Mode, 38px Logo)</h4>
        <div class="nav-bar dark">
          <div class="brand-link">
            <div style="width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;">${svgWhite}</div>
            <span>Speech Emotion Recognition</span>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  await page.setContent(html);
  const outPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/04_spindle_vector_comparison.png';
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('Saved spindle vector comparison to:', outPath);

  await browser.close();
})();

