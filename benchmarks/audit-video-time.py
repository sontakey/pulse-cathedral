"""Export actual presentation timestamps, rejecting absent/nonmonotonic video clocks."""
import json,subprocess,sys
from pathlib import Path
j=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','json',sys.argv[1]]))
ts=[float(f['best_effort_timestamp_time']) for f in j['frames']]
assert len(ts)>1 and all(b>a for a,b in zip(ts,ts[1:])), 'Video clock is missing or not strictly increasing'
Path(sys.argv[2]).write_text(json.dumps(ts));print('Exported',len(ts),'presentation timestamps')
