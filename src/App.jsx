import { useState, useRef, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const SB_URL = "https://kiaccwwgmrveaqcmiatw.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpYWNjd3dnbXJ2ZWFxY21pYXR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NTUyMjYsImV4cCI6MjA5MTUzMTIyNn0.9SRA-xO1rkAve4rFKLqe2PI-jRhkoe8ZercBfmkVD_4";
const SB_HEADERS = {"Content-Type":"application/json","apikey":SB_KEY,"Authorization":`Bearer ${SB_KEY}`};

const sb = {
  async getRoom(id){
    const r = await fetch(`${SB_URL}/rest/v1/game_rooms?id=eq.${id}&select=*`,{headers:SB_HEADERS});
    const d = await r.json();
    return d[0]||null;
  },
  async createRoom(id, state){
    await fetch(`${SB_URL}/rest/v1/game_rooms`,{
      method:"POST", headers:{...SB_HEADERS,"Prefer":"return=minimal"},
      body:JSON.stringify({id, state}),
    });
  },
  async updateRoom(id, state){
    await fetch(`${SB_URL}/rest/v1/game_rooms?id=eq.${id}`,{
      method:"PATCH", headers:{...SB_HEADERS,"Prefer":"return=minimal"},
      body:JSON.stringify({state, updated_at: new Date().toISOString()}),
    });
  },
  // Long-poll: check for changes every 1.2s
  pollRoom(id, onUpdate, intervalMs=1200){
    let lastUpdated = null;
    const t = setInterval(async()=>{
      try{
        const room = await sb.getRoom(id);
        if(!room) return;
        if(room.updated_at !== lastUpdated){
          lastUpdated = room.updated_at;
          onUpdate(room.state);
        }
      }catch(e){}
    }, intervalMs);
    return ()=>clearInterval(t);
  }
};

// Generate a random 6-char room code
const genCode = ()=>Math.random().toString(36).slice(2,8).toUpperCase();

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const F = "'Plus Jakarta Sans', sans-serif";
const GOLD = "#FFD060", GOLDD = "#C87800";
const GOLDBTN = `linear-gradient(135deg,${GOLD},${GOLDD})`;
const TABLE_BG = `repeating-linear-gradient(92deg,transparent,transparent 8px,rgba(0,0,0,.06) 8px,rgba(0,0,0,.06) 9px),linear-gradient(155deg,#3B1E0E 0%,#1E0A04 35%,#2E1408 60%,#180804 100%)`;

const BS=9, WG=8, CS=44, GP=5, PAD=14, UN=CS+GP;
const BP = BS*CS + (BS-1)*GP + PAD*2;

const cx = c => PAD + c*UN;
const cy = r => PAD + r*UN;
const GOALS = [0,8];

const P1C="#0097A7", P1L="#80DEEA", P1D="#005F6A";
const P2C="#E91E63", P2L="#F48FB1", P2D="#880E4F";
const PC=[P1C,P2C], PL=[P1L,P2L], PD=[P1D,P2D], PN=["TEAL","PINK"];
const WALLT="#C8860A", WALLM="#A86808", WALLB="#7A4C08", WALLHI="#FFD060";

// ─────────────────────────────────────────────────────────────────────────────
// SOUND ENGINE  (Web Audio API — no files, synthesized)
// ─────────────────────────────────────────────────────────────────────────────
let _ctx = null;
const ctx = () => {
  if(!_ctx) _ctx = new (window.AudioContext||window.webkitAudioContext)();
  return _ctx;
};

const playTone = (freq, type, duration, vol=0.18, decay=true) => {
  try {
    const ac = ctx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    gain.gain.setValueAtTime(vol, ac.currentTime);
    if(decay) gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration);
  } catch(e) {}
};

const SFX = {
  move: ()=>{
    playTone(520, "sine", 0.08, 0.15);
    setTimeout(()=>playTone(680, "sine", 0.06, 0.1), 40);
  },
  wall: ()=>{
    playTone(120, "sawtooth", 0.12, 0.22);
    playTone(80,  "square",   0.14, 0.18);
  },
  invalid: ()=>{
    playTone(180, "square", 0.08, 0.12);
    setTimeout(()=>playTone(140, "square", 0.08, 0.1), 60);
  },
  tick: ()=>{ playTone(880, "sine", 0.05, 0.08); },
  urgentTick: ()=>{ playTone(1100, "square", 0.06, 0.1); },
  win: ()=>{
    const notes=[523,659,784,1047];
    notes.forEach((f,i)=>setTimeout(()=>playTone(f,"sine",0.3,0.2),i*120));
  },
  lose: ()=>{
    [400,320,240].forEach((f,i)=>setTimeout(()=>playTone(f,"sawtooth",0.25,0.15),i*130));
  },
  turnStart: ()=>{ playTone(440,"sine",0.07,0.1); },
};

// ─────────────────────────────────────────────────────────────────────────────
// BACKGROUND MUSIC  — melodic looping BGM, synthesized
// ─────────────────────────────────────────────────────────────────────────────
let _music = null;
let _musicTimer = null;

// A cheerful pentatonic melody (D major penta: D E F# A B)
const MELODY = [
  // note freq, duration(s), gap after(s)
  [293.7, 0.18, 0.06],  // D
  [329.6, 0.18, 0.06],  // E
  [369.9, 0.28, 0.06],  // F#
  [440.0, 0.18, 0.06],  // A
  [493.9, 0.36, 0.12],  // B  (held)
  [440.0, 0.18, 0.06],  // A
  [369.9, 0.18, 0.06],  // F#
  [329.6, 0.28, 0.12],  // E  (held)
  [293.7, 0.18, 0.06],  // D
  [369.9, 0.18, 0.06],  // F#
  [440.0, 0.18, 0.06],  // A
  [587.3, 0.36, 0.12],  // D high (held)
  [493.9, 0.18, 0.06],  // B
  [440.0, 0.18, 0.06],  // A
  [369.9, 0.28, 0.08],  // F#
  [329.6, 0.18, 0.06],  // E
  [293.7, 0.48, 0.30],  // D long (phrase end)
];

// Gentle chords played every ~2 bars under the melody
const CHORDS = [
  [293.7, 369.9, 440.0],  // D major
  [329.6, 415.3, 493.9],  // E minor
  [369.9, 440.0, 554.4],  // F# minor
  [293.7, 369.9, 440.0],  // D major
];

function playNote(ac, master, freq, start, dur, vol=0.13){
  try{
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = "triangle";  // warmer than sine, less harsh than sawtooth
    osc.frequency.setValueAtTime(freq, start);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(vol, start + 0.02);
    env.gain.setValueAtTime(vol, start + dur - 0.04);
    env.gain.linearRampToValueAtTime(0, start + dur);
    osc.connect(env); env.connect(master);
    osc.start(start); osc.stop(start + dur + 0.05);
  }catch(e){}
}

function scheduleLoop(ac, master){
  if(!_music) return;
  let t = ac.currentTime + 0.05;

  // Schedule melody
  MELODY.forEach(([freq, dur, gap])=>{
    playNote(ac, master, freq, t, dur, 0.11);
    t += dur + gap;
  });

  // Schedule background chords underneath (softer, longer)
  let ct = ac.currentTime + 0.05;
  CHORDS.forEach(notes=>{
    notes.forEach(f=>playNote(ac, master, f, ct, 1.8, 0.028));
    ct += 2.0;
  });

  // Total loop length — schedule next loop slightly before end
  const loopLen = MELODY.reduce((s,[,d,g])=>s+d+g, 0);
  _musicTimer = setTimeout(()=>scheduleLoop(ac, master), (loopLen - 0.3) * 1000);
}

function startMusic(){
  if(_music) return;
  try{
    const ac = ctx();
    const master = ac.createGain();
    // Slight reverb-like effect using a delay node
    const delay = ac.createDelay(0.4);
    const delayGain = ac.createGain();
    delay.delayTime.setValueAtTime(0.25, ac.currentTime);
    delayGain.gain.setValueAtTime(0.18, ac.currentTime);
    master.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(master);
    master.connect(ac.destination);
    master.gain.setValueAtTime(0, ac.currentTime);
    master.gain.linearRampToValueAtTime(0.7, ac.currentTime + 1.5);
    _music = { ac, master };
    scheduleLoop(ac, master);
  }catch(e){}
}

function stopMusic(){
  if(!_musicTimer) clearTimeout(_musicTimer);
  _musicTimer = null;
  if(!_music) return;
  try{
    _music.master.gain.linearRampToValueAtTime(0, _music.ac.currentTime + 1.2);
    setTimeout(()=>{ _music=null; }, 1300);
  }catch(e){ _music=null; }
}

function MusicController({enabled}){
  useEffect(()=>{
    if(enabled) startMusic();
    else stopMusic();
    return()=>{};
  },[enabled]);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFETTI
// ─────────────────────────────────────────────────────────────────────────────
function Confetti(){
  const COLORS=["#FFD060","#0097A7","#E91E63","#80DEEA","#F48FB1","#fff","#FF6B35","#50DC78"];
  const pieces = Array.from({length:60},(_,i)=>({
    id:i,
    x:Math.random()*100,
    delay:Math.random()*0.8,
    duration:1.8+Math.random()*1.4,
    color:COLORS[i%COLORS.length],
    size:6+Math.random()*8,
    rotate:Math.random()*360,
    shape:Math.random()>0.5?"circle":"rect",
  }));
  return(
    <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden",zIndex:10}}>
      <style>{`
        @keyframes fall{
          0%{transform:translateY(-20px) rotate(0deg);opacity:1}
          100%{transform:translateY(110vh) rotate(720deg);opacity:0}
        }
      `}</style>
      {pieces.map(p=>(
        <div key={p.id} style={{
          position:"absolute",
          left:`${p.x}%`,
          top:0,
          width:p.size,
          height:p.shape==="circle"?p.size:p.size*0.4,
          borderRadius:p.shape==="circle"?"50%":"2px",
          background:p.color,
          animation:`fall ${p.duration}s ease-in ${p.delay}s forwards`,
          transform:`rotate(${p.rotate}deg)`,
          boxShadow:`0 0 6px ${p.color}80`,
        }}/>
      ))}
    </div>
  );
}

const CAMS=[
  {id:"top",   label:"TOP",   rx:0,  rz:0},
  {id:"table", label:"TABLE", rx:18, rz:0},
  {id:"p1",    label:"P1",    rx:30, rz:0},
  {id:"p2",    label:"P2",    rx:30, rz:180},
];

// ─────────────────────────────────────────────────────────────────────────────
// GAME LOGIC
// ─────────────────────────────────────────────────────────────────────────────
function isBlocked(r,c,dr,dc,hW,vW){
  const nr=r+dr, nc=c+dc;
  if(nr<0||nr>=BS||nc<0||nc>=BS) return true;
  if(dr===-1) return (c<=7&&hW[r-1]?.[c]!==-1)||(c>=1&&hW[r-1]?.[c-1]!==-1);
  if(dr===1)  return (c<=7&&hW[r]?.[c]!==-1)||(c>=1&&hW[r]?.[c-1]!==-1);
  if(dc===-1) return (r<=7&&vW[r]?.[c-1]!==-1)||(r>=1&&vW[r-1]?.[c-1]!==-1);
  if(dc===1)  return (r<=7&&vW[r]?.[c]!==-1)||(r>=1&&vW[r-1]?.[c]!==-1);
  return false;
}
const D4=[[-1,0],[1,0],[0,-1],[0,1]];

function bfs(sr,sc,goal,hW,vW){
  const v=Array.from({length:9},()=>Array(9).fill(false));
  const q=[[sr,sc]]; v[sr][sc]=true;
  while(q.length){
    const[r,c]=q.shift();
    if(r===goal) return true;
    for(const[dr,dc]of D4){
      const nr=r+dr,nc=c+dc;
      if(nr>=0&&nr<9&&nc>=0&&nc<9&&!v[nr][nc]&&!isBlocked(r,c,dr,dc,hW,vW)){
        v[nr][nc]=true; q.push([nr,nc]);
      }
    }
  }
  return false;
}

function getVM(pi,players,hW,vW){
  const{row:r,col:c}=players[pi], opp=players[1-pi], mv=[];
  for(const[dr,dc]of D4){
    if(isBlocked(r,c,dr,dc,hW,vW)) continue;
    const nr=r+dr, nc=c+dc;
    if(nr===opp.row&&nc===opp.col){
      if(!isBlocked(nr,nc,dr,dc,hW,vW)) mv.push([nr+dr,nc+dc]);
      else for(const[pr,pc2]of(dr!==0?[[0,-1],[0,1]]:[[-1,0],[1,0]]))
        if(!isBlocked(nr,nc,pr,pc2,hW,vW)) mv.push([nr+pr,nc+pc2]);
    } else mv.push([nr,nc]);
  }
  return mv;
}

function canPlace(wr,wc,ori,hW,vW,pl){
  if(wr<0||wr>=WG||wc<0||wc>=WG) return false;
  if(ori==="h"){
    if(hW[wr][wc]!==-1||vW[wr][wc]!==-1) return false;
    if(wc>0&&hW[wr][wc-1]!==-1) return false;
    if(wc<7&&hW[wr][wc+1]!==-1) return false;
  } else {
    if(vW[wr][wc]!==-1||hW[wr][wc]!==-1) return false;
    if(wr>0&&vW[wr-1][wc]!==-1) return false;
    if(wr<7&&vW[wr+1][wc]!==-1) return false;
  }
  const nh=hW.map(x=>[...x]), nv=vW.map(x=>[...x]);
  ori==="h"?(nh[wr][wc]=0):(nv[wr][wc]=0);
  return bfs(pl[0].row,pl[0].col,0,nh,nv)&&bfs(pl[1].row,pl[1].col,8,nh,nv);
}

const INIT=()=>{
  const first=Math.random()<0.5?0:1;
  return{
    players:[{row:8,col:4,walls:10},{row:0,col:4,walls:10}],
    hW:Array(8).fill(null).map(()=>Array(8).fill(-1)),
    vW:Array(8).fill(null).map(()=>Array(8).fill(-1)),
    turn:first, mode:"move", ori:"h", winner:null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// AI LOGIC  (difficulty: "easy" | "medium" | "hard")
// ─────────────────────────────────────────────────────────────────────────────

function bfsPath(sr,sc,goal,hW,vW){
  const v=Array.from({length:9},()=>Array(9).fill(false));
  const q=[[sr,sc,[[sr,sc]]]]; v[sr][sc]=true;
  while(q.length){
    const[r,c,path]=q.shift();
    if(r===goal) return path;
    for(const[dr,dc]of D4){
      const nr=r+dr,nc=c+dc;
      if(nr>=0&&nr<9&&nc>=0&&nc<9&&!v[nr][nc]&&!isBlocked(r,c,dr,dc,hW,vW)){
        v[nr][nc]=true; q.push([nr,nc,[...path,[nr,nc]]]);
      }
    }
  }
  return null;
}

function findBestBlock(human,humanPath,hW,vW,players){
  let bestWall=null, bestGain=0;
  for(let wr=0;wr<8;wr++){
    for(let wc=0;wc<8;wc++){
      for(const ori of["h","v"]){
        if(!canPlace(wr,wc,ori,hW,vW,players)) continue;
        const nh=hW.map(x=>[...x]),nv=vW.map(x=>[...x]);
        ori==="h"?(nh[wr][wc]=1):(nv[wr][wc]=1);
        const newPath=bfsPath(human.row,human.col,0,nh,nv);
        if(!newPath) continue;
        const gain=(newPath.length-1)-(humanPath.length-1);
        if(gain>bestGain){bestGain=gain;bestWall={type:"wall",wr,wc,ori};}
      }
    }
  }
  return{wall:bestWall,gain:bestGain};
}

function aiPickMove(g, difficulty="medium"){
  const ai=g.players[1], human=g.players[0];
  const hW=g.hW, vW=g.vW;
  const aiPath   =bfsPath(ai.row,   ai.col,   8, hW, vW);
  const humanPath=bfsPath(human.row, human.col, 0, hW, vW);
  const aiDist   =aiPath    ? aiPath.length-1    : 99;
  const humanDist=humanPath ? humanPath.length-1 : 99;

  // Always win if possible
  if(aiPath&&aiPath[1]&&aiPath[1][0]===8)
    return{type:"move",row:8,col:aiPath[1][1]};

  // ── EASY: just walk forward, never block ────────────────────────────────
  if(difficulty==="easy"){
    // 10% chance of a random sideways step to feel less robotic
    if(aiPath&&aiPath[1]&&Math.random()<0.1){
      const vm=getVM(1,g.players,hW,vW);
      if(vm.length>0){const r=vm[Math.floor(Math.random()*vm.length)];return{type:"move",row:r[0],col:r[1]};}
    }
    if(aiPath&&aiPath[1]) return{type:"move",row:aiPath[1][0],col:aiPath[1][1]};
    return null;
  }

  // ── MEDIUM: block when human is close or clearly ahead ─────────────────
  if(difficulty==="medium"){
    if(humanDist<=1&&ai.walls>0){const{wall}=findBestBlock(human,humanPath,hW,vW,g.players);if(wall)return wall;}
    if(humanDist<=2&&ai.walls>0){const{wall,gain}=findBestBlock(human,humanPath,hW,vW,g.players);if(wall&&gain>=1)return wall;}
    if(ai.walls>0&&humanDist<aiDist-1){const{wall,gain}=findBestBlock(human,humanPath,hW,vW,g.players);if(wall&&gain>=2)return wall;}
    if(ai.walls>0&&humanDist<=5){const{wall,gain}=findBestBlock(human,humanPath,hW,vW,g.players);if(wall&&gain>=3)return wall;}
    if(aiPath&&aiPath[1]) return{type:"move",row:aiPath[1][0],col:aiPath[1][1]};
    return null;
  }

  // ── HARD: very aggressive — blocks early, even when not threatened ──────
  if(difficulty==="hard"){
    // Always try to block if it costs human even 1 step and AI has walls
    if(ai.walls>0&&humanPath){
      const{wall,gain}=findBestBlock(human,humanPath,hW,vW,g.players);
      // Block if: human close to winning, OR human significantly ahead, OR gain is large
      const shouldBlock =
        humanDist<=3 ||
        humanDist<aiDist ||
        gain>=4 ||
        (gain>=2&&Math.random()<0.7); // 70% chance to block even small gains
      if(wall&&shouldBlock) return wall;
    }
    // Also try to find a smarter move — prefer cells that shorten AI path most
    if(aiPath&&aiPath[1]) return{type:"move",row:aiPath[1][0],col:aiPath[1][1]};
    return null;
  }

  return null;
}

function WinSound({winner}){
  useEffect(()=>{ if(winner===0)SFX.win(); else SFX.lose(); },[]);
  return null;
}

function BackHeader({onBack,title,subtitle}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 20px",
      background:"rgba(0,0,0,.5)",backdropFilter:"blur(12px)",
      borderBottom:"1px solid rgba(255,208,96,.1)",
      position:"sticky",top:0,zIndex:10,flexShrink:0}}>
      <button onClick={onBack} style={{
        width:42,height:42,borderRadius:12,border:"1px solid rgba(255,208,96,.25)",
        background:"rgba(255,208,96,.1)",color:GOLD,fontSize:20,cursor:"pointer",
        fontFamily:F,display:"flex",alignItems:"center",justifyContent:"center",
        fontWeight:700,flexShrink:0,
      }}>‹</button>
      <div>
        <div style={{fontSize:18,fontWeight:900,color:GOLD,lineHeight:1}}>{title}</div>
        {subtitle&&<div style={{fontSize:9,color:"rgba(255,210,80,.4)",
          letterSpacing:".12em",fontWeight:600,marginTop:2}}>{subtitle}</div>}
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
function Pawn({pi}){
  const base=PC[pi], light=PL[pi], dark=PD[pi];
  return(
    <div style={{
      position:"absolute", bottom:2, left:"50%",
      transform:"translateX(-50%)",
      width:26, height:32,
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-end",
      filter:`drop-shadow(0 4px 8px rgba(0,0,0,.7))`,
      pointerEvents:"none",
    }}>
      <div style={{width:10,height:5,background:`linear-gradient(to bottom,${base},${dark})`,borderRadius:"3px 3px 0 0"}}/>
      <div style={{width:21,height:6,borderRadius:"3px 3px 2px 2px",
        background:`linear-gradient(to bottom,${dark},rgba(0,0,0,.9))`,
        boxShadow:"0 2px 4px rgba(0,0,0,.6)"}}/>
      <div style={{
        position:"absolute", top:0, left:"50%", transform:"translateX(-50%)",
        width:21, height:21, borderRadius:"50% 50% 46% 46%",
        background:`radial-gradient(circle at 36% 28%,${light},${base} 48%,${dark} 90%)`,
        boxShadow:`0 0 14px ${base}80`,
      }}>
        <div style={{position:"absolute",top:4,left:4,width:7,height:7,borderRadius:"50%",background:"rgba(255,255,255,.45)"}}/>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WALLS
// ─────────────────────────────────────────────────────────────────────────────
function HWall({wr,wc,pi=-1,ghost,valid}){
  const wallColor = ghost
    ? (valid?"rgba(200,134,10,.7)":"rgba(220,60,60,.5)")
    : pi===0 ? P1C : P2C;
  const wallLight = ghost ? undefined : pi===0 ? P1L : P2L;
  const wallDark  = ghost ? undefined : pi===0 ? P1D : P2D;
  return(
    <div style={{
      position:"absolute", pointerEvents:"none", zIndex:12,
      top:cy(wr+1)-GP, left:cx(wc), width:2*CS+GP, height:GP+3,
    }}>
      <div style={{position:"absolute",top:GP+3,left:4,right:4,height:5,
        background:"radial-gradient(ellipse,rgba(0,0,0,.35),transparent 70%)",borderRadius:"50%"}}/>
      <div style={{position:"absolute",inset:0,borderRadius:"4px 4px 2px 2px",
        background:ghost?wallColor:`linear-gradient(to bottom,${wallLight},${wallColor} 40%,${wallDark})`,
        borderTop:`1.5px solid ${ghost?(valid?"rgba(255,220,80,.7)":"rgba(255,100,100,.6)"):"rgba(255,255,255,.4)"}`,
        boxShadow:ghost?"none":`0 4px 12px rgba(0,0,0,.6), 0 0 8px ${wallColor}55`,
      }}/>
    </div>
  );
}
function VWall({wr,wc,pi=-1,ghost,valid}){
  const wallColor = ghost
    ? (valid?"rgba(200,134,10,.7)":"rgba(220,60,60,.5)")
    : pi===0 ? P1C : P2C;
  const wallLight = ghost ? undefined : pi===0 ? P1L : P2L;
  const wallDark  = ghost ? undefined : pi===0 ? P1D : P2D;
  return(
    <div style={{
      position:"absolute", pointerEvents:"none", zIndex:12,
      top:cy(wr), left:cx(wc+1)-GP, width:GP+3, height:2*CS+GP,
    }}>
      <div style={{position:"absolute",left:GP+3,top:4,bottom:4,width:5,
        background:"radial-gradient(ellipse,rgba(0,0,0,.3),transparent 70%)",borderRadius:"50%"}}/>
      <div style={{position:"absolute",inset:0,borderRadius:"4px 2px 2px 4px",
        background:ghost?wallColor:`linear-gradient(to right,${wallLight},${wallColor} 40%,${wallDark})`,
        borderLeft:`1.5px solid ${ghost?(valid?"rgba(255,220,80,.7)":"rgba(255,100,100,.6)"):"rgba(255,255,255,.4)"}`,
        boxShadow:ghost?"none":`0 4px 12px rgba(0,0,0,.6), 0 0 8px ${wallColor}55`,
      }}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SPLASH
// ─────────────────────────────────────────────────────────────────────────────
function SplashScreen({onDone}){
  const[ph,setPh]=useState(0);
  useEffect(()=>{
    const t1=setTimeout(()=>setPh(1),300);
    const t2=setTimeout(()=>setPh(2),2100);
    const t3=setTimeout(onDone,2700);
    return()=>{clearTimeout(t1);clearTimeout(t2);clearTimeout(t3);};
  },[]);
  return(
    <div style={{position:"fixed",inset:0,zIndex:1000,background:"#0D0603",fontFamily:F,
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:18,
      opacity:ph===2?0:1,transition:ph===2?"opacity .6s":"opacity .5s"}}>
      <div style={{width:96,height:96,borderRadius:20,background:GOLDBTN,
        display:"flex",alignItems:"center",justifyContent:"center",fontSize:46,
        boxShadow:`0 0 60px ${GOLD}55`,
        opacity:ph===0?0:1,transform:ph===0?"scale(.4)":"scale(1)",
        transition:"all .55s cubic-bezier(.34,1.56,.64,1)"}}>⊞</div>
      <div style={{opacity:ph===0?0:1,transform:ph===0?"translateY(14px)":"translateY(0)",
        transition:"all .5s ease .15s",textAlign:"center"}}>
        <div style={{fontSize:34,fontWeight:900,color:GOLD,letterSpacing:"-.02em"}}>QUORIDOR</div>
        <div style={{fontSize:10,color:"rgba(255,210,80,.4)",letterSpacing:".22em",fontWeight:600,marginTop:2}}>BOARD GAME</div>
      </div>
      <div style={{width:110,height:3,background:"rgba(255,255,255,.08)",borderRadius:99,overflow:"hidden",
        opacity:ph===0?0:1,transition:"opacity .3s ease .3s"}}>
        <div style={{height:"100%",background:GOLDBTN,borderRadius:99,
          width:ph===1?"100%":"0%",transition:ph===1?"width 1.6s ease":"none"}}/>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MENU
// ─────────────────────────────────────────────────────────────────────────────
function MenuScreen({onNew,onContinue,hasSave,onHowTo,onSettings}){
  const[vis,setVis]=useState(false);
  useEffect(()=>{setTimeout(()=>setVis(true),60);},[]);
  const items=[
    {label:"NEW GAME",    icon:"🎲",action:onNew,    primary:true},
    {label:"CONTINUE",   icon:"▶", action:onContinue,disabled:!hasSave},
    {label:"HOW TO PLAY",icon:"📋",action:onHowTo},
    {label:"SIGN IN",    icon:"👤",action:()=>{},   comingSoon:true},
    {label:"SETTINGS",   icon:"⚙️",action:onSettings},
  ];
  return(
    <div style={{minHeight:"100dvh",background:TABLE_BG,display:"flex",flexDirection:"column",
      alignItems:"center",fontFamily:F,overflowX:"hidden"}}>
      <style>{`@keyframes mf{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}`}</style>
      <div style={{width:"100%",height:4,background:`linear-gradient(90deg,transparent,${GOLD},transparent)`}}/>
      <div style={{padding:"40px 20px 24px",textAlign:"center",
        opacity:vis?1:0,transform:vis?"translateY(0)":"translateY(-20px)",transition:"all .6s ease"}}>
        <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:16}}>
          {[P1C,GOLD,P2C].map((c,i)=>(
            <div key={i} style={{width:13,height:13,borderRadius:"50%",
              background:`radial-gradient(circle at 35% 28%,rgba(255,255,255,.6),${c})`,
              boxShadow:`0 0 10px ${c}80`,animation:`mf ${1.8+i*.3}s ease-in-out ${i*.2}s infinite`}}/>
          ))}
        </div>
        <div style={{width:68,height:68,borderRadius:16,background:GOLDBTN,margin:"0 auto 16px",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:34,
          boxShadow:`0 8px 28px ${GOLD}50`}}>⊞</div>
        <div style={{fontSize:30,fontWeight:900,color:GOLD,letterSpacing:"-.02em"}}>QUORIDOR</div>
        <div style={{fontSize:9,color:"rgba(255,210,80,.4)",letterSpacing:".2em",fontWeight:700,marginTop:4}}>STRATEGY BOARD GAME</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,width:"100%",maxWidth:320,padding:"0 20px",
        opacity:vis?1:0,transform:vis?"translateY(0)":"translateY(20px)",transition:"all .65s ease .1s"}}>
        {items.map(({label,icon,action,primary,disabled,comingSoon})=>(
          <button key={label} onClick={disabled||comingSoon?undefined:action}
            style={{display:"flex",alignItems:"center",gap:14,padding:"15px 20px",borderRadius:15,
              border:`1px solid ${primary?GOLD+"55":disabled||comingSoon?"rgba(255,255,255,.04)":"rgba(255,255,255,.1)"}`,
              cursor:disabled||comingSoon?"default":"pointer",fontFamily:F,
              background:primary?GOLDBTN:"rgba(255,255,255,.07)",opacity:disabled?.38:1,
              transition:"all .15s",boxShadow:primary?`0 6px 26px ${GOLD}45`:"none"}}
            onMouseEnter={e=>{if(!disabled&&!comingSoon)e.currentTarget.style.transform="scale(1.02)";}}
            onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";}}>
            <span style={{fontSize:21,width:28,textAlign:"center"}}>{icon}</span>
            <span style={{flex:1,textAlign:"left",fontWeight:800,fontSize:14,
              color:primary?"#3c2200":disabled?"rgba(255,255,255,.3)":"rgba(255,255,255,.85)"}}>{label}</span>
            {comingSoon&&<span style={{fontSize:8,fontWeight:700,background:"rgba(255,255,255,.1)",
              color:"rgba(255,255,255,.3)",padding:"3px 7px",borderRadius:99}}>SOON</span>}
            {!comingSoon&&!disabled&&<span style={{color:primary?"rgba(60,34,0,.5)":"rgba(255,255,255,.2)",fontSize:16}}>›</span>}
          </button>
        ))}
      </div>
      <div style={{marginTop:"auto",padding:"24px 0 30px",fontSize:9,color:"rgba(255,255,255,.1)",
        letterSpacing:".1em",fontWeight:600,opacity:vis?1:0,transition:"opacity .8s ease .3s"}}>
        VERSION 1.0.0 · LOCAL MULTIPLAYER
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOW TO PLAY
// ─────────────────────────────────────────────────────────────────────────────
function HowToPlayScreen({onBack}){
  const steps=[
    {icon:"🎯",title:"Objective",desc:"Be the first to move your pawn across to the opposite side."},
    {icon:"🏃",title:"Move Pawn",desc:"Tap MOVE then tap any glowing cell to step one space."},
    {icon:"━━",title:"H Wall",desc:"Tap H WALL then hover/tap between rows to place a horizontal wall."},
    {icon:"┃", title:"V Wall",desc:"Tap V WALL then hover/tap between columns to place a vertical wall."},
    {icon:"⛔",title:"No Full Block",desc:"You can never trap your opponent — illegal walls are auto-rejected."},
    {icon:"🦘",title:"Jump",desc:"Jump straight over an adjacent opponent, or diagonally if blocked."},
    {icon:"📷",title:"Camera",desc:"Drag the board to orbit. Use TOP / TABLE / P1 / P2 preset buttons."},
    {icon:"📱",title:"Landscape",desc:"Turn your device sideways — Quoridor plays in landscape mode."},
    {icon:"🏆",title:"Win",desc:"First pawn to reach the opposite side wins!"},
  ];
  return(
    <div style={{minHeight:"100dvh",background:TABLE_BG,fontFamily:F,overflowX:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"16px 20px",
        background:"rgba(0,0,0,.5)",backdropFilter:"blur(12px)",
        borderBottom:"1px solid rgba(255,208,96,.1)",position:"sticky",top:0,zIndex:10}}>
        <button onClick={onBack} style={{width:38,height:38,borderRadius:10,border:"1px solid rgba(255,208,96,.2)",
          background:"rgba(255,208,96,.1)",color:GOLD,fontSize:18,cursor:"pointer",fontFamily:F,
          display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
        <div>
          <div style={{fontSize:18,fontWeight:900,color:GOLD,lineHeight:1}}>HOW TO PLAY</div>
          <div style={{fontSize:9,color:"rgba(255,210,80,.4)",letterSpacing:".12em",fontWeight:600}}>QUORIDOR RULES</div>
        </div>
      </div>
      <div style={{padding:"12px 16px 40px",display:"flex",flexDirection:"column",gap:10}}>
        {steps.map(({icon,title,desc},i)=>(
          <div key={i} style={{display:"flex",gap:14,padding:"14px 16px",
            background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.07)",borderRadius:14}}>
            <div style={{width:42,height:42,borderRadius:12,flexShrink:0,
              background:"rgba(255,208,96,.1)",border:"1px solid rgba(255,208,96,.2)",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:icon.length>2?14:20,fontWeight:900,color:GOLD}}>{icon}</div>
            <div>
              <div style={{fontWeight:800,fontSize:13,color:"rgba(255,255,255,.9)",marginBottom:3}}>{title}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.4)",lineHeight:1.65}}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
function SettingsScreen({onBack,settings,onChange}){
  const Toggle=({val,onCh})=>(
    <div onClick={()=>onCh(!val)} style={{width:46,height:26,borderRadius:13,cursor:"pointer",
      background:val?GOLDBTN:"rgba(255,255,255,.12)",position:"relative",transition:"background .2s",
      flexShrink:0,boxShadow:val?`0 0 12px ${GOLD}50`:"none"}}>
      <div style={{position:"absolute",top:3,left:val?22:3,width:20,height:20,borderRadius:"50%",
        background:"#fff",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.3)"}}/>
    </div>
  );
  const secs=[
    {title:"🔊 AUDIO",items:[
      {key:"soundFx",label:"Sound Effects",desc:"Move and wall sounds"},
      {key:"music",label:"Background Music",desc:"Ambient music during gameplay (on by default)"},
      {key:"haptics",label:"Haptic Feedback",desc:"Vibration on actions"},
    ]},
    {title:"🎮 GAMEPLAY",items:[
      {key:"showHints",label:"Show Move Hints",desc:"Highlight valid cells"},
      {key:"animatePawns",label:"Animate Pawns",desc:"Floating pawn animation"},
    ]},
    {title:"🎨 DISPLAY",items:[
      {key:"highContrast",label:"High Contrast Walls",desc:"Brighter wall colours"},
    ]},
  ];
  return(
    <div style={{minHeight:"100dvh",background:TABLE_BG,fontFamily:F,overflowX:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"16px 20px",
        background:"rgba(0,0,0,.5)",backdropFilter:"blur(12px)",
        borderBottom:"1px solid rgba(255,208,96,.1)",position:"sticky",top:0,zIndex:10}}>
        <button onClick={onBack} style={{width:38,height:38,borderRadius:10,border:"1px solid rgba(255,208,96,.2)",
          background:"rgba(255,208,96,.1)",color:GOLD,fontSize:18,cursor:"pointer",fontFamily:F,
          display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
        <div>
          <div style={{fontSize:18,fontWeight:900,color:GOLD,lineHeight:1}}>SETTINGS</div>
          <div style={{fontSize:9,color:"rgba(255,210,80,.4)",letterSpacing:".12em",fontWeight:600}}>PREFERENCES</div>
        </div>
      </div>
      <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:16}}>
        {secs.map(({title,items})=>(
          <div key={title}>
            <div style={{fontSize:10,fontWeight:800,color:"rgba(255,208,96,.5)",
              letterSpacing:".14em",marginBottom:8,paddingLeft:4}}>{title}</div>
            <div style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.07)",
              borderRadius:16,overflow:"hidden"}}>
              {items.map(({key,label,desc},i)=>(
                <div key={key} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",
                  borderBottom:i<items.length-1?"1px solid rgba(255,255,255,.05)":"none"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.88)",marginBottom:2}}>{label}</div>
                    <div style={{fontSize:11,color:"rgba(255,255,255,.3)"}}>{desc}</div>
                  </div>
                  <Toggle val={settings[key]??true} onCh={v=>onChange(key,v)}/>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{textAlign:"center",paddingBottom:20}}>
          <div style={{fontSize:9,color:"rgba(255,255,255,.1)",letterSpacing:".08em"}}>QUORIDOR v1.0.0</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODE PICKER SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function ModePickerScreen({onSelect,onBack}){
  const[vis,setVis]=useState(false);
  useEffect(()=>{setTimeout(()=>setVis(true),60);},[]);
  return(
    <div style={{minHeight:"100dvh",background:TABLE_BG,fontFamily:F,display:"flex",flexDirection:"column"}}>
      <BackHeader onBack={onBack} title="NEW GAME" subtitle="CHOOSE YOUR MODE"/>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        flex:1,gap:16,padding:24}}>
        <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%",maxWidth:300,
          opacity:vis?1:0,transform:vis?"translateY(0)":"translateY(16px)",transition:"all .45s ease .1s"}}>
          {[
            {label:"2 Players",  sub:"Pass & play with a friend",     icon:"👥",mode:"2p"},
            {label:"vs AI",      sub:"Play against the computer",      icon:"🤖",mode:"ai"},
            {label:"Online",     sub:"Challenge a friend remotely",    icon:"🌐",mode:"online",teal:true},
            {label:"Tournament", sub:"Compete for glory & coins",      icon:"🏆",mode:"tournament",gold:true},
          ].map(({label,sub,icon,mode,gold,teal})=>(
            <button key={mode} onClick={()=>onSelect(mode)}
              style={{display:"flex",alignItems:"center",gap:16,padding:"18px 20px",borderRadius:16,
                border:`1px solid ${gold?GOLD+"88":teal?P1C+"88":"rgba(255,255,255,.1)"}`,
                background:gold?GOLDBTN:teal?`linear-gradient(135deg,${P1D},${P1C})`:"rgba(255,255,255,.07)",
                cursor:"pointer",fontFamily:F,transition:"transform .12s",
                boxShadow:gold?`0 6px 26px ${GOLD}55`:teal?`0 6px 26px ${P1C}40`:"none"}}
              onMouseEnter={e=>e.currentTarget.style.transform="scale(1.02)"}
              onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
              <span style={{fontSize:28}}>{icon}</span>
              <div style={{textAlign:"left"}}>
                <div style={{fontWeight:800,fontSize:15,color:(gold||teal)?"#fff":"rgba(255,255,255,.9)"}}>{label}</div>
                <div style={{fontSize:11,color:(gold||teal)?"rgba(255,255,255,.55)":"rgba(255,255,255,.4)",marginTop:2}}>{sub}</div>
              </div>
              <span style={{marginLeft:"auto",color:(gold||teal)?"rgba(255,255,255,.35)":"rgba(255,255,255,.2)",fontSize:18}}>›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ONLINE LOBBY SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function OnlineLobbyScreen({onBack, onStartGame, coins}){
  const[tab,setTab]=useState("create");
  const[name,setName]=useState("");
  const[code,setCode]=useState("");
  const[status,setStatus]=useState("idle");
  const[roomCode,setRoomCode]=useState("");
  const[errorMsg,setErrorMsg]=useState("");
  const[bet,setBet]=useState(0);
  const[pendingRoom,setPendingRoom]=useState(null); // room waiting for bet confirm
  const pollStop=useRef(null);
  useEffect(()=>()=>{ if(pollStop.current) pollStop.current(); },[]);

  const createRoom=async()=>{
    if(!name.trim()) return;
    setStatus("creating");
    const id=genCode();
    setRoomCode(id);
    const initState={
      players:[{row:8,col:4,walls:10,name:name.trim()},{row:0,col:4,walls:10,name:""}],
      hW:Array(8).fill(null).map(()=>Array(8).fill(-1)),
      vW:Array(8).fill(null).map(()=>Array(8).fill(-1)),
      turn:Math.random()<0.5?0:1, mode:"move", ori:"h", winner:null,
      phase:"waiting", host:name.trim(), bet,
      chat:[],
    };
    try{
      await sb.createRoom(id, initState);
      setStatus("waiting");
      pollStop.current = sb.pollRoom(id, state=>{
        if(state.phase==="playing"){
          if(pollStop.current) pollStop.current();
          onStartGame({roomId:id, playerIndex:0, playerName:name.trim(), initialState:state, bet});
        }
      });
    }catch(e){ setStatus("error"); setErrorMsg("Failed to create room. Check connection."); }
  };

  const joinRoom=async()=>{
    if(!name.trim()||!code.trim()) return;
    setStatus("joining");
    try{
      const room=await sb.getRoom(code.trim().toUpperCase());
      if(!room){ setStatus("error"); setErrorMsg("Room not found. Check the code."); return; }
      if(room.state.phase!=="waiting"){ setStatus("error"); setErrorMsg("Game already started."); return; }
      if(room.state.bet>0){
        // Show confirmation before joining
        setPendingRoom(room);
        setStatus("betconfirm");
        return;
      }
      await doJoin(room, code.trim().toUpperCase());
    }catch(e){ setStatus("error"); setErrorMsg("Connection error. Try again."); }
  };

  const doJoin=async(room, roomId)=>{
    const newState={
      ...room.state,
      players:[room.state.players[0],{...room.state.players[1],name:name.trim(),row:0,col:4}],
      phase:"playing",
    };
    await sb.updateRoom(roomId, newState);
    onStartGame({roomId, playerIndex:1, playerName:name.trim(), initialState:newState, bet:room.state.bet||0});
  };

  return(
    <div style={{minHeight:"100dvh",background:TABLE_BG,fontFamily:F,display:"flex",flexDirection:"column"}}>
      <BackHeader onBack={onBack} title="ONLINE MULTIPLAYER" subtitle="PLAY WITH A FRIEND"/>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        flex:1,gap:20,padding:24}}>

        {/* Bet confirmation modal */}
        {status==="betconfirm"&&pendingRoom&&(
          <div style={{width:"100%",maxWidth:300,display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
            <div style={{fontSize:36}}>🪙</div>
            <div style={{fontSize:20,fontWeight:900,color:GOLD}}>Bet Confirmation</div>
            <div style={{textAlign:"center",fontSize:13,color:"rgba(255,255,255,.5)",lineHeight:1.8}}>
              The host set a bet of<br/>
              <span style={{fontSize:28,fontWeight:900,color:GOLD}}>{pendingRoom.state.bet.toLocaleString()} 🪙</span>
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.3)"}}>
              Total pot: <strong style={{color:GOLD}}>{(pendingRoom.state.bet*2).toLocaleString()} 🪙</strong> — winner takes all
            </div>
            {coins[1]<pendingRoom.state.bet&&(
              <div style={{fontSize:11,color:"#ff6060",background:"rgba(255,80,80,.1)",
                padding:"8px 12px",borderRadius:8}}>⚠ Not enough coins</div>
            )}
            <div style={{display:"flex",gap:10,width:"100%"}}>
              <button onClick={async()=>{setStatus("joining");await doJoin(pendingRoom,code.trim().toUpperCase());}}
                disabled={coins[1]<pendingRoom.state.bet}
                style={{flex:1,padding:"14px",borderRadius:12,border:"none",cursor:"pointer",fontFamily:F,
                  background:coins[1]>=pendingRoom.state.bet?GOLDBTN:"rgba(255,255,255,.1)",
                  color:coins[1]>=pendingRoom.state.bet?"#3c2200":"rgba(255,255,255,.3)",
                  fontWeight:800,fontSize:14}}>✓ Accept</button>
              <button onClick={()=>{setPendingRoom(null);setStatus("idle");}}
                style={{flex:1,padding:"14px",borderRadius:12,cursor:"pointer",fontFamily:F,
                  border:"1px solid rgba(255,255,255,.1)",background:"transparent",
                  color:"rgba(255,255,255,.4)",fontWeight:700,fontSize:14}}>✕ Cancel</button>
            </div>
          </div>
        )}

        {(status==="idle"||status==="error")&&(
          <div style={{width:"100%",maxWidth:300,display:"flex",flexDirection:"column",gap:12}}>
            <input value={name} onChange={e=>setName(e.target.value)} maxLength={12}
              placeholder="Your name…" autoFocus
              style={{width:"100%",padding:"13px 16px",borderRadius:12,
                border:`2px solid ${name.trim()?P1C+"80":"rgba(255,255,255,.1)"}`,
                background:"rgba(255,255,255,.07)",color:"#fff",
                fontSize:15,fontWeight:700,fontFamily:F,outline:"none"}}/>
            <div style={{display:"flex",background:"rgba(0,0,0,.4)",borderRadius:12,padding:4,gap:3}}>
              {["create","join"].map(t=>(
                <button key={t} onClick={()=>{setTab(t);setErrorMsg("");}} style={{
                  flex:1,padding:"10px",borderRadius:9,border:"none",cursor:"pointer",
                  background:tab===t?GOLDBTN:"transparent",
                  color:tab===t?"#3c2200":"rgba(255,255,255,.4)",
                  fontWeight:800,fontSize:12,fontFamily:F,transition:"all .15s",
                }}>{t==="create"?"🏠 CREATE ROOM":"🔑 JOIN ROOM"}</button>
              ))}
            </div>
            {tab==="create"&&(
              <div style={{padding:"12px 14px",borderRadius:12,
                background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.08)"}}>
                <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginBottom:8}}>Bet amount (optional)</div>
                <input type="range" min={0} max={Math.min(500,coins[0])} step={10} value={bet}
                  onChange={e=>setBet(Number(e.target.value))}
                  style={{width:"100%",accentColor:GOLD,cursor:"pointer"}}/>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
                  <div style={{display:"flex",gap:6}}>
                    {[0,50,100,200].filter(v=>v<=coins[0]).map(v=>(
                      <button key={v} onClick={()=>setBet(v)} style={{
                        padding:"3px 8px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:F,
                        background:bet===v?"rgba(255,208,96,.3)":"rgba(255,255,255,.08)",
                        color:bet===v?GOLD:"rgba(255,255,255,.4)",fontSize:10,fontWeight:700}}>
                        {v===0?"Free":v}
                      </button>
                    ))}
                  </div>
                  <span style={{fontSize:13,fontWeight:800,color:bet>0?GOLD:"rgba(255,255,255,.3)"}}>
                    {bet>0?`${bet} 🪙`:"Free"}
                  </span>
                </div>
                {bet>0&&<div style={{fontSize:10,color:"rgba(255,255,255,.25)",marginTop:4}}>
                  Opponent must match — pot: {bet*2} 🪙
                </div>}
              </div>
            )}
            {tab==="join"&&(
              <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={6}
                placeholder="Enter 6-digit room code"
                style={{width:"100%",padding:"13px 16px",borderRadius:12,
                  border:`2px solid ${code.trim()?GOLD+"80":"rgba(255,255,255,.1)"}`,
                  background:"rgba(255,255,255,.07)",color:GOLD,
                  fontSize:18,fontWeight:900,fontFamily:F,outline:"none",
                  textAlign:"center",letterSpacing:".2em"}}/>
            )}
            {errorMsg&&<div style={{fontSize:12,color:"#ff6060",textAlign:"center",padding:"8px",
              background:"rgba(255,80,80,.1)",borderRadius:8}}>{errorMsg}</div>}
            <button onClick={tab==="create"?createRoom:joinRoom}
              disabled={!name.trim()||(tab==="join"&&code.trim().length!==6)}
              style={{padding:"15px",borderRadius:12,border:"none",fontFamily:F,
                cursor:name.trim()?"pointer":"not-allowed",
                background:name.trim()?GOLDBTN:"rgba(255,255,255,.08)",
                color:name.trim()?"#3c2200":"rgba(255,255,255,.25)",
                fontWeight:900,fontSize:14,
                boxShadow:name.trim()?`0 6px 24px ${GOLD}45`:"none"}}>
              {tab==="create"?"CREATE ROOM →":"JOIN GAME →"}
            </button>
          </div>
        )}

        {status==="waiting"&&(
          <div style={{textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
            <div style={{fontSize:13,color:"rgba(255,255,255,.5)"}}>Share this code with your friend:</div>
            <div style={{fontSize:42,fontWeight:900,color:GOLD,letterSpacing:".22em",
              padding:"16px 28px",borderRadius:16,
              background:"rgba(255,208,96,.1)",border:"2px solid rgba(255,208,96,.3)"}}>
              {roomCode}
            </div>
            {bet>0&&<div style={{fontSize:12,color:GOLD+"aa"}}>Bet: {bet} 🪙 per player</div>}
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:P1C,animation:"pulse .8s ease-in-out infinite"}}/>
              <div style={{fontSize:13,color:"rgba(255,255,255,.4)"}}>Waiting for opponent to join…</div>
            </div>
            <button onClick={()=>{if(pollStop.current)pollStop.current();setStatus("idle");setRoomCode("");setBet(0);}}
              style={{fontSize:11,color:"rgba(255,255,255,.25)",background:"none",border:"none",cursor:"pointer",fontFamily:F,marginTop:8}}>
              Cancel
            </button>
          </div>
        )}
        {(status==="creating"||status==="joining")&&(
          <div style={{fontSize:13,color:"rgba(255,255,255,.4)"}}>
            {status==="creating"?"Creating room…":"Joining game…"}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ONLINE GAME SCREEN  (wraps GameScreen with real-time sync)
// ─────────────────────────────────────────────────────────────────────────────
function OnlineGameScreen({roomId, playerIndex, playerName, initialState, onBack, bet=0, onCoinsUpdate}){
  const[g,setG]=useState(initialState);
  const[connected,setConnected]=useState(true);
  const[potClaimed,setPotClaimed]=useState(false);
  const[timeLeft,setTimeLeft]=useState(30);
  const[missedTurns,setMissedTurns]=useState(0);
  const[chatOpen,setChatOpen]=useState(false);
  const[chatMsg,setChatMsg]=useState("");
  const[unread,setUnread]=useState(0);
  const chatEndRef=useRef(null);
  const timerRef=useRef(null);
  const isMyTurn = g.turn===playerIndex && !g.winner;
  const pollStop=useRef(null);
  const chat=g.chat||[];
  const names=[
    g.players[0].name||"Player 1",
    g.players[1].name||"Player 2",
  ];

  // Poll for remote updates
  useEffect(()=>{
    pollStop.current = sb.pollRoom(roomId, state=>{
      setG(prev=>{
        // Count new messages as unread if chat is closed
        const prevLen=(prev.chat||[]).length;
        const newLen=(state.chat||[]).length;
        if(!chatOpen&&newLen>prevLen) setUnread(u=>u+(newLen-prevLen));
        return state;
      });
      setConnected(true);
    });
    return()=>{ if(pollStop.current) pollStop.current(); };
  },[roomId]);

  // Scroll chat to bottom when opened or new message
  useEffect(()=>{
    if(chatOpen) chatEndRef.current?.scrollIntoView({behavior:"smooth"});
  },[chatOpen,chat.length]);

  // Clear unread when chat opened
  useEffect(()=>{ if(chatOpen) setUnread(0); },[chatOpen]);

  // Timer
  useEffect(()=>{
    if(g.winner||!isMyTurn) return;
    setTimeLeft(30);
    clearInterval(timerRef.current);
    timerRef.current=setInterval(()=>{
      setTimeLeft(prev=>{
        if(prev<=5) SFX.urgentTick();
        else if(prev<=10) SFX.tick();
        if(prev<=1){
          clearInterval(timerRef.current);
          const vm=getVM(g.turn,g.players,g.hW,g.vW);
          const missed=missedTurns+1;
          setMissedTurns(missed);
          if(missed>=3){
            const winner=1-playerIndex;
            const newState={...g,winner};
            setG(newState); pushState(newState);
          } else if(vm.length>0){
            const[r,c]=vm[Math.floor(Math.random()*vm.length)];
            const np=g.players.map((p,i)=>i===g.turn?{...p,row:r,col:c}:p);
            const won=r===GOALS[g.turn]?g.turn:null;
            const newState={...g,players:np,turn:won!=null?g.turn:1-g.turn,winner:won};
            setG(newState); pushState(newState);
          }
          return 30;
        }
        return prev-1;
      });
    },1000);
    return()=>clearInterval(timerRef.current);
  },[g.turn,g.winner,isMyTurn]);

  const pushState=async(newState)=>{
    try{ await sb.updateRoom(roomId, newState); setConnected(true); }
    catch(e){ setConnected(false); }
  };

  const sendChat=async(text)=>{
    if(!text.trim()) return;
    const msg={from:playerIndex,name:names[playerIndex],text:text.trim(),ts:Date.now()};
    const newState={...g,chat:[...(g.chat||[]),msg]};
    setG(newState);
    await pushState(newState);
    setChatMsg("");
  };

  const vm = g.winner?[]:getVM(g.turn,g.players,g.hW,g.vW);
  const isVM=(r,c)=>vm.some(([vr,vc])=>vr===r&&vc===c);
  const tc=PC[g.turn];

  const doMove=(r,c)=>{
    if(!isMyTurn||!isVM(r,c)) return;
    clearInterval(timerRef.current);
    setMissedTurns(0);
    SFX.move();
    const np=g.players.map((p,i)=>i===g.turn?{...p,row:r,col:c}:p);
    const won=r===GOALS[g.turn]?g.turn:null;
    const newState={...g,players:np,turn:won!=null?g.turn:1-g.turn,winner:won};
    setG(newState);
    pushState(newState);
  };
  const doWall=(wr,wc,ori)=>{
    if(!isMyTurn||g.mode!=="wall"||!g.players[g.turn].walls) return;
    if(!canPlace(wr,wc,ori,g.hW,g.vW,g.players)){SFX.invalid();return;}
    clearInterval(timerRef.current);
    setMissedTurns(0);
    SFX.wall();
    const nh=g.hW.map(x=>[...x]),nv=g.vW.map(x=>[...x]);
    ori==="h"?(nh[wr][wc]=g.turn):(nv[wr][wc]=g.turn);
    const np=g.players.map((p,i)=>i===g.turn?{...p,walls:p.walls-1}:p);
    const newState={...g,hW:nh,vW:nv,players:np,turn:1-g.turn,mode:"move"};
    setG(newState);
    pushState(newState);
  };

  const[hov,setHov]=useState(null);
  const showHov=hov&&g.mode==="wall"&&isMyTurn;
  const hvValid=showHov&&g.players[g.turn].walls>0&&canPlace(hov.wr,hov.wc,hov.ori,g.hW,g.vW,g.players);
  const frameW=12;

  // Layout
  const[vw,setVw]=useState(window.innerWidth);
  const[vh,setVh]=useState(window.innerHeight);
  useEffect(()=>{
    const upd=()=>{setVw(window.innerWidth);setVh(window.innerHeight);};
    window.addEventListener("resize",upd);
    return()=>window.removeEventListener("resize",upd);
  },[]);

  const isPortrait=vw<=vh;
  const LW=isPortrait?vh:vw, LH=isPortrait?vw:vh;
  const PANEL_W=Math.round(Math.max(78,Math.min(96,LW*0.105)));
  const BTN_W=66, GAP=5;
  const centerW=LW-PANEL_W*2-BTN_W-GAP*4;
  const boardScale=Math.min((LH-8)/BP,centerW/BP);
  const boardPx=Math.round(BP*boardScale);

  const outerStyle=isPortrait?{
    position:"fixed",zIndex:10,
    width:vh,height:vw,
    top:(vh-vw)/2,left:(vw-vh)/2,
    transform:"rotate(90deg)",
    transformOrigin:"center center",
    overflow:"hidden",
  }:{width:"100vw",height:"100vh",overflow:"hidden"};

  return(
    <div style={{...outerStyle,background:TABLE_BG,fontFamily:F,
      display:"flex",flexDirection:"row",alignItems:"center",
      padding:4,gap:GAP}}>
      <style>{`
        .gb:active{opacity:.75;transform:scale(.92)!important}
        @keyframes vp{0%,100%{opacity:.28;transform:scale(.58)}50%{opacity:.88;transform:scale(1.1)}}
        @keyframes wf{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes pulse{0%,100%{opacity:.5}50%{opacity:1}}
      `}</style>

      {/* Connection badge */}
      {!connected&&(
        <div style={{position:"absolute",top:8,left:"50%",transform:"translateX(-50%)",zIndex:99,
          background:"rgba(255,80,80,.9)",color:"#fff",fontSize:10,fontWeight:700,
          padding:"4px 12px",borderRadius:99}}>⚠ Reconnecting…</div>
      )}

      {/* LEFT PANEL */}
      <div style={{width:PANEL_W,flexShrink:0,height:LH-8,
        display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"space-between",padding:"10px 6px",
        background:g.turn===0&&!g.winner?"rgba(0,151,167,.13)":"rgba(0,0,0,.3)",
        border:`2px solid ${g.turn===0&&!g.winner?P1C+"70":"rgba(255,255,255,.06)"}`,
        borderRadius:14,transition:"all .25s"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          <div style={{fontSize:30,filter:g.turn===0?`drop-shadow(0 0 8px ${P1C})`:"grayscale(.5) opacity(.6)"}}>
            {playerIndex===0?"👤":"👥"}
          </div>
          <div style={{fontSize:11,fontWeight:900,color:g.turn===0?P1C:"rgba(255,255,255,.3)",textAlign:"center"}}>
            {names[0]}{playerIndex===0?" (you)":""}
          </div>
          {g.turn===0&&!g.winner&&<div style={{background:P1C,color:"#fff",fontSize:8,fontWeight:900,padding:"3px 8px",borderRadius:99}}>TURN</div>}
        </div>
        {/* Timer — shown when it's my turn and I am P1, or opponent is P1 */}
        {g.turn===0&&!g.winner&&(
          <div style={{width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <div style={{
              fontSize:22,fontWeight:900,
              color:timeLeft<=5?"#FF4444":timeLeft<=10?"#FFD060":P1C,
              transition:"color .3s",
              animation:timeLeft<=5?"pulse .5s ease-in-out infinite":"none",
            }}>{playerIndex===0?timeLeft:"⏳"}</div>
            {playerIndex===0&&(
              <div style={{width:"100%",height:3,background:"rgba(255,255,255,.1)",borderRadius:99,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:99,
                  width:`${(timeLeft/30)*100}%`,
                  background:timeLeft<=5?"#FF4444":timeLeft<=10?"#FFD060":P1C,
                  transition:"width 1s linear, background .3s"}}/>
              </div>
            )}
            {missedTurns>0&&playerIndex===0&&(
              <div style={{fontSize:8,color:"#FF4444"}}>⚠ {missedTurns}/3 auto-moves</div>
            )}
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          <div style={{fontSize:7,color:"rgba(255,255,255,.2)",fontWeight:700}}>WALLS</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:3}}>
            {Array(10).fill(0).map((_,j)=>(
              <div key={j} style={{width:10,height:10,borderRadius:3,
                background:j<g.players[0].walls?`linear-gradient(135deg,${P1L},${P1C})`:"rgba(255,255,255,.09)"}}/>
            ))}
          </div>
          <div style={{fontSize:10,fontWeight:700,color:g.turn===0?P1C:"rgba(255,255,255,.2)"}}>{g.players[0].walls}</div>
        </div>
        {/* Camera / back buttons */}
        <div style={{display:"flex",flexDirection:"column",gap:5,width:"100%"}}>
          <button onClick={onBack} style={{width:"100%",padding:"7px 0",borderRadius:8,
            border:"1px solid rgba(255,208,96,.2)",background:"rgba(255,208,96,.08)",
            fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>🏠</button>
        </div>
      </div>

      {/* CENTER */}
      <div style={{flex:1,height:LH-8,position:"relative",display:"flex",flexDirection:"row",
        alignItems:"center",gap:5}}>

        {/* Mode buttons — only interactive on your turn */}
        {!g.winner&&(
          <div style={{width:BTN_W,flexShrink:0,height:boardPx,display:"flex",flexDirection:"column",gap:5}}>
            {[
              {m:"move",ori:null,icon:"🏃",label:"MOVE"},
              {m:"wall",ori:"h", icon:"━━", label:"H WALL"},
              {m:"wall",ori:"v", icon:"┃",  label:"V WALL"},
            ].map(({m,ori,icon,label})=>{
              const active=g.mode===m&&(ori===null||g.ori===ori);
              return(
                <button key={label}
                  onClick={()=>isMyTurn&&setG(p=>({...p,mode:m,ori:ori??p.ori}))}
                  className="gb"
                  style={{flex:1,width:"100%",borderRadius:12,cursor:isMyTurn?"pointer":"not-allowed",
                    background:active?GOLDBTN:"rgba(0,0,0,.55)",
                    border:`1px solid ${active?GOLD+"55":"rgba(255,255,255,.07)"}`,
                    color:active?"#3c2200":isMyTurn?"rgba(255,255,255,.35)":"rgba(255,255,255,.15)",
                    fontWeight:900,fontFamily:F,transition:"all .15s",
                    boxShadow:active?`0 3px 16px ${GOLD}55`:"none",
                    display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,
                    opacity:isMyTurn?1:0.5,
                  }}>
                  <span style={{fontSize:16,lineHeight:1}}>{icon}</span>
                  <span style={{fontSize:9,letterSpacing:".04em",fontWeight:800}}>{label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Board */}
        <div style={{flex:1,height:"100%",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
          <div style={{transform:`scale(${boardScale})`,transformOrigin:"center center",flexShrink:0}}>
            <div style={{position:"relative",width:BP,height:BP,
              transformStyle:"preserve-3d",
              transform:`rotateX(0deg) rotateZ(0deg)`,
            }}>
              {/* Frame */}
              <div style={{position:"absolute",top:-frameW,left:-frameW,width:BP+frameW*2,height:BP+frameW*2,
                backgroundImage:`repeating-linear-gradient(92deg,transparent,transparent 7px,rgba(0,0,0,.05) 7px,rgba(0,0,0,.05) 8px),linear-gradient(145deg,#7A4010 0%,#4A2008 45%,#3A1808 55%,#6A3818 100%)`,
                borderRadius:16,zIndex:0,
                boxShadow:"0 40px 100px rgba(0,0,0,.95),0 15px 40px rgba(0,0,0,.7)"}}>
                {[[8,8],[8,BP+frameW*2-15],[BP+frameW*2-15,8],[BP+frameW*2-15,BP+frameW*2-15]].map(([t,l],i)=>(
                  <div key={i} style={{position:"absolute",top:t,left:l,width:7,height:7,borderRadius:"50%",
                    background:"radial-gradient(circle at 35% 28%,#FFE880,#B07018)",zIndex:5}}/>
                ))}
              </div>
              {/* Surface */}
              <div style={{position:"absolute",inset:0,zIndex:1,background:"#3A1808",borderRadius:5}}/>
              {/* Goal labels */}
              <div style={{position:"absolute",top:2,left:"50%",transform:"translateX(-50%)",zIndex:3,
                fontSize:7,fontWeight:800,color:P1C,background:"rgba(0,0,0,.3)",padding:"2px 7px",borderRadius:99,whiteSpace:"nowrap"}}>
                {names[0]} GOAL ▲
              </div>
              <div style={{position:"absolute",bottom:2,left:"50%",transform:"translateX(-50%)",zIndex:3,
                fontSize:7,fontWeight:800,color:P2C,background:"rgba(0,0,0,.3)",padding:"2px 7px",borderRadius:99,whiteSpace:"nowrap"}}>
                ▼ {names[1]} GOAL
              </div>
              {/* Cells */}
              {Array.from({length:9},(_,r)=>Array.from({length:9},(_,c)=>{
                const valid=isMyTurn&&isVM(r,c);
                const isP0=g.players[0].row===r&&g.players[0].col===c;
                const isP1=g.players[1].row===r&&g.players[1].col===c;
                return(
                  <div key={`${r}-${c}`} onClick={()=>doMove(r,c)} style={{
                    position:"absolute",zIndex:3,top:cy(r),left:cx(c),width:CS,height:CS,borderRadius:3,
                    background:valid?`${tc}40`:(r+c)%2===0?"#F0DFA8":"#E8D496",
                    border:`1px solid ${valid?tc+"70":"rgba(130,90,20,.22)"}`,
                    cursor:valid?"pointer":"default",
                    display:"flex",alignItems:"flex-end",justifyContent:"center",
                    boxShadow:valid?`inset 0 0 12px ${tc}28`:"inset 0 1px 0 rgba(255,255,255,.35)",
                  }}>
                    {valid&&!isP0&&!isP1&&<div style={{position:"absolute",top:"50%",left:"50%",
                      transform:"translate(-50%,-50%)",width:12,height:12,borderRadius:"50%",
                      background:tc,animation:"vp 1.5s ease-in-out infinite"}}/>}
                    {(isP0||isP1)&&<div style={{position:"absolute",bottom:2,left:"50%",transform:"translateX(-50%)",
                      width:22,height:7,background:"radial-gradient(ellipse,rgba(0,0,0,.45),transparent 70%)",
                      borderRadius:"50%",zIndex:2,pointerEvents:"none"}}/>}
                    {isP0&&<Pawn pi={0}/>}
                    {isP1&&<Pawn pi={1}/>}
                  </div>
                );
              }))}
              {/* Walls */}
              {g.hW.map((row,wr)=>row.map((pi,wc)=>pi!==-1&&<HWall key={`hw${wr}-${wc}`} wr={wr} wc={wc} pi={pi}/>))}
              {g.vW.map((row,wr)=>row.map((pi,wc)=>pi!==-1&&<VWall key={`vw${wr}-${wc}`} wr={wr} wc={wc} pi={pi}/>))}
              {showHov&&(hov.ori==="h"
                ?<HWall wr={hov.wr} wc={hov.wc} ghost valid={hvValid}/>
                :<VWall wr={hov.wr} wc={hov.wc} ghost valid={hvValid}/>)}
              {g.mode==="wall"&&isMyTurn&&!g.winner&&Array.from({length:WG},(_,wr)=>
                Array.from({length:WG},(_,wc)=>
                  g.ori==="h"
                    ?<div key={`wth${wr}-${wc}`} style={{position:"absolute",zIndex:20,cursor:"crosshair",
                        top:cy(wr+1)-GP-8,left:cx(wc),width:2*CS+GP,height:GP+16}}
                        onMouseEnter={()=>setHov({wr,wc,ori:"h"})} onMouseLeave={()=>setHov(null)}
                        onClick={()=>doWall(wr,wc,"h")}/>
                    :<div key={`wtv${wr}-${wc}`} style={{position:"absolute",zIndex:20,cursor:"crosshair",
                        top:cy(wr),left:cx(wc+1)-GP-8,width:GP+16,height:2*CS+GP}}
                        onMouseEnter={()=>setHov({wr,wc,ori:"v"})} onMouseLeave={()=>setHov(null)}
                        onClick={()=>doWall(wr,wc,"v")}/>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div style={{width:PANEL_W,flexShrink:0,height:LH-8,
        display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"space-between",padding:"10px 6px",
        background:g.turn===1&&!g.winner?"rgba(233,30,99,.13)":"rgba(0,0,0,.3)",
        border:`2px solid ${g.turn===1&&!g.winner?P2C+"70":"rgba(255,255,255,.06)"}`,
        borderRadius:14,transition:"all .25s"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          <div style={{fontSize:30,filter:g.turn===1?`drop-shadow(0 0 8px ${P2C})`:"grayscale(.5) opacity(.6)"}}>
            {playerIndex===1?"👤":"👥"}
          </div>
          <div style={{fontSize:11,fontWeight:900,color:g.turn===1?P2C:"rgba(255,255,255,.3)",textAlign:"center"}}>
            {names[1]||"Waiting…"}{playerIndex===1?" (you)":""}
          </div>
          {g.turn===1&&!g.winner&&<div style={{background:P2C,color:"#fff",fontSize:8,fontWeight:900,padding:"3px 8px",borderRadius:99}}>TURN</div>}
        </div>
        {g.turn===1&&!g.winner&&(
          <div style={{width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <div style={{
              fontSize:22,fontWeight:900,
              color:timeLeft<=5?"#FF4444":timeLeft<=10?"#FFD060":P2C,
              transition:"color .3s",
              animation:timeLeft<=5?"pulse .5s ease-in-out infinite":"none",
            }}>{playerIndex===1?timeLeft:"⏳"}</div>
            {playerIndex===1&&(
              <div style={{width:"100%",height:3,background:"rgba(255,255,255,.1)",borderRadius:99,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:99,
                  width:`${(timeLeft/30)*100}%`,
                  background:timeLeft<=5?"#FF4444":timeLeft<=10?"#FFD060":P2C,
                  transition:"width 1s linear, background .3s"}}/>
              </div>
            )}
            {missedTurns>0&&playerIndex===1&&(
              <div style={{fontSize:8,color:"#FF4444"}}>⚠ {missedTurns}/3 auto-moves</div>
            )}
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          <div style={{fontSize:7,color:"rgba(255,255,255,.2)",fontWeight:700}}>WALLS</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:3}}>
            {Array(10).fill(0).map((_,j)=>(
              <div key={j} style={{width:10,height:10,borderRadius:3,
                background:j<g.players[1].walls?`linear-gradient(135deg,${P2L},${P2C})`:"rgba(255,255,255,.09)"}}/>
            ))}
          </div>
          <div style={{fontSize:10,fontWeight:700,color:g.turn===1?P2C:"rgba(255,255,255,.2)"}}>{g.players[1].walls}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,width:"100%"}}>
          <div style={{fontSize:8,color:"rgba(255,255,255,.18)",textAlign:"center",lineHeight:1.6}}>
            Room <span style={{color:GOLD,fontWeight:800,fontSize:10}}>{roomId}</span>
          </div>
          {/* Chat toggle button */}
          <button onClick={()=>setChatOpen(o=>!o)} style={{
            width:"100%",padding:"7px 0",borderRadius:8,cursor:"pointer",
            border:`1px solid ${chatOpen?"rgba(255,208,96,.4)":"rgba(255,255,255,.1)"}`,
            background:chatOpen?"rgba(255,208,96,.15)":"rgba(255,255,255,.06)",
            fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",
            position:"relative",
          }}>
            💬
            {unread>0&&!chatOpen&&(
              <div style={{position:"absolute",top:3,right:6,
                background:"#FF4444",color:"#fff",
                fontSize:8,fontWeight:900,borderRadius:99,
                padding:"1px 5px",minWidth:14,textAlign:"center"}}>
                {unread}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* CHAT PANEL */}
      {chatOpen&&(
        <div style={{
          position:"absolute",right:PANEL_W+GAP,bottom:0,
          width:Math.min(260,LW*0.35),height:LH-8,
          zIndex:100,display:"flex",flexDirection:"column",
          background:"rgba(10,5,2,.95)",
          border:"1px solid rgba(255,208,96,.2)",
          borderRadius:14,overflow:"hidden",
          boxShadow:"-8px 0 32px rgba(0,0,0,.6)",
        }}>
          <div style={{padding:"10px 12px",borderBottom:"1px solid rgba(255,255,255,.08)",
            display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:12,fontWeight:800,color:GOLD}}>💬 Chat</div>
            <button onClick={()=>setChatOpen(false)} style={{
              background:"none",border:"none",color:"rgba(255,255,255,.4)",
              fontSize:16,cursor:"pointer",fontFamily:F,lineHeight:1}}>✕</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"8px",display:"flex",flexDirection:"column",gap:6}}>
            {chat.length===0&&(
              <div style={{fontSize:11,color:"rgba(255,255,255,.2)",textAlign:"center",marginTop:20}}>
                No messages yet.<br/>Say hi! 👋
              </div>
            )}
            {chat.map((m,i)=>{
              const mine=m.from===playerIndex;
              return(
                <div key={i} style={{display:"flex",flexDirection:"column",
                  alignItems:mine?"flex-end":"flex-start"}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,.3)",marginBottom:2,
                    paddingLeft:mine?0:4,paddingRight:mine?4:0}}>
                    {mine?"You":m.name}
                  </div>
                  <div style={{maxWidth:"85%",padding:"7px 10px",
                    borderRadius:mine?"12px 12px 4px 12px":"12px 12px 12px 4px",
                    background:mine?`rgba(${playerIndex===0?"0,151,167":"233,30,99"},.25)`:"rgba(255,255,255,.1)",
                    border:`1px solid ${mine?PC[playerIndex]+"40":"rgba(255,255,255,.08)"}`,
                    fontSize:12,color:"rgba(255,255,255,.9)",wordBreak:"break-word",lineHeight:1.5,
                  }}>{m.text}</div>
                </div>
              );
            })}
            <div ref={chatEndRef}/>
          </div>
          <div style={{padding:"6px 8px",borderTop:"1px solid rgba(255,255,255,.06)",
            display:"flex",flexWrap:"wrap",gap:4}}>
            {["👋 Hi!","Nice move!","Oops 😅","Good game!","😂😂😂","GG!"].map(p=>(
              <button key={p} onClick={()=>sendChat(p)} style={{
                padding:"4px 8px",borderRadius:20,border:"1px solid rgba(255,255,255,.1)",
                background:"rgba(255,255,255,.06)",color:"rgba(255,255,255,.6)",
                fontSize:10,cursor:"pointer",fontFamily:F,fontWeight:600,
              }}>{p}</button>
            ))}
          </div>
          <div style={{padding:"6px 8px 8px",display:"flex",gap:6}}>
            <input value={chatMsg} onChange={e=>setChatMsg(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&sendChat(chatMsg)}
              placeholder="Type a message…" maxLength={80}
              style={{flex:1,padding:"8px 10px",borderRadius:10,
                border:"1px solid rgba(255,255,255,.12)",
                background:"rgba(255,255,255,.07)",color:"#fff",
                fontSize:12,fontFamily:F,outline:"none"}}/>
            <button onClick={()=>sendChat(chatMsg)} disabled={!chatMsg.trim()} style={{
              padding:"8px 12px",borderRadius:10,border:"none",cursor:"pointer",
              background:chatMsg.trim()?GOLDBTN:"rgba(255,255,255,.08)",
              color:chatMsg.trim()?"#3c2200":"rgba(255,255,255,.25)",
              fontWeight:800,fontSize:12,fontFamily:F}}>→</button>
          </div>
        </div>
      )}

      {/* ONLINE WIN OVERLAY */}
      {g.winner!=null&&(
        <div style={{position:"absolute",inset:0,zIndex:200,display:"flex",alignItems:"center",
          justifyContent:"center",padding:20,background:"rgba(0,0,0,.88)",backdropFilter:"blur(22px)"}}>
          {g.winner===playerIndex&&<Confetti/>}
          <WinSound winner={g.winner===playerIndex?0:1}/>
          {/* Award pot once */}
          {!potClaimed&&bet>0&&g.winner===playerIndex&&(()=>{
            setPotClaimed(true);
            onCoinsUpdate&&onCoinsUpdate(bet*2);
            return null;
          })()}
          <div style={{background:"linear-gradient(145deg,#2A1508,#1A0C04)",
            border:`2px solid ${PC[g.winner]}50`,borderRadius:22,padding:"26px 24px",
            textAlign:"center",maxWidth:280,width:"100%",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",inset:0,pointerEvents:"none",borderRadius:22,
              background:`radial-gradient(ellipse at 50% 0%,${PC[g.winner]}16,transparent 65%)`}}/>
            <div style={{fontSize:8,fontWeight:900,letterSpacing:".2em",color:PC[g.winner],marginBottom:4}}>
              {g.winner===playerIndex?"🏆 YOU WIN!":"YOU LOSE"}
            </div>
            <div style={{fontSize:28,fontWeight:900,color:"rgba(255,255,255,.95)",lineHeight:1,marginBottom:4}}>
              {names[g.winner]}
            </div>
            <div style={{fontSize:14,color:"rgba(255,255,255,.4)",marginBottom:bet>0?10:20}}>wins the game!</div>
            {bet>0&&(
              <div style={{marginBottom:16,padding:"10px",borderRadius:10,
                background:g.winner===playerIndex?"rgba(255,208,96,.12)":"rgba(255,80,80,.08)",
                border:`1px solid ${g.winner===playerIndex?"rgba(255,208,96,.25)":"rgba(255,80,80,.15)"}`}}>
                {g.winner===playerIndex
                  ?<div style={{fontSize:13,fontWeight:800,color:GOLD}}>+{(bet*2).toLocaleString()} 🪙 won!</div>
                  :<div style={{fontSize:13,color:"rgba(255,120,120,.7)"}}>-{bet.toLocaleString()} 🪙 lost</div>
                }
              </div>
            )}
            <button onClick={onBack} className="gb" style={{width:"100%",padding:"13px",borderRadius:12,border:"none",
              background:GOLDBTN,color:"#3c2200",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:F}}>
              🏠 Back to Menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOURNAMENT DATA
// ─────────────────────────────────────────────────────────────────────────────
const TOURNAMENTS=[
  {
    id:"sydney",name:"SYDNEY",country:"Australia",flag:"🇦🇺",
    difficulty:"easy",
    entry:50,prize:300,
    color:"#00B4D8",dark:"#005F73",
    desc:"A relaxed introduction to tournament play. Easy AI, low stakes.",
    games:3, // best of 3
  },
  {
    id:"china",name:"CHINA",country:"China",flag:"🇨🇳",
    difficulty:"medium",
    entry:150,prize:800,
    color:"#E63946",dark:"#9B1B26",
    desc:"The Middle Kingdom challenge. Tactical AI, serious stakes.",
    games:3,
  },
  {
    id:"usa",name:"USA",country:"United States",flag:"🇺🇸",
    difficulty:"hard",
    entry:400,prize:2000,
    color:"#3A86FF",dark:"#1B3A7A",
    desc:"The ultimate test. Brutal AI, highest prize. Champions only.",
    games:3,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// TOURNAMENT SELECT SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function TournamentScreen({coins,onSelect,onBack}){
  const[vis,setVis]=useState(false);
  useEffect(()=>{setTimeout(()=>setVis(true),60);},[]);

  return(
    <div style={{minHeight:"100dvh",background:TABLE_BG,fontFamily:F,display:"flex",flexDirection:"column",overflowY:"auto"}}>
      <BackHeader onBack={onBack} title="TOURNAMENT" subtitle="CHOOSE YOUR CHAMPIONSHIP"/>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"16px 20px 40px"}}>
        <div style={{fontSize:11,color:GOLD+"88",marginBottom:16}}>
          💰 Your coins: {coins[0].toLocaleString()} 🪙
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14,width:"100%",maxWidth:340,
          opacity:vis?1:0,transform:vis?"translateY(0)":"translateY(14px)",transition:"all .5s ease .1s"}}>
          {TOURNAMENTS.map((t)=>{
            const canAfford=coins[0]>=t.entry;
            return(
              <div key={t.id} style={{borderRadius:18,overflow:"hidden",
                border:`2px solid ${t.color}55`,opacity:canAfford?1:.55,
                boxShadow:canAfford?`0 8px 32px ${t.color}25`:"none",transition:"all .15s"}}>
                <div style={{background:`linear-gradient(135deg,${t.dark},${t.color})`,
                  padding:"16px 18px",display:"flex",alignItems:"center",gap:14}}>
                  <div style={{fontSize:36,lineHeight:1}}>{t.flag}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:18,fontWeight:900,color:"#fff",letterSpacing:".04em"}}>{t.name}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.6)",marginTop:2}}>
                      {t.difficulty.toUpperCase()} AI · BEST OF {t.games}
                    </div>
                  </div>
                  <div style={{background:"rgba(0,0,0,.25)",borderRadius:8,padding:"6px 10px",textAlign:"center"}}>
                    <div style={{fontSize:9,color:"rgba(255,255,255,.6)",fontWeight:700}}>PRIZE</div>
                    <div style={{fontSize:15,fontWeight:900,color:"#FFD060"}}>{t.prize.toLocaleString()} 🪙</div>
                  </div>
                </div>
                <div style={{background:"rgba(255,255,255,.05)",padding:"14px 18px"}}>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.45)",marginBottom:12,lineHeight:1.6}}>{t.desc}</div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{fontSize:11,color:"rgba(255,255,255,.4)"}}>
                      Entry: <span style={{color:canAfford?GOLD:"#ff6060",fontWeight:700}}>
                        {t.entry.toLocaleString()} 🪙
                      </span>
                      {!canAfford&&<span style={{color:"#ff6060",fontSize:9,marginLeft:6}}>Not enough</span>}
                    </div>
                    <button onClick={()=>canAfford&&onSelect(t)} style={{
                      padding:"9px 20px",borderRadius:10,border:"none",
                      cursor:canAfford?"pointer":"not-allowed",fontFamily:F,
                      background:canAfford?`linear-gradient(135deg,${t.dark},${t.color})`:"rgba(255,255,255,.08)",
                      color:canAfford?"#fff":"rgba(255,255,255,.25)",
                      fontWeight:800,fontSize:12,letterSpacing:".04em",
                      boxShadow:canAfford?`0 4px 14px ${t.color}40`:"none",transition:"all .15s"}}>
                      ENTER →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOURNAMENT RESULT SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function TournamentResultScreen({tournament,playerName,wins,losses,onPlayAgain,onMenu}){
  const[vis,setVis]=useState(false);
  useEffect(()=>{setTimeout(()=>setVis(true),80);},[]);
  const won=wins>=2;
  const t=tournament;

  return(
    <div style={{minHeight:"100dvh",background:TABLE_BG,fontFamily:F,
      display:"flex",flexDirection:"column",alignItems:"center",
      justifyContent:"center",gap:20,padding:24}}>
      <style>{`@keyframes trophySpin{0%{transform:scale(1) rotate(-5deg)}50%{transform:scale(1.15) rotate(5deg)}100%{transform:scale(1) rotate(-5deg)}}`}</style>

      <div style={{
        opacity:vis?1:0,transform:vis?"scale(1)":"scale(.85)",
        transition:"all .5s cubic-bezier(.34,1.56,.64,1)",
        textAlign:"center",
      }}>
        {/* Trophy / broken */}
        <div style={{
          fontSize:80,marginBottom:12,
          animation:won?"trophySpin 2s ease-in-out infinite":"none",
          display:"inline-block",
        }}>
          {won?"🏆":"💔"}
        </div>

        {/* Tournament flag */}
        <div style={{fontSize:32,marginBottom:4}}>{t.flag}</div>
        <div style={{
          fontSize:11,fontWeight:700,letterSpacing:".14em",
          color:t.color,marginBottom:8,
        }}>{t.name} TOURNAMENT</div>

        <div style={{
          fontSize:won?34:26,fontWeight:900,
          color:won?"#FFD060":"rgba(255,255,255,.6)",
          marginBottom:6,lineHeight:1,
        }}>
          {won?"CHAMPION!":"ELIMINATED"}
        </div>
        <div style={{fontSize:14,color:"rgba(255,255,255,.45)",marginBottom:20}}>
          {playerName} · {wins}W – {losses}L
        </div>

        {/* Prize box */}
        {won&&(
          <div style={{
            background:`linear-gradient(135deg,rgba(255,208,96,.15),rgba(255,208,96,.05))`,
            border:"1px solid rgba(255,208,96,.35)",
            borderRadius:16,padding:"16px 28px",marginBottom:20,
            display:"inline-block",
          }}>
            <div style={{fontSize:11,color:"rgba(255,208,96,.6)",fontWeight:700,marginBottom:4}}>PRIZE AWARDED</div>
            <div style={{fontSize:28,fontWeight:900,color:GOLD}}>+{t.prize.toLocaleString()} 🪙</div>
          </div>
        )}
        {!won&&(
          <div style={{
            background:"rgba(255,80,80,.08)",border:"1px solid rgba(255,80,80,.2)",
            borderRadius:16,padding:"12px 24px",marginBottom:20,display:"inline-block",
          }}>
            <div style={{fontSize:12,color:"rgba(255,120,120,.7)"}}>Better luck next time!</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.3)",marginTop:3}}>
              Entry fee of {t.entry.toLocaleString()} 🪙 was lost
            </div>
          </div>
        )}

        {/* Scoreboard */}
        <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:24}}>
          {Array(3).fill(0).map((_,i)=>{
            const isWin=i<wins;
            const isLoss=i<losses&&!isWin;
            return(
              <div key={i} style={{
                width:44,height:44,borderRadius:12,
                background:i<wins?"rgba(80,220,120,.2)":i<wins+losses?"rgba(255,80,80,.2)":"rgba(255,255,255,.05)",
                border:`2px solid ${i<wins?"#50DC78":i<wins+losses?"#ff5050":"rgba(255,255,255,.1)"}`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:20,
              }}>
                {i<wins?"✓":i<wins+losses?"✗":"·"}
              </div>
            );
          })}
        </div>

        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={onPlayAgain} style={{
            padding:"14px 24px",borderRadius:12,border:"none",cursor:"pointer",fontFamily:F,
            background:`linear-gradient(135deg,${t.dark},${t.color})`,
            color:"#fff",fontWeight:800,fontSize:14,
            boxShadow:`0 6px 20px ${t.color}40`,
          }}>🔄 Try Again</button>
          <button onClick={onMenu} style={{
            padding:"14px 24px",borderRadius:12,border:"1px solid rgba(255,255,255,.1)",
            cursor:"pointer",fontFamily:F,
            background:"transparent",color:"rgba(255,255,255,.4)",fontWeight:700,fontSize:14,
          }}>🏠 Menu</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAYER NAME SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function PlayerNameScreen({vsAI, onStart, onBack}){
  const[n1,setN1]=useState("");
  const[n2,setN2]=useState("");
  const canStart=n1.trim().length>0&&(vsAI||n2.trim().length>0);
  return(
    <div style={{minHeight:"100dvh",background:TABLE_BG,fontFamily:F,display:"flex",flexDirection:"column"}}>
      <BackHeader onBack={onBack} title={vsAI?"YOUR NAME":"PLAYER NAMES"} subtitle="ENTER NAMES TO BEGIN"/>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,gap:16,padding:24}}>
        <div style={{display:"flex",flexDirection:"column",gap:14,width:"100%",maxWidth:300}}>
          <div>
            <div style={{fontSize:10,fontWeight:800,color:P1C,letterSpacing:".1em",marginBottom:6}}>
              {vsAI?"YOUR NAME":"PLAYER 1 · TEAL"}
            </div>
            <input value={n1} onChange={e=>setN1(e.target.value)} maxLength={12}
              placeholder={vsAI?"Enter your name…":"e.g. Alex"} autoFocus
              style={{width:"100%",padding:"14px 16px",borderRadius:12,
                border:`2px solid ${n1.trim()?P1C+"80":"rgba(255,255,255,.1)"}`,
                background:"rgba(255,255,255,.07)",color:"#fff",
                fontSize:15,fontWeight:700,fontFamily:F,outline:"none",transition:"border-color .2s"}}/>
          </div>
          {!vsAI&&(
            <div>
              <div style={{fontSize:10,fontWeight:800,color:P2C,letterSpacing:".1em",marginBottom:6}}>PLAYER 2 · PINK</div>
              <input value={n2} onChange={e=>setN2(e.target.value)} maxLength={12} placeholder="e.g. Jordan"
                style={{width:"100%",padding:"14px 16px",borderRadius:12,
                  border:`2px solid ${n2.trim()?P2C+"80":"rgba(255,255,255,.1)"}`,
                  background:"rgba(255,255,255,.07)",color:"#fff",
                  fontSize:15,fontWeight:700,fontFamily:F,outline:"none",transition:"border-color .2s"}}/>
            </div>
          )}
          {vsAI&&(
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderRadius:12,
              background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.07)"}}>
              <span style={{fontSize:24}}>🤖</span>
              <div>
                <div style={{fontSize:12,fontWeight:800,color:"rgba(255,255,255,.5)"}}>OPPONENT</div>
                <div style={{fontSize:14,fontWeight:900,color:P2C}}>AI</div>
              </div>
            </div>
          )}
          <button onClick={()=>{if(!canStart)return;onStart(n1.trim()||"Player 1",vsAI?"AI":(n2.trim()||"Player 2"));}}
            style={{marginTop:4,padding:"16px",borderRadius:14,border:"none",
              cursor:canStart?"pointer":"not-allowed",fontFamily:F,
              background:canStart?GOLDBTN:"rgba(255,255,255,.1)",
              color:canStart?"#3c2200":"rgba(255,255,255,.25)",
              fontWeight:900,fontSize:15,letterSpacing:".04em",
              boxShadow:canStart?`0 6px 26px ${GOLD}45`:"none",transition:"all .15s"}}>
            LET'S PLAY →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BETTING SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function BettingScreen({names,coins,vsAI,onStart,onBack}){
  const[vis,setVis]=useState(false);
  const[bet1,setBet1]=useState(100);
  const[bet2,setBet2]=useState(100);
  useEffect(()=>{setTimeout(()=>setVis(true),60);},[]);

  const c1=coins[0], c2=coins[1];
  const canBet=bet1>0&&bet1<=c1&&(vsAI||(bet2>0&&bet2<=c2));

  const BetInput=({pi,val,setVal,max,color})=>(
    <div style={{
      padding:"14px 16px",borderRadius:14,
      background:"rgba(255,255,255,.06)",
      border:`1px solid ${color}30`,
    }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div>
          <div style={{fontSize:12,fontWeight:800,color,letterSpacing:".04em"}}>{names[pi]}</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,.3)",marginTop:2}}>
            💰 {max.toLocaleString()} coins available
          </div>
        </div>
        <div style={{fontSize:18,fontWeight:900,color,minWidth:80,textAlign:"right"}}>
          {val.toLocaleString()} 🪙
        </div>
      </div>
      {/* Slider */}
      <input type="range" min={10} max={max} step={10} value={val}
        onChange={e=>setVal(Number(e.target.value))}
        style={{width:"100%",accentColor:color,cursor:"pointer"}}/>
      {/* Quick picks */}
      <div style={{display:"flex",gap:6,marginTop:8}}>
        {[50,100,250,500].filter(v=>v<=max).map(v=>(
          <button key={v} onClick={()=>setVal(v)} style={{
            flex:1,padding:"5px 0",borderRadius:8,border:"none",cursor:"pointer",
            background:val===v?color:"rgba(255,255,255,.08)",
            color:val===v?"#fff":"rgba(255,255,255,.4)",
            fontSize:10,fontWeight:700,fontFamily:F,
          }}>{v}</button>
        ))}
        <button onClick={()=>setVal(max)} style={{
          flex:1,padding:"5px 0",borderRadius:8,border:"none",cursor:"pointer",
          background:val===max?color:"rgba(255,255,255,.08)",
          color:val===max?"#fff":"rgba(255,255,255,.4)",
          fontSize:10,fontWeight:700,fontFamily:F,
        }}>ALL</button>
      </div>
    </div>
  );

  return(
    <div style={{minHeight:"100dvh",background:TABLE_BG,fontFamily:F,display:"flex",flexDirection:"column"}}>
      <BackHeader onBack={onBack} title="PLACE YOUR BETS" subtitle="WINNER TAKES THE POT"/>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,gap:16,padding:24}}>
        <div style={{width:"100%",maxWidth:320,display:"flex",flexDirection:"column",gap:12,
          opacity:vis?1:0,transform:vis?"translateY(0)":"translateY(14px)",transition:"all .45s ease .1s"}}>
          <BetInput pi={0} val={bet1} setVal={setBet1} max={c1} color={P1C}/>
          {!vsAI&&<BetInput pi={1} val={bet2} setVal={setBet2} max={c2} color={P2C}/>}
          <div style={{textAlign:"center",padding:"12px",borderRadius:12,
            background:"rgba(255,208,96,.08)",border:"1px solid rgba(255,208,96,.2)"}}>
            <div style={{fontSize:11,color:"rgba(255,208,96,.5)",fontWeight:700,marginBottom:2}}>TOTAL POT</div>
            <div style={{fontSize:24,fontWeight:900,color:GOLD}}>{(vsAI?bet1*2:bet1+bet2).toLocaleString()} 🪙</div>
            {vsAI&&<div style={{fontSize:10,color:"rgba(255,255,255,.3)",marginTop:2}}>AI matches your bet</div>}
          </div>
          <button onClick={()=>canBet&&onStart(bet1,vsAI?bet1:bet2)} style={{
            padding:"16px",borderRadius:14,border:"none",cursor:canBet?"pointer":"not-allowed",
            background:canBet?GOLDBTN:"rgba(255,255,255,.08)",
            color:canBet?"#3c2200":"rgba(255,255,255,.25)",
            fontWeight:900,fontSize:15,fontFamily:F,
            boxShadow:canBet?`0 6px 24px ${GOLD}45`:"none",transition:"all .15s"}}>🎲 START GAME</button>
          <button onClick={()=>onStart(0,0)} style={{
            padding:"10px",borderRadius:10,border:"none",cursor:"pointer",
            background:"transparent",color:"rgba(255,255,255,.2)",
            fontSize:11,fontWeight:600,fontFamily:F}}>Skip betting — play for free</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function GameScreen({onBack,initialState,onSave,settings,vsAI,names,bets,onGameEnd,aiDifficulty="medium",tournament,tournWins,tournLosses,onNextTournamentGame}){
  const[g,setG]=useState(()=>initialState||INIT());
  const[hov,setHov]=useState(null);
  const[camRx,setCamRx]=useState(0);
  const[camRz,setCamRz]=useState(0);
  const[activeCam,setActiveCam]=useState("top");
  const[smooth,setSmooth]=useState(true);
  const[aiThinking,setAiThinking]=useState(false);
  const[timeLeft,setTimeLeft]=useState(30);
  const timerRef=useRef(null);
  const drag=useRef(null);
  const wasDrag=useRef(false);

  const[vw,setVw]=useState(window.innerWidth);
  const[vh,setVh]=useState(window.innerHeight);
  useEffect(()=>{
    const upd=()=>{setVw(window.innerWidth);setVh(window.innerHeight);};
    window.addEventListener("resize",upd);
    window.addEventListener("orientationchange",()=>setTimeout(upd,100));
    return()=>window.removeEventListener("resize",upd);
  },[]);

  useEffect(()=>{ if(!g.winner) onSave(g); },[g]);

  // Timer
  useEffect(()=>{
    if(g.winner) return;
    if(vsAI&&g.turn===1) return;
    setTimeLeft(30);
    SFX.turnStart();
    clearInterval(timerRef.current);
    timerRef.current=setInterval(()=>{
      setTimeLeft(prev=>{
        if(prev<=5) SFX.urgentTick();
        else if(prev<=10) SFX.tick();
        if(prev<=1){
          clearInterval(timerRef.current);
          setG(p=>({...p,turn:1-p.turn,mode:"move"}));
          return 30;
        }
        return prev-1;
      });
    },1000);
    return()=>clearInterval(timerRef.current);
  },[g.turn,g.winner]);

  // AI move trigger
  useEffect(()=>{
    if(!vsAI||g.turn!==1||g.winner) return;
    setAiThinking(true);
    const t=setTimeout(()=>{
      const move=aiPickMove(g, aiDifficulty);
      if(move){
        if(move.type==="move"){
          SFX.move();
          setG(prev=>{
            const np=prev.players.map((p,i)=>i===1?{...p,row:move.row,col:move.col}:p);
            const won=move.row===GOALS[1]?1:null;
            return{...prev,players:np,turn:won!=null?1:0,winner:won};
          });
        } else {
          SFX.wall();
          setG(prev=>{
            const nh=prev.hW.map(x=>[...x]),nv=prev.vW.map(x=>[...x]);
            move.ori==="h"?(nh[move.wr][move.wc]=1):(nv[move.wr][move.wc]=1);
            const np=prev.players.map((p,i)=>i===1?{...p,walls:p.walls-1}:p);
            return{...prev,hW:nh,vW:nv,players:np,turn:0,mode:"move"};
          });
        }
      }
      setAiThinking(false);
    },650);
    return()=>clearTimeout(t);
  },[g.turn,g.winner,vsAI]);

  const isPortrait = vw <= vh;

  // Music
  const musicEnabled = settings?.music !== false;

  if(isPortrait){
    return(
      <>
        <MusicController enabled={musicEnabled}/>
        <div style={{width:"100vw",height:"100vh",background:TABLE_BG,fontFamily:F,
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:20}}>
        <style>{`@keyframes tilt{0%,100%{transform:rotate(-15deg)}50%{transform:rotate(15deg)}}`}</style>
        <div style={{fontSize:72,animation:"tilt 1.8s ease-in-out infinite"}}>📱</div>
        <div style={{textAlign:"center",padding:"0 40px"}}>
          <div style={{fontSize:22,fontWeight:900,color:GOLD,marginBottom:10}}>Rotate Your Device</div>
          <div style={{fontSize:14,color:"rgba(255,255,255,.4)",lineHeight:1.7}}>
            Quoridor plays in landscape mode.<br/>Turn your device sideways to start playing.
          </div>
        </div>
        <button onClick={onBack} style={{padding:"12px 28px",borderRadius:14,
          border:"1px solid rgba(255,208,96,.25)",background:"rgba(255,208,96,.12)",
          color:GOLD,fontWeight:700,fontSize:13,fontFamily:F,cursor:"pointer"}}>
          ‹ Back to Menu
        </button>
      </div>
      </>
    );
  }
  const LW=vw, LH=vh;
  const PANEL_W = Math.round(Math.max(78, Math.min(96, LW*0.105)));
  const BTN_W = 66;
  const GAP = 5;
  // Center space = full width minus two side panels minus gaps
  const centerW = LW - PANEL_W*2 - BTN_W - GAP*4;
  // Board scale: fit inside center width and full height
  const boardScale = Math.min((LH - 8) / BP, centerW / BP);
  const boardPx = Math.round(BP * boardScale);

  // ── Input handlers ────────────────────────────────────────────────────────
  const vm=g.winner?[]:getVM(g.turn,g.players,g.hW,g.vW);
  const isVM=(r,c)=>vm.some(([vr,vc])=>vr===r&&vc===c);
  const tc=PC[g.turn];

  // Camera drag — high threshold (14px) so normal cell taps never trigger it
  const dStart=e=>{
    const p=e.touches?.[0]??e;
    drag.current={x:p.clientX,y:p.clientY,rx:camRx,rz:camRz};
    wasDrag.current=false;
  };
  const dMove=e=>{
    if(!drag.current)return;
    const p=e.touches?.[0]??e;
    const dx=p.clientX-drag.current.x, dy=p.clientY-drag.current.y;
    if(Math.hypot(dx,dy)>14){
      wasDrag.current=true; setSmooth(false); setActiveCam(null);
      setCamRx(Math.max(0,Math.min(35,drag.current.rx+dy*.25)));
      setCamRz(drag.current.rz+dx*.25);
    }
  };
  const dEnd=()=>{drag.current=null; setTimeout(()=>{wasDrag.current=false;},100);};

  const goPreset=p=>{setSmooth(true);setActiveCam(p.id);setCamRx(p.rx);setCamRz(p.rz);};

  const doMove=(r,c)=>{
    if(aiThinking||wasDrag.current||g.winner||g.mode!=="move"||!isVM(r,c))return;
    SFX.move();
    clearInterval(timerRef.current);
    setG(prev=>{
      const np=prev.players.map((p,i)=>i===prev.turn?{...p,row:r,col:c}:p);
      const won=r===GOALS[prev.turn]?prev.turn:null;
      return{...prev,players:np,turn:won!=null?prev.turn:1-prev.turn,winner:won};
    });
  };
  const doWall=(wr,wc,ori)=>{
    if(aiThinking||wasDrag.current||g.winner||g.mode!=="wall"||!g.players[g.turn].walls)return;
    if(!canPlace(wr,wc,ori,g.hW,g.vW,g.players)){SFX.invalid();return;}
    SFX.wall();
    clearInterval(timerRef.current);
    setG(prev=>{
      const nh=prev.hW.map(x=>[...x]),nv=prev.vW.map(x=>[...x]);
      ori==="h"?(nh[wr][wc]=prev.turn):(nv[wr][wc]=prev.turn);
      const np=prev.players.map((p,i)=>i===prev.turn?{...p,walls:p.walls-1}:p);
      return{...prev,hW:nh,vW:nv,players:np,turn:1-prev.turn,mode:"move"};
    });
    setHov(null);
  };
  const newGame=()=>{setG(INIT());setHov(null);onSave(null);};

  const showHov=!wasDrag.current&&hov&&g.mode==="wall";
  const hvValid=showHov&&g.players[g.turn].walls>0&&
    canPlace(hov.wr,hov.wc,hov.ori,g.hW,g.vW,g.players);
  const frameW=12;

  // ── Side panel (inline) ───────────────────────────────────────────────────
  const SidePanel=({pi})=>{
    const player=g.players[pi];
    const isActive=g.turn===pi&&!g.winner;
    const base=PC[pi],light=PL[pi],dark=PD[pi];
    const bet=bets?.[pi]||0;
    return(
      <div style={{
        width:PANEL_W, height:LH-8,
        display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"space-between",padding:"10px 6px",
        background:isActive?`rgba(${pi===0?"0,151,167":"233,30,99"},.13)`:"rgba(0,0,0,.3)",
        border:`2px solid ${isActive?base+"70":"rgba(255,255,255,.06)"}`,
        borderRadius:14,transition:"all .25s",
        boxShadow:isActive?`0 0 20px ${base}25`:"none",
      }}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          {/* Avatar emoji */}
          <div style={{
            fontSize:30, lineHeight:1,
            filter:isActive?`drop-shadow(0 0 8px ${base})`:"grayscale(0.5) opacity(0.6)",
            transition:"filter .3s",
          }}>
            {vsAI&&pi===1&&!tournament?"🤖":"👤"}
          </div>
          {/* Name only — no subtitle */}
          <div style={{fontSize:11,fontWeight:900,color:isActive?base:"rgba(255,255,255,.3)",textAlign:"center",lineHeight:1.2}}>
            {names?.[pi]||PN[pi]}
          </div>
          {isActive&&!aiThinking&&<div style={{background:base,color:"#fff",fontSize:8,fontWeight:900,
            padding:"3px 8px",borderRadius:99,boxShadow:`0 2px 8px ${base}50`}}>TURN</div>}
          {isActive&&aiThinking&&pi===1&&<div style={{background:"rgba(255,255,255,.15)",color:"#fff",fontSize:7,fontWeight:900,
            padding:"3px 8px",borderRadius:99,letterSpacing:".04em",
            animation:"pulse 0.8s ease-in-out infinite"}}>THINKING…</div>}
        </div>

        {/* Timer — only show for active human player */}
        {isActive&&!(vsAI&&pi===1)&&!g.winner&&(
          <div style={{width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <div style={{
              fontSize:20,fontWeight:900,
              color:timeLeft<=10?"#FF4444":timeLeft<=20?"#FFD060":base,
              transition:"color .3s",
              animation:timeLeft<=5?"pulse .5s ease-in-out infinite":"none",
            }}>{timeLeft}</div>
            {/* Timer bar */}
            <div style={{width:"100%",height:4,background:"rgba(255,255,255,.1)",borderRadius:99,overflow:"hidden"}}>
              <div style={{
                height:"100%",borderRadius:99,
                width:`${(timeLeft/30)*100}%`,
                background:timeLeft<=10?"#FF4444":timeLeft<=20?"#FFD060":base,
                transition:"width 1s linear, background .3s",
              }}/>
            </div>
          </div>
        )}

        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
          <div style={{fontSize:7,color:"rgba(255,255,255,.2)",fontWeight:700,letterSpacing:".05em"}}>WALLS</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:3}}>
            {Array(10).fill(0).map((_,j)=>(
              <div key={j} style={{width:10,height:10,borderRadius:3,
                background:j<player.walls?`linear-gradient(135deg,${light},${base})`:"rgba(255,255,255,.09)",
                transition:"background .2s"}}/>
            ))}
          </div>
          <div style={{fontSize:10,fontWeight:700,color:isActive?base:"rgba(255,255,255,.2)"}}>{player.walls}</div>
        </div>

        {/* Bet amount */}
        {bet>0&&(
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:7,color:"rgba(255,255,255,.2)",fontWeight:700,letterSpacing:".05em",marginBottom:2}}>BET</div>
            <div style={{fontSize:11,fontWeight:800,color:GOLD}}>🪙 {bet.toLocaleString()}</div>
          </div>
        )}

        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,width:"100%"}}>
          {pi===0?(
            <>
              <div style={{fontSize:7,color:"rgba(255,255,255,.18)",fontWeight:700,marginBottom:2}}>VIEW</div>
              {CAMS.map(p=>(
                <button key={p.id} onClick={()=>goPreset(p)} style={{
                  width:"100%",padding:"5px 0",borderRadius:8,cursor:"pointer",
                  background:activeCam===p.id?"rgba(255,208,96,.2)":"rgba(0,0,0,.35)",
                  border:`1px solid ${activeCam===p.id?"rgba(255,208,96,.45)":"rgba(255,255,255,.07)"}`,
                  color:activeCam===p.id?GOLD:"rgba(255,255,255,.3)",
                  fontSize:8,fontWeight:700,fontFamily:F,transition:"all .15s",
                }}>{p.label}</button>
              ))}
            </>
          ):(
            <>
              <button onClick={onBack} style={{width:"100%",padding:"7px 0",borderRadius:8,
                border:"1px solid rgba(255,208,96,.2)",background:"rgba(255,208,96,.08)",
                fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>🏠</button>
              <button onClick={newGame} style={{width:"100%",padding:"7px 0",borderRadius:8,
                border:"1px solid rgba(255,208,96,.2)",background:"rgba(255,208,96,.08)",
                fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>🔄</button>
            </>
          )}
        </div>
      </div>
    );
  };

  return(
    <>
    <MusicController enabled={musicEnabled}/>
    <div style={{
      width:LW, height:LH,
      background:TABLE_BG, fontFamily:F,
      display:"flex", flexDirection:"row",
      alignItems:"center", padding:4, gap:GAP,
      overflow:"hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800;900&display=swap');
        *{box-sizing:border-box}body{margin:0;overflow:hidden}
        .gb:active{opacity:.78;transform:scale(.93)!important}
        @keyframes vp{0%,100%{opacity:.28;transform:scale(.58)}50%{opacity:.88;transform:scale(1.1)}}
        @keyframes wf{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes pulse{0%,100%{opacity:.5}50%{opacity:1}}
      `}</style>

      {/* LEFT: P1 */}
      <div style={{width:PANEL_W,flexShrink:0,height:LH-8}}>
        <SidePanel pi={0}/>
      </div>

      {/* MOVE/HWALL/VWALL vertical strip */}
      {!g.winner&&(
        <div style={{
          width:BTN_W, flexShrink:0, height:boardPx,
          display:"flex",flexDirection:"column",gap:5,
        }}>
          {[
            {m:"move",ori:null,icon:"🏃",label:"MOVE"},
            {m:"wall",ori:"h", icon:"━━",label:"H WALL"},
            {m:"wall",ori:"v", icon:"┃", label:"V WALL"},
          ].map(({m,ori,icon,label})=>{
            const active=g.mode===m&&(ori===null||g.ori===ori);
            return(
              <button key={label}
                onClick={()=>setG(p=>({...p,mode:m,ori:ori??p.ori}))}
                className="gb"
                style={{
                  flex:1, width:"100%", borderRadius:12,
                  cursor:"pointer",
                  background:active?GOLDBTN:"rgba(0,0,0,.55)",
                  border:`1px solid ${active?GOLD+"55":"rgba(255,255,255,.07)"}`,
                  color:active?"#3c2200":"rgba(255,255,255,.35)",
                  fontWeight:900, fontFamily:F, transition:"background .15s, color .15s, box-shadow .15s",
                  boxShadow:active?`0 3px 16px ${GOLD}55`:"none",
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,
                }}>
                <span style={{fontSize:16,lineHeight:1}}>{icon}</span>
                <span style={{fontSize:9,letterSpacing:".04em",fontWeight:800,lineHeight:1.2,textAlign:"center"}}>{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* BOARD */}
      <div style={{
        flex:1, height:LH-8,
        display:"flex", alignItems:"center", justifyContent:"center",
        // Board drag
        cursor:"grab", touchAction:"none", userSelect:"none",
        overflow:"hidden",
      }}
        onMouseDown={dStart} onMouseMove={dMove} onMouseUp={dEnd} onMouseLeave={dEnd}
        onTouchStart={dStart} onTouchMove={dMove} onTouchEnd={dEnd}
      >
        {/* Scale wrapper — only scale here, no preserve-3d */}
        <div style={{
          width:BP, height:BP, flexShrink:0,
          transform:`scale(${boardScale})`,
          transformOrigin:"center center",
        }}>
          {/* Perspective wrapper */}
          <div style={{
            width:BP, height:BP,
            perspective:"2400px",
            perspectiveOrigin:"50% 50%",
          }}>
            {/* 3D board — only rotations, NO scale */}
            <div style={{
              position:"relative", width:BP, height:BP,
              transformStyle:"preserve-3d",
              transform:`rotateX(${camRx}deg) rotateZ(${camRz}deg)`,
              transformOrigin:"center center",
              transition:smooth?"transform .45s cubic-bezier(.25,.46,.45,.94)":"none",
            }}>
            {/* Wooden frame */}
            <div style={{
              position:"absolute",
              top:-frameW, left:-frameW,
              width:BP+frameW*2, height:BP+frameW*2,
              backgroundImage:`repeating-linear-gradient(92deg,transparent,transparent 7px,rgba(0,0,0,.05) 7px,rgba(0,0,0,.05) 8px),linear-gradient(145deg,#7A4010 0%,#4A2008 45%,#3A1808 55%,#6A3818 100%)`,
              borderRadius:16, zIndex:0,
              boxShadow:"0 40px 100px rgba(0,0,0,.95),0 15px 40px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,200,80,.22)",
            }}>
              {[[8,8],[8,BP+frameW*2-15],[BP+frameW*2-15,8],[BP+frameW*2-15,BP+frameW*2-15]].map(([t,l],i)=>(
                <div key={i} style={{position:"absolute",top:t,left:l,width:7,height:7,borderRadius:"50%",
                  background:"radial-gradient(circle at 35% 28%,#FFE880,#B07018)",
                  boxShadow:"0 1px 4px rgba(0,0,0,.7)",zIndex:5}}/>
              ))}
            </div>

            {/* Board surface */}
            <div style={{position:"absolute",inset:0,zIndex:1,
              background:"#3A1808",
              borderRadius:5}}/>

            <div style={{position:"absolute",top:2,left:"50%",transform:"translateX(-50%)",zIndex:3,
              fontSize:7,fontWeight:800,color:P1C,background:"rgba(0,0,0,.3)",
              padding:"2px 7px",borderRadius:99,whiteSpace:"nowrap"}}>P1 GOAL ▲</div>
            <div style={{position:"absolute",bottom:2,left:"50%",transform:"translateX(-50%)",zIndex:3,
              fontSize:7,fontWeight:800,color:P2C,background:"rgba(0,0,0,.3)",
              padding:"2px 7px",borderRadius:99,whiteSpace:"nowrap"}}>▼ P2 GOAL</div>

            {/* Cells */}
            {Array.from({length:9},(_,r)=>Array.from({length:9},(_,c)=>{
              const valid=isVM(r,c);
              const isP0=g.players[0].row===r&&g.players[0].col===c;
              const isP1=g.players[1].row===r&&g.players[1].col===c;
              const checker=(r+c)%2===0;
              return(
                <div key={`${r}-${c}`} onClick={()=>doMove(r,c)} style={{
                  position:"absolute", zIndex:3,
                  top:cy(r), left:cx(c), width:CS, height:CS, borderRadius:3,
                  background:valid?`${tc}40`:checker?"#F0DFA8":"#E8D496",
                  border:`1px solid ${valid?tc+"70":"rgba(130,90,20,.22)"}`,
                  cursor:valid?"pointer":"default",
                  display:"flex", alignItems:"flex-end", justifyContent:"center",
                  boxShadow:valid?`inset 0 0 12px ${tc}28`:"inset 0 1px 0 rgba(255,255,255,.35)",
                }}>
                  {valid&&!isP0&&!isP1&&(
                    <div style={{position:"absolute",top:"50%",left:"50%",
                      transform:"translate(-50%,-50%)",
                      width:12,height:12,borderRadius:"50%",
                      background:tc,animation:"vp 1.5s ease-in-out infinite"}}/>
                  )}
                  {(isP0||isP1)&&(
                    <div style={{position:"absolute",bottom:2,left:"50%",transform:"translateX(-50%)",
                      width:22,height:7,background:"radial-gradient(ellipse,rgba(0,0,0,.45),transparent 70%)",
                      borderRadius:"50%",zIndex:2,pointerEvents:"none"}}/>
                  )}
                  {isP0&&<Pawn pi={0}/>}
                  {isP1&&<Pawn pi={1}/>}
                </div>
              );
            }))}

            {/* Placed walls */}
            {g.hW.map((row,wr)=>row.map((pi,wc)=>pi!==-1&&<HWall key={`hw${wr}-${wc}`} wr={wr} wc={wc} pi={pi}/>))}
            {g.vW.map((row,wr)=>row.map((pi,wc)=>pi!==-1&&<VWall key={`vw${wr}-${wc}`} wr={wr} wc={wc} pi={pi}/>))}

            {/* Hover preview */}
            {showHov&&(hov.ori==="h"
              ?<HWall wr={hov.wr} wc={hov.wc} ghost valid={hvValid}/>
              :<VWall wr={hov.wr} wc={hov.wc} ghost valid={hvValid}/>
            )}

            {/* Wall click targets */}
            {g.mode==="wall"&&!g.winner&&Array.from({length:WG},(_,wr)=>
              Array.from({length:WG},(_,wc)=>
                g.ori==="h"
                  ?<div key={`wth${wr}-${wc}`} style={{position:"absolute",zIndex:20,cursor:"crosshair",
                      top:cy(wr+1)-GP-8,left:cx(wc),width:2*CS+GP,height:GP+16}}
                      onMouseEnter={()=>setHov({wr,wc,ori:"h"})} onMouseLeave={()=>setHov(null)}
                      onClick={()=>doWall(wr,wc,"h")}/>
                  :<div key={`wtv${wr}-${wc}`} style={{position:"absolute",zIndex:20,cursor:"crosshair",
                      top:cy(wr),left:cx(wc+1)-GP-8,width:GP+16,height:2*CS+GP}}
                      onMouseEnter={()=>setHov({wr,wc,ori:"v"})} onMouseLeave={()=>setHov(null)}
                      onClick={()=>doWall(wr,wc,"v")}/>
              )
            )}
          </div>
          </div>
        </div>
      </div>

      {/* RIGHT: P2 */}
      <div style={{width:PANEL_W,flexShrink:0,height:LH-8}}>
        <SidePanel pi={1}/>
      </div>

      {/* WIN OVERLAY */}
      {g.winner!=null&&(
        <div style={{position:"absolute",inset:0,zIndex:200,
          display:"flex",alignItems:"center",justifyContent:"center",padding:20,
          background:"rgba(0,0,0,.88)",backdropFilter:"blur(22px)"}}>
          {g.winner===0&&<Confetti/>}
          <WinSound winner={g.winner}/>          <div style={{
            background:"linear-gradient(145deg,#2A1508,#1A0C04)",
            border:`2px solid ${PC[g.winner]}50`,borderRadius:22,
            padding:"26px 24px",textAlign:"center",maxWidth:280,width:"100%",
            boxShadow:`0 40px 100px rgba(0,0,0,.9),0 0 60px ${PC[g.winner]}18`,
            position:"relative",overflow:"hidden",
          }}>
            <div style={{position:"absolute",inset:0,pointerEvents:"none",borderRadius:22,
              background:`radial-gradient(ellipse at 50% 0%,${PC[g.winner]}16,transparent 65%)`}}/>
            <div style={{width:60,height:60,margin:"0 auto 14px",position:"relative",animation:"wf 2.5s ease-in-out infinite"}}>
              <div style={{position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",
                width:48,height:8,borderRadius:3,
                background:`linear-gradient(to bottom,${PD[g.winner]},rgba(0,0,0,.9))`,
                boxShadow:"0 3px 8px rgba(0,0,0,.7)"}}/>
              <div style={{position:"absolute",bottom:6,left:"50%",transform:"translateX(-50%)",
                width:14,height:6,background:`linear-gradient(to bottom,${PC[g.winner]},${PD[g.winner]})`,
                borderRadius:"2px 2px 0 0"}}/>
              <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",
                width:46,height:46,borderRadius:"50% 50% 46% 46%",
                background:`radial-gradient(circle at 36% 28%,${PL[g.winner]},${PC[g.winner]} 48%,${PD[g.winner]} 90%)`,
                boxShadow:`0 0 32px ${PC[g.winner]}80`,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,paddingTop:3}}>🏆</div>
            </div>
            <div style={{fontSize:8,fontWeight:900,letterSpacing:".2em",color:PC[g.winner],marginBottom:2}}>WINNER</div>
            <div style={{fontSize:28,fontWeight:900,color:"rgba(255,255,255,.95)",lineHeight:1,marginBottom:2}}>
              {names?.[g.winner]||`PLAYER ${g.winner+1}`}
            </div>
            <div style={{fontSize:18,fontWeight:900,color:PC[g.winner],marginBottom:8}}>{PN[g.winner]}</div>
            {bets&&(bets[0]>0||bets[1]>0)&&(
              <div style={{
                padding:"10px 16px",borderRadius:12,marginBottom:14,
                background:"rgba(255,208,96,.12)",border:"1px solid rgba(255,208,96,.25)",
              }}>
                <div style={{fontSize:11,color:GOLD,fontWeight:900,marginBottom:2}}>
                  🏆 +{(bets[0]+bets[1]).toLocaleString()} 🪙 coins won!
                </div>
                <div style={{fontSize:10,color:"rgba(255,255,255,.35)"}}>
                  Pot: {bets[0].toLocaleString()} + {bets[1].toLocaleString()}
                </div>
              </div>
            )}

            {/* Tournament scoreboard */}
            {tournament&&(()=>{
              const w=tournWins+(g.winner===0?1:0);
              const l=tournLosses+(g.winner===1?1:0);
              const done=w>=2||l>=2;
              return(
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:700,letterSpacing:".1em",marginBottom:8}}>
                    {tournament.flag} {tournament.name} — GAME {w+l} OF {tournament.games}
                  </div>
                  <div style={{display:"flex",gap:6,justifyContent:"center"}}>
                    {Array(3).fill(0).map((_,i)=>(
                      <div key={i} style={{
                        width:36,height:36,borderRadius:10,fontSize:16,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        background:i<w?"rgba(80,220,120,.2)":i<w+l?"rgba(255,80,80,.2)":"rgba(255,255,255,.05)",
                        border:`2px solid ${i<w?"#50DC78":i<w+l?"#ff5050":"rgba(255,255,255,.1)"}`,
                      }}>{i<w?"✓":i<w+l?"✗":"·"}</div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div style={{display:"flex",gap:8}}>
              {tournament?(()=>{
                const w=tournWins+(g.winner===0?1:0);
                const l=tournLosses+(g.winner===1?1:0);
                const done=w>=2||l>=2;
                return done?(
                  <button onClick={()=>{onGameEnd&&onGameEnd(g.winner);}} className="gb"
                    style={{flex:1,padding:"12px",borderRadius:12,border:"none",
                      background:GOLDBTN,color:"#3c2200",
                      fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:F}}>
                    🏆 See Result
                  </button>
                ):(
                  <button onClick={()=>{onGameEnd&&onGameEnd(g.winner);onNextTournamentGame&&onNextTournamentGame();newGame();}} className="gb"
                    style={{flex:1,padding:"12px",borderRadius:12,border:"none",
                      background:`linear-gradient(135deg,${tournament.dark},${tournament.color})`,
                      color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:F}}>
                    ▶ Next Game
                  </button>
                );
              })():(
                <>
                  <button onClick={()=>{onGameEnd&&onGameEnd(g.winner);newGame();}} className="gb" style={{flex:1,padding:"12px",borderRadius:12,border:"none",
                    background:`linear-gradient(135deg,${PL[g.winner]},${PC[g.winner]})`,
                    color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:F,
                    boxShadow:`0 5px 18px ${PC[g.winner]}45`}}>↺ AGAIN</button>
                  <button onClick={()=>{onGameEnd&&onGameEnd(g.winner);onBack();}} className="gb" style={{flex:1,padding:"12px",borderRadius:12,
                    border:"1px solid rgba(255,255,255,.1)",background:"transparent",
                    color:"rgba(255,255,255,.4)",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:F}}>🏠 MENU</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOURNAMENT FAKE PLAYERS
// ─────────────────────────────────────────────────────────────────────────────
const FAKE_PLAYERS = [
  "Kwame Asante","Yuki Tanaka","Carlos Vega","Amara Diallo","Lena Hoffmann",
  "Raj Patel","Zoe Williams","Ivan Petrov","Fatima Al-Hassan","Marco Rossi",
  "Priya Sharma","Elijah Brooks","Sofia Chen","Ahmed Osman","Hannah Mueller",
  "Diego Flores","Mei Lin","Kofi Mensah","Anya Ivanova","Tomás García",
  "Nia Okafor","Kenji Mori","Isabella Santos","Omar Farouq","Emma Lindqvist",
  "Bayo Adeyemi","Sun Wei","Valentina Cruz","Mikael Johansson","Aaliya Khan",
];

function getRandomOpponent(exclude=""){
  const pool=FAKE_PLAYERS.filter(n=>n!==exclude);
  return pool[Math.floor(Math.random()*pool.length)];
}

function OpponentShuffleScreen({onDone}){
  const[current,setCurrent]=useState(FAKE_PLAYERS[0]);
  const[phase,setPhase]=useState("shuffling"); // shuffling | revealing | done
  const[chosen,setChosen]=useState("");
  const[vis,setVis]=useState(false);

  useEffect(()=>{
    setTimeout(()=>setVis(true),60);
    let count=0;
    const fast=setInterval(()=>{
      setCurrent(FAKE_PLAYERS[Math.floor(Math.random()*FAKE_PLAYERS.length)]);
      count++;
      if(count>18) clearInterval(fast);
    },120);

    // Slow down
    const slow=setTimeout(()=>{
      let s=0;
      const slowInterval=setInterval(()=>{
        setCurrent(FAKE_PLAYERS[Math.floor(Math.random()*FAKE_PLAYERS.length)]);
        s++;
        if(s>6) clearInterval(slowInterval);
      },300);
    },2400);

    // Final pick
    const final=setTimeout(()=>{
      const pick=getRandomOpponent();
      setChosen(pick);
      setCurrent(pick);
      setPhase("revealing");
      setTimeout(()=>onDone(pick),1600);
    },4500);

    return()=>{clearInterval(fast);clearTimeout(slow);clearTimeout(final);};
  },[]);

  return(
    <div style={{minHeight:"100dvh",background:TABLE_BG,fontFamily:F,
      display:"flex",flexDirection:"column",alignItems:"center",
      justifyContent:"center",gap:24,padding:24,
      opacity:vis?1:0,transition:"opacity .4s"}}>
      <style>{`
        @keyframes nameFlash{0%,100%{opacity:.3}50%{opacity:1}}
        @keyframes revealPop{0%{transform:scale(.7);opacity:0}100%{transform:scale(1);opacity:1}}
      `}</style>

      <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.4)",
        letterSpacing:".12em"}}>🔍 FINDING OPPONENT…</div>

      {/* Shuffling name display */}
      <div style={{
        width:"100%",maxWidth:300,
        background:"rgba(255,255,255,.06)",
        border:`2px solid ${phase==="revealing"?GOLD+"88":"rgba(255,255,255,.1)"}`,
        borderRadius:18,padding:"24px 20px",textAlign:"center",
        transition:"border-color .3s",
        boxShadow:phase==="revealing"?`0 0 40px ${GOLD}30`:"none",
      }}>
        <div style={{fontSize:28,marginBottom:12}}>👤</div>
        <div style={{
          fontSize:22,fontWeight:900,
          color:phase==="revealing"?GOLD:"rgba(255,255,255,.9)",
          minHeight:32,lineHeight:1.2,
          animation:phase==="shuffling"?"nameFlash .24s ease-in-out infinite":
                    phase==="revealing"?"revealPop .4s ease-out forwards":"none",
          transition:"color .3s",
        }}>{current}</div>
        {phase==="revealing"&&(
          <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:8}}>
            Your opponent is ready
          </div>
        )}
      </div>

      {/* Progress dots */}
      <div style={{display:"flex",gap:8}}>
        {Array(5).fill(0).map((_,i)=>(
          <div key={i} style={{
            width:8,height:8,borderRadius:"50%",
            background:phase==="revealing"?GOLD:"rgba(255,255,255,.2)",
            animation:phase==="shuffling"?`pulse ${0.6+i*.1}s ease-in-out ${i*.12}s infinite`:"none",
            transition:"background .3s",
          }}/>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOURNAMENT NAME SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function TournamentNameScreen({tournament, onStart, onBack}){
  const[n,setN]=useState("");
  return(
    <div style={{minHeight:"100dvh",background:TABLE_BG,fontFamily:F,display:"flex",flexDirection:"column"}}>
      <BackHeader onBack={onBack} title={`${tournament?.name||""} TOURNAMENT`} subtitle={tournament?.flag}/>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        flex:1,gap:16,padding:24}}>
        <div style={{textAlign:"center",marginBottom:4}}>
          <div style={{fontSize:12,color:"rgba(255,255,255,.35)"}}>Enter your name to begin</div>
        </div>
        <input value={n} onChange={e=>setN(e.target.value)} maxLength={12}
          placeholder="Your name…" autoFocus
          style={{width:"100%",maxWidth:280,padding:"14px 16px",borderRadius:12,
            border:`2px solid ${n.trim()?P1C+"80":"rgba(255,255,255,.1)"}`,
            background:"rgba(255,255,255,.07)",color:"#fff",
            fontSize:15,fontWeight:700,fontFamily:F,outline:"none"}}/>
        <button onClick={()=>{if(!n.trim())return;onStart(n.trim());}}
          style={{width:"100%",maxWidth:280,padding:"15px",borderRadius:12,border:"none",
            cursor:n.trim()?"pointer":"not-allowed",fontFamily:F,
            background:n.trim()?GOLDBTN:"rgba(255,255,255,.08)",
            color:n.trim()?"#3c2200":"rgba(255,255,255,.25)",
            fontWeight:900,fontSize:14}}>
          ENTER TOURNAMENT →
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function App(){
  const[screen,setScreen]=useState("splash");
  const[savedGame,setSavedGame]=useState(null);
  const[vsAI,setVsAI]=useState(false);
  const[playerNames,setPlayerNames]=useState(["Player 1","Player 2"]);
  const[bets,setBets]=useState([0,0]);
  const[aiDifficulty,setAiDifficulty]=useState("medium");
  const[onlineSession,setOnlineSession]=useState(null); // {roomId,playerIndex,playerName,initialState}

  // Tournament state
  const[tournament,setTournament]=useState(null);   // selected tournament object
  const[tournWins,setTournWins]=useState(0);
  const[tournLosses,setTournLosses]=useState(0);
  const isTournament=!!tournament;

  // Coins
  const initCoins=()=>{
    try{const c=JSON.parse(localStorage.getItem("qCoins"));if(c&&Array.isArray(c)&&c.length===2)return c;}catch(e){}
    return[1000,1000];
  };
  const[coins,setCoins]=useState(initCoins);
  const saveCoins=c=>{setCoins(c);try{localStorage.setItem("qCoins",JSON.stringify(c));}catch(e){}};

  const handleGameEnd=(winner)=>{
    // Normal betting
    if(!isTournament&&bets&&bets[0]+bets[1]>0){
      const pot=bets[0]+bets[1];
      const nc=[...coins];
      nc[winner]+=pot;
      saveCoins(nc);
      return;
    }
    // Tournament
    if(isTournament){
      const isPlayerWin=winner===0;
      const newWins=tournWins+(isPlayerWin?1:0);
      const newLosses=tournLosses+(isPlayerWin?0:1);
      setTournWins(newWins);
      setTournLosses(newLosses);

      if(newWins>=2||newLosses>=2){
        // Tournament over
        if(newWins>=2){
          // Player wins — award prize
          const nc=[coins[0]+tournament.prize, coins[1]];
          saveCoins(nc);
        }
        setScreen("tournresult");
      }
      // else continue to next game automatically (handled in game screen via onBack returning to tournament flow)
    }
  };

  const[settings,setSettings]=useState({
    soundFx:true,music:true,haptics:true,
    showHints:true,animatePawns:true,highContrast:false,
  });
  const upd=(k,v)=>setSettings(p=>({...p,[k]:v}));

  const[tournOpponent,setTournOpponent]=useState("");

  const startTournamentGame=()=>{
    setSavedGame(null);
    setScreen("tournshuffle");
  };

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');
        *{box-sizing:border-box}body{margin:0;overflow:hidden}
      `}</style>

      {screen==="splash"      &&<SplashScreen onDone={()=>setScreen("menu")}/>}

      {screen==="menu"        &&<MenuScreen hasSave={!!savedGame}
          onNew={()=>setScreen("modepick")}
          onContinue={()=>setScreen("game")}
          onHowTo={()=>setScreen("howto")}
          onSettings={()=>setScreen("settings")}/>}

      {screen==="modepick"    &&<ModePickerScreen
          onBack={()=>setScreen("menu")}
          onSelect={mode=>{
            if(mode==="tournament"){setTournament(null);setScreen("tournselect");return;}
            if(mode==="online"){setScreen("online");return;}
            setTournament(null);
            setVsAI(mode==="ai");
            setAiDifficulty("medium");
            setSavedGame(null);
            setScreen("namepick");
          }}/>}

      {screen==="online"      &&<OnlineLobbyScreen
          onBack={()=>setScreen("modepick")}
          coins={coins}
          onStartGame={session=>{
            // Deduct bet from coins when game starts
            if(session.bet>0){
              const nc=[...coins];
              nc[session.playerIndex]-=session.bet;
              saveCoins(nc);
            }
            setOnlineSession(session);
            setScreen("onlinegame");
          }}/>}

      {screen==="onlinegame"  &&onlineSession&&<OnlineGameScreen
          roomId={onlineSession.roomId}
          playerIndex={onlineSession.playerIndex}
          playerName={onlineSession.playerName}
          initialState={onlineSession.initialState}
          bet={onlineSession.bet||0}
          onCoinsUpdate={amount=>{
            const nc=[...coins];
            nc[onlineSession.playerIndex]+=amount;
            saveCoins(nc);
          }}
          onBack={()=>{setOnlineSession(null);setScreen("menu");}}/>}

      {screen==="tournselect" &&<TournamentScreen
          coins={coins}
          onBack={()=>setScreen("modepick")}
          onSelect={t=>{
            setTournament(t);
            setTournWins(0);
            setTournLosses(0);
            setVsAI(true);
            setAiDifficulty(t.difficulty);
            // Deduct entry fee
            const nc=[coins[0]-t.entry, coins[1]];
            saveCoins(nc);
            setPlayerNames(["You","AI"]);
            setBets([0,0]);
            setScreen("tournname");
          }}/>}

      {screen==="tournname"   &&<TournamentNameScreen
          tournament={tournament}
          onBack={()=>setScreen("tournselect")}
          onStart={name=>{
            setPlayerNames([name,""]);
            setSavedGame(null);
            setScreen("tournshuffle");
          }}/>}

      {screen==="tournshuffle" &&<OpponentShuffleScreen
          onDone={opponent=>{
            setTournOpponent(opponent);
            setPlayerNames(prev=>[prev[0],opponent]);
            setScreen("game");
          }}/>}

      {screen==="namepick"    &&<PlayerNameScreen
          vsAI={vsAI}
          onBack={()=>setScreen("modepick")}
          onStart={(n1,n2)=>{setPlayerNames([n1,n2]);setScreen("bet");}}/>}

      {screen==="bet"         &&<BettingScreen
          names={playerNames}
          coins={coins}
          vsAI={vsAI}
          onBack={()=>setScreen("namepick")}
          onStart={(b1,b2)=>{
            if(b1+b2>0){const nc=[coins[0]-b1,coins[1]-b2];saveCoins(nc);}
            setBets([b1,b2]);
            setSavedGame(null);
            setScreen("game");
          }}/>}

      {screen==="game"        &&<GameScreen initialState={savedGame}
          onBack={()=>isTournament?setScreen("tournselect"):setScreen("menu")}
          onSave={s=>setSavedGame(s)}
          settings={settings}
          vsAI={vsAI}
          names={playerNames}
          bets={bets}
          onGameEnd={handleGameEnd}
          aiDifficulty={aiDifficulty}
          tournament={tournament}
          tournWins={tournWins}
          tournLosses={tournLosses}
          onNextTournamentGame={startTournamentGame}/>}

      {screen==="tournresult" &&<TournamentResultScreen
          tournament={tournament}
          playerName={playerNames[0]}
          wins={tournWins}
          losses={tournLosses}
          onPlayAgain={()=>{
            // Re-enter same tournament (pay entry again)
            const nc=[coins[0]-tournament.entry, coins[1]];
            saveCoins(nc);
            setTournWins(0);
            setTournLosses(0);
            startTournamentGame();
          }}
          onMenu={()=>{setTournament(null);setScreen("menu");}}/>}

      {screen==="howto"       &&<HowToPlayScreen onBack={()=>setScreen("menu")}/>}
      {screen==="settings"    &&<SettingsScreen onBack={()=>setScreen("menu")} settings={settings} onChange={upd}/>}
    </>
  );
}
