"""Trusted host. Student Python is executed ONLY inside CPython WebAssembly."""
import json
import os
import sys
import importlib.metadata
from pathlib import Path
import wasmtime

RUNTIME = Path(os.environ.get('WASI_PYTHON_DIR', '/opt/cpython'))
GUEST = r'''
import sys, json, random
boot = json.loads(sys.stdin.readline())
random.seed(boot['seed'])
scope = {'__name__': 'student_bot'}
exec(compile(boot['source'], 'bot.py', 'exec'), scope)
if not callable(scope.get('choose_move')):
    raise TypeError('Thiếu hàm choose_move(state)')
print('READY', flush=True)
for line in sys.stdin:
    state = json.loads(line)
    move = scope['choose_move'](state)
    print(json.dumps(move, separators=(',', ':')), flush=True)
'''


def engine_config():
    config = wasmtime.Config()
    config.consume_fuel = True
    config.wasm_threads = False
    config.wasm_memory64 = False
    config.cranelift_nan_canonicalization = True
    return config


def main():
    if importlib.metadata.version('wasmtime') != '50.0.1':
        raise RuntimeError('Runtime version mismatch')
    engine = wasmtime.Engine(engine_config())
    compiled = RUNTIME / 'python.cwasm'
    if '--compile' in sys.argv:
        compiled.write_bytes(wasmtime.Module.from_file(engine, str(RUNTIME / 'python.wasm')).serialize())
        return
    # Only a host-created, read-only artifact is deserialized. Never accept Wasm uploads.
    module = wasmtime.Module.deserialize_file(engine, str(compiled)) if compiled.exists() else wasmtime.Module.from_file(engine, str(RUNTIME / 'python.wasm'))
    store = wasmtime.Store(engine)
    store.set_limits(memory_size=int(os.environ.get('BOT_MEMORY_MB', '128')) * 1048576, instances=1, memories=1, tables=4, table_elements=100000)
    store.set_fuel(5_000_000_000)
    wasi = wasmtime.WasiConfig()
    wasi.argv = ['python', '-B', '-u', '-c', GUEST]
    wasi.env = [('PYTHONPATH', '/lib/python3.15'), ('PYTHONHASHSEED', '0'), ('PYTHONDONTWRITEBYTECODE', '1')]
    wasi.preopen_dir(str(RUNTIME / 'lib'), '/lib', fs_mutable=False)
    wasi.inherit_stdin()
    count = [0]

    def output(data):
        count[0] += len(data)
        if count[0] > 65536:
            os._exit(73)
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()
        return len(data)

    def errors(data):
        # No paths, secrets or host tracebacks are exposed to the guest.
        count[0] += len(data)
        if count[0] > 65536:
            os._exit(73)
        sys.stderr.buffer.write(data)
        sys.stderr.buffer.flush()
        return len(data)

    wasi.stdout_custom = output
    wasi.stderr_custom = errors
    store.set_wasi(wasi)
    linker = wasmtime.Linker(engine)
    linker.define_wasi()
    instance = linker.instantiate(store, module)
    print('HOST_READY', flush=True)
    instance.exports(store)['_start'](store)


if __name__ == '__main__':
    try:
        main()
    except wasmtime.ExitTrap as exc:
        sys.exit(exc.code)
    except Exception:
        print('Sandbox đã dừng: hết tài nguyên hoặc Python gặp lỗi.', file=sys.stderr)
        sys.exit(70)
