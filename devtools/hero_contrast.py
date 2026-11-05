"""Developer tool (needs the website running on port 5173).
Contrast of the hero text against the ACTUAL moving footage: video paused at 11 moments, text hidden, pixels under each text line measured."""
import io, numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
exe="/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"
def lum(a):
    a=a/255.0; a=np.where(a<=0.03928,a/12.92,((a+0.055)/1.055)**2.4); return 0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]
IVORY=lum(np.array([[[255,254,250]]],dtype=float))[0,0]; TONE=lum(np.array([[[0xC3,0xCC,0xEA]]],dtype=float))[0,0]; MUTED=lum(np.array([[[0xE4,0xE6,0xEE]]],dtype=float))[0,0]
cr=lambda l_text,l_bg:(l_text+0.05)/(l_bg+0.05)
sel={"headline: Speech":(".hl-1",IVORY,3.0),"headline: Emotion (silver-blue italic)":(".hl-2",TONE,3.0),"headline: Recognition":(".hl-3",IVORY,3.0),"label":(".hero-label",MUTED,4.5),"supporting copy":(".hero-lead",MUTED,4.5)}
res={}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=exe)
    for vp,(w,h) in {"1440x900":(1440,900),"1280x720":(1280,720),"768x1024":(768,1024),"390x844":(390,844),"375x667":(375,667)}.items():
        pg=b.new_page(viewport={"width":w,"height":h}); pg.goto("http://127.0.0.1:5173/"); pg.wait_for_selector(".hero-title"); pg.wait_for_timeout(1500)
        pg.evaluate("document.querySelector('.hero-video video').pause()")
        pg.add_style_tag(content=".hero-inner *{color:transparent!important;text-shadow:none!important} .hero-inner .btn,.hero-meta{visibility:hidden}")
        boxes={}
        for name,(s,_,_) in sel.items():
            boxes[name]=pg.evaluate("""(s)=>{const el=document.querySelector(s);const r=document.createRange();r.selectNodeContents(el);return [...r.getClientRects()].map(q=>[q.left,q.top,q.width,q.height])}""",s)
        for t in [0.2,1,2,3,4,5,6,7,8,9,9.9]:
            pg.evaluate("t=>new Promise(r=>{const v=document.querySelector('.hero-video video');v.onseeked=()=>r();v.currentTime=t})",t); pg.wait_for_timeout(120)
            img=np.array(Image.open(io.BytesIO(pg.screenshot())).convert("RGB")).astype(float); L=lum(img)
            for name,(s,lt,need) in sel.items():
                for (x,y,bw,bh) in boxes[name]:
                    reg=L[max(0,int(y)):int(y+bh),max(0,int(x)):int(x+bw)]
                    if reg.size==0: continue
                    d=res.setdefault((vp,name),{"mean":[],"p95":[],"need":need,"lt":lt}); d["mean"].append(cr(lt,reg.mean())); d["p95"].append(cr(lt,np.percentile(reg,95)))
        pg.close()
    b.close()
worst_fail=0
for (vp,name),d in sorted(res.items()):
    m=min(d["mean"]); p=min(d["p95"]); ok=m>=d["need"]
    worst_fail+= not ok
    print(f"{vp:9s} {name:40s} worst-frame MEAN contrast {m:5.1f}:1 | worst-frame brightest-5% {p:4.1f}:1 | needs {d['need']}:1 {'ok' if ok else 'FAIL'}")
print("RESULT:", "all text lines meet the minimum on average in every sampled frame" if not worst_fail else f"{worst_fail} lines fall short")
