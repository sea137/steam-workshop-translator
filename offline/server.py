"""Optional English -> Chinese service using the official Argos model on CPU.

No Internet access at inference time. Only listens on loopback; no CORS, file,
command execution, download, or model-install HTTP endpoints.
"""
import argparse
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Translator:
    def __init__(self, model_root):
        import ctranslate2
        import sentencepiece
        root = Path(model_root)
        self.tokenizer = sentencepiece.SentencePieceProcessor(model_file=str(root / 'sentencepiece.model'))
        self.model = ctranslate2.Translator(str(root / 'model'), device='cpu', compute_type='int8',
                                           inter_threads=1, intra_threads=min(4, os.cpu_count() or 2))
        self.lock = threading.Lock()

    def translate(self, texts):
        segments, layouts = [], []
        for text in texts:
            # Preserve paragraph breaks. Split long segments by actual model tokens
            # so CTranslate2 never silently truncates the end of a description.
            layout = []
            for paragraph in re.split(r'(\n+)', text):
                if not paragraph or paragraph.isspace(): layout.append(paragraph); continue
                tokens = self.tokenizer.encode(paragraph, out_type=str)
                for i in range(0, len(tokens), 192):
                    layout.append(len(segments)); segments.append(tokens[i:i + 192])
            layouts.append(layout)
        with self.lock:
            results = self.model.translate_batch(segments, beam_size=2, max_batch_size=8,
                                                  max_input_length=192, max_decoding_length=512,
                                                  repetition_penalty=1.05) if segments else []
            rendered = [self.tokenizer.decode_pieces(x.hypotheses[0]).replace('▁', ' ').strip() for x in results]
        return [''.join(rendered[x] if isinstance(x, int) else x for x in layout) for layout in layouts]


def make_server(translator, port=17653):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass  # Do not log submitted text.
        def send_json(self, code, value):
            body = json.dumps(value, ensure_ascii=False).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers(); self.wfile.write(body)
        def trusted(self):
            return not self.headers.get('Origin') and self.headers.get('Host') in (
                f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}')
        def do_GET(self):
            if not self.trusted(): return self.send_json(403, {'ok': False})
            if self.path != '/health': return self.send_json(404, {'ok': False})
            self.send_json(200, {'ok': True, 'service': 'HaijingToolsOffline', 'version': 1, 'model': 'Argos en_zh 1.9'})
        def do_POST(self):
            if not self.trusted(): return self.send_json(403, {'ok': False})
            if self.path != '/translate': return self.send_json(404, {'ok': False})
            if self.headers.get_content_type() != 'application/json': return self.send_json(415, {'ok': False})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if size <= 0 or size > 30000: return self.send_json(413, {'ok': False})
                data = json.loads(self.rfile.read(size))
                texts = data.get('texts') if isinstance(data, dict) else None
                if not isinstance(texts, list) or not 1 <= len(texts) <= 8 or any(
                    not isinstance(s, str) or not s or len(s.encode('utf-8')) > 7000 for s in texts):
                    return self.send_json(400, {'ok': False})
                rendered = translator.translate(texts)
                self.send_json(200, {'ok': True, 'items': [{'ok': True, 'text': s} for s in rendered]})
            except (ValueError, UnicodeError): self.send_json(400, {'ok': False})
            except Exception: self.send_json(503, {'ok': False, 'error': 'Local model failed; see installation instructions.'})
    class Server(ThreadingHTTPServer):
        daemon_threads = True
        # Reject additional local requests rather than unbounded queued work.
        request_queue_size = 4
        slots = threading.BoundedSemaphore(2)
        def process_request(self, request, address):
            if not self.slots.acquire(blocking=False):
                self.shutdown_request(request); return
            try: super().process_request(request, address)
            except Exception:
                self.slots.release(); raise
        def process_request_thread(self, request, address):
            try: super().process_request_thread(request, address)
            finally: self.slots.release()
        def get_request(self):
            connection, address = super().get_request()
            connection.settimeout(5)
            return connection, address
    return Server(('127.0.0.1', port), Handler)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    args = parser.parse_args()
    make_server(Translator(args.model)).serve_forever()
