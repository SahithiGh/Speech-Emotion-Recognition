const puppeteer = require("puppeteer-core");

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 740 });
  await page.goto("http://127.0.0.1:5173/analyze", { waitUntil: "networkidle0" });

  // Upload Happy2.wav to reproduce analyzed state
  const fileInput = await page.$("input[type=file]#multi-file-input");
  await fileInput.uploadFile("external data/sample_audio/Happy2.wav");
  const buttons = await page.$$("button");
  for (const b of buttons) {
    const txt = await page.evaluate((el) => el.textContent, b);
    if (txt.includes("Analyze Files") || txt.includes("Analyze")) {
      await b.click();
      break;
    }
  }
  await page.waitForSelector(".primary-emotion-hero", { timeout: 30000 });

  const docWidth = await page.evaluate(() => document.documentElement.clientWidth);
  console.log("Document width at 360px viewport:", docWidth);

  const overflowing = await page.evaluate(() => {
    const dw = document.documentElement.clientWidth;
    const elements = document.querySelectorAll("*");
    const results = [];
    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > dw + 1) {
        results.push({
          tag: el.tagName,
          className: el.className,
          id: el.id,
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }
    });
    return results;
  });

  console.log("Overflowing elements count:", overflowing.length);
  console.log("First 10 overflowing elements:", JSON.stringify(overflowing.slice(0, 10), null, 2));

  await browser.close();
})();

