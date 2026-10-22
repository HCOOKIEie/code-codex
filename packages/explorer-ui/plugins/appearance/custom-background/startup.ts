import {KEY,normalizeParameters,type Media} from './model';
import {transaction} from './repository';
import {applyMediaParameters} from './media-presentation';

/** Read-only selected media. No theme lease, library seeding, or normal enable. */
export function mountCustomStartupBackground(target:HTMLElement,onError:(message?:string)=>void){
 let disposed=false,url:string|undefined,media:HTMLVideoElement|HTMLImageElement|undefined;
 let timer:ReturnType<typeof setTimeout>|undefined,cancel:undefined|(()=>void);
 const release=()=>{if(timer!==undefined)clearTimeout(timer);timer=undefined;if(media){media.onload=null;media.onerror=null;if(media instanceof HTMLVideoElement){media.pause();media.onloadeddata=null;media.removeAttribute('src');media.load();}media.remove();media=undefined;}if(url){URL.revokeObjectURL(url);url=undefined;}};
 const ready=(async()=>{
  let selected='';try{selected=JSON.parse(localStorage.getItem(KEY)??'{}').selected??'';}catch{throw Error('CC-BG-STARTUP-SETTINGS: Custom Background selection could not be read.');}
  if(typeof selected!=='string'||!selected)throw Error('CC-BG-STARTUP-SELECTION: Select an image or video in Custom Background first.');
  // Bound storage lookup as well as media decoding. A blocked IDB must not hold startup.
  const record=await new Promise<Media|undefined>((resolve,reject)=>{
   cancel=()=>reject(new DOMException('Custom startup preparation canceled','AbortError'));
   timer=setTimeout(()=>reject(Error('CC-BG-STARTUP-STORAGE: Media lookup timed out.')),10000);
   void transaction<Media|undefined>('readonly',store=>store.get(selected)).then(resolve,reject);
  });
  if(timer!==undefined)clearTimeout(timer);timer=undefined;cancel=undefined;
  if(disposed)throw new DOMException('Custom startup preparation canceled','AbortError');
  if(!record||!(record.blob instanceof Blob)||!record.blob.size||!['image','video'].includes(record.kind))throw Error('CC-BG-STARTUP-MISSING: The selected custom media is missing or invalid; no alternative was selected.');
  const p=normalizeParameters(record.parameters);media=document.createElement(record.kind==='video'?'video':'img');
  media.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';applyMediaParameters(media,p);
  const element=media;url=URL.createObjectURL(record.blob);
  await new Promise<void>((resolve,reject)=>{
   cancel=()=>reject(new DOMException('Custom startup preparation canceled','AbortError'));
   timer=setTimeout(()=>reject(Error('CC-BG-STARTUP-DECODE: Media preparation timed out.')),15000);
   element.onerror=()=>reject(Error('CC-BG-STARTUP-DECODE: The selected custom media could not be decoded.'));
   if(element instanceof HTMLVideoElement){element.muted=true;element.loop=true;element.playsInline=true;element.onloadeddata=()=>{applyMediaParameters(element,p);void element.play().then(resolve,()=>reject(Error('CC-BG-STARTUP-PLAY: The selected custom video could not start.')));};}
   else element.onload=()=>resolve();
   target.append(element);element.src=url!;
  });
  if(timer!==undefined)clearTimeout(timer);timer=undefined;cancel=undefined;
 })().catch(error=>{release();if(!disposed)onError(error instanceof Error?error.message:String(error));throw error;});
 void ready.catch(()=>{});
 return {ready,dispose(){if(disposed)return;disposed=true;cancel?.();cancel=undefined;release();}};
}
