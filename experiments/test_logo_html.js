const fs = require('fs');
const puppeteer = require('puppeteer-core');
const path = require('path');

// Reference image
const refPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/original_logo_reference.jpg';
const refBase64 = fs.readFileSync(refPath).toString('base64');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  // Generate SVG from the exact 18 stripes
  // ViewBox: 0 0 100 100, center at (50, 50), radius R = 47
  // Angles theta for the 18 stripes:
  // Using the exact measured longitudes from original image:
  // sinThetas: [-0.974, -0.897, -0.784, -0.681, -0.560, -0.440, -0.328, -0.207, -0.095, 0.026, 0.155, 0.276, 0.397, 0.517, 0.638, 0.767, 0.888, 0.983]
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 40px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #FAF9F5; color: #0A1128; }
        h1 { font-size: 20px; margin-bottom: 24px; }
        .grid { display: flex; flex-direction: column; gap: 32px; }
        .row { display: flex; align-items: center; gap: 32px; padding: 20px; border-radius: 12px; }
        .light { background: #FAF9F5; border: 1px solid #E2E8F0; }
        .dark { background: #0A1128; color: #FAF9F5; border: 1px solid #1E293B; }
        .test-box { display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 12px; }
        .brand-preview { display: flex; align-items: center; gap: 12px; font-weight: 600; font-size: 17px; }
      </style>
    </head>
    <body>
      <h1>Logo Rendering & Optical Distinctness Test (Reference vs Vector vs PNG)</h1>
      <div class="grid">
        <div class="row light">
          <div class="test-box">
            <span>Original Uploaded (Cropped)</span>
            <div style="width: 80px; height: 80px; overflow: hidden; border-radius: 8px; border: 1px solid #ddd;">
              <img src="data:image/jpeg;base64,${refBase64}" style="width: 218px; margin-left: -69px; margin-top: -69px;" />
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  await page.setContent(html);
  console.log('HTML loaded');
  await browser.close();
})();

