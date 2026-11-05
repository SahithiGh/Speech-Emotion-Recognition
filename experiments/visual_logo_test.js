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
  await page.setViewport({ width: 1440, height: 1200 });

  // Generate the SVG paths for the 18 stripes
  // Center (50, 50), radius R = 46.5
  const normStripes = [
    { "leftRel": -0.991, "rightRel": -0.943 },
    { "leftRel": -0.922, "rightRel": -0.862 },
    { "leftRel": -0.822, "rightRel": -0.747 },
    { "leftRel": -0.716, "rightRel": -0.643 },
    { "leftRel": -0.598, "rightRel": -0.522 },
    { "leftRel": -0.478, "rightRel": -0.402 },
    { "leftRel": -0.367, "rightRel": -0.281 },
    { "leftRel": -0.250, "rightRel": -0.164 },
    { "leftRel": -0.133, "rightRel": -0.047 },
    { "leftRel": -0.012, "rightRel": 0.074 },
    { "leftRel": 0.109, "rightRel": 0.195 },
    { "leftRel": 0.229, "rightRel": 0.316 },
    { "leftRel": 0.350, "rightRel": 0.436 },
    { "leftRel": 0.471, "rightRel": 0.557 },
    { "leftRel": 0.591, "rightRel": 0.678 },
    { "leftRel": 0.724, "rightRel": 0.802 },
    { "leftRel": 0.845, "rightRel": 0.914 },
    { "leftRel": 0.960, "rightRel": 0.991 }
  ];

  // Function to build SVG paths
  // Each stripe is bounded by:
  // - Top and bottom circle boundary: (x-50)^2 + (y-50)^2 = R^2
  // - Left curve: xL(y) = 50 + R * leftRel * cosPhi
  // - Right curve: xR(y) = 50 + R * rightRel * cosPhi
  function generateSvg(fillColor = "currentColor") {
    const cx = 50, cy = 50, R = 46.5;
    const paths = [];

    normStripes.forEach((stripe, sIdx) => {
      // Find the y range where this stripe exists
      // The stripe exists where the center or edges are within the sphere
      // For any longitude u, the curve intersects the circle where:
      // (R*u*cosPhi)^2 + (R*sinPhi)^2 = R^2  => u^2 cos^2(phi) + sin^2(phi) = 1
      // (1 - u^2) sin^2(phi) = 1 - u^2 => only at poles (phi = +- pi/2)!
      // But in 3D projection, the stripe terminates at the top and bottom circular cap!
      // In the original reference image:
      // Outer stripes (near u = +-1) terminate earlier because they touch the silhouette!
      // Specifically, for stripe with leftRel and rightRel:
      // Max extent in y:
      // The outer edge rightRel (for left stripes) or leftRel (for right stripes)
      // touches the circle when cosPhi = 0 (top/bottom poles), or if u > 1 it's clipped.
      // But notice: at the poles, all stripes converge!
      // However, in the reference image, the top and bottom tips of the stripes end with a clean cut / taper!
      
      // Let's sample points from top to bottom along the right edge, then bottom to top along left edge:
      // Determine topY and bottomY for this stripe:
      // Notice: in the original logo, the stripes terminate near the sphere boundary.
      // The center stripes reach y = 3.5 to 96.5.
      // The outer stripes reach y = 20 to 80 (where their silhouette meets the circle).
      const avgU = (Math.abs(stripe.leftRel) + Math.abs(stripe.rightRel)) / 2;
      // In the reference image, outer stripes terminate where the circle begins:
      // The circle radius at x is y = cy +- sqrt(R^2 - (x-cx)^2)
      // For a stripe at relative position u, it meets the circle silhouette when:
      // x_edge = cx + R * u * sqrt(1 - dy^2) and (x_edge - cx)^2 + (y - cy)^2 <= R^2
      // That is always inside the circle for |u| <= 1!
      // BUT notice in the original image, the stripes don't all touch at a single point at the pole:
      // They have an upper cut-off arc and lower cut-off arc that forms the top and bottom round boundary!
      
      const maxPhi = Math.acos(Math.min(0.999, Math.pow(avgU, 1.8) * 0.45)); // smooth tapering towards poles
      const numPts = 32;
      const rightPts = [];
      const leftPts = [];

      for (let i = 0; i <= numPts; i++) {
        const t = (i / numPts) * 2 - 1; // -1 to +1
        const phi = t * (Math.PI / 2 * 0.94); // slightly inset from exact pole for crisp tip
        const cosPhi = Math.cos(phi);
        const y = cy + R * Math.sin(phi);

        // Check if inside circle
        const xR = cx + R * stripe.rightRel * cosPhi;
        const xL = cx + R * stripe.leftRel * cosPhi;

        // Ensure clamped within sphere circle
        const maxCircleX = Math.sqrt(Math.max(0, R*R - (y-cy)*(y-cy)));
        const clampedXR = Math.min(cx + maxCircleX, Math.max(cx - maxCircleX, xR));
        const clampedXL = Math.min(cx + maxCircleX, Math.max(cx - maxCircleX, xL));

        if (clampedXR > clampedXL + 0.1) {
          rightPts.push({ x: +clampedXR.toFixed(2), y: +y.toFixed(2) });
          leftPts.push({ x: +clampedXL.toFixed(2), y: +y.toFixed(2) });
        }
      }

      if (rightPts.length >= 2) {
        let dStr = `M ${rightPts[0].x} ${rightPts[0].y} `;
        for (let i = 1; i < rightPts.length; i++) {
          dStr += `L ${rightPts[i].x} ${rightPts[i].y} `;
        }
        for (let i = leftPts.length - 1; i >= 0; i--) {
          dStr += `L ${leftPts[i].x} ${leftPts[i].y} `;
        }
        dStr += 'Z';
        paths.push(`<path d="${dStr}" fill="${fillColor}" />`);
      }
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">\n${paths.join('\n')}\n</svg>`;
  }

  const svgBlack = generateSvg('#0A1128');
  const svgWhite = generateSvg('#FAF9F5');

  // Let's save a test HTML and capture screenshot
  const testHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 40px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F1EFEA; }
        .card { background: #FAF9F5; padding: 24px; border-radius: 12px; margin-bottom: 24px; border: 1px solid #E2E8F0; }
        .card.dark { background: #0A1128; color: #FAF9F5; border-color: #1E293B; }
        .sizes-row { display: flex; align-items: flex-end; gap: 32px; margin-top: 16px; }
        .size-box { display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 13px; font-family: monospace; }
        .navbar-sim { display: flex; align-items: center; gap: 14px; padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 17px; margin-top: 12px; }
        .navbar-sim.light { background: #FAF9F5; color: #0A1128; border: 1px solid #E2E8F0; }
        .navbar-sim.dark { background: #0A1128; color: #FAF9F5; border: 1px solid #1E293B; }
        .ref-crop { width: 120px; height: 120px; overflow: hidden; border-radius: 8px; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; background: #fff; }
      </style>
    </head>
    <body>
      <h2>Logo Visibility Test: Reference vs 18-Stripe Sphere Vector (28px, 32px, 36px, 38px, 40px)</h2>

      <div class="card">
        <h3>Original Uploaded Reference</h3>
        <div style="display: flex; gap: 24px; align-items: center;">
          <div class="ref-crop">
            <img src="data:image/jpeg;base64,${refBase64}" style="width: 250px; margin-left: -50px; margin-top: -50px;" />
          </div>
          <div>
            <p>Spherical silhouette composed of 18 curved vertical stripes.</p>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Light Theme Vector Logo at Navbar Sizes</h3>
        <div class="sizes-row">
          <div class="size-box">
            <div style="width: 28px; height: 28px;">${svgBlack}</div>
            <span>28px (Old)</span>
          </div>
          <div class="size-box">
            <div style="width: 32px; height: 32px;">${svgBlack}</div>
            <span>32px</span>
          </div>
          <div class="size-box">
            <div style="width: 36px; height: 36px;">${svgBlack}</div>
            <span>36px</span>
          </div>
          <div class="size-box">
            <div style="width: 38px; height: 38px;">${svgBlack}</div>
            <span>38px (Target)</span>
          </div>
          <div class="size-box">
            <div style="width: 40px; height: 40px;">${svgBlack}</div>
            <span>40px</span>
          </div>
          <div class="size-box">
            <div style="width: 72px; height: 72px;">${svgBlack}</div>
            <span>72px (Large)</span>
          </div>
        </div>

        <h4 style="margin-top: 24px;">Navbar Brand Simulation (38px)</h4>
        <div class="navbar-sim light">
          <div style="width: 38px; height: 38px; display: flex; align-items: center;">${svgBlack}</div>
          <span>Speech Emotion Recognition</span>
        </div>
      </div>

      <div class="card dark">
        <h3>Dark Theme Vector Logo at Navbar Sizes</h3>
        <div class="sizes-row">
          <div class="size-box">
            <div style="width: 28px; height: 28px;">${svgWhite}</div>
            <span>28px (Old)</span>
          </div>
          <div class="size-box">
            <div style="width: 32px; height: 32px;">${svgWhite}</div>
            <span>32px</span>
          </div>
          <div class="size-box">
            <div style="width: 36px; height: 36px;">${svgWhite}</div>
            <span>36px</span>
          </div>
          <div class="size-box">
            <div style="width: 38px; height: 38px;">${svgWhite}</div>
            <span>38px (Target)</span>
          </div>
          <div class="size-box">
            <div style="width: 40px; height: 40px;">${svgWhite}</div>
            <span>40px</span>
          </div>
          <div class="size-box">
            <div style="width: 72px; height: 72px;">${svgWhite}</div>
            <span>72px (Large)</span>
          </div>
        </div>

        <h4 style="margin-top: 24px;">Navbar Brand Simulation (Dark, 38px)</h4>
        <div class="navbar-sim dark">
          <div style="width: 38px; height: 38px; display: flex; align-items: center;">${svgWhite}</div>
          <span>Speech Emotion Recognition</span>
        </div>
      </div>
    </body>
    </html>
  `;

  await page.setContent(testHtml);
  const outPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/01_logo_visual_test.png';
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('Saved test screenshot:', outPath);

  await browser.close();
})();

