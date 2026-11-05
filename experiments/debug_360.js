const puppeteer = require("puppeteer-core");

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 740 });
  await page.goto("http://127.0.0.1:5173/analyze", { waitUntil: "networkidle0" });

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

  const metrics = await page.evaluate(() => {
    const bw = document.body.clientWidth;
    const sw = document.documentElement.scrollWidth;
    const ow = document.documentElement.offsetWidth;
    const cw = document.documentElement.clientWidth;

    // Find direct children of body or wrap that stretch past 360
    const offenders = [];
    document.querySelectorAll("body, section, div, table, header, main").forEach((el) => {
      if (el.scrollWidth > 360) {
        offenders.push({ tag: el.tagName, cls: el.className, sw: el.scrollWidth, cw: el.clientWidth });
      }
    });

    return { bw, sw, ow, cw, offenders: offenders.slice(0, 15) };
  });

  console.log("360px Metrics:", JSON.stringify(metrics, null, 2));

  await browser.close();
})();

