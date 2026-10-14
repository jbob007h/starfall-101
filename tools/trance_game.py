# Offline renderer for in-game trance soundtracks: 8 seamless 16-bar loops per song.
import sys, json, subprocess, numpy as np
from lib import *
import lib
OUT='/workspace/music_styles/trance_out'
def phrase_len(s): return sum(float(t.split(':')[1]) for t in s.split())
SONGS={
 'trance1':dict(name='NEON TRANCE',key='D minor',chords=[[57,62,65],[58,62,65],[57,60,65],[55,60,64]],roots=[38,34,41,36],
  A="D5:2 A5:2 F5:2 D5:2 A5:2 F5:1 G5:1 A5:2 C6:2 Bb5:3 A5:3 F5:2 D5:4 F5:2 G5:2 A5:2 F5:2 C5:2 F5:2 A5:2 C6:2 A5:2 G5:2 G5:6 E5:2 C5:4 E5:2 G5:2",
  B="D5:2 A5:2 F5:2 D5:2 A5:2 F5:1 G5:1 A5:2 C6:2 D6:3 C6:3 Bb5:2 A5:4 G5:2 F5:2 A5:2 C6:2 F6:4 E6:2 C6:2 A5:2 G5:2 E5:8 G5:4 C6:4",
  bpm=[136,138,140,142,144,146,148,150],tr=[0,0,0,0,2,2,3,5]),
 'trance2':dict(name='STARLIGHT TRANCE',key='E minor',chords=[[55,59,64],[55,60,64],[54,57,62],[54,59,63]],roots=[40,36,38,35],
  A="E5:3 G5:3 B5:2 A5:2 G5:2 F#5:2 G5:2 E5:4 C5:2 E5:2 G5:4 E5:4 F#5:3 A5:3 D6:2 C6:2 B5:2 A5:4 B5:6 A5:2 F#5:4 D#5:4 "
    "E5:3 G5:3 B5:2 E6:4 D6:2 B5:2 C6:4 B5:2 G5:2 E5:4 G5:4 A5:3 F#5:3 D5:2 F#5:2 A5:2 D6:4 D#6:4 B5:4 F#5:4 D#5:4",
  B="B5:2 B5:2 G5:2 E5:2 B5:3 C6:3 B5:2 G5:3 E5:3 C5:2 E5:2 G5:2 C6:4 A5:2 A5:2 F#5:2 D5:2 A5:3 B5:3 A5:2 F#5:3 D#5:3 B4:2 D#5:2 F#5:2 B5:4 "
    "E6:4 D6:2 B5:2 G5:4 B5:4 C6:4 E6:4 D6:2 C6:2 B5:2 G5:2 A5:2 B5:2 C6:2 D6:2 F#6:4 E6:2 D6:2 D#6:8 F#6:4 B5:4",
  bpm=[134,136,138,141,144,146,149,152],tr=[0,0,0,0,1,1,3,5]),
}
SEC_NAMES=['LAUNCH','CRUISE','PURSUIT','ASSAULT','OVERDRIVE','HYPERSPACE','BOSS','FINAL DUEL']
def pluck(f,d,br=6000):
    n=int(0.35*SR);t=np.arange(n)/SR
    x=saw(f,n)+saw(f*1.007,n)+0.5*pulse(f*2,n);x=filt(x,'lp',500+br*np.exp(-t/0.05),q=1.4)
    return x*np.exp(-t/0.15)*0.4
def ssaw(f,d,oct=1):
    n=int((d+0.4)*SR);x=supersaw(f*oct,n,9,0.25)+0.4*supersaw(f*oct*2,n,5,0.2)
    return filt(x,'lp',7000)*adsr(n,0.005,0.25,0.8,0.18,d)[:,None]*0.25
def pad(f,d):
    n=int((d+0.8)*SR);return filt(supersaw(f,n,7,0.2),'lp',3000)*adsr(n,0.2,1,0.85,0.6,d)[:,None]
def bass(f,d):
    n=int((d+0.03)*SR);t=np.arange(n)/SR
    x=saw(f,n)+0.7*sine(f,n);x=filt(x,'lp',300+1500*np.exp(-t/0.05),q=1.2)
    return np.tanh(1.6*x*adsr(n,0.002,0.1,0.6,0.02,d))*0.6
def render(sid,si):
    P=SONGS[sid];BARS=16;bpm=P['bpm'][si];k=P['tr'][si]
    pb=int(phrase_len(P['A'])//16);assert phrase_len(P['A'])==phrase_len(P['B'])==pb*16 and 16%(2*pb)==0
    lib.R=np.random.default_rng(100*si+(7 if sid=='trance1' else 11))
    S=Song(bpm,BARS,tail=4.0);st=S.st
    K=kick(200,48,0.03,0.32,0.6,2.8,0.5);CL=clap();SN=snare(200,0.05,0.12,0.75,0.3);HC=hat(0.03);HO=hat(0.12,0.4,6500);CR=crash()
    kt=[];boss=si>=6
    for bar in range(BARS):
        c=bar%4;ch=[n+k for n in P['chords'][c]];r=P['roots'][c]+k
        kicks=[0,4,8,12] if bar!=15 else [0,4,8]
        if si==0 and bar==15: kicks=[0,4]
        for b in kicks: S.add('kick',K,S.T(bar,b));kt.append(S.T(bar,b))
        for s in range(16):
            if s%4==2: S.add('hat',HO,S.T(bar,s),0.15,0.5)
            if si>=1 or s%2==0: S.add('hat',HC,S.T(bar,s),-0.3,0.3 if s%2 else 0.15)
        if si>=1 and bar!=15:
            for b in (4,12): S.add('clap',CL,S.T(bar,b),0,0.7)
        if bar in (0,8) and si>=2 or bar==0: S.add('fx',CR,S.T(bar),0,0.8 if si>=1 else 0.4)
        # bass: offbeat (sparse early), rolling 16ths from section 2, octave pops in boss
        for s in range(16):
            if s%4==0 or (bar==15 and s>=12): continue
            if si<2 and s%4!=2: continue
            S.add('bass',bass(float(mf(r+(12 if (boss and s%4==3) else 0))),st*0.85),S.T(bar,s),0,0.8)
        tones=ch+[ch[0]+12,ch[1]+12]
        pat=[0,2,4,1,3,2,4,0,2,4,3,1,4,2,3,0] if sid=='trance1' else [0,1,2,3,4,3,2,1,0,2,4,2,3,1,4,2]
        oc=12*(1 if si<5 else 2)
        for s in range(16):
            S.add('arp',pluck(float(mf(tones[pat[s]]+oc)),st,3000+700*si),S.T(bar,s),0.5 if s%2 else -0.5,0.4)
        if si>=3:  # second arp an octave up, sparser, opposite pattern
            for s in range(0,16,2): S.add('arp2',pluck(float(mf(tones[pat[15-s]]+oc+12)),st),S.T(bar,s),-0.6 if s%4 else 0.6,0.3)
        for n in ch: S.add('pad',pad(float(mf(n)),S.bar*0.97),S.T(bar),R.uniform(-.4,.4),0.25)
        if si>=5 or (si==4 and bar>=8):
            for s in ((2,6,10,14,15) if boss else (2,6,10,14)):
                for n in ch: S.add('stab',ssaw(float(mf(n+12)),st*0.8),S.T(bar,s),0,0.35)
    # 2-bar build into the loop point
    for i in range(16 if si<4 else 32):
        pos=14+2*i/(16 if si<4 else 32);S.add('roll',SN,pos*S.bar,0,0.15+0.6*((pos-14)/2)**2)
    S.add('fx',riser(S.bar*2,200,12000,2.5),S.T(14),0,0.25+0.03*si)
    if si>=2: S.add('fx',impact(),S.T(0),0,0.3+0.03*si)
    # melodies: A over bars 0-7, B over bars 8-15
    A=[];B=[]
    for o in range(0,16,2*pb): A+=parse(P['A'],o,k);B+=parse(P['B'],o+pb,k)
    if si==0: S.play('plk',A+B,pluck,0.1,0.8)
    elif si==1: S.play('plk',A+B,pluck,0.1,0.8);S.play('lead',B,ssaw,g=0.6)
    else:
        S.play('lead',A+B,ssaw)
        S.play('plk',A+B,lambda f,d:pluck(f,d),-0.1,0.5,tr=12 if si>=3 else 0)
        if si>=3: S.play('lead',A+B,lambda f,d:ssaw(f,d,0.5),g=0.55)
        if si>=6: S.play('lead',B,lambda f,d:ssaw(f,d,2.0),g=0.35)
    B_=S.b
    for nm_ in ('arp2','stab','lead','plk','roll','clap'): S.bus(nm_)
    cut=4500+1800*si if si<3 else 16000
    # mix: lead/synths/arps forward, drums & bass a touch lower than preview
    musicraw=B_['arp']*0.62+B_['arp2']*0.5+B_['pad']*0.3+B_['plk']*0.55+B_['lead']*0.85+B_['stab']*0.4
    send=reverb(B_['arp']*0.3+B_['pad']*0.4+B_['plk']*0.5+B_['lead']*0.4+B_['stab']*0.3+B_['arp2']*0.3,3.0,0.03,6000)*0.4
    send+=delay(B_['lead']+B_['plk']+B_['arp']*0.3,S.beat*0.75,0.35)*0.22
    music=filt(musicraw+send,'lp',cut,q=0.9)
    g=pump(S.N,kt,0.45,0.11)[:,None]
    music=music*g+B_['bass']*0.42*g
    drums=B_['kick']*0.72+B_['clap']*0.33+reverb(B_['clap'],1.2)*0.1+B_['hat']*0.34+B_['roll']*0.3+reverb(B_['roll'],1.5)*0.12
    mix=drums+music+B_['fx']*0.45+reverb(B_['fx'],2.5)*0.18
    L=int(round(BARS*S.bar*SR));loop=mix[:L].copy();tail=mix[L:]
    loop[:len(tail)]+=tail[:L]  # wrap tail around loop point
    # master 3 copies, keep middle -> limiter/filters are periodic, seamless
    x=filt(np.vstack([loop]*3),'hp',28);x/=np.max(np.abs(x));gain=1.0
    for _ in range(4):
        y=limit(np.tanh(x*gain*0.7)/0.7);gain*=10**((-14.0-lufs(y))/20)
    y=limit(np.tanh(x*gain*0.7)/0.7)[L:2*L]
    nm2=f'{sid}_{si+1}'
    print(nm2,bpm,'LUFS',round(lufs(y),2),'peak',round(20*np.log10(np.max(np.abs(y))),2),'len',round(L/SR,2),flush=True)
    wf.write(f'{OUT}/{nm2}.wav',SR,y.astype(np.float32))
    return dict(file=f'{sid}_{si+1}',bpm=bpm,bars=BARS,samples=L,name=SEC_NAMES[si])
if __name__=='__main__':
    sid=sys.argv[1];secs=[render(sid,i) for i in range(8)]
    json.dump(dict(name=SONGS[sid]['name'],key=SONGS[sid]['key'],sections=secs),open(f'{OUT}/{sid}.json','w'),indent=1)
