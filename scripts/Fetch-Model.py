"""Fetch the original licensed Argos en_zh 1.9 model for release assets."""
import hashlib
import sys
import urllib.request
from pathlib import Path

URL = 'https://argos-net.com/v1/translate-en_zh-1_9.argosmodel'
SHA256 = '433e7c4f034d87fbe2353161e05f18646d7999452f801a4e1f0378522b9850ab'
target = Path(sys.argv[1]); target.parent.mkdir(parents=True, exist_ok=True)
if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == SHA256:
    print('Verified cached model:', target); sys.exit(0)
for direct in (False, True):
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({})) if direct else urllib.request.build_opener()
        req = urllib.request.Request(URL, headers={'User-Agent': 'HaijingTools-Release/0.3.1'})
        with opener.open(req, timeout=60) as response, target.open('wb') as out:
            size = 0
            while chunk := response.read(1024 * 1024):
                out.write(chunk); size += len(chunk)
                if size % (8 * 1024 * 1024) == 0: print('Downloaded model bytes:', size, flush=True)
        if hashlib.sha256(target.read_bytes()).hexdigest() != SHA256: raise ValueError('Model SHA256 mismatch')
        print('Verified model SHA256:', SHA256); break
    except Exception:
        if direct: raise
        print('Retrying the official model host using a direct TLS connection.', flush=True)
