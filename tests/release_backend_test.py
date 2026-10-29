"""Run backend regressions against the actual packed .star, including UTF-8 literals.

Usage: python tests/release_backend_test.py workshop-translator.star
Requires lupa; no extra decompression dependency.
"""
import os
import runpy
import struct
import sys
import tempfile
from pathlib import Path


def lz4(data):
    expected = struct.unpack_from('<I', data)[0]
    data = data[4:]
    out = bytearray()
    pos = 0
    while pos < len(data):
        token = data[pos]; pos += 1
        length = token >> 4
        if length == 15:
            while True:
                extra = data[pos]; pos += 1; length += extra
                if extra != 255: break
        out.extend(data[pos:pos + length]); pos += length
        if pos == len(data): break
        offset = struct.unpack_from('<H', data, pos)[0]; pos += 2
        length = (token & 15) + 4
        if (token & 15) == 15:
            while True:
                extra = data[pos]; pos += 1; length += extra
                if extra != 255: break
        for _ in range(length): out.append(out[-offset])
    assert len(out) == expected
    return bytes(out)


def backend_entries(path):
    data = Path(path).read_bytes()
    start = 0 if data[:4] == b'STAR' else 4 + struct.unpack_from('<I', data)[0]
    assert data[start:start + 4] == b'STAR'
    for i in range(data[start + 6]):
        entry = start + 12 + i * 256
        kind, flags = data[entry:entry + 2]
        if kind != 2: continue
        offset, length = struct.unpack_from('<QQ', data, entry + 8)
        blob = data[start + offset:start + offset + length]
        if flags & 64: blob = bytes(v ^ 0x4D ^ (i & 255) for i, v in enumerate(blob))
        if flags:
            stripped = bytearray(); pos = 0
            while pos < len(blob):
                end = min(pos + 64, len(blob) - 12)
                stripped.extend(blob[pos:end]); pos = end + 12
            blob = bytes(stripped)
        if flags & 128: blob = lz4(blob)
        count = struct.unpack_from('<I', blob)[0]; pos = 4
        for _ in range(count):
            n, size = struct.unpack_from('<HI', blob, pos); pos += 6
            name = blob[pos:pos+n].decode(); pos += n
            source = blob[pos:pos+size].decode(); pos += size
            yield name, source


if __name__ == '__main__':
    entries = dict(backend_entries(sys.argv[1]))
    source = next(v for k, v in entries.items() if k.endswith('translator.lua'))
    with tempfile.TemporaryDirectory(prefix='haijing-packed-') as temp:
        for name, content in entries.items():
            (Path(temp) / Path(name).name).write_text(content, encoding='utf-8')
        target = Path(temp) / 'translator.lua'
        target.write_text(source, encoding='utf-8')
        os.environ['HAIJING_BACKEND_SOURCE'] = str(target)
        os.environ['HAIJING_BACKEND_DIR'] = temp
        for luajit in ('', '1'):
            os.environ['HAIJING_LUAJIT'] = luajit
            print('Checking packed backend in ' + ('LuaJIT 2.1' if luajit else 'Lua default'))
            runpy.run_path(str(Path(__file__).with_name('backend_test.py')), run_name='__main__')
            runpy.run_path(str(Path(__file__).with_name('providers_test.py')), run_name='__main__')
            runpy.run_path(str(Path(__file__).with_name('offline_runtime_test.py')), run_name='__main__')
