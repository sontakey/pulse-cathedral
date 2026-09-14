"""Acquire three fixed UBFC controls from a public mirror; verify original references.

The official video host is quota-limited. This mirror is not an official release.
Its reference files must match the already downloaded official files byte-for-byte.
"""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEST = Path('/Volumes/AcasisData/rPPG-datasets/ubfc-control')
DEST.mkdir(exist_ok=True)
REPO = 'thachha901/UBFC'
REV = '674723ab9ff04fb7c41507d7dda5bc92b5eeea13'
records = []

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(8*1024*1024), b''):
            h.update(block)
    return h.hexdigest()

for subject in [1, 3, 4]:
    folder = DEST / f'subject{subject}'
    folder.mkdir(exist_ok=True)
    api = f'https://huggingface.co/api/datasets/{REPO}/tree/{REV}/UBFC/subject{subject}'
    entries = json.load(urllib.request.urlopen(api, timeout=60))
    record = dict(subject=subject, mirror=REPO, revision=REV, files=[])
    # Validate the reference before downloading video.
    entries.sort(key=lambda e: e['path'].endswith('vid.avi'))
    for entry in entries:
        if Path(entry['path']).name not in ['ground_truth.txt', 'vid.avi']:
            continue
        target = folder / Path(entry['path']).name
        url = f'https://huggingface.co/datasets/{REPO}/resolve/{REV}/{entry["path"]}'
        expected = entry.get('lfs', {}).get('oid')
        if not target.exists() or target.stat().st_size != entry['size'] or (expected and sha(target) != expected):
            partial = target.with_suffix(target.suffix + '.partial')
            print('DOWNLOAD', subject, target.name, entry['size'], flush=True)
            with urllib.request.urlopen(url, timeout=90) as r, partial.open('wb') as f:
                size = 0
                milestone = 0
                while block := r.read(4*1024*1024):
                    f.write(block)
                    size += len(block)
                    if size // (256*1024*1024) > milestone:
                        milestone = size // (256*1024*1024)
                        print('  MB', size // (1024*1024), flush=True)
            assert partial.stat().st_size == entry['size']
            if expected:
                assert sha(partial) == expected, 'Mirror LFS SHA-256 mismatch'
            partial.replace(target)
        checksum = sha(target)
        if target.name == 'ground_truth.txt':
            original = ROOT / f'benchmarks/artifacts/ubfc/subject{subject}/ground_truth.txt'
            assert target.read_bytes() == original.read_bytes(), 'Official/mirror reference mismatch'
            record['officialReferenceByteMatch'] = True
        record['files'].append(dict(path=str(target), url=url, bytes=target.stat().st_size, sha256=checksum))
        print('VERIFIED', subject, target.name, flush=True)
    records.append(record)
    (DEST / 'provenance.json').write_text(json.dumps(records, indent=2))
print('COMPLETE', flush=True)
