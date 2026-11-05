const puppeteer = require("puppeteer-core");
const fs = require("fs");

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();

  const b64Black = fs.readFileSync("frontend/public/logo-black.png").toString("base64");
  const b64White = fs.readFileSync("frontend/public/logo-white.png").toString("base64");

  const html = `
    <!DOCTYPE html>
    <html>
    <head><style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .row { display: flex; gap: 40px; padding: 30px; align-items: center; }
      .light { background: #FAF9F5; color: #0A1128; }
      .dark { background: #050811; color: #FAF9F5; }
      .item { display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 13px; }
      .brand-preview { display: flex; align-items: center; gap: 12px; font-weight: 600; font-size: 18px; }
      .brand-preview img { display: block; object-fit: contain; }
    </style></head>
    <body>
      <div class="row light">
        <div class="item">
          <span>Clean Transparent Symbol (142px)</span>
          <img src="data:image/png;base64,${b64Black}" width="142" height="142" />
        </div>
        <div class="item">
          <span>Medium (56px)</span>
          <img src="data:image/png;base64,${b64Black}" width="56" height="56" />
        </div>
        <div class="item">
          <span>Navbar Size (28px)</span>
          <img src="data:image/png;base64,${b64Black}" width="28" height="28" />
        </div>
        <div class="item">
          <span>Navbar Brand Simulation (Light)</span>
          <div class="brand-preview">
            <img src="data:image/png;base64,${b64Black}" width="28" height="28" />
            <span>Speech Emotion Recognition</span>
          </div>
        </div>
      </div>
      <div class="row dark">
        <div class="item">
          <span>Clean Transparent Symbol (142px)</span>
          <img src="data:image/png;base64,${b64White}" width="142" height="142" />
        </div>
        <div class="item">
          <span>Medium (56px)</span>
          <img src="data:image/png;base64,${b64White}" width="56" height="56" />
        </div>
        <div class="item">
          <span>Navbar Size (28px)</span>
          <img src="data:image/png;base64,${b64White}" width="28" height="28" />
        </div>
        <div class="item">
          <span>Navbar Brand Simulation (Dark)</span>
          <div class="brand-preview">
            <img src="data:image/png;base64,${b64White}" width="28" height="28" />
            <span>Speech Emotion Recognition</span>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  await page.setContent(html);
  await page.screenshot({ path: "C:\\Users\\JAI-SREE-RAM\\.gemini\\antigravity\\brain\\cb96c2cc-5be4-4858-b66a-ba5c125cf3fc\\preview_clean_transparent_logo.png" });
  console.log("Screenshot saved: preview_clean_transparent_logo.png");
  await browser.close();
})();

