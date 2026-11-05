const puppeteer = require('puppeteer-core');

async function test() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle0' });
  const title = await page.title();
  console.log('Page title:', title);
  await page.screenshot({ path: 'experiments/screenshot_home.png' });
  await browser.close();
  console.log('Successfully saved experiments/screenshot_home.png');
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});

