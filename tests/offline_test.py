"""Exercise the actual local HTTP server; optionally exercise the real model.

Set HAIJING_TEST_MODEL to an extracted Argos en_zh 1.9 directory for model QA.
"""
import importlib.util
import json
import os
import threading
import urllib.error
import urllib.request
from pathlib import Path

spec = importlib.util.spec_from_file_location('offline_server', Path(__file__).resolve().parent.parent / 'offline/server.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)


class Echo:
    def translate(self, texts): return ['本地结果 ' + t for t in texts]


server = module.make_server(Echo(), 0)
thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
base = 'http://127.0.0.1:' + str(server.server_port)
client = urllib.request.build_opener(urllib.request.ProxyHandler({}))
def request(path, data=None, extra=None, raw=None):
    headers = {'Content-Type': 'application/json'}
    headers.update(extra or {})
    body = raw if raw is not None else json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(base + path, data=body, headers=headers)
    try:
        with client.open(req, timeout=5) as result: return result.status, json.load(result)
    except urllib.error.HTTPError as e: return e.code, json.load(e)
try:
    assert request('/health')[1]['service'] == 'HaijingToolsOffline'
    code, data = request('/translate', {'texts': ['Field Tents', 'Weapons']})
    assert code == 200 and len(data['items']) == 2
    assert request('/translate', {'texts': ['test']}, {'Origin': 'https://steamcommunity.com'})[0] == 403
    assert request('/health', extra={'Host': 'evil.example'})[0] == 403
    assert request('/translate', {'texts': []})[0] == 400
    assert request('/translate', {'texts': ['x'] * 9})[0] == 400
    assert request('/translate', {'texts': ['x' * 7001]})[0] == 400
    assert request('/translate', raw=b'x' * 30001)[0] == 413
    assert request('/translate', raw=b'{invalid')[0] == 400
    assert request('/translate', {'texts': ['x']}, {'Content-Type': 'text/plain'})[0] == 415
    assert request('/install', {'model': 'anything'})[0] == 404
finally:
    server.shutdown(); server.server_close(); thread.join(timeout=5)
print('PASS: local-only service HTTP contract, browser-origin rejection, input limits, no install/command endpoints')

if os.environ.get('HAIJING_TEST_MODEL'):
    # Disallow network during model loading and inference.
    import socket
    def blocked(*args, **kwargs): raise AssertionError('Offline inference attempted a network connection')
    previous = socket.socket.connect
    socket.socket.connect = blocked
    try:
        engine = module.Translator(os.environ['HAIJING_TEST_MODEL'])
        texts = ['Field Tents', 'This mod adds more weapons and furniture to your colony.',
                 'Does this work with existing saves?', 'First paragraph.\nSecond paragraph.']
        results = engine.translate(texts)
        assert len(results) == len(texts)
        assert all(any('\u4e00' <= c <= '\u9fff' for c in s) for s in results)
        assert '\n' in results[-1]
        long = ' '.join(['This is a workshop translation test.'] * 80)
        assert engine.translate([long])[0]
        print(json.dumps({'model': 'Argos en_zh 1.9', 'samples': list(zip(texts, results))}, ensure_ascii=False))
    finally: socket.socket.connect = previous
    print('PASS: real model initialization and sentence/paragraph/long-text inference with network connections blocked')
