"""Lua backend checks with native Millennium modules mocked. Requires lupa.
Run from the source folder: python tests/backend_test.py
"""
import json
import tempfile
import urllib.parse
from pathlib import Path
from lupa import LuaRuntime, lua_type

source = (Path(__file__).resolve().parent.parent / 'backend/translator.lua').read_text(encoding='utf-8')
with tempfile.TemporaryDirectory(prefix='swt-test-') as temp:
    runtime = LuaRuntime(unpack_returned_tuples=True)
    def to_lua(value):
        if isinstance(value, dict):
            return runtime.table_from({k: to_lua(v) for k, v in value.items()})
        if isinstance(value, list):
            return runtime.table_from([to_lua(v) for v in value])
        return value
    def from_lua(value):
        if lua_type(value) == 'table':
            keys = list(value.keys())
            if keys and set(keys) == set(range(1, len(keys) + 1)):
                return [from_lua(value[i]) for i in range(1, len(keys) + 1)]
            return {str(k): from_lua(v) for k, v in value.items()}
        return value
    state = {'calls': 0, 'status': 200, 'body': '[[["野外帐篷","Field Tents"]]]'}
    def request(url, options):
        state['calls'] += 1
        state['url'] = url
        assert options['verify_ssl'] is True
        assert options['timeout'] == 18
        if state.get('network_failure'):
            return None
        return to_lua({'status': state['status'], 'body': state['body']})
    modules = {
        'http': runtime.table_from({'get': request}),
        'json': runtime.table_from({
            'decode': lambda s: to_lua(json.loads(s)),
            'encode': lambda v: json.dumps(from_lua(v), ensure_ascii=False),
        }),
        'fs': runtime.table_from({'create_directories': lambda p: Path(p).mkdir(parents=True, exist_ok=True)}),
        'millennium': runtime.table_from({'steam_path': lambda: Path(temp).as_posix()}),
    }
    runtime.globals()['require'] = lambda name: modules[name]
    runtime.execute(source)
    translate = lambda text: json.loads(runtime.globals().translateText(text))
    assert translate('Field Tents')['text'] == '野外帐篷'
    assert state['calls'] == 1
    assert translate('Field Tents')['cached'] is True
    assert state['calls'] == 1
    encoded = 'hello & 世界 + #?😀'
    translate(encoded)
    assert urllib.parse.parse_qs(urllib.parse.urlsplit(state['url']).query)['q'] == [encoded]
    runtime.globals().clearTranslationCache()
    assert translate('Field Tents')['cached'] is False
    state['status'] = 429
    assert translate('rate limit')['ok'] is False
    state['status'] = 200
    state['body'] = 'not json'
    assert translate('invalid JSON')['ok'] is False
    state['body'] = '[[["第一句"],["第二句"]]]'
    assert translate('multiple sentences')['text'] == '第一句第二句'
    state['body'] = '[]'
    assert translate('empty')['ok'] is False
    state['network_failure'] = True
    assert translate('network failure')['ok'] is False
    assert translate('')['ok'] is False
    assert translate('x' * 7001)['ok'] is False
    assert translate('汉' * 2400)['ok'] is False
    # Recreate Lua module state to prove persisted cache survives reload.
    state['network_failure'] = False
    runtime.execute(source)
    assert translate('Field Tents')['cached'] is True
    # Google preserves numbered boundaries: eight items must need one HTTP call.
    runtime.globals().clearTranslationCache()
    texts = ['Title ' + str(i) for i in range(8)]
    state['body'] = json.dumps([[["\n".join(f'⟦HJ_{i+1:02d}⟧\n中文 {i}' for i in range(8)) + '\n⟦HJ_END⟧']]], ensure_ascii=False)
    before = state['calls']
    batch = json.loads(runtime.globals().translateTexts(json.dumps(texts)))
    assert state['calls'] - before == 1
    assert [item['text'] for item in batch['items']] == ['中文 ' + str(i) for i in range(8)]
    before = state['calls']
    again = json.loads(runtime.globals().translateTexts(json.dumps(texts)))
    assert state['calls'] == before and all(item['cached'] for item in again['items'])
    # Repeated titles inside a request are deduplicated.
    state['body'] = '[[["新标题"]]]'
    before = state['calls']
    duplicate = json.loads(runtime.globals().translateTexts(json.dumps(['New title'] * 8)))
    assert state['calls'] - before == 1
    assert len(duplicate['items']) == 8
    # Damaged separators never silently pair a translation with the wrong item.
    before = state['calls']
    state['body'] = '[[["单独处理"]]]'
    fallback = json.loads(runtime.globals().translateTexts(json.dumps(['Fallback A', 'Fallback B'])))
    assert state['calls'] - before == 3
    assert all(item['text'] == '单独处理' for item in fallback['items'])
    # A service failure is reported once, without an eight-request retry storm.
    before = state['calls']; state['status'] = 429
    failure = json.loads(runtime.globals().translateTexts(json.dumps(['Limit A', 'Limit B'])))
    assert state['calls'] - before == 1 and all(not item['ok'] for item in failure['items'])
    state['status'] = 200
    assert not json.loads(runtime.globals().translateTexts('[]'))['ok']
    assert not json.loads(runtime.globals().translateTexts(json.dumps(['x'] * 9)))['ok']
    print('PASS: Lua backend translation, caching/reload/clear, URL encoding, invalid input, 429, network and malformed response')
