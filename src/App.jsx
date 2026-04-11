import { useState, useRef, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const F = "'Plus Jakarta Sans', sans-serif";
const GOLD = "#FFD060", GOLDD = "#C87800";
const GOLDBTN = `linear-gradient(135deg,${GOLD},${GOLDD})`;
const TABLE_BG = `repeating-linear-gradient(92deg,transparent,transparent 8px,rgba(0,0,0,.06) 8px,rgba(0,0,0,.06) 9px),linear-gradient(155deg,#3B1E0E 0%,#1E0A04 35%,#2E1408 60%,#180804 100%)`;

const BS=9, WG=8, CS=44, GP=5, PAD=14, UN=CS+GP;
const BP = BS*CS + (BS-1)*GP + PAD*2; // 464px

const cx = c => PAD + c*UN;
const cy = r => PAD + r*UN;
const GOALS = [0,8];

const P1C="#0097A7", P1L="#80DEEA", P1D="#005F6A";
const P2C="#E91E63", P2L="#F48FB1", P2D="#880E4F";
const PC=[P1C,P2C], PL=[P1L,P2L], PD=[P1D,P2D], PN=["TEAL","PINK"];
const WALLT="#C8860A", WALLM="#A86808", WALLB="#7A4C08", WALLHI="#FFD060";

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
      {key:"music",label:"Background Music",desc:"Ambient music during game"},
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
    <div style={{minHeight:"100dvh",background:TABLE_BG,fontFamily:F,
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:24,padding:24}}>
      <div style={{textAlign:"center",opacity:vis?1:0,transition:"opacity .4s"}}>
        <div style={{fontSize:26,fontWeight:900,color:GOLD,marginBottom:6}}>NEW GAME</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,.35)"}}>Choose your game mode</div>
      </div>
      <div style={{
        display:"flex",flexDirection:"column",gap:12,width:"100%",maxWidth:300,
        opacity:vis?1:0,transform:vis?"translateY(0)":"translateY(16px)",transition:"all .45s ease .1s",
      }}>
        {[
          {label:"2 Players",sub:"Pass & play with a friend",icon:"👥",mode:"2p"},
          {label:"vs AI",sub:"Play against the computer",icon:"🤖",mode:"ai"},
          {label:"Tournament",sub:"Compete for glory & coins",icon:"🏆",mode:"tournament",gold:true},
        ].map(({label,sub,icon,mode,gold})=>(
          <button key={mode} onClick={()=>onSelect(mode)}
            style={{
              display:"flex",alignItems:"center",gap:16,
              padding:"18px 20px",borderRadius:16,
              border:`1px solid ${gold?GOLD+"88":"rgba(255,255,255,.1)"}`,
              background:gold?GOLDBTN:"rgba(255,255,255,.07)",
              cursor:"pointer",fontFamily:F,transition:"transform .12s",
              boxShadow:gold?`0 6px 26px ${GOLD}55`:"none",
            }}
            onMouseEnter={e=>e.currentTarget.style.transform="scale(1.02)"}
            onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
            <span style={{fontSize:28}}>{icon}</span>
            <div style={{textAlign:"left"}}>
              <div style={{fontWeight:800,fontSize:15,color:gold?"#3c2200":"rgba(255,255,255,.9)"}}>{label}</div>
              <div style={{fontSize:11,color:gold?"rgba(60,34,0,.55)":"rgba(255,255,255,.4)",marginTop:2}}>{sub}</div>
            </div>
            <span style={{marginLeft:"auto",color:gold?"rgba(60,34,0,.4)":"rgba(255,255,255,.2)",fontSize:18}}>›</span>
          </button>
        ))}
      </div>
      <button onClick={onBack}
        style={{fontSize:12,color:"rgba(255,255,255,.25)",background:"none",border:"none",
          cursor:"pointer",fontFamily:F,fontWeight:600,marginTop:8}}>
        ‹ Back
      </button>
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
    <div style={{minHeight:"100dvh",background:TABLE_BG,fontFamily:F,
      display:"flex",flexDirection:"column",alignItems:"center",
      overflowY:"auto",padding:"28px 20px 40px"}}>

      <div style={{textAlign:"center",marginBottom:24,
        opacity:vis?1:0,transform:vis?"translateY(0)":"translateY(-12px)",transition:"all .45s"}}>
        <div style={{fontSize:32,marginBottom:6}}>🏆</div>
        <div style={{fontSize:24,fontWeight:900,color:GOLD,letterSpacing:"-.02em"}}>TOURNAMENT</div>
        <div style={{fontSize:12,color:"rgba(255,255,255,.35)",marginTop:4}}>Choose your championship</div>
        <div style={{fontSize:11,color:GOLD+"88",marginTop:6}}>
          💰 Your coins: {coins[0].toLocaleString()} 🪙
        </div>
      </div>

      <div style={{
        display:"flex",flexDirection:"column",gap:14,width:"100%",maxWidth:340,
        opacity:vis?1:0,transform:vis?"translateY(0)":"translateY(14px)",
        transition:"all .5s ease .1s",
      }}>
        {TOURNAMENTS.map((t,i)=>{
          const canAfford=coins[0]>=t.entry;
          return(
            <div key={t.id} style={{
              borderRadius:18,overflow:"hidden",
              border:`2px solid ${t.color}55`,
              opacity:canAfford?1:.55,
              boxShadow:canAfford?`0 8px 32px ${t.color}25`:"none",
              transition:"all .15s",
            }}>
              {/* Header banner */}
              <div style={{
                background:`linear-gradient(135deg,${t.dark},${t.color})`,
                padding:"16px 18px",
                display:"flex",alignItems:"center",gap:14,
              }}>
                <div style={{fontSize:36,lineHeight:1}}>{t.flag}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:18,fontWeight:900,color:"#fff",letterSpacing:".04em"}}>{t.name}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,.6)",marginTop:2}}>
                    {t.difficulty.toUpperCase()} AI · BEST OF {t.games}
                  </div>
                </div>
                <div style={{
                  background:"rgba(0,0,0,.25)",borderRadius:8,
                  padding:"6px 10px",textAlign:"center",
                }}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,.6)",fontWeight:700}}>PRIZE</div>
                  <div style={{fontSize:15,fontWeight:900,color:"#FFD060"}}>
                    {t.prize.toLocaleString()} 🪙
                  </div>
                </div>
              </div>

              {/* Body */}
              <div style={{background:"rgba(255,255,255,.05)",padding:"14px 18px"}}>
                <div style={{fontSize:11,color:"rgba(255,255,255,.45)",marginBottom:12,lineHeight:1.6}}>
                  {t.desc}
                </div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.4)"}}>
                    Entry: <span style={{color:canAfford?GOLD:"#ff6060",fontWeight:700}}>
                      {t.entry.toLocaleString()} 🪙
                    </span>
                    {!canAfford&&<span style={{color:"#ff6060",fontSize:9,marginLeft:6}}>Not enough coins</span>}
                  </div>
                  <button onClick={()=>canAfford&&onSelect(t)} style={{
                    padding:"9px 20px",borderRadius:10,border:"none",
                    cursor:canAfford?"pointer":"not-allowed",fontFamily:F,
                    background:canAfford?`linear-gradient(135deg,${t.dark},${t.color})`:"rgba(255,255,255,.08)",
                    color:canAfford?"#fff":"rgba(255,255,255,.25)",
                    fontWeight:800,fontSize:12,letterSpacing:".04em",
                    boxShadow:canAfford?`0 4px 14px ${t.color}40`:"none",
                    transition:"all .15s",
                  }}>ENTER →</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={onBack} style={{marginTop:20,fontSize:12,color:"rgba(255,255,255,.25)",
        background:"none",border:"none",cursor:"pointer",fontFamily:F,fontWeight:600}}>
        ‹ Back
      </button>
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
  const[vis,setVis]=useState(false);
  const[n1,setN1]=useState("");
  const[n2,setN2]=useState("");
  useEffect(()=>{setTimeout(()=>setVis(true),60);},[]);

  const canStart = n1.trim().length>0 && (vsAI || n2.trim().length>0);

  return(
    <div style={{minHeight:"100dvh",background:TABLE_BG,fontFamily:F,
      display:"flex",flexDirection:"column",alignItems:"center",
      justifyContent:"center",gap:24,padding:24}}>

      <div style={{textAlign:"center",
        opacity:vis?1:0,transform:vis?"translateY(0)":"translateY(-12px)",transition:"all .4s"}}>
        <div style={{fontSize:26,fontWeight:900,color:GOLD,marginBottom:6}}>
          {vsAI?"Your Name":"Player Names"}
        </div>
        <div style={{fontSize:13,color:"rgba(255,255,255,.35)"}}>
          {vsAI?"What should we call you?":"Enter both player names to begin"}
        </div>
      </div>

      <div style={{
        display:"flex",flexDirection:"column",gap:14,
        width:"100%",maxWidth:300,
        opacity:vis?1:0,transform:vis?"translateY(0)":"translateY(14px)",
        transition:"all .45s ease .1s",
      }}>
        {/* P1 input */}
        <div>
          <div style={{fontSize:10,fontWeight:800,color:P1C,
            letterSpacing:".1em",marginBottom:6}}>
            {vsAI?"YOUR NAME":"PLAYER 1 · TEAL"}
          </div>
          <input
            value={n1}
            onChange={e=>setN1(e.target.value)}
            maxLength={12}
            placeholder={vsAI?"Enter your name…":"e.g. Alex"}
            autoFocus
            style={{
              width:"100%",padding:"14px 16px",borderRadius:12,
              border:`2px solid ${n1.trim()?P1C+"80":"rgba(255,255,255,.1)"}`,
              background:"rgba(255,255,255,.07)",
              color:"#fff",fontSize:15,fontWeight:700,fontFamily:F,
              outline:"none",transition:"border-color .2s",
            }}
          />
        </div>

        {/* P2 input — only for 2P mode */}
        {!vsAI&&(
          <div>
            <div style={{fontSize:10,fontWeight:800,color:P2C,
              letterSpacing:".1em",marginBottom:6}}>
              PLAYER 2 · PINK
            </div>
            <input
              value={n2}
              onChange={e=>setN2(e.target.value)}
              maxLength={12}
              placeholder="e.g. Jordan"
              style={{
                width:"100%",padding:"14px 16px",borderRadius:12,
                border:`2px solid ${n2.trim()?P2C+"80":"rgba(255,255,255,.1)"}`,
                background:"rgba(255,255,255,.07)",
                color:"#fff",fontSize:15,fontWeight:700,fontFamily:F,
                outline:"none",transition:"border-color .2s",
              }}
            />
          </div>
        )}

        {/* AI label preview */}
        {vsAI&&(
          <div style={{
            display:"flex",alignItems:"center",gap:12,
            padding:"14px 16px",borderRadius:12,
            background:"rgba(255,255,255,.04)",
            border:"1px solid rgba(255,255,255,.07)",
          }}>
            <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,
              background:`radial-gradient(circle at 35% 28%,${P2L},${P2C} 50%,${P2D})`}}/>
            <div>
              <div style={{fontSize:12,fontWeight:800,color:"rgba(255,255,255,.5)"}}>OPPONENT</div>
              <div style={{fontSize:14,fontWeight:900,color:P2C}}>🤖 AI</div>
            </div>
          </div>
        )}

        {/* Start button */}
        <button
          onClick={()=>{
            if(!canStart) return;
            onStart(
              n1.trim()||"Player 1",
              vsAI?"AI":(n2.trim()||"Player 2")
            );
          }}
          style={{
            marginTop:4,padding:"16px",borderRadius:14,border:"none",
            cursor:canStart?"pointer":"not-allowed",fontFamily:F,
            background:canStart?GOLDBTN:"rgba(255,255,255,.1)",
            color:canStart?"#3c2200":"rgba(255,255,255,.25)",
            fontWeight:900,fontSize:15,letterSpacing:".04em",
            boxShadow:canStart?`0 6px 26px ${GOLD}45`:"none",
            transition:"all .15s",
          }}>
          LET'S PLAY →
        </button>
      </div>

      <button onClick={onBack}
        style={{fontSize:12,color:"rgba(255,255,255,.25)",background:"none",
          border:"none",cursor:"pointer",fontFamily:F,fontWeight:600}}>
        ‹ Back
      </button>
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
    <div style={{minHeight:"100dvh",background:TABLE_BG,fontFamily:F,
      display:"flex",flexDirection:"column",alignItems:"center",
      justifyContent:"center",gap:20,padding:24}}>

      <div style={{textAlign:"center",opacity:vis?1:0,transition:"opacity .4s"}}>
        <div style={{fontSize:32,marginBottom:6}}>🪙</div>
        <div style={{fontSize:24,fontWeight:900,color:GOLD,marginBottom:4}}>PLACE YOUR BETS</div>
        <div style={{fontSize:12,color:"rgba(255,255,255,.35)"}}>Winner takes the pot</div>
      </div>

      <div style={{
        width:"100%",maxWidth:320,display:"flex",flexDirection:"column",gap:12,
        opacity:vis?1:0,transform:vis?"translateY(0)":"translateY(14px)",
        transition:"all .45s ease .1s",
      }}>
        <BetInput pi={0} val={bet1} setVal={setBet1} max={c1} color={P1C}/>
        {!vsAI&&<BetInput pi={1} val={bet2} setVal={setBet2} max={c2} color={P2C}/>}

        {/* Pot preview */}
        <div style={{
          textAlign:"center",padding:"12px",borderRadius:12,
          background:"rgba(255,208,96,.08)",border:"1px solid rgba(255,208,96,.2)",
        }}>
          <div style={{fontSize:11,color:"rgba(255,208,96,.5)",fontWeight:700,marginBottom:2}}>TOTAL POT</div>
          <div style={{fontSize:24,fontWeight:900,color:GOLD}}>
            {(vsAI?bet1*2:bet1+bet2).toLocaleString()} 🪙
          </div>
          {vsAI&&<div style={{fontSize:10,color:"rgba(255,255,255,.3)",marginTop:2}}>AI matches your bet</div>}
        </div>

        <button onClick={()=>canBet&&onStart(bet1,vsAI?bet1:bet2)} style={{
          padding:"16px",borderRadius:14,border:"none",cursor:canBet?"pointer":"not-allowed",
          background:canBet?GOLDBTN:"rgba(255,255,255,.08)",
          color:canBet?"#3c2200":"rgba(255,255,255,.25)",
          fontWeight:900,fontSize:15,fontFamily:F,
          boxShadow:canBet?`0 6px 24px ${GOLD}45`:"none",
          transition:"all .15s",
        }}>🎲 START GAME</button>

        <button onClick={()=>onStart(0,0)} style={{
          padding:"10px",borderRadius:10,border:"none",cursor:"pointer",
          background:"transparent",color:"rgba(255,255,255,.2)",
          fontSize:11,fontWeight:600,fontFamily:F,
        }}>Skip betting — play for free</button>
      </div>

      <button onClick={onBack} style={{fontSize:12,color:"rgba(255,255,255,.2)",
        background:"none",border:"none",cursor:"pointer",fontFamily:F,fontWeight:600}}>
        ‹ Back
      </button>
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

  // Timer — reset on turn change, counts down, forfeits turn at 0
  useEffect(()=>{
    if(g.winner) return;
    if(vsAI&&g.turn===1) return; // AI handles its own turn
    setTimeLeft(30);
    clearInterval(timerRef.current);
    timerRef.current=setInterval(()=>{
      setTimeLeft(prev=>{
        if(prev<=1){
          clearInterval(timerRef.current);
          // Forfeit turn — just switch to next player
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
          setG(prev=>{
            const np=prev.players.map((p,i)=>i===1?{...p,row:move.row,col:move.col}:p);
            const won=move.row===GOALS[1]?1:null;
            return{...prev,players:np,turn:won!=null?1:0,winner:won};
          });
        } else {
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

  if(isPortrait){
    return(
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
    );
  }

  // ── Layout math ───────────────────────────────────────────────────────────
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
    clearInterval(timerRef.current);
    setG(prev=>{
      const np=prev.players.map((p,i)=>i===prev.turn?{...p,row:r,col:c}:p);
      const won=r===GOALS[prev.turn]?prev.turn:null;
      return{...prev,players:np,turn:won!=null?prev.turn:1-prev.turn,winner:won};
    });
  };
  const doWall=(wr,wc,ori)=>{
    if(aiThinking||wasDrag.current||g.winner||g.mode!=="wall"||!g.players[g.turn].walls)return;
    if(!canPlace(wr,wc,ori,g.hW,g.vW,g.players))return;
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
          <div style={{width:36,height:36,borderRadius:"50%",flexShrink:0,
            background:`radial-gradient(circle at 35% 28%,${light},${base} 50%,${dark} 90%)`,
            boxShadow:isActive?`0 0 16px ${base}90,0 0 32px ${base}28`:`0 3px 8px rgba(0,0,0,.6)`,
            transition:"box-shadow .3s"}}/>
          <div style={{textAlign:"center",lineHeight:1.2}}>
            <div style={{fontSize:11,fontWeight:900,color:isActive?base:"rgba(255,255,255,.3)"}}>
              {names?.[pi]||PN[pi]}
            </div>
            <div style={{fontSize:9,fontWeight:700,color:isActive?base:"rgba(255,255,255,.2)"}}>
              {vsAI&&pi===1?"AI":PN[pi]}
            </div>
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
                  flex:1, width:"100%", borderRadius:12, border:"none",
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
          <div style={{
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
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOURNAMENT NAME SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function TournamentNameScreen({tournament, onStart, onBack}){
  const[n,setN]=useState("");
  const[vis,setVis]=useState(false);
  useEffect(()=>{setTimeout(()=>setVis(true),60);},[]);
  return(
    <div style={{minHeight:"100dvh",background:TABLE_BG,fontFamily:F,
      display:"flex",flexDirection:"column",alignItems:"center",
      justifyContent:"center",gap:20,padding:24,
      opacity:vis?1:0,transition:"opacity .4s"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:40}}>{tournament?.flag}</div>
        <div style={{fontSize:22,fontWeight:900,color:GOLD,marginBottom:4}}>
          {tournament?.name} TOURNAMENT
        </div>
        <div style={{fontSize:12,color:"rgba(255,255,255,.35)"}}>Enter your name to begin</div>
      </div>
      <input value={n} onChange={e=>setN(e.target.value)} maxLength={12}
        placeholder="Your name…" autoFocus
        style={{width:"100%",maxWidth:280,padding:"14px 16px",borderRadius:12,
          border:`2px solid ${n.trim()?P1C+"80":"rgba(255,255,255,.1)"}`,
          background:"rgba(255,255,255,.07)",color:"#fff",
          fontSize:15,fontWeight:700,fontFamily:F,outline:"none"}}/>
      <button onClick={()=>{if(!n.trim())return; onStart(n.trim());}}
        style={{width:"100%",maxWidth:280,padding:"15px",borderRadius:12,border:"none",
          cursor:n.trim()?"pointer":"not-allowed",fontFamily:F,
          background:n.trim()?GOLDBTN:"rgba(255,255,255,.08)",
          color:n.trim()?"#3c2200":"rgba(255,255,255,.25)",
          fontWeight:900,fontSize:14}}>
        ENTER TOURNAMENT →
      </button>
      <button onClick={onBack}
        style={{fontSize:12,color:"rgba(255,255,255,.25)",background:"none",
          border:"none",cursor:"pointer",fontFamily:F}}>‹ Back</button>
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
    soundFx:true,music:false,haptics:true,
    showHints:true,animatePawns:true,highContrast:false,
  });
  const upd=(k,v)=>setSettings(p=>({...p,[k]:v}));

  const startTournamentGame=()=>{
    setSavedGame(null);
    setScreen("game");
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
            setTournament(null);
            setVsAI(mode==="ai");
            setAiDifficulty("medium");
            setSavedGame(null);
            setScreen("namepick");
          }}/>}

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
            setPlayerNames([name,"AI"]);
            setSavedGame(null);
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
