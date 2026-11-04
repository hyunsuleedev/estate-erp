(() => {
 const $=id=>document.getElementById(id);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const pieces=[...document.querySelectorAll('.logo-piece')];
 let timer,hideTimer,hold=false,generation=0,finishing=false,motions=[];
 const rest='translate3d(0,0,0) rotateY(0deg) rotateZ(0deg)';
 function stopMotion(){motions.forEach(a=>a.cancel());motions=[];}
 function animateLogo(){
  stopMotion();if(reduced.matches)return;
  pieces.forEach((piece,i)=>{
   const sign=i===0?-1:1;
   const intro=piece.animate([
    {transform:`translate3d(${sign*15}px,${-sign*7}px,-14px) rotateY(${sign*32}deg) rotateZ(${sign*12}deg)`,opacity:0},
    {transform:rest,opacity:1},
   ],{duration:760,delay:i*70,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
   const idle=piece.animate([
    {transform:rest,offset:0},
    {transform:rest,offset:.12},
    {transform:`translate3d(${sign*4.5}px,${-sign*2}px,3px) rotateY(${sign*12}deg) rotateZ(${sign*5}deg)`,offset:.43},
    {transform:rest,offset:.78},
    {transform:rest,offset:1},
   ],{duration:2800,delay:1000,iterations:Infinity,easing:'cubic-bezier(.45,0,.3,1)'});
   motions.push(intro,idle);
  });
  if(document.hidden)motions.forEach(a=>a.pause());
 }
 function finish(){
  if(finishing||document.body.classList.contains('complete'))return;
  finishing=true;
  clearTimeout(timer);clearTimeout(hideTimer);
  const transforms=pieces.map(p=>getComputedStyle(p).transform);
  stopMotion();
  if(!reduced.matches)pieces.forEach((p,i)=>motions.push(p.animate([{transform:transforms[i]},{transform:rest}],{duration:180,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'})));
  $('splash').setAttribute('aria-busy','false');
  $('status').textContent='준비되었습니다.';
  $('finish').hidden=true;
  timer=setTimeout(()=>{
   document.body.classList.add('complete');
   $('login').inert=false;$('login').removeAttribute('aria-hidden');
   hideTimer=setTimeout(()=>{$('splash').setAttribute('aria-hidden','true');stopMotion();},reduced.matches?0:180);
  },reduced.matches?0:180);
 }
 function start(ready){
  const run=++generation;clearTimeout(timer);clearTimeout(hideTimer);finishing=false;
  if($('login').contains(document.activeElement))document.activeElement.blur();
  document.body.classList.remove('complete');
  $('splash').removeAttribute('aria-hidden');$('splash').setAttribute('aria-busy','true');
  $('login').inert=true;$('login').setAttribute('aria-hidden','true');
  $('status').textContent='에스테잇플로우를 시작하고 있습니다.';$('status').className='sr-only';
  $('finish').hidden=false;
  animateLogo();
  if(ready){Promise.resolve(ready).then(()=>{if(run===generation)finish();}).catch(()=>{if(run!==generation)return;$('status').textContent='시작하지 못했습니다. 다시 시도해주세요.';$('status').className='note';});}
  else if(!hold)timer=setTimeout(finish,10000);
 }
 $('replay').addEventListener('click',()=>start());
 $('finish').addEventListener('click',finish);
 $('hold').addEventListener('click',()=>{hold=!hold;$('hold').setAttribute('aria-pressed',String(hold));start();});
 $('loginForm').addEventListener('submit',e=>{e.preventDefault();$('formNote').textContent='로그인 화면 시안입니다. 입력 내용은 전송되지 않았습니다.';});
 document.addEventListener('visibilitychange',()=>{document.querySelector('.loader span').style.animationPlayState=document.hidden?'paused':'';motions.forEach(a=>{if(document.hidden)a.pause();else if(a.playState==='paused')a.play();});});
 reduced.addEventListener('change',()=>{if(reduced.matches)stopMotion();else if(!finishing&&!document.body.classList.contains('complete'))animateLogo();});
 window.splashPreview={start,finish};
 start();
})();
