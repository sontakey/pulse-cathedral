"""Replay the three controls through actual browser MediaPipe and production sampling."""
import os
from pathlib import Path
import subprocess
import time
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'benchmarks/artifacts/control'
SOURCE=Path('/Volumes/AcasisData/rPPG-datasets/ubfc-control')
env={**os.environ,'NODE_PATH':'/Users/anton/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules',
     'BASE_URL':'http://127.0.0.1:8990','REPLAY_SECONDS':'3600','REPLAY_START_SECONDS':'0','REPLAY_DIAGNOSTICS':'1'}
for subject in [1,3,4]:
    name=f'subject{subject}'
    folder=OUT/name
    print('BROWSER EXTRACT',name,flush=True)
    server=subprocess.Popen(['python3','benchmarks/video-server.py',str(SOURCE/name/'vid.avi'),
                             '--port','8990','--timestamps',str(folder/'timestamps.json')],cwd=ROOT)
    try:
        ready=False
        for _ in range(100):
            try:
                with urllib.request.urlopen('http://127.0.0.1:8990/video-info',timeout=1):ready=True
                break
            except OSError:time.sleep(.1)
        assert ready,'Frame server unavailable'
        subprocess.run(['node','benchmarks/extract-video.cjs',str(folder/'session.json')],cwd=ROOT,
                       env={**env,'DATASET':f'UBFC-rPPG {name}; official reference matched, mirror video'},check=True)
        subprocess.run(['node','benchmarks/replay-stages.js',str(folder/'session.json'),str(folder/'stages.json')],cwd=ROOT,check=True)
    finally:
        server.terminate()
        server.wait(timeout=10)
print('BROWSER REPLAY COMPLETE',flush=True)
