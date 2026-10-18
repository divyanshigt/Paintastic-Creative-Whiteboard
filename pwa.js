'use strict';
(()=>{
  let installPrompt=null;
  const buttons=[...document.querySelectorAll('[data-install]')];
  const badge=document.querySelector('[data-offline-status]');
  const installed=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  function connection(){if(!badge)return;badge.hidden=navigator.onLine;badge.textContent='Offline · keep creating';}
  function showInstall(){buttons.forEach(b=>b.hidden=!installPrompt||installed());}
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;showInstall();});
  window.addEventListener('appinstalled',()=>{installPrompt=null;showInstall();});
  buttons.forEach(button=>button.addEventListener('click',async()=>{
    if(!installPrompt)return;
    const prompt=installPrompt;installPrompt=null;showInstall();
    try{await prompt.prompt();await prompt.userChoice;}catch{ /* Browser declined or dismissed the request. */ }
  }));
  window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();showInstall();
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
  window.addEventListener('load',async()=>{
    try{
      const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
      const notify=()=>{
        let notice=document.querySelector('.pwa-update');
        if(!notice){notice=document.createElement('div');notice.className='pwa-update';notice.setAttribute('role','status');notice.textContent='Update ready. Finish your drawing, then close all Paintastic tabs and reopen to update.';const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','Dismiss update notice');close.onclick=()=>notice.remove();notice.append(close);document.body.append(notice);}
      };
      if(registration.waiting)notify();
      registration.addEventListener('updatefound',()=>{
        const worker=registration.installing;if(!worker)return;
        worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)notify();});
      });
    }catch{
      // Online drawing remains usable when caching is blocked or storage is full.
      if(badge){badge.hidden=false;badge.textContent='Offline setup unavailable';}
    }
  });
})();
