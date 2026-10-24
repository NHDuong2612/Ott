FROM python:3.13-slim-bookworm AS python-runtime
WORKDIR /build
RUN python -c "import urllib.request; urllib.request.urlretrieve('https://github.com/brettcannon/cpython-wasi-build/releases/download/v3.15.0/python-3.15.0-wasi_sdk-33.zip', 'python.zip')"
RUN python -c "import hashlib,zipfile; assert hashlib.sha256(open('python.zip','rb').read()).hexdigest()=='00b791b3729230f97a625087f534d71978433fb1e068e13a9cac8cd3f2541742'; zipfile.ZipFile('python.zip').extractall('/opt/cpython')"
COPY judge/requirements.txt /build/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY judge/sandbox.py /build/sandbox.py
RUN python /build/sandbox.py --compile

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
COPY --from=python-runtime /usr/local/lib/python3.13/site-packages/wasmtime /usr/local/lib/python3.11/dist-packages/wasmtime
COPY --from=python-runtime /usr/local/lib/python3.13/site-packages/wasmtime-50.0.1.dist-info /usr/local/lib/python3.11/dist-packages/wasmtime-50.0.1.dist-info
COPY --from=python-runtime /opt/cpython /opt/cpython
WORKDIR /app
COPY judge/package.json judge/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY judge ./judge
COPY competition ./competition
COPY lib/engine.mjs ./lib/engine.mjs
COPY lib/rules ./lib/rules
ENV JUDGE_PYTHON=python3
USER node
CMD ["node", "judge/worker.mjs"]
