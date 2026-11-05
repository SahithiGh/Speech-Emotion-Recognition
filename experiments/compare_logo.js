const puppeteer = require("puppeteer-core");
const fs = require("fs");

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  const paths = JSON.parse(fs.readFileSync("frontend/public/traced_paths.json"));

  const svgContent = `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
${paths.map((p) => `  <path d="${p}" fill="currentColor" />`).join("\n")}
</svg>`;

  fs.writeFileSync("frontend/public/logo.svg", svgContent);
  fs.writeFileSync("frontend/public/favicon.svg", svgContent);
  console.log("Saved logo.svg and favicon.svg");

  const b64Black = fs.readFileSync("frontend/public/logo-black.png").toString("base64");
  const b64White = fs.readFileSync("frontend/public/logo-white.png").toString("base64");

  // Verify rendering on light background and dark background
  const html = `
    <!DOCTYPE html>
    <html>
    <head><style>
      body { margin: 0; font-family: sans-serif; }
      .row { display: flex; gap: 40px; padding: 30px; align-items: center; }
      .light { background: #FAF9F5; color: #0A1128; }
      .dark { background: #050811; color: #FAF9F5; }
      .item { display: flex; flex-direction: column; align-items: center; gap: 10px; }
      .svg-box { width: 120px; height: 120px; }
      .svg-box svg { width: 100%; height: 100%; }
      .small-box { width: 28px; height: 28px; }
      .small-box svg { width: 100%; height: 100%; }
    </style></head>
    <body>
      <div class="row light">
        <div class="item">
          <span>Raster PNG (Light)</span>
          <img src="data:image/png;base64,${b64Black}" width="120" height="120" />
        </div>
        <div class="item">
          <span>Vector SVG (120px)</span>
          <div class="svg-box" style="color: #0A1128;">${svgContent}</div>
        </div>
        <div class="item">
          <span>Navbar Scale (28px)</span>
          <div class="small-box" style="color: #0A1128;">${svgContent}</div>
        </div>
      </div>
      <div class="row dark">
        <div class="item">
          <span>Raster PNG (Dark)</span>
          <img src="data:image/png;base64,${b64White}" width="120" height="120" />
        </div>
        <div class="item">
          <span>Vector SVG (120px)</span>
          <div class="svg-box" style="color: #FAF9F5;">${svgContent}</div>
        </div>
        <div class="item">
          <span>Navbar Scale (28px)</span>
          <div class="small-box" style="color: #FAF9F5;">${svgContent}</div>
        </div>
      </div>
    </body>
    </html>
  `;

  await page.setContent(html);
  await page.screenshot({ path: "experiments/compare_logo_png_svg.png" });
  console.log("Screenshot saved: experiments/compare_logo_png_svg.png");
  await browser.close();
})();

