"""Local-only sequential lossless frame decoder for benchmark replay; no uploads."""
import argparse, cv2, json
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('video');p.add_argument('--port',type=int,default=8987);p.add_argument('--width',type=int,default=0);p.add_argument('--timestamps');a=p.parse_args()
cap=cv2.VideoCapture(a.video)
assert cap.isOpened(), 'Cannot decode video'
info=dict(fps=cap.get(cv2.CAP_PROP_FPS),frames=int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),width=int(cap.get(3)),height=int(cap.get(4)))
info['sourceWidth']=info['width'];info['sourceHeight']=info['height']
if a.width:
 info['height']=round(info['height']*a.width/info['width']);info['width']=a.width
if a.timestamps:info['timestamps']=json.loads(Path(a.timestamps).read_text())
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  if self.path=='/video-info':
   data=json.dumps(info).encode();mime='application/json'
  elif self.path.startswith('/frame/'):
   index=int(self.path.split('/')[-1]);current=int(cap.get(cv2.CAP_PROP_POS_FRAMES))
   if index<current or index-current>120:cap.set(cv2.CAP_PROP_POS_FRAMES,index)
   else:
    while int(cap.get(cv2.CAP_PROP_POS_FRAMES))<index:cap.grab()
   ok,frame=cap.read()
   if not ok:self.send_error(404);return
   if a.width:frame=cv2.resize(frame,(info['width'],info['height']),interpolation=cv2.INTER_AREA)
   ok,png=cv2.imencode('.png',frame,[cv2.IMWRITE_PNG_COMPRESSION,1]);data=png.tobytes();mime='image/png'
  else:return super().do_GET()
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
print(json.dumps({k:v for k,v in info.items() if k!='timestamps'}),flush=True)
HTTPServer(('127.0.0.1',a.port),Handler).serve_forever()
