"""Local diagnostic UI and on-demand control frames; never uploads or auto-records."""
import argparse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import cv2
import os

ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path('/Volumes/AcasisData/rPPG-datasets/ubfc-control')
parser=argparse.ArgumentParser()
parser.add_argument('--port',type=int,default=8991)
args=parser.parse_args()
os.chdir(ROOT)
captures={}
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  route=urlparse(self.path)
  if route.path=='/source-frame':
   try:
    query=parse_qs(route.query);name=query['recording'][0];index=int(query['index'][0])
    if name not in ['subject1','subject3','subject4']:raise ValueError('Unknown recording')
    if name not in captures:captures[name]=cv2.VideoCapture(str(SOURCE/name/'vid.avi'))
    cap=captures[name]
    if index<0 or index>=cap.get(cv2.CAP_PROP_FRAME_COUNT):raise ValueError('Invalid frame index')
    cap.set(cv2.CAP_PROP_POS_FRAMES,index)
    ok,frame=cap.read()
    if not ok:raise ValueError('Cannot decode frame')
    ok,png=cv2.imencode('.png',frame,[cv2.IMWRITE_PNG_COMPRESSION,1])
    if not ok:raise ValueError('Cannot encode frame')
    data=png.tobytes()
    self.send_response(200);self.send_header('Content-Type','image/png');self.send_header('Cache-Control','no-store')
    self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
   except (ValueError,KeyError):self.send_error(404)
   return
  if route.path=='/':self.path='/benchmarks/replay.html'
  elif not route.path.startswith(('/benchmarks/','/js/')):self.send_error(404);return
  resolved=Path(self.translate_path(self.path)).resolve()
  if not any(resolved.is_relative_to(ROOT/p) for p in ['benchmarks','js']):self.send_error(404);return
  return super().do_GET()
print(f'Local diagnostic replay: http://127.0.0.1:{args.port}/',flush=True)
HTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
