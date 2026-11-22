const socket = io();
const $ = id => document.getElementById(id);
const lobby = $("lobby"), game = $("game"), canvas = $("gameCanvas"), ctx = canvas.getContext("2d");
let myId = null, roomCode = "", state = null, keys = {}, lastSent = 0;
const TILE=40, W=800, H=520;
const roomNames=["Forgotten Entrance","The Crypt","Treasure Chamber"];
const walls=[];
function showError(msg){$("lobbyError").textContent=msg||""}
function enterRoom(result){
  if(!result.ok){showError(result.error);return}
  myId=result.playerId;roomCode=result.code;
  $("codeLabel").textContent=roomCode;$("roomLabel").textContent="1 / 3";
  lobby.classList.add("hidden");game.classList.remove("hidden");showError("");
}
$("createBtn").onclick=()=>socket.emit("createRoom",{name:$("playerName").value.trim()||"Hero"},enterRoom);
$("joinBtn").onclick=()=>socket.emit("joinRoom",{name:$("playerName").value.trim()||"Hero",code:$("roomCode").value},enterRoom);
$("copyBtn").onclick=()=>navigator.clipboard?.writeText(roomCode).then(()=>$("copyBtn").textContent="COPIED");
$("againBtn").onclick=()=>location.reload();
socket.on("state",s=>{state=s;updateHud();checkOverlay()});
socket.on("notice",msg=>$("status").textContent=msg);
socket.on("connect_error",()=>$("status").textContent="Connection problem. Refresh and try again.");

function updateHud(){
 if(!state)return;
 $("roomLabel").textContent=`${state.stage+1} / 3 — ${roomNames[state.stage]}`;
 const ps=state.players;
 $("healthLabel").textContent=ps.map(p=>`${p.name}: ${"❤️".repeat(p.hp)}${"🖤".repeat(3-p.hp)}${p.alive?"":" OUT"}`).join("　");
 $("enemyLabel").textContent=`${state.enemyCount} remaining`;
 $("keyLabel").textContent=state.key?"🗝️ Carried":"🔒 Not found";
}
function checkOverlay(){
 if(!state)return;
 if(state.finished){$("overlayTitle").textContent="DUNGEON CLEARED!";$("overlayText").textContent="The team made it out. Excellent teamwork!";$("overlay").classList.remove("hidden")}
 else if(state.gameOver){$("overlayTitle").textContent="TEAM DEFEATED";$("overlayText").textContent="Every hero has fallen. The dungeon wins this time."; $("overlay").classList.remove("hidden")}
 else $("overlay").classList.add("hidden");
}
window.addEventListener("keydown",e=>{
 const k=e.key.toLowerCase();
 if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k))e.preventDefault();
 if(k===" "){if(!e.repeat)socket.emit("attack");return}
 if(k==="w"||k==="arrowup")keys.up=true;
 if(k==="s"||k==="arrowdown")keys.down=true;
 if(k==="a"||k==="arrowleft")keys.left=true;
 if(k==="d"||k==="arrowright")keys.right=true;
});
window.addEventListener("keyup",e=>{
 const k=e.key.toLowerCase();
 if(k==="w"||k==="arrowup")keys.up=false;
 if(k==="s"||k==="arrowdown")keys.down=false;
 if(k==="a"||k==="arrowleft")keys.left=false;
 if(k==="d"||k==="arrowright")keys.right=false;
});
window.addEventListener("blur",()=>keys={});
setInterval(()=>{
 if(!myId||!state)return;
 const me=state.players.find(p=>p.id===myId);if(!me||!me.alive)return;
 const facing=keys.left?"left":keys.right?"right":keys.up?"up":keys.down?"down":me.facing;
 socket.emit("input",{...keys,facing});
},50);

function draw(){
 ctx.clearRect(0,0,W,H);
 // pixel-stone floor
 for(let y=0;y<H;y+=40)for(let x=0;x<W;x+=40){
   ctx.fillStyle=((x/40+y/40)%2)?"#292d36":"#252a33";ctx.fillRect(x,y,40,40);
   ctx.strokeStyle="#343943";ctx.strokeRect(x+.5,y+.5,39,39);
   ctx.fillStyle="#414651";ctx.fillRect(x+5,y+6,3,3);
 }
 // outer stone border
 ctx.fillStyle="#55515a";ctx.fillRect(0,0,W,18);ctx.fillRect(0,H-18,W,18);ctx.fillRect(0,0,18,H);ctx.fillRect(W-18,0,18,H);
 ctx.fillStyle="#1b2029";ctx.fillRect(18,18,W-36,H-36);
 for(let y=40;y<H-25;y+=40)for(let x=40;x<W-25;x+=40){ctx.fillStyle="#292d36";ctx.fillRect(x,y,38,38);ctx.strokeStyle="#3a404b";ctx.strokeRect(x,y,38,38)}
 // exit arch
 const open=!!(state&&state.doorOpen);
 ctx.fillStyle=open?"#b8923c":"#65533c";ctx.fillRect(714,207,54,106);ctx.fillStyle=open?"#2a2418":"#171b22";ctx.fillRect(724,218,34,84);
 if(open){ctx.save();ctx.shadowColor="#ffca54";ctx.shadowBlur=24;ctx.fillStyle="#f3c969";ctx.fillRect(724,218,34,4);ctx.fillRect(724,298,34,4);ctx.restore();ctx.fillStyle="#fff2bd";ctx.font="bold 12px sans-serif";ctx.textAlign="center";ctx.fillText("GO",741,262)}
 else{ctx.fillStyle="#687184";ctx.fillRect(738,255,5,5)}
 // torches
 [90,400,690].forEach(x=>{ctx.fillStyle="#70513a";ctx.fillRect(x,34,7,22);ctx.fillStyle="#ffb84f";ctx.fillRect(x-3,27,13,12);ctx.fillStyle="#ffe6a1";ctx.fillRect(x,25,5,6)});
 if(state){
   if(state.stage===1&&!state.key&&state.enemyCount===0){
     ctx.fillStyle="#f3c969";ctx.shadowColor="#ffca54";ctx.shadowBlur=22;ctx.fillRect(642,252,16,16);ctx.shadowBlur=0;
     ctx.fillStyle="#fff2bd";ctx.font="12px sans-serif";ctx.fillText("KEY",635,240);
   }
   state.enemies.filter(e=>e.alive).forEach(drawEnemy);
   state.players.forEach(drawPlayer);
   if(state.stage===1&&!state.key&&state.enemyCount===0){ctx.fillStyle="#e7d59c";ctx.font="13px sans-serif";ctx.fillText("Find the glowing key!",570,292)}
 }
 requestAnimationFrame(draw);
}
function drawPlayer(p){
 const x=p.x,y=p.y;ctx.fillStyle="#0008";ctx.fillRect(x-12,y+12,24,6);
 ctx.fillStyle=p.id===myId?"#54c8d7":"#e5b65a";ctx.fillRect(x-10,y-14,20,25);
 ctx.fillStyle="#f0c79b";ctx.fillRect(x-8,y-23,16,13);
 ctx.fillStyle="#29202a";ctx.fillRect(x-7,y-19,4,3);ctx.fillRect(x+3,y-19,4,3);
 ctx.fillStyle="#e8e2d4";ctx.fillRect(x-13,y+7,10,7);ctx.fillRect(x+3,y+7,10,7);
 ctx.fillStyle="#fff";ctx.font="11px sans-serif";ctx.textAlign="center";ctx.fillText(p.name+(p.id===myId?" (YOU)":""),x,y-30);
 if(Date.now()<p.attackUntil){ctx.strokeStyle="#fff1a6";ctx.lineWidth=5;ctx.beginPath();ctx.arc(x,y,37,-.8,.8);ctx.stroke()}
 if(!p.alive){ctx.fillStyle="#f66";ctx.font="bold 12px sans-serif";ctx.fillText("OUT",x,y-38)}
}
function drawEnemy(e){
 const x=e.x,y=e.y;ctx.fillStyle="#0008";ctx.fillRect(x-14,y+12,28,6);
 ctx.fillStyle="#8c4e68";ctx.fillRect(x-14,y-13,28,26);ctx.fillStyle="#c77b8c";ctx.fillRect(x-10,y-19,20,12);
 ctx.fillStyle="#ffe58a";ctx.fillRect(x-7,y-15,4,4);ctx.fillRect(x+4,y-15,4,4);
 ctx.fillStyle="#31212b";ctx.fillRect(x-10,y+10,7,7);ctx.fillRect(x+4,y+10,7,7);
 ctx.fillStyle="#181b22";ctx.fillRect(x-15,y-27,30,4);ctx.fillStyle="#e66c75";ctx.fillRect(x-15,y-27,30*(e.hp/e.maxHp),4);
}
requestAnimationFrame(draw);
