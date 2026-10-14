import json, subprocess, numpy as np, scipy.io.wavfile as wf
from lib import SR, limit, lufs
O='/workspace/music_styles/trance_out';M='/workspace/music_styles';A='/workspace/shmup99/assets/music'
import os;os.makedirs(A,exist_ok=True)
def ff(*a): subprocess.run(['ffmpeg','-y','-loglevel','error',*a],check=True)
for sid in ('trance1','trance2'):
    meta=json.load(open(f'{O}/{sid}.json'));parts=[]
    for i,s in enumerate(meta['sections']):
        w=f"{O}/{s['file']}.wav"
        ff('-i',w,'-c:a','libopus','-b:a','96k','-vbr','on',f"{A}/{s['file']}.ogg")
        ff('-i',w,'-c:a','libmp3lame','-b:a','192k',f"{M}/{s['file']}.mp3")
        _,y=wf.read(w);bar=int(round(240/s['bpm']*SR));ex=y[8*bar:15*bar+bar].copy();parts.append((ex,bar))
    out=parts[0][0]
    for ex,bar in parts[1:]:
        f=np.linspace(0,np.pi/2,bar)[:,None]
        out=np.vstack([out[:-bar],out[-bar:]*np.cos(f)+ex[:bar]*np.sin(f),ex[bar:]])
    k=3*SR;out[-k:]*=np.linspace(1,0,k)[:,None]
    g=1.0
    for _ in range(3): y2=limit(out*g);g*=10**((-14-lufs(y2))/20)
    y2=limit(out*g);print(sid,'journey',round(len(y2)/SR,1),'s LUFS',round(lufs(y2),2),'peak',round(20*np.log10(np.abs(y2).max()),2))
    wf.write(f'{O}/{sid}_journey.wav',SR,y2.astype(np.float32))
    ff('-i',f'{O}/{sid}_journey.wav','-c:a','libmp3lame','-b:a','192k',f'{M}/{sid}_journey.mp3')
    ts='TRANCE1' if sid=='trance1' else 'TRANCE2'
    open(f'/workspace/shmup99/src/audio/{sid}.json','w').write(json.dumps(meta,indent=1))
