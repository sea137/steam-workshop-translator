"""Provider routing regressions; native HTTP mocked, actual Lua code executed."""
import json
import os
import tempfile
import urllib.parse
from pathlib import Path
if os.environ.get('HAIJING_LUAJIT'):
    from lupa.luajit21 import LuaRuntime, lua_type
else:
    from lupa import LuaRuntime, lua_type

ROOT = Path(os.environ.get('HAIJING_BACKEND_DIR', Path(__file__).resolve().parent.parent / 'backend'))


def fixture():
    temp = tempfile.TemporaryDirectory(prefix='haijing-providers-')
    lua = LuaRuntime(unpack_returned_tuples=True)
    state = {'calls': [], 'google': 429, 'memory': 200, 'local': False, 'clock': 1000000}
    lua.globals().os.time = lambda: state['clock']
    def to_lua(v):
        if isinstance(v, dict): return lua.table_from({k: to_lua(x) for k, x in v.items()})
        if isinstance(v, list): return lua.table_from([to_lua(x) for x in v])
        return v
    def from_lua(v):
        if lua_type(v) != 'table': return v
        keys = list(v.keys())
        if keys and set(keys) == set(range(1, len(keys) + 1)):
            return [from_lua(v[i]) for i in range(1, len(keys) + 1)]
        return {str(k): from_lua(x) for k, x in v.items()}
    def request(url, body=None, options=None):
        if options is None: options, body = body, None
        if options and options['method'] == 'POST': body = options['data']
        state['calls'].append((url, body))
        if state.get('delay'):
            elapsed = min(state['delay'], options['timeout'])
            state['clock'] += elapsed
            if state['delay'] > options['timeout']: return None
        if 'googleapis.com' in url:
            return to_lua({'status': state['google'], 'body': '[[["谷歌译文"]]]'})
        if 'mymemory.translated.net' in url:
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)['q'][0]
            assert len(q.encode('utf-8')) <= 500
            data = {'responseStatus': state['memory'], 'responseData': {'translatedText': '备用译文'}}
            return to_lua({'status': 200, 'body': json.dumps(data)})
        assert url.startswith('http://127.0.0.1:17653/'), url
        assert options['proxy'] == ''
        assert options['method'] == 'POST' and options['headers']['Content-Type'] == 'application/json'
        if not state['local']: return None
        texts = json.loads(body)['texts']
        return to_lua({'status': 200, 'body': json.dumps({'ok': True, 'items': [{'ok': True, 'text': '本地译文'} for _ in texts]})})
    modules = {
        'http': lua.table_from({'get': request, 'request': request}),
        'json': lua.table_from({'decode': lambda s: to_lua(json.loads(s)), 'encode': lambda v: json.dumps(from_lua(v), ensure_ascii=False)}),
        'fs': lua.table_from({'create_directories': lambda p: Path(p).mkdir(parents=True, exist_ok=True)}),
        'millennium': lua.table_from({'steam_path': lambda: Path(temp.name).as_posix()}),
    }
    def require(name):
        if name not in modules: modules[name] = lua.execute((ROOT / (name + '.lua')).read_text(encoding='utf-8'))
        return modules[name]
    lua.globals().require = require
    lua.execute((ROOT / 'translator.lua').read_text(encoding='utf-8'))
    def batch(texts, provider='auto'):
        return json.loads(lua.globals().translateTexts(json.dumps({'texts': texts, 'provider': provider})))
    return temp, lua, state, batch


temp, lua, state, batch = fixture()
with temp:
    result = batch(['A new workshop title'])
    assert result['items'][0]['provider'] == 'mymemory', result
    assert len(state['calls']) == 3, state['calls']
    before = len(state['calls'])
    assert batch(['A second title'])['items'][0]['provider'] == 'mymemory'
    assert len(state['calls']) == before + 2, 'Google cooldown is shared across requests'
    before = len(state['calls'])
    assert batch(['A new workshop title'])['items'][0]['cached'] is True
    assert len(state['calls']) == before
    assert batch(['A new workshop title'], 'google')['items'][0]['ok'] is False, 'Manual source cannot reuse another provider cache'
    before = len(state['calls'])
    state['local'] = True
    local = batch(['Offline unseen sentence'], 'offline')
    assert local['items'][0]['provider'] == 'offline', local
    assert len(state['calls']) == before + 1 and state['calls'][-1][0].startswith('http://127.0.0.1')
    before = len(state['calls'])
    known = batch(['Field Tents'], 'dictionary')
    assert known['items'][0]['kind'] == 'dictionary', known
    assert len(state['calls']) == before
    missing = batch(['Completely unknown long sentence.'], 'dictionary')
    assert missing['items'][0]['ok'] is False, 'Do not masquerade word substitutions as sentence translations'
    imported = json.loads(lua.globals().importDictionary(json.dumps({'entries': {'Completely unknown long sentence.': '自定义整句'}})))
    assert imported['ok'] is True
    assert batch(['Completely unknown long sentence.'], 'dictionary')['items'][0]['text'] == '自定义整句'
    assert not json.loads(lua.globals().importDictionary('{"bad":123}'))['ok']
    assert not batch(['x'], 'unknown')['ok']

temp, lua, state, batch = fixture()
with temp:
    state['memory'] = 403
    state['local'] = True
    result = batch(['Fresh title for local fallback'])
    assert result['items'][0]['provider'] == 'offline', result
    # Partial successes are retained even when another item cannot be translated.
    state['local'] = False
    result = batch(['Field Tents', 'No translation available for this item'])
    assert result['items'][0]['ok'] is True and result['items'][0]['kind'] == 'dictionary', result
    assert result['items'][1]['ok'] is False, result
    assert '本地' in result['items'][1]['error']

temp, lua, state, batch = fixture()
with temp:
    state['google'] = 200
    assert batch(['New manual source'], 'google')['items'][0]['text'] == '谷歌译文'
    assert batch(['New manual source'], 'mymemory')['items'][0]['text'] == '备用译文'
    assert batch(['New manual source'], 'google')['items'][0]['text'] == '谷歌译文'
    text = ('A long sentence about animals, research and furniture. ' * 30) + '🐈'
    result = batch([text], 'mymemory')
    assert result['items'][0]['ok'] is True, result
    assert len(state['calls']) > 3
    # Missing explicit language support must not mislabel Japanese as English.
    result = batch(['これは翻訳です'], 'mymemory')
    assert result['items'][0]['ok'] is False
print('PASS: automatic failover, per-source cache/cooldown, strict offline, glossary import, partial success, UTF-8 byte limits')

temp, lua, state, batch = fixture()
with temp:
    state['local'] = False
    state['delay'] = 4
    started = state['clock']
    batch(['Slow public title ' + str(i) for i in range(8)], 'mymemory')
    assert state['clock'] - started <= 12, 'Sequential HTTP calls must finish before the framework 30-second RPC limit'
print('PASS: slow-service batch stays inside the per-RPC wall-clock budget')

temp, lua, state, batch = fixture()
with temp:
    state['local'] = True
    result = batch(['Prefer the local model'])
    assert result['items'][0]['provider'] == 'offline'
    assert len(state['calls']) == 1 and state['calls'][0][0].startswith('http://127.0.0.1')
print('PASS: auto prefers the local model without contacting online services when it succeeds')
