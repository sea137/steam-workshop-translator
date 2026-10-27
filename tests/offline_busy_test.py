"""A second request must fail promptly while inference is held; health stays live."""
import importlib.util
import json
import threading
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

spec = importlib.util.spec_from_file_location('offline_server', Path(__file__).resolve().parent.parent / 'offline/server.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
entered, release = threading.Event(), threading.Event()

class Slow:
    def translate(self, texts):
        entered.set()
        assert release.wait(4)
        return ['中文' for _ in texts]

server = module.make_server(Slow(), 0)
worker = threading.Thread(target=server.serve_forever, daemon=True); worker.start()
client = urllib.request.build_opener(urllib.request.ProxyHandler({}))
base = f'http://127.0.0.1:{server.server_port}'
def request(path='/translate'):
    body = json.dumps({'texts': ['A held request']}).encode() if path == '/translate' else None
    req = urllib.request.Request(base + path, data=body, headers={'Content-Type': 'application/json'})
    try:
        with client.open(req, timeout=1) as r: return r.status, json.load(r)
    except urllib.error.HTTPError as e: return e.code, json.load(e)

try:
    with ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(request)
        assert entered.wait(1)
        try:
            code, data = request()
            assert code == 503 and data['code'] == 'busy', (code, data)
            assert request('/health')[0] == 200
        finally: release.set()
        assert first.result()[0] == 200
    assert request()[0] == 200, 'Service must remain usable after a busy response'
finally:
    release.set(); server.shutdown(); server.server_close(); worker.join(timeout=2)
print('PASS: busy response is immediate, health works during inference, subsequent translation recovers')
