"""Exercise on-demand readiness without starting real OS processes."""
import json, os
from pathlib import Path
if os.environ.get('HAIJING_LUAJIT'):
    from lupa.luajit21 import LuaRuntime
else:
    from lupa import LuaRuntime
root = Path(os.environ.get('HAIJING_BACKEND_DIR', Path(__file__).resolve().parent.parent / 'backend'))
lua = LuaRuntime(unpack_returned_tuples=True)
clock = [100]; state = {'health': None, 'launches': 0, 'output': 'HAIJING_STARTING'}
lua.globals().os.time = lambda: clock[0]
def get(url, opts):
    assert url == 'http://127.0.0.1:17653/health' and opts['proxy'] == '' and opts['timeout'] == 1
    return lua.table_from(state['health']) if state['health'] else None
def execute(command):
    assert 'Start-OnDemand.ps1' in command and 'EncodedCommand' not in command
    state['launches'] += 1
    return state['output'], 0
modules = {'http': lua.table_from({'get': get}), 'json': lua.table_from({'decode': lambda s: lua.table_from(json.loads(s))}),
           'utils': lua.table_from({'exec': execute})}
lua.globals().require = lambda name: modules[name]
runtime = lua.execute((root / 'offline_runtime.lua').read_text(encoding='utf-8'))
assert runtime.prepare()['state'] == 'starting'
assert runtime.prepare()['state'] == 'starting' and state['launches'] == 1
state['health'] = {'status': 200, 'body': json.dumps({'ok': True, 'service': 'HaijingToolsOffline'})}
assert runtime.prepare()['state'] == 'ready'
assert state['launches'] == 1
state['health'] = None; state['output'] = 'HAIJING_MISSING'
assert runtime.prepare()['state'] == 'missing'
clock[0] += 21; state['health'] = {'status': 200, 'body': '{"ok":true,"service":"another-service"}'}
assert runtime.prepare()['state'] == 'unavailable' and state['launches'] == 2
print('PASS: local health, one launch during startup, readiness recovery, verified missing install and foreign listener rejection')
