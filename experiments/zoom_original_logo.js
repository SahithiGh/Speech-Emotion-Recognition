const fs = require('fs');
const puppeteer = require('puppeteer-core');

const refPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/original_logo_reference.jpg';
const refBase64 = fs.readFileSync(refPath).toString('base64');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 800 });

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="margin: 0; background: #eee; padding: 20px;">
      <div style="width: 464px; height: 468px; overflow: hidden; border: 1px solid #999;">
        <img src="data:image/jpeg;base64,${refBase64}" style="image-rendering: pixelated; width: 1264px; margin-left: -400px; margin-top: -400px;" />
      </div>
    </body>
    </html>
  `;
  await page.setContent(html);
  const outPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/02_original_logo_zoomed.png';
  await page.screenshot({ path: outPath });
  console.log('Saved zoomed view to:', outPath);

  await browser.close();
})();
