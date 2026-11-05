const puppeteer = require("puppeteer-core");

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  for (const path of ["/analyze", "/evaluation", "/model", "/about", "/faq"]) {
    await page.goto("http://127.0.0.1:5173" + path, { waitUntil: "networkidle0" });
    const name = path.replace("/", "") + "_hero.png";
    await page.screenshot({ path: "experiments/" + name, clip: { x: 0, y: 0, width: 1440, height: 450 } });
    console.log("Captured", name);
  }
  await browser.close();
})();

