"""Tests the downloader against a local mock of GitHub's LFS service (no internet, no real audio)."""
import gzip
import hashlib
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

import download_crema_d as D


def make_server(objects, mode="ok"):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_POST(self):
            req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            if mode == "quota":
                self.send_response(403); self.end_headers(); self.wfile.write(b'{"message":"bandwidth quota exceeded"}'); return
            out = [{"oid": o["oid"], "size": o["size"], "actions": {"download": {"href": f"http://127.0.0.1:{self.server.server_port}/o/{o['oid']}"}}} for o in req["objects"]]
            body = json.dumps({"objects": out}).encode()
            self.send_response(200); self.end_headers(); self.wfile.write(body)

        def do_GET(self):
            data = objects[self.path.split("/")[-1]]
            if mode == "corrupt":
                data = b"X" + data[1:]
            self.send_response(200); self.end_headers(); self.wfile.write(data)

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


@pytest.fixture
def setup(tmp_path, monkeypatch):
    files = {f"100{i}_DFA_ANG_XX.wav": (b"RIFF" + bytes([i]) * (3000 + i * 10)) for i in range(5)}
    objects, rows = {}, []
    for n, b in files.items():
        oid = hashlib.sha256(b).hexdigest(); objects[oid] = b; rows.append(f"{n},{oid},{len(b)}")
    man = tmp_path / "m.csv.gz"
    with gzip.open(man, "wt") as f:
        f.write("# test\n" + "\n".join(rows) + "\n")
    return files, objects, man, tmp_path / "out"


def test_download_verifies_and_resumes(setup, monkeypatch):
    files, objects, man, dest = setup
    srv = make_server(objects)
    monkeypatch.setattr(D, "LFS_BATCH_URL", f"http://127.0.0.1:{srv.server_port}/batch")
    assert D.main(["--manifest", str(man), "--dest", str(dest), "--chunk", "2"]) == 0
    assert {p.name: p.read_bytes() for p in dest.glob("*.wav")} == files and not list(dest.glob("*.part"))
    # damage one file and delete another: a second run repairs exactly those
    (dest / "1001_DFA_ANG_XX.wav").write_bytes(b"short")
    (dest / "1002_DFA_ANG_XX.wav").unlink()
    assert D.main(["--manifest", str(man), "--dest", str(dest)]) == 0
    assert {p.name: p.read_bytes() for p in dest.glob("*.wav")} == files
    srv.shutdown()


def test_corrupt_download_is_rejected_not_saved(setup, monkeypatch):
    files, objects, man, dest = setup
    srv = make_server(objects, "corrupt")
    monkeypatch.setattr(D, "LFS_BATCH_URL", f"http://127.0.0.1:{srv.server_port}/batch")
    assert D.main(["--manifest", str(man), "--dest", str(dest)]) == 1
    assert not list(dest.glob("*.wav")) and not list(dest.glob("*.part"))
    srv.shutdown()


def test_quota_error_is_reported_clearly(setup, monkeypatch, capsys):
    files, objects, man, dest = setup
    srv = make_server(objects, "quota")
    monkeypatch.setattr(D, "LFS_BATCH_URL", f"http://127.0.0.1:{srv.server_port}/batch")
    assert D.main(["--manifest", str(man), "--dest", str(dest)]) == 2
    assert "bandwidth" in capsys.readouterr().out.lower()
    srv.shutdown()
