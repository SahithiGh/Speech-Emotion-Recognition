const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log("=== STARTING EXACT PALETTE & THEME VERIFICATION ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("favicon.ico") && !msg.text().includes("404")) {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // 1. Initial Load at Home Page in Light Mode
    console.log("\n[1] Verifying Light Theme Tokens from bright.zip...");
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto("http://127.0.0.1:5173/analyze", { waitUntil: "networkidle0" });

    // Explicitly set light
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("ser-theme", "light");
    });
    await delay(300);

    const lightTokens = await page.evaluate(() => {
      const style = window.getComputedStyle(document.documentElement);
      return {
        bg: style.getPropertyValue("--color-background").trim().toLowerCase(),
        fg: style.getPropertyValue("--color-foreground").trim().toLowerCase(),
        primary: style.getPropertyValue("--color-primary").trim().toLowerCase(),
        secondary: style.getPropertyValue("--color-secondary").trim().toLowerCase(),
        accent: style.getPropertyValue("--color-accent").trim().toLowerCase(),
        bodyBg: window.getComputedStyle(document.body).backgroundColor,
        bodyColor: window.getComputedStyle(document.body).color,
      };
    });

    console.log("  Light Tokens:", JSON.stringify(lightTokens, null, 2));
    const passLightBg = lightTokens.bg === "#fffefa" || lightTokens.bodyBg === "rgb(255, 254, 250)";
    const passLightFg = lightTokens.fg === "#160709" || lightTokens.bodyColor === "rgb(22, 7, 9)";
    const passLightPri = lightTokens.primary === "#c4536e";
    const passLightSec = lightTokens.secondary === "#4e5d9f";
    const passLightAcc = lightTokens.accent === "#3f6a28";

    console.log(`  Light Mode Background (#fffefa): ${passLightBg ? "PASS" : "FAIL"}`);
    console.log(`  Light Mode Text (#160709): ${passLightFg ? "PASS" : "FAIL"}`);
    console.log(`  Light Mode Primary (#c4536e): ${passLightPri ? "PASS" : "FAIL"}`);
    console.log(`  Light Mode Secondary (#4e5d9f): ${passLightSec ? "PASS" : "FAIL"}`);
    console.log(`  Light Mode Accent (#3f6a28): ${passLightAcc ? "PASS" : "FAIL"}`);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "palette_light_analyze.png") });

    // 2. Test Functional Theme Toggle Button
    console.log("\n[2] Testing Theme Toggle Button in Navbar...");
    const toggleResult = await page.evaluate(() => {
      const toggleBtn = document.querySelector(".theme-toggle-btn");
      if (!toggleBtn) return { error: "Theme toggle button not found" };
      toggleBtn.click();
      return {
        themeAttr: document.documentElement.getAttribute("data-theme"),
        savedStorage: localStorage.getItem("ser-theme"),
      };
    });
    console.log("  Toggle Result:", toggleResult);
    await delay(300);

    const darkTokens = await page.evaluate(() => {
      const style = window.getComputedStyle(document.documentElement);
      return {
        bg: style.getPropertyValue("--color-background").trim().toLowerCase(),
        fg: style.getPropertyValue("--color-foreground").trim().toLowerCase(),
        primary: style.getPropertyValue("--color-primary").trim().toLowerCase(),
        secondary: style.getPropertyValue("--color-secondary").trim().toLowerCase(),
        accent: style.getPropertyValue("--color-accent").trim().toLowerCase(),
        bodyBg: window.getComputedStyle(document.body).backgroundColor,
        bodyColor: window.getComputedStyle(document.body).color,
      };
    });

    console.log("  Dark Tokens:", JSON.stringify(darkTokens, null, 2));
    const passDarkBg = darkTokens.bg === "#050400" || darkTokens.bodyBg === "rgb(5, 4, 0)";
    const passDarkFg = darkTokens.fg === "#fafafa" || darkTokens.bodyColor === "rgb(250, 250, 250)";
    const passDarkPri = darkTokens.primary === "#5b1626";
    const passDarkSec = darkTokens.secondary === "#424552";
    const passDarkAcc = darkTokens.accent === "#0d3c0e";

    console.log(`  Dark Mode Background (#050400): ${passDarkBg ? "PASS" : "FAIL"}`);
    console.log(`  Dark Mode Text (#fafafa): ${passDarkFg ? "PASS" : "FAIL"}`);
    console.log(`  Dark Mode Primary (#5b1626): ${passDarkPri ? "PASS" : "FAIL"}`);
    console.log(`  Dark Mode Secondary (#424552): ${passDarkSec ? "PASS" : "FAIL"}`);
    console.log(`  Dark Mode Accent (#0d3c0e): ${passDarkAcc ? "PASS" : "FAIL"}`);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "palette_dark_analyze.png") });

    // 3. Test Persistence across Reload
    console.log("\n[3] Testing Persistence Across Page Reload...");
    await page.reload({ waitUntil: "networkidle0" });
    await delay(300);
    const persistedTheme = await page.evaluate(() => {
      return {
        attr: document.documentElement.getAttribute("data-theme"),
        storage: localStorage.getItem("ser-theme"),
      };
    });
    console.log("  Theme after reload:", persistedTheme);
    const persistPass = persistedTheme.attr === "dark" && persistedTheme.storage === "dark";
    console.log(`  Persistence Check: ${persistPass ? "PASS" : "FAIL"}`);

    // 4. Test Navigation Across Pages in Dark Mode
    console.log("\n[4] Testing Theme Consistency across Pages...");
    const pagesToTest = [
      { name: "Evaluation", url: "http://127.0.0.1:5173/evaluation" },
      { name: "Model Info", url: "http://127.0.0.1:5173/model" },
      { name: "About", url: "http://127.0.0.1:5173/about" },
      { name: "FAQ", url: "http://127.0.0.1:5173/faq" },
      { name: "Login", url: "http://127.0.0.1:5173/login" },
    ];

    for (const p of pagesToTest) {
      await page.goto(p.url, { waitUntil: "networkidle0" });
      await delay(250);
      const themeState = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      console.log(`  Page ${p.name}: Theme is '${themeState}'`);
    }

    // 5. Toggle back to Light Mode on Login page and verify navigation back
    console.log("\n[5] Toggling back to Light Mode on Login page...");
    await page.evaluate(() => {
      const btn = document.querySelector(".theme-toggle-btn");
      if (btn) btn.click();
    });
    await delay(300);
    const loginTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    console.log(`  Login page toggled to: ${loginTheme}`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "palette_light_login.png") });

    await page.goto("http://127.0.0.1:5173/evaluation", { waitUntil: "networkidle0" });
    await delay(300);
    const evalTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    console.log(`  Navigated to Evaluation: Theme is '${evalTheme}' (persisted Light Mode)`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "palette_light_evaluation.png") });

    // 6. Check Console Errors
    console.log(`\n[6] Console Errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log("  Errors:", consoleErrors);
    }

    console.log("\n=== ALL PALETTE & THEME CHECKS COMPLETED ===");
  } catch (err) {
    console.error("Verification error:", err);
  } finally {
    await browser.close();
  }
}

run();

