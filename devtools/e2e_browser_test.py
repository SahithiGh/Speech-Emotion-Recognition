"""Developer-only browser test. Needs:  pip install playwright  (+ a Chromium: playwright install chromium, or set CHROMIUM_PATH)
Optional accessibility scan:  --axe path/to/axe.min.js   (npm install axe-core)

It starts the real backend and website against a TEMPORARY SER_HOME folder. The temporary data are generated tones used
only to exercise the software; the resulting model is deleted afterwards and is never a CREMA-D result.
Usage:  python devtools/e2e_browser_test.py [--axe PATH] [--shots DIR]
"""
import argparse
import os
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "tests"))
from conftest import make_tone_dataset, tone, wav_bytes  # noqa: E402
import numpy as np  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--axe")
ap.add_argument("--shots", default=str(Path(tempfile.gettempdir()) / "ser_shots"))
args = ap.parse_args()
Path(args.shots).mkdir(parents=True, exist_ok=True)
home = Path(tempfile.mkdtemp(prefix="ser_e2e_"))
env = {**os.environ, "SER_HOME": str(home)}
RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""), flush=True)


def wait(url, tries=60):
    for _ in range(tries):
        try:
            urllib.request.urlopen(url, timeout=2); return True
        except Exception:
            time.sleep(0.5)
    return False


procs = []
def spawn(cmd, cwd):
    p = subprocess.Popen(cmd, cwd=cwd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    procs.append(p); return p


def killall():
    for p in procs:
        try: os.killpg(p.pid, signal.SIGTERM)
        except Exception: pass


ROUTES = ["/", "/analyze", "/evaluation", "/model", "/about", "/faq", "/contact", "/privacy", "/terms", "/nope"]
try:
    from playwright.sync_api import sync_playwright
    api = spawn([sys.executable, "-m", "uvicorn", "app.main:app", "--port", "8000"], ROOT / "backend")
    web = spawn(["npx", "vite", "--host", "127.0.0.1"], ROOT / "frontend")
    check("backend and website start", wait("http://127.0.0.1:8000/api/health") and wait("http://127.0.0.1:5173/"))
    B = "http://127.0.0.1:5173"
    tmp = home / "clips"; tmp.mkdir()
    (tmp / "good.wav").write_bytes(wav_bytes(tone(230, seconds=2)))
    (tmp / "silent.wav").write_bytes(wav_bytes(np.zeros(32000)))
    (tmp / "fake.wav").write_bytes(b"not audio" * 500)
    (tmp / "story.wav").write_bytes(wav_bytes(np.concatenate([tone(180, seconds=2.0), np.zeros(32000, dtype=np.float32), tone(300, seconds=1.0, seed=3)])))   # tone 0-2 s, silence 2-4 s, tone 4-5 s
    (tmp / "tiny.wav").write_bytes(wav_bytes(tone(230, seconds=0.2)))
    (tmp / "clipped.wav").write_bytes(wav_bytes(np.clip(tone(230, seconds=2, amp=4.0), -1, 1)))
    exe = os.environ.get("CHROMIUM_PATH")
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path=exe, args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        logs = []
        external = []

        def make_page():
            """A fresh browser context per section: one browser instance runs out of resources after about 100 full dev-mode page loads."""
            c_ = br.new_context(viewport={"width": 1280, "height": 900}, permissions=["microphone"])
            p_ = c_.new_page()
            p_.on("request", lambda r: external.append(r.url) if not (r.url.startswith("http://127.0.0.1:5173") or r.url.startswith("http://127.0.0.1:8000") or r.url.startswith("data:") or r.url.startswith("blob:")) else None)
            p_.on("console", lambda m: logs.append(m.text) if m.type == "error" else None)
            p_.on("pageerror", lambda e: logs.append("PAGEERROR " + str(e)))
            return c_, p_
        ctx, pg = make_page()

        # ---------- exact palette applied in both themes (read from the rendered page) ----------
        import base64
        PAL = {"light": {"background": "#FFFEFA", "foreground": "#160709", "primary": "#C4536E", "secondary": "#4E5D9F", "accent": "#3F6A28"},
               "dark": {"background": "#050400", "foreground": "#FAFAFA", "primary": "#5B1626", "secondary": "#424552", "accent": "#0D3C0E"}}
        rgb = lambda h: "rgb(%d, %d, %d)" % tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
        pg.goto(B + "/analyze"); pg.wait_for_selector("h1")
        for theme, pal in PAL.items():
            pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
            got = pg.evaluate("n => { const s = getComputedStyle(document.documentElement); return Object.fromEntries(n.map(k => [k, s.getPropertyValue('--color-' + k).trim().toUpperCase()])) }", list(pal))
            check(f"{theme} theme: exact palette tokens", got == pal, str(got))
            check(f"{theme} theme: page background and text are the exact palette colours",
                  pg.evaluate("[getComputedStyle(document.body).backgroundColor, getComputedStyle(document.body).color]") == [rgb(pal["background"]), rgb(pal["foreground"])])
        pg.evaluate("document.documentElement.setAttribute('data-theme','light')")

        # ---------- A: model not trained ----------
        pg.goto(B + "/"); pg.wait_for_selector(".hero-meta")
        pg.wait_for_function("document.querySelector('.hero-meta').innerText.includes('Model not trained yet')")
        check("A home says model not trained", "Model not trained yet" in pg.inner_text(".hero-meta"))
        check("A header badge says model not trained", "Model not trained" in pg.inner_text(".badge"))
        pg.goto(B + "/evaluation"); pg.wait_for_selector(".empty")
        t = pg.inner_text("main")
        check("A evaluation shows 'Model not trained yet' and no metrics", "Model not trained yet" in t and "%" not in t, t[:80])
        pg.goto(B + "/model"); pg.wait_for_selector("h1"); pg.wait_for_function("document.querySelector('main').innerText.includes('Model not trained yet')")
        mt = pg.inner_text("main")
        check("A model page shows unavailable values and no importance table when untrained", "unavailable" in mt and "Not available yet" in mt and pg.locator("table.data").count() == 0)
        pg.goto(B + "/analyze"); pg.wait_for_selector(".banner.warn")
        pg.set_input_files("#file", str(tmp / "good.wav")); pg.wait_for_selector("text=Analyze audio")
        check("A analyze button disabled until trained", pg.locator("button.primary").first.is_disabled())

        # ---------- train on temporary tones ----------
        make_tone_dataset(home / "data" / "AudioWAV", speakers=20, reps=2)
        r = subprocess.run([sys.executable, "train.py", "--skip-manifest-check", "--folds", "3", "--jobs", "2"], cwd=ROOT / "backend", env=env, capture_output=True, text=True)
        check("temporary training run succeeds", r.returncode == 0, r.stdout[-300:] + r.stderr[-300:])

        # ---------- B: trained ----------
        pg.goto(B + "/"); pg.wait_for_function("document.querySelector('.hero-meta').innerText.includes('macro F1')")
        check("B home shows measured macro F1 and unverified-data note", "not verified" in pg.inner_text(".hero-meta"))
        pg.goto(B + "/analyze")
        for f, expect in (("fake.wav", "could not be read"), ("tiny.wav", "only")):
            pg.set_input_files("#file", str(tmp / f)); pg.wait_for_selector(".error")
            check(f"B {f} rejected with a helpful message", expect in pg.inner_text(".error"), pg.inner_text(".error"))
        pg.set_input_files("#file", str(tmp / "silent.wav")); pg.wait_for_selector("text=Analyze audio"); pg.click("button.primary")
        pg.wait_for_selector(".error:has-text('silent')")
        check("B silent audio gives silence message from server", True)
        check("B waveform and duration shown after loading", pg.locator(".waveform").count() == 1)
        pg.set_input_files("#file", str(tmp / "clipped.wav")); pg.wait_for_selector("button.primary:not([disabled])"); pg.click("button.primary")
        pg.wait_for_selector(".r-emotion")
        check("B upload analyzed: six scores shown", pg.locator(".scores li").count() == 6)
        check("B clipping note shown", "clipped" in pg.inner_text(".result"))
        check("B warning about estimates shown", "estimate" in pg.inner_text(".result").lower())
        res_text = pg.inner_text(".result")
        check("B result shows Highest tag, model details and score explanation", "Highest" in res_text and "Model ID" in res_text and "not calibrated probabilities" in res_text)
        check("B result has a text table equivalent of the chart", pg.locator(".result .sr-only table tbody tr").count() == 6)
        check("B uncertainty comes from validation evidence (or says none is available)", "validat" in res_text.lower(), res_text[:600])
        pg.screenshot(path=f"{args.shots}/result_light.png", full_page=True)
        pg.evaluate("document.documentElement.setAttribute('data-theme','dark')"); pg.screenshot(path=f"{args.shots}/result_dark.png", full_page=True)
        pg.evaluate("document.documentElement.setAttribute('data-theme','light')")
        pg.click("text=Analyze another recording"); pg.wait_for_selector("role=tab")

        # ---------- advanced features: spectrogram, timeline, transcript, report ----------
        import csv as _csv, io as _io, json as _json
        pg.set_input_files("#file", str(tmp / "story.wav")); pg.wait_for_selector("button.primary:not([disabled])"); pg.click("button.primary"); pg.wait_for_selector(".r-emotion")
        shown_text_for_time = pg.inner_text(".result")
        shown_emotion = pg.inner_text(".r-emotion").strip().lower()
        shown_scores = {r.locator("th").inner_text().strip().lower(): r.locator("td").inner_text().strip() for r in pg.locator(".result .sr-only table tbody tr").all()}
        check("advanced sections are collapsed by default", pg.locator(".advanced details[open]").count() == 0)
        # spectrogram
        pg.click(".advanced summary:has-text('Spectrogram')"); pg.wait_for_selector("canvas[role=img]")
        pg.wait_for_function("document.querySelector('.spec-y span') !== null")
        cols = pg.evaluate("""() => { const c = document.querySelector('.spec canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const out = [];
            for (let x = 0; x < c.width; x++) { let s = 0; for (let y = 0; y < c.height; y++) { const o = (y * c.width + x) * 4; s += (d[o] + d[o + 1] + d[o + 2]) / 3; } out.push(s / c.height); } return out }""")
        px = lambda t: int(t / 5.0 * 960)
        tone_part = sum(cols[px(0.3):px(1.7)]) / (px(1.7) - px(0.3)); quiet_part = sum(cols[px(2.3):px(3.7)]) / (px(3.7) - px(2.3)); tone2 = sum(cols[px(4.2):px(4.8)]) / (px(4.8) - px(4.2))
        check("spectrogram is drawn from the audio: tone and silence regions differ at the right times", abs(tone_part - quiet_part) > 15 and abs(tone2 - quiet_part) > 15, f"{tone_part:.1f} {quiet_part:.1f} {tone2:.1f}")
        check("spectrogram has frequency and time axes, a level legend and an honest label", "kHz" in pg.inner_text(".spec-plot") and "5" in pg.inner_text(".spec-x") and "dB" in pg.inner_text(".legend") and "not an emotion prediction" in pg.inner_text(".spec"))
        pg.hover(".spec canvas"); check("spectrogram hover reads out time, frequency and level", " dB" in pg.inner_text(".spec p[aria-live]"))
        pg.evaluate("(() => { const i = document.querySelectorAll('.spec input[type=range]')[1]; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 2.5); i.dispatchEvent(new Event('input', {bubbles: true})); })()")
        pg.wait_for_function("document.querySelectorAll('.spec .range-row .mono')[1].innerText.includes('2.5')")
        check("spectrogram time range can be narrowed and reset", pg.locator("button:has-text('Show whole clip')").is_enabled())
        pg.click("button:has-text('Show whole clip')")
        # timeline
        pg.click(".advanced summary:has-text('Emotion timeline')"); pg.click("button:has-text('Analyze timeline')"); pg.wait_for_selector(".tl-track button")
        ui_segments = [(r.locator("th").inner_text().strip(), r.locator("td").nth(0).inner_text().strip(), r.locator("td").nth(1).inner_text().strip().lower()) for r in pg.locator(".tl-detail ~ div, .timeline table tbody tr").all()]
        ui_segments = [(r.locator("th").inner_text().strip(), r.locator("td").nth(0).inner_text().strip(), r.locator("td").nth(1).inner_text().strip().lower()) for r in pg.locator(".timeline table tbody tr").all()]
        check("timeline shows 4 segments with the original timestamps", [x[0] for x in ui_segments] == ["0.0 to 2.0 s", "1.0 to 3.0 s", "2.0 to 4.0 s", "3.0 to 5.0 s"], str(ui_segments))
        check("timeline marks the silent window as silent and does not classify it", ui_segments[2][1] == "silent" and ui_segments[2][2] == "none")
        direct = ctx.request.post("http://127.0.0.1:8000/api/timeline", multipart={"file": {"name": "story.wav", "mimeType": "audio/wav", "buffer": (tmp / "story.wav").read_bytes()}, "window_s": "2", "hop_s": "1"}).json()
        check("timeline in the UI equals the real model output from the API", [(f"{s['start']:.1f} to {s['end']:.1f} s", s["status"].replace("_", " "), s["emotion"] or "none") for s in direct["segments"]] == [(a, b, c) for a, b, c in ui_segments])
        pg.click(".tl-track button >> nth=0"); pg.wait_for_selector(".tl-detail")
        check("selecting a segment shows its start, end, prediction and scores", "0.0 to 2.0 s" in pg.inner_text(".tl-detail") and pg.locator(".tl-detail dl div").count() == 6)
        check("timeline states that segment estimates are unreliable", "not evaluated on short windows" in pg.inner_text(".timeline"))
        # transcription (no engine configured in this environment)
        pg.click(".advanced summary:has-text('Transcript')"); pg.wait_for_selector(".advanced .banner.warn")
        check("transcription is honestly reported as unavailable, with no transcript", "unavailable" in pg.inner_text(".advanced").lower() and pg.locator(".transcript").count() == 0 and pg.locator("button:has-text('Transcribe speech')").count() == 0)
        # accessibility of the result page with everything open, both themes, and mobile overflow
        if args.axe:
            for theme in ("light", "dark"):
                pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')"); pg.wait_for_timeout(300)
                pg.add_script_tag(content=Path(args.axe).read_text())
                res = pg.evaluate("axe.run(document, {runOnly:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']})")
                v = [(x["id"], [(n["target"], (n.get("any") or [{}])[0].get("message", "")[:90]) for n in x["nodes"][:3]]) for x in res["violations"]]
                check(f"axe {theme} result page with spectrogram, timeline and transcript open: no violations", not v, str(v))
                pg.screenshot(path=f"{args.shots}/advanced_{theme}.png", full_page=True)
        pg.evaluate("document.documentElement.setAttribute('data-theme','light')")
        for w in (390, 375):
            pg.set_viewport_size({"width": w, "height": 800}); pg.wait_for_timeout(250)
            off = pg.evaluate("[...document.querySelectorAll('main *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('.table-scroll')).slice(0, 5).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right))")
            check(f"no horizontal overflow at {w}px with advanced views open", not pg.evaluate("document.documentElement.scrollWidth > innerWidth + 1"), str(off))
        pg.set_viewport_size({"width": 1280, "height": 900})
        # report
        with pg.expect_download() as dl:
            pg.click("button:has-text('Download report (JSON)')")
        raw = Path(dl.value.path()).read_text(); rep = _json.loads(raw)
        check("JSON report matches the displayed prediction and all six scores", rep["prediction"]["closest_emotion"] == shown_emotion and all(f"{rep['prediction']['scores'][k] * 100:.1f}%" == v for k, v in shown_scores.items()), str(shown_scores))
        check("JSON report contains the timeline that was run, model details and limitations", len(rep["timeline"]["segments"]) == 4 and rep["model"]["dataset"] == "CREMA-D" and len(rep["limitations"]) >= 4 and rep["transcript"] is None)
        check("report contains no file name, path or audio", "story.wav" not in raw and "/tmp" not in raw and "/mnt" not in raw and "RIFF" not in raw)
        with pg.expect_download() as dl2:
            pg.click("button:has-text('Download report (CSV)')")
        rows = list(_csv.DictReader(_io.StringIO(Path(dl2.value.path()).read_text())))
        csv_scores = {r["name"]: float(r["value"]) for r in rows if r["section"] == "overall_score"}
        check("CSV report parses and its scores equal the JSON report", set(csv_scores) == set(rep["prediction"]["scores"]) and all(abs(csv_scores[k] - rep["prediction"]["scores"][k]) < 1e-9 for k in csv_scores))
        check("CSV report lists every segment with its start and end", sorted({(r["start_seconds"], r["end_seconds"]) for r in rows if r["section"] == "segment_status"}) == sorted({(str(float(s["start"])), str(float(s["end"]))) for s in rep["timeline"]["segments"]}) or len([r for r in rows if r["section"] == "segment_status"]) == 4)
        pg.click("text=Analyze another recording"); pg.wait_for_selector("role=tab")
        check("B result shows measured processing time", "Processing time" in shown_text_for_time and " ms" in shown_text_for_time)
        pg.goto(B + "/model"); pg.wait_for_selector("h1"); pg.wait_for_selector("table.data")
        mt = pg.inner_text("main")
        check("B model page shows license, architecture, pipeline and limitations", all(x in mt for x in ("Open Database License", "StandardScaler", "Intended use and limitations", "Reproduce training")), mt[:200])
        check("B model page shows 9 feature groups with an honest caveat", pg.locator("table.data tbody tr").count() == 9 and "does not explain an individual prediction" in mt)
        pg.goto(B + "/analyze"); pg.wait_for_selector("role=tab")
        pg.click("summary:has-text('Example recordings')")
        check("no example recordings installed: honest empty state", "No example recordings are installed" in pg.inner_text(".samples"))
        # TEST FIXTURE ONLY: a generated tone served through an intercepted manifest, to exercise the sample-loading mechanism
        import json as __j
        pg.route("**/samples/manifest.json", lambda r: r.fulfill(status=200, content_type="application/json", body=__j.dumps({"samples": [{"id": "t1", "title": "Test tone", "file": "t1.wav", "description": "Generated tone used only by the software test", "source": "generated by the test", "license": "none (test fixture)"}]})))
        pg.route("**/samples/t1.wav", lambda r: r.fulfill(status=200, content_type="audio/wav", body=(tmp / "good.wav").read_bytes()))
        pg.reload(); pg.wait_for_selector("role=tab"); pg.click("summary:has-text('Example recordings')"); pg.wait_for_selector(".sample-list")
        check("example is labelled as an example with source, license and a no-accuracy-claim note", all(x in pg.inner_text(".sample-list") for x in ("(example)", "Source:", "License:", "not evidence of model accuracy")))
        pg.click("button:has-text('Use this example')"); pg.wait_for_selector(".player"); check("an example loads into the normal analysis flow", "Test tone" in pg.inner_text(".p-head"))
        pg.click("button.primary"); pg.wait_for_selector(".r-emotion"); check("an example is analyzed by the real inference pipeline", pg.locator(".scores li").count() == 6)
        pg.unroute("**/samples/manifest.json"); pg.unroute("**/samples/t1.wav")
        pg.click("text=Analyze another recording"); pg.wait_for_selector("role=tab")
        good_b64 = base64.b64encode((tmp / "good.wav").read_bytes()).decode()
        drop_js = """([b64, name, count]) => { const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const dt = new DataTransfer();
            for (let i = 0; i < count; i++) dt.items.add(new File([bytes], name, {type: 'audio/wav'}));
            const z = document.querySelector('.dropzone'); z.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true, cancelable: true}));
            const over = z.className; z.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true})); return over }"""
        over_cls = pg.evaluate(drop_js, [good_b64, "dropped.wav", 2])
        pg.wait_for_selector(".error")
        pg.evaluate("document.querySelector('.dropzone')?.dispatchEvent(new DragEvent('dragover', {dataTransfer: new DataTransfer(), bubbles: true, cancelable: true}))")
        pg.wait_for_function("document.querySelector('.dropzone').className.includes('over')")
        over_cls = pg.get_attribute(".dropzone", "class")
        check("B drag-over highlights the drop zone", "over" in over_cls)
        check("B dropping two files is refused with a message", "one audio file" in pg.inner_text(".error"))
        pg.evaluate(drop_js, [good_b64, "dropped.wav", 1]); pg.wait_for_selector(".player")
        check("B drag-and-drop loads the file and shows name, duration and size", "dropped.wav" in pg.inner_text(".p-head") and " s | " in pg.inner_text(".p-head"))
        pg.set_input_files("#file", str(tmp / "good.wav")); pg.wait_for_function("document.querySelector('.p-name')?.innerText === 'good.wav'")
        check("B Replace file swaps the loaded file", True)
        pg.click("button:has-text('Replay')"); pg.wait_for_timeout(300)
        check("B Replay starts playback from the start", pg.evaluate("(() => { const a = document.querySelector('audio'); return !a.paused || a.currentTime > 0 })()"))
        pg.click("button:has-text('Clear')"); pg.wait_for_selector(".player", state="detached")
        check("B Clear removes the file", pg.locator(".player").count() == 0)
        pg.focus("role=tab[name='Upload a file']"); pg.keyboard.press("ArrowRight")
        check("B tabs work with arrow keys", pg.get_attribute("#tab-record", "aria-selected") == "true")
        pg.click("text=Start recording"); pg.wait_for_timeout(2500)
        check("B recording shows timer and level meter", "Recording" in pg.inner_text("span.hint") and pg.locator(".meter").count() == 1)
        pg.click("text=Stop recording"); pg.wait_for_selector("audio")
        check("B recording can be played back before analysis", pg.locator("audio").count() == 1)
        check("B recording shows Replay and Discard", pg.locator("button:has-text('Replay')").count() == 1 and pg.locator("button:has-text('Discard')").count() == 1)
        pg.click("button.primary"); pg.wait_for_selector(".r-emotion,.error", timeout=30000)
        check("B recording analyzed", pg.locator(".r-emotion").count() == 1)
        pg.goto(B + "/evaluation"); pg.wait_for_selector(".cm")
        t = pg.inner_text("main")
        check("B evaluation shows unverified-dataset warning", "NOT verified" in t)
        check("B evaluation shows confusion matrix 6x6 and per-class table", pg.locator(".cm").first.locator("tbody tr").count() == 6 and pg.locator("table.data").count() >= 3)
        check("B evaluation has metric explanations, reliability table and a link to Model information", all(x in t for x in ("Model information", "What these numbers mean", "Unweighted average recall", "How reliable are high and low scores")))
        check("B evaluation shows no zero placeholders for missing values", "NaN" not in t and "undefined" not in t)
        pg.screenshot(path=f"{args.shots}/evaluation_light.png", full_page=True)


        ctx.close(); ctx, pg = make_page()
        # ---------- homepage hero: typography first, full-viewport video second ----------
        px_rgba = lambda c: c in ("rgba(0, 0, 0, 0)", "transparent")
        for vw, vh in ((1440, 900), (1280, 720), (768, 1024), (390, 844), (375, 667)):
            pg.set_viewport_size({"width": vw, "height": vh}); pg.goto(B + "/"); pg.wait_for_selector(".hero-title"); pg.wait_for_timeout(700)
            g = pg.evaluate("""() => { const r = e => document.querySelector(e).getBoundingClientRect(); const v = r('.hero-video video'), s = r('.hero-video'), h = r('.hero-title'), a = r('.hero-actions'), l = r('.hero-lead'), t = r('.hero-video-toggle'), m = document.querySelector('.menu-btn') ? r('.menu-btn') : null, hd = r('.site-header');
                return {vw: innerWidth, vh: innerHeight, video: [v.left, v.top, v.width, v.height], sec: [s.top, s.height], h1: [h.left, h.top, h.right, h.bottom], hfs: parseFloat(getComputedStyle(document.querySelector('.hero-title')).fontSize), lfs: parseFloat(getComputedStyle(document.querySelector('.hero-lead')).fontSize), actions: [a.top, a.bottom], lead: [l.top, l.bottom], toggle: [t.left, t.top, t.right, t.bottom], menu: m ? [m.left, m.top, m.right, m.bottom] : null, headerH: hd.height, scrollW: document.documentElement.scrollWidth} }""")
            tag = f"{vw}x{vh}"
            check(f"hero {tag}: video covers the whole viewport edge to edge", g["video"][0] <= 0.5 and g["video"][1] <= 0.5 and g["video"][2] >= vw - 1 and g["video"][3] >= vh - 1, str(g["video"]))
            check(f"hero {tag}: headline is at least 4x the supporting text (3x on phones) and fits the screen", g["hfs"] >= (4 if vw > 620 else 3) * g["lfs"] and g["h1"][2] <= vw - 8, f"{g['hfs']} {g['lfs']} {g['h1']}")
            check(f"hero {tag}: headline sits upper-left, actions sit lower, below the headline", g["h1"][0] < 0.12 * vw + 40 and g["h1"][3] < 0.72 * vh and g["actions"][0] > g["h1"][3] + 24 and g["actions"][1] > 0.74 * vh, str((g["h1"], g["actions"])))
            check(f"hero {tag}: pause button does not collide with the header or menu", g["toggle"][1] > g["headerH"] and (g["menu"] is None or g["toggle"][1] >= g["menu"][3] or g["toggle"][0] >= g["menu"][2] or g["toggle"][2] <= g["menu"][0]))
            check(f"hero {tag}: header stays on one row and nothing overflows horizontally", g["headerH"] < 84 and g["scrollW"] <= vw + 1, str((g["headerH"], g["scrollW"])))
            fit = pg.evaluate("[...document.querySelectorAll('.hero-btn')].every(b => { const r = document.createRange(); r.selectNodeContents(b); return r.getBoundingClientRect().right <= b.getBoundingClientRect().right - 6 })")
            check(f"hero {tag}: button labels fit inside their buttons", fit)
        pg.set_viewport_size({"width": 1440, "height": 900}); pg.goto(B + "/"); pg.wait_for_selector(".hero-title"); pg.wait_for_timeout(900)
        flat = pg.evaluate("""() => { const out = []; let n = document.querySelector('.hero-title'); const seen = []; while (n && !n.classList.contains('hero-video')) { const s = getComputedStyle(n); seen.push([n.className, s.backgroundColor, s.backgroundImage]); n = n.parentElement; }
            return {seen, texts: ['.hero-label', '.hero-title', '.hero-lead'].map(q => { const s = getComputedStyle(document.querySelector(q)); return [s.backgroundColor, s.backgroundImage] }), hero: getComputedStyle(document.querySelector('.hero-inner')).backgroundImage} }""")
        check("hero: no panel, box or gradient sits behind the headline or copy (the footage shows through)", all(px_rgba(c) and bi == "none" for _, c, bi in flat["seen"]) and all(px_rgba(c) and bi == "none" for c, bi in flat["texts"]) and flat["hero"] == "none", str(flat))
        check("hero: only the video element sits behind the text (no overlay or scrim elements)", pg.evaluate("[...document.querySelectorAll('.hero-video > *')].map(e => e.tagName).sort().join()") in ("BUTTON,DIV,VIDEO",), pg.evaluate("[...document.querySelectorAll('.hero-video > *')].map(e => e.tagName).join()"))
        pg.wait_for_function("document.querySelector('.hero-video video').currentTime > 0.8"); t1 = pg.evaluate("document.querySelector('.hero-video video').currentTime"); pg.wait_for_timeout(800); t2 = pg.evaluate("document.querySelector('.hero-video video').currentTime")
        check("hero: the video is genuinely playing", t2 > t1, f"{t1} {t2}")
        pg.click(".hero-video-toggle"); pg.wait_for_timeout(300)
        check("hero: pause control pauses and its label updates", pg.evaluate("document.querySelector('.hero-video video').paused") and pg.get_attribute(".hero-video-toggle", "aria-label") == "Play background video")
        pg.click(".hero-video-toggle"); pg.wait_for_timeout(300)
        check("hero: play control resumes", not pg.evaluate("document.querySelector('.hero-video video').paused"))
        vf = {}
        for theme in ("light", "dark"):
            pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
            vf[theme] = pg.evaluate("(() => { const s = getComputedStyle(document.querySelector('.hero-video video')); return [s.filter, s.opacity, s.mixBlendMode, s.backgroundColor, s.transform] })()")
        check("dark mode never alters the video (no filter, opacity, blend or tint in either theme)", vf["light"] == vf["dark"] and vf["light"][0] == "none" and vf["light"][1] == "1" and vf["light"][2] == "normal", str(vf))
        pg.evaluate("document.querySelector('.hero-video video').pause()")
        pg.evaluate("t=>new Promise(r=>{const v=document.querySelector('.hero-video video');v.onseeked=()=>r();v.currentTime=t})", 5.0); pg.wait_for_timeout(200)
        shots = {}
        clip = {"x": 1000, "y": 300, "width": 340, "height": 260}
        for theme in ("light", "dark"):
            pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')"); pg.wait_for_timeout(250); shots[theme] = pg.screenshot(clip=clip)
        check("dark and bright themes show pixel-identical footage", shots["light"] == shots["dark"])
        pg.evaluate("document.documentElement.setAttribute('data-theme','light')")
        hdr = pg.evaluate("getComputedStyle(document.querySelector('.site-header')).backgroundColor")
        pg.evaluate("window.scrollTo(0, innerHeight + 100)"); pg.wait_for_timeout(500)
        hdr2 = pg.evaluate("getComputedStyle(document.querySelector('.site-header')).backgroundColor")
        check("navigation is transparent over the video and becomes solid after the hero", px_rgba(hdr) and not px_rgba(hdr2), f"{hdr} -> {hdr2}")
        pg.evaluate("window.scrollTo(0, 0)")
        rctx = br.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce"); rp = rctx.new_page(); rp.goto(B + "/"); rp.wait_for_selector(".hero-title"); rp.wait_for_timeout(1500)
        check("reduced motion: the video does not autoplay and the poster is shown", rp.evaluate("(() => { const v = document.querySelector('.hero-video video'); return v.paused && v.currentTime === 0 && v.getAttribute('poster') === '/media/hero-poster.jpg' })()"))
        rctx.close()
        pg.click("a.hero-btn:has-text('Upload audio')"); pg.wait_for_url("**/analyze?mode=upload"); pg.wait_for_selector("role=tab")
        check("Upload audio opens the real upload workflow", pg.get_attribute("#tab-upload", "aria-selected") == "true" and pg.locator("#file").count() == 1)
        pg.goto(B + "/"); pg.wait_for_selector(".hero-title"); pg.click("a.hero-btn:has-text('Live analysis')"); pg.wait_for_url("**/analyze?mode=record"); pg.wait_for_selector("role=tab")
        check("Live analysis opens the real microphone workflow", pg.get_attribute("#tab-record", "aria-selected") == "true" and pg.locator("button:has-text('Start recording')").count() == 1)
        pg.click("text=Start recording"); pg.wait_for_selector("button:has-text('Stop recording')"); pg.wait_for_timeout(1800); pg.click("button:has-text('Stop recording')"); pg.wait_for_selector(".player")
        check("Live analysis: recording through the hero link produces a playable clip", pg.locator("audio").count() == 1)

        ctx.close(); ctx, pg = make_page()
        # ---------- site features ----------
        titles = set()
        for r_ in ROUTES:
            pg.goto(B + r_); pg.wait_for_selector("h1"); titles.add(pg.title())
            check(f"direct load {r_} has one h1", pg.locator("main h1").count() == 1)
        check("page titles are unique per page", len(titles) == len(ROUTES), str(titles))
        pg.goto(B + "/nope"); check("custom 404 page", "Page not found" in pg.inner_text("h1"))
        pg.goto(B + "/faq"); pg.fill("#faq-search", "microphone")
        n = pg.locator(".faq details").count()
        check("FAQ search filters results", 0 < n < 11, str(n))
        pg.fill("#faq-search", "zzzzqqq"); check("FAQ empty state", pg.locator(".empty").count() == 1)
        pg.goto(B + "/contact"); check("contact page does not invent an email", "No contact address" in pg.inner_text("main") and "@" not in pg.inner_text("main"))
        pg.goto(B + "/"); before = pg.get_attribute("html", "data-theme")
        pg.click("button[aria-label^='Switch to']"); after = pg.get_attribute("html", "data-theme")
        pg.reload(); persisted = pg.get_attribute("html", "data-theme")
        check("dark mode toggles and persists across reload", before != after == persisted, f"{before} {after} {persisted}")
        pg.screenshot(path=f"{args.shots}/home_dark.png")
        pg.click("button[aria-label^='Switch to']")
        pg.goto(B + "/"); pg.wait_for_selector("h1"); pg.wait_for_timeout(600)
        fam = pg.evaluate("[getComputedStyle(document.querySelector('h1')).fontFamily, getComputedStyle(document.body).fontFamily]")
        loaded = pg.evaluate("[...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/\"/g, ''))")
        check("typography: Fraunces for headlines, Plus Jakarta Sans for the interface", "Fraunces Variable" in fam[0] and "Plus Jakarta Sans Variable" in fam[1], str(fam))
        check("typography: the self-hosted fonts actually loaded", {"Fraunces Variable", "Plus Jakarta Sans Variable", "IBM Plex Mono"} <= set(loaded), str(loaded))
        pg.goto(B + "/evaluation"); pg.wait_for_selector(".metrics")
        mono = pg.evaluate("[getComputedStyle(document.querySelector('.metrics dd')).fontFamily, getComputedStyle(document.querySelector('table.data td')).fontFamily]")
        check("typography: IBM Plex Mono for metrics and table values", all("IBM Plex Mono" in f for f in mono), str(mono))
        pg.goto(B + "/evaluation"); pg.wait_for_selector(".cm"); et = pg.inner_text("main")
        check("evaluation shows all 8 trained candidates on the same test speakers", "All candidate models on the same test speakers" in et and pg.locator("table.data:has(th:has-text('UAR')) tbody tr").count() == 8 and et.count("(selected)") >= 2)
        check("em dash never appears in page text", all("\u2014" not in (pg.goto(B + r_) and pg.inner_text("body")) for r_ in ROUTES))
        pg.goto(B + "/"); pg.wait_for_selector(".skip", state="attached"); pg.keyboard.press("Tab")
        pg.wait_for_timeout(300)
        check("skip link receives keyboard focus first", pg.evaluate("document.activeElement.className") == "skip", pg.evaluate("document.activeElement.outerHTML.slice(0,120)"))

        ctx.close(); ctx, pg = make_page()
        # ---------- responsive ----------
        for w in (1440, 1280, 768, 390, 375):
            pg.set_viewport_size({"width": w, "height": 800}); bad = []
            for r_ in ROUTES:
                pg.goto(B + r_); pg.wait_for_selector("h1"); pg.wait_for_timeout(120)
                if pg.evaluate("document.documentElement.scrollWidth > innerWidth + 1"):
                    off = pg.evaluate("[...document.querySelectorAll('main *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('.table-scroll')).slice(0, 4).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right))")
                    bad.append((r_, off))
            check(f"no horizontal overflow at {w}px on all pages", not bad, str(bad))
        pg.set_viewport_size({"width": 390, "height": 800}); pg.goto(B + "/")
        check("mobile: sticky Analyze button hidden over the hero", pg.locator(".sticky-cta").count() == 0)
        pg.evaluate("window.scrollTo(0, innerHeight + 200)"); pg.wait_for_selector(".sticky-cta"); check("mobile: sticky Analyze button appears after the hero", pg.locator(".sticky-cta").is_visible())
        pg.evaluate("window.scrollTo(0, 0)")
        pg.click("button.menu-btn"); check("mobile menu opens", pg.get_attribute("button.menu-btn", "aria-expanded") == "true")
        pg.click("nav >> text=About"); pg.wait_for_url("**/about"); pg.wait_for_timeout(300)
        check("mobile menu navigates and closes", pg.get_attribute("button.menu-btn", "aria-expanded") == "false", str(pg.get_attribute("button.menu-btn", "aria-expanded")))
        pg.goto(B + "/analyze"); check("mobile: sticky button hidden on analyze page", pg.locator(".sticky-cta").count() == 0)
        pg.screenshot(path=f"{args.shots}/mobile_analyze.png", full_page=True)
        pg.goto(B + "/about"); pg.evaluate("window.scrollTo(0, 2000)"); pg.wait_for_selector(".to-top")
        pg.click(".to-top"); pg.wait_for_function("window.scrollY < 5")
        check("back-to-top appears and works", True)
        pg.set_viewport_size({"width": 1280, "height": 900})

        ctx.close(); ctx, pg = make_page()
        # ---------- focus ring colour and microphone icon ----------
        for theme, ring in (("light", "#4E5D9F"), ("dark", "#A9B9DC")):
            pg.goto(B + "/about"); pg.wait_for_selector(".skip", state="attached"); pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
            pg.keyboard.press("Tab"); pg.keyboard.press("Tab")
            st = pg.evaluate("(() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, s.outlineColor, s.outlineWidth] })()")
            check(f"{theme} theme: keyboard focus ring uses the focus-ring token", st[0] == "solid" and st[1] == rgb(ring) and st[2] == "3px", str(st))
        pg.evaluate("document.documentElement.setAttribute('data-theme','light')")
        pg.set_viewport_size({"width": 375, "height": 800}); pg.goto(B + "/analyze"); pg.wait_for_selector("role=tab")
        box = pg.evaluate("(() => { const r = document.querySelector('#tab-record svg').getBoundingClientRect(); return [r.width, r.height] })()")
        check("microphone icon keeps its size in the narrow tab at 375px", box[0] >= 15.5 and box[1] >= 15.5, str(box))

        ctx.close(); ctx, pg = make_page()
        # ---------- screenshots of every page in both themes ----------
        for w in (1440, 390):
            pg.set_viewport_size({"width": w, "height": 900})
            for theme in ("light", "dark"):
                for r_ in ROUTES:
                    pg.goto(B + r_)
                    try: pg.wait_for_selector("h1", timeout=8000)
                    except Exception: print("DEBUG no visible h1:", w, theme, r_, repr(pg.inner_text("body")[:300]), pg.url); raise
                    pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')"); pg.wait_for_timeout(150)
                    name = ("home" if r_ == "/" else r_.strip("/"))
                    pg.screenshot(path=f"{args.shots}/{name}_{theme}_{w}.png", full_page=True)
                if w == 390:   # mobile menu open in both themes
                    pg.goto(B + "/"); pg.wait_for_selector("button.menu-btn", timeout=8000); pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')"); pg.click("button.menu-btn"); pg.screenshot(path=f"{args.shots}/menu_{theme}_390.png")
        pg.set_viewport_size({"width": 1280, "height": 900})
        pg.goto(B + "/"); pg.evaluate("document.documentElement.setAttribute('data-theme','light')")

        ctx.close(); ctx, pg = make_page()
        # ---------- accessibility scan ----------
        if args.axe:
            axe_src = Path(args.axe).read_text()
            for theme in ("light", "dark"):
                pg.goto(B + "/"); pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
                for r_ in ROUTES:
                    pg.goto(B + r_); pg.wait_for_selector("h1"); pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')"); pg.wait_for_timeout(250)
                    pg.add_script_tag(content=axe_src)
                    res = pg.evaluate("axe.run(document, {runOnly:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']})")
                    v = [(x["id"], [(n["target"], (n.get("any") or [{}])[0].get("message", "")[:110]) for n in x["nodes"][:3]]) for x in res["violations"]]
                    check(f"axe {theme} {r_}: no violations", not v, str(v))
        if args.axe:
            # Layout fixture: intercept /api/metrics with VARIED matrix values (invented, test-only) to check contrast in realistic shading.
            import json as _j
            real = _j.loads(urllib.request.urlopen("http://127.0.0.1:8000/api/metrics").read())
            real["confusion_matrix"] = [[120, 20, 10, 40, 30, 17], [15, 100, 30, 25, 40, 20], [10, 25, 90, 30, 20, 60], [45, 20, 25, 110, 35, 10], [20, 30, 15, 25, 130, 12], [12, 18, 55, 8, 25, 110]]
            pg.route("**/api/metrics", lambda route: route.fulfill(status=200, content_type="application/json", body=_j.dumps(real)))
            for theme in ("light", "dark"):
                pg.goto(B + "/evaluation"); pg.wait_for_selector(".cm"); pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')"); pg.wait_for_timeout(250)
                pg.add_script_tag(content=axe_src)
                res = pg.evaluate("axe.run(document, {runOnly:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']})")
                check(f"axe {theme} /evaluation with varied matrix shading: no violations", not res["violations"], str([(x["id"], len(x["nodes"])) for x in res["violations"]]))
                if theme == "dark": pg.screenshot(path=f"{args.shots}/evaluation_varied_dark.png", full_page=True)
            pg.unroute("**/api/metrics")
        check("no requests to any third-party host (fonts and scripts are self-hosted)", not external, str(external[:3]))
        check("no unexpected browser console errors", all("422" in l or "Failed to load resource" in l for l in logs), str(logs[:3]))

        # ---------- backend offline ----------
        os.killpg(api.pid, signal.SIGTERM); time.sleep(1)
        pg.goto(B + "/analyze"); pg.wait_for_timeout(2000)
        check("backend offline is explained to the user", "backend is not running" in pg.inner_text("main"))
        br.close()
finally:
    killall()
    import shutil; shutil.rmtree(home, ignore_errors=True)
passed = sum(1 for _, ok, _ in RESULTS if ok)
print(f"\nSUMMARY: {passed} passed, {len(RESULTS) - passed} failed, {len(RESULTS)} total")
sys.exit(0 if passed == len(RESULTS) else 1)
