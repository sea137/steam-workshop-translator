"""Launch our installed service without inheriting the Lua VM's output pipes."""
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


def running(pid):
    import ctypes
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_bool, ctypes.c_ulong]
    kernel.OpenProcess.restype = ctypes.c_void_p
    kernel.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    handle = kernel.OpenProcess(0x1000, False, int(pid))
    if not handle: return False
    try:
        code = ctypes.c_ulong()
        return bool(kernel.GetExitCodeProcess(handle, ctypes.byref(code))) and code.value == 259
    finally: kernel.CloseHandle(handle)


def start(root):
    import msvcrt
    root = Path(root)
    paths = [root / 'server.py', root / 'venv/Scripts/python.exe', root / 'models/translate-en_zh-1_9/model/model.bin',
             root / 'models/translate-en_zh-1_9/sentencepiece.model']
    if not all(p.is_file() for p in paths): return 'HAIJING_MISSING'
    client = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with client.open('http://127.0.0.1:17653/health', timeout=1) as response:
            health = json.load(response)
            return 'HAIJING_STARTING' if health.get('service') == 'HaijingToolsOffline' else 'HAIJING_UNAVAILABLE'
    except Exception: pass
    with (root / 'startup.lock').open('a+b') as lock:
        lock.seek(0)
        if not lock.read(1): lock.write(b'0'); lock.flush()
        lock.seek(0)
        try: msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError: return 'HAIJING_STARTING'
        try:
            marker = root / 'startup.json'
            try:
                recent = json.loads(marker.read_text())
                # Bound duplicate starts during model loading; never kill a PID from a marker.
                if 0 <= time.time() - recent['started'] < 20 and running(recent['pid']): return 'HAIJING_STARTING'
            except (OSError, ValueError, KeyError, TypeError): pass
            for name in ('server.log', 'server-error.log'):
                path = root / name
                if path.exists() and path.stat().st_size:
                    backup = root / (name + '.' + str(time.time_ns()) + '.bak')
                    backup.write_bytes(path.read_bytes())
            with (root / 'server.log').open('wb') as out, (root / 'server-error.log').open('wb') as err:
                child = subprocess.Popen([str(paths[1]), str(paths[0]), '--model', str(root / 'models/translate-en_zh-1_9')],
                    stdin=subprocess.DEVNULL, stdout=out, stderr=err, close_fds=True,
                    creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP)
            (root / 'server.pid').write_text(str(child.pid))
            marker.write_text(json.dumps({'started': time.time(), 'pid': child.pid}))
            return 'HAIJING_STARTING'
        finally:
            lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


if __name__ == '__main__':
    try: print(start(Path(__file__).resolve().parent), flush=True)
    except Exception as exc:
        print('On-demand startup failed: ' + type(exc).__name__, file=sys.stderr)
        print('HAIJING_UNAVAILABLE', flush=True)
        sys.exit(1)
