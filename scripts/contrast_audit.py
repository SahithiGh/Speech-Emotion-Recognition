"""WCAG contrast audit of the design tokens in frontend/src/tokens.css (both themes).
Usage:  python scripts/contrast_audit.py        (exit code 1 if any pairing is below its minimum)"""
import re
import sys
from pathlib import Path

CSS = Path(__file__).resolve().parents[1] / "frontend" / "src" / "tokens.css"
EXACT = {   # the palette supplied by the project owner
    "light": {"background": "#FFFEFA", "foreground": "#160709", "primary": "#C4536E", "secondary": "#4E5D9F", "accent": "#3F6A28"},
    "dark": {"background": "#050400", "foreground": "#FAFAFA", "primary": "#5B1626", "secondary": "#424552", "accent": "#0D3C0E"},
}
T, N = 4.5, 3.0   # normal text, non-text (borders, icons, graphs, focus rings)
PAIRS = [  # (foreground token, background token, minimum, description)
    ("foreground", "background", T, "body text"), ("foreground", "surface", T, "text on cards"), ("foreground", "surface-muted", T, "text on muted surfaces"),
    ("muted-foreground", "background", T, "muted text"), ("muted-foreground", "surface", T, "muted text on cards"), ("muted-foreground", "surface-muted", T, "muted text on muted surfaces"),
    ("on-primary", "primary", T, "primary button label"), ("on-primary", "primary-hover", T, "primary button label (hover)"), ("on-primary", "primary-active", T, "primary button label (pressed)"),
    ("on-secondary", "secondary", T, "secondary fill label"), ("on-accent", "accent", T, "accent fill label"),
    ("primary-text", "background", T, "primary-coloured text"), ("primary-text", "surface-muted", T, "primary-coloured text on muted"),
    ("link", "background", T, "links"), ("link", "surface-muted", T, "links on muted"), ("link", "surface", T, "links on cards"),
    ("success", "background", T, "success text"), ("success", "surface-muted", T, "success text on muted"),
    ("foreground", "success-surface", T, "text in success banner"), ("success", "success-surface", T, "success icon/text in banner"),
    ("foreground", "warning-surface", T, "text in warning banner"), ("warning", "warning-surface", T, "warning icon/text in banner"), ("warning", "background", T, "warning text"),
    ("foreground", "error-surface", T, "text in error banner"), ("error", "error-surface", T, "error text in banner"), ("error", "background", T, "error text"), ("error", "surface-muted", T, "error text on muted"), ("error", "surface", T, "error text on cards"),
    ("foreground", "info-surface", T, "text in info banner"), ("info", "info-surface", T, "info icon in banner"),
    ("disabled-foreground", "disabled-surface", T, "disabled control label"),
    ("border-strong", "background", N, "input and control borders"), ("border-strong", "surface-muted", N, "control borders on muted"), ("border-strong", "surface", N, "control borders on cards"),
    ("focus-ring", "background", N, "focus ring"), ("focus-ring", "surface-muted", N, "focus ring on muted"),
    ("chart-bar", "chart-track", N, "chart bar vs track"), ("chart-bar-top", "chart-track", N, "top chart bar vs track"),
    ("chart-bar", "surface", N, "chart bar vs card"), ("chart-bar-top", "surface", N, "top chart bar vs card"),
    ("primary-border", "background", N, "primary button outline"), ("primary-border", "surface-muted", N, "primary outline on muted"),
    ("primary-text", "surface", T, "primary-coloured text on cards"),
    ("hero-text", "hero-bg", T, "hero headline on the footage's base black"), ("hero-muted", "hero-bg", T, "hero copy on base black"), ("hero-tone", "hero-bg", T, "hero silver-blue italic on base black"),
    ("hero-on-action", "hero-action", T, "hero solid button label"), ("hero-on-action", "hero-action-hover", T, "hero solid button label (hover)"), ("hero-text", "hero-bg", N, "hero outlined button border"),
] + [("foreground", f"emo-{e}", T, f"text on {e} timeline segment") for e in ("angry", "happy", "sad", "fear", "disgust", "neutral")] \
  + [("border-strong", f"emo-{e}", 1.0, f"segment outline vs {e} fill") for e in ("angry",)]


def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [v / 12.92 if v <= .03928 else ((v + .055) / 1.055) ** 2.4 for v in c]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + .05) / (lb + .05)


def tokens(theme):
    text = CSS.read_text()
    hero = dict((k, v.upper()) for k, v in re.findall(r"--color-(hero-[a-z-]+):\s*(#[0-9A-Fa-f]{6})", text))
    block = re.search(r":root, :root\[data-theme=\"light\"\] \{(.*?)\n\}" if theme == "light" else r":root\[data-theme=\"dark\"\] \{(.*?)\n\}", text, re.S).group(1)
    return {**{k: v.upper() for k, v in re.findall(r"--color-([a-z-]+):\s*(#[0-9A-Fa-f]{6})", block)}, **hero}


def matrix_text_check(t):
    """Worst case for text drawn on the confusion-matrix tint: full tint at 90% over the surface."""
    def mix(a, b, p):
        return "#" + "".join(f"{round(int(a[i:i+2], 16) * p + int(b[i:i+2], 16) * (1 - p)):02X}" for i in (1, 3, 5))
    return ratio(t["foreground"], mix(t["matrix-tint"], t["surface"], .9)), ratio(t["muted-foreground"], mix(t["matrix-tint"], t["surface"], .9))


def main():
    bad = 0
    for theme in ("light", "dark"):
        t = tokens(theme)
        for k, v in EXACT[theme].items():
            if t[k] != v:
                print(f"[{theme}] FAIL exact palette colour --color-{k} is {t[k]}, expected {v}"); bad += 1
        print(f"[{theme}] exact palette colours present: {', '.join(f'{k} {v}' for k, v in EXACT[theme].items())}")
        for fg, bg, minimum, what in PAIRS:
            r = ratio(t[fg], t[bg])
            ok = r >= minimum
            bad += not ok
            if not ok or "-v" in sys.argv:
                print(f"[{theme}] {'ok  ' if ok else 'FAIL'} {r:5.2f}:1 (min {minimum}) {what}: {fg} {t[fg]} on {bg} {t[bg]}")
        r1, _ = matrix_text_check(t)
        for r, what in ((r1, "matrix cell text and percentage"),):
            ok = r >= T; bad += not ok
            if not ok or "-v" in sys.argv: print(f"[{theme}] {'ok  ' if ok else 'FAIL'} {r:5.2f}:1 {what} at full tint")
    print("\nAUDIT RESULT:", "all pairings pass" if not bad else f"{bad} failing pairings")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
