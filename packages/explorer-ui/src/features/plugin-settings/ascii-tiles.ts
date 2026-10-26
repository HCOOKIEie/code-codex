import type { BackgroundCommands } from '../../contracts/appearance';
import type { AsciiTilesBackgroundController } from '../../plugin-host/backgrounds/ascii-tiles';
import { ASCII_TILES_BACKGROUND_PLUGIN_ID as ID, DEFAULT_ASCII_TILES_SETTINGS, RANGES } from '../../effects/ascii-tiles/model';
import { icons } from '../../icons';
import { getLocale, subscribeLanguage } from '../../i18n';
import { recordCaughtRuntimeError } from '../../runtime-operations';

const groups = [
  ['Grid and motion','网格与流动',['speed','glyphSize','tileDensity','tileShear','tileGap','opacity','dpr','paused']],
  ['Glass material','玻璃材质',['outlineWidth','outlineStrength','bevelWidth','bevelSoftness','refractionStrength','chromaticSpread','specularExponent','specularStrength']],
  ['Pattern and colors','图案与颜色',['patternFreqX','patternFreqY','patternFreqXY','glyphColor','recessColor','backgroundColor']],
  ['Interaction','交互波纹',['cursorInteraction','cursorRadius','cursorIntensity','cursorRecovery','waveSpeed','waveHeight','clickStrength']],
] as const;
const labels:Record<string,readonly [string,string,string?]>={
 speed:['Flow speed','流动速度','×'],glyphSize:['Glyph size','字符大小','px'],tileDensity:['Tile density','砖块密度'],tileShear:['Tile shear','砖块倾斜'],tileGap:['Tile gap','砖块间距','px'],opacity:['Opacity','不透明度'],dpr:['Pixel ratio limit','像素倍率上限','×'],paused:['Pause flow','暂停流动'],
 outlineWidth:['Edge width','边缘宽度','px'],outlineStrength:['Edge strength','边缘强度'],bevelWidth:['Bevel width','倒角宽度'],bevelSoftness:['Bevel softness','倒角柔和度'],refractionStrength:['Refraction','折射强度'],chromaticSpread:['Chromatic spread','色散'],specularExponent:['Highlight sharpness','高光锐度'],specularStrength:['Highlight strength','高光强度'],
 patternFreqX:['Horizontal frequency','水平频率'],patternFreqY:['Vertical frequency','垂直频率'],patternFreqXY:['Diagonal frequency','对角频率'],glyphColor:['Glyph color','字符颜色'],recessColor:['Gap color','砖缝颜色'],backgroundColor:['Background color','背景颜色'],cursorInteraction:['Tile interaction','砖块联动'],cursorRadius:['Interaction radius','交互半径','px'],cursorIntensity:['Drag strength','拖动强度'],cursorRecovery:['Wave decay','波动消退','s'],waveSpeed:['Propagation speed','传播速度'],waveHeight:['Wave height','波纹高度','px'],clickStrength:['Click strength','点击强度'],
};
const text=(en:string,zh:string)=>getLocale()==='zh-CN'?zh:en;
export function asciiTilesCardMarkup():string{return `<article class="preview-extension appearance-extension" data-appearance-plugin="${ID}"><span class="preview-extension-icon" aria-hidden="true">${icons.preview}</span><div class="preview-extension-copy"><div class="preview-extension-title-row"><h4 data-plugin-name>ASCII Tiles Background</h4><span class="preview-extension-status ascii-tiles-status">Disabled</span></div></div><div class="preview-extension-actions"><button type="button" class="preview-extension-action ascii-tiles-enable" aria-pressed="false">Enable</button><button type="button" class="particle-settings-trigger ascii-tiles-settings" aria-label="Configure ASCII Tiles Background" aria-haspopup="dialog" aria-controls="cle-ascii-tiles-settings" aria-expanded="false">${icons.sliders}</button></div></article>`;}
export function asciiTilesPanelMarkup():string{return `<section id="cle-ascii-tiles-settings" class="particle-settings-panel ascii-tiles-panel" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-ascii-tiles-title"><header class="particle-settings-header"><div class="particle-settings-heading"><p data-ascii-category>Appearance</p><h3 id="cle-ascii-tiles-title" data-plugin-name>ASCII Tiles Background</h3></div><div class="particle-settings-header-actions"><button type="button" class="particle-settings-close ascii-tiles-close" aria-label="Close settings">${icons.close}</button></div></header><div class="particle-settings-scroll"><p class="particle-settings-error ascii-tiles-error" role="status" hidden></p>${groups.map(([en,,keys],index)=>`<fieldset class="particle-settings-group"><legend style="width:100%"><span data-ascii-group="${index}">${en}</span><button type="button" class="particle-library-clear" data-ascii-reset="${index}" style="float:right;margin:0">Reset</button></legend>${keys.map(key=>{const range=RANGES[key];const boolean=typeof DEFAULT_ASCII_TILES_SETTINGS[key]==='boolean';return `<div class="particle-control-row"><label for="cle-ascii-${key}" data-ascii-label="${key}">${labels[key]?.[0]}</label><input id="cle-ascii-${key}" data-ascii-control="${key}" type="${range?'range':boolean?'checkbox':'color'}" ${range?`min="${range[0]}" max="${range[1]}" step="${range[2]}"`:''}><output for="cle-ascii-${key}" data-ascii-output="${key}"></output></div>`;}).join('')}</fieldset>`).join('')}</div></section>`;}

export interface AsciiTilesSettingsPorts {
 readonly shadow:ShadowRoot;
 readonly runtime:Pick<AsciiTilesBackgroundController,'enabled'|'pending'|'error'|'settings'|'updateSettings'|'subscribe'>;
 readonly actions:BackgroundCommands;
 readonly enabled:()=>boolean;
 readonly closeOthers:()=>void;
 readonly notice:(message:string)=>void;
}
/** Owns only this panel and its inputs; opening never touches the renderer. */
export class AsciiTilesSettingsController {
 #scope:AbortController|undefined;
 #unsubscribe:(()=>void)|undefined;
 #language:(()=>void)|undefined;
 readonly #panel:HTMLElement;
 readonly #trigger:HTMLButtonElement;
 readonly #button:HTMLButtonElement;
 constructor(private readonly ports:AsciiTilesSettingsPorts){
  this.#panel=ports.shadow.querySelector<HTMLElement>('.ascii-tiles-panel')!;
  this.#trigger=ports.shadow.querySelector<HTMLButtonElement>('.ascii-tiles-settings')!;
  this.#button=ports.shadow.querySelector<HTMLButtonElement>('.ascii-tiles-enable')!;
 }
 start():void{
  this.stop();const scope=this.#scope=new AbortController(),options={signal:scope.signal};
  this.#unsubscribe=this.ports.runtime.subscribe(()=>this.render());
  this.#language=subscribeLanguage(()=>this.render());
  this.#button.addEventListener('click',()=>void this.ports.actions.toggle(ID).catch(error=>{recordCaughtRuntimeError('ASCII background toggle',error);this.ports.notice(String(error));}),options);
  this.#trigger.addEventListener('click',()=>this.open?this.close(true):this.show(),options);
  this.#panel.querySelector('.ascii-tiles-close')!.addEventListener('click',()=>this.close(true),options);
  this.#panel.addEventListener('input',event=>{
   const input=event.target as HTMLInputElement,key=input.dataset.asciiControl;
   if(!key)return;const value=input.type==='checkbox'?input.checked:input.type==='range'?Number(input.value):input.value;
   this.ports.runtime.updateSettings({...this.ports.runtime.settings,[key]:value});
  },options);
  this.#panel.addEventListener('click',event=>{
   const target=(event.target as Element).closest<HTMLButtonElement>('[data-ascii-reset]');if(!target)return;
   const group=groups[Number(target.dataset.asciiReset)];if(!group)return;
   const next={...this.ports.runtime.settings};for(const key of group[2])Object.assign(next,{[key]:DEFAULT_ASCII_TILES_SETTINGS[key]});this.ports.runtime.updateSettings(next);
  },options);
  window.addEventListener('pointerdown',event=>{if(this.open&&!event.composedPath().includes(this.#panel)&&!event.composedPath().includes(this.#trigger))this.close(false);},{...options,capture:true});
  window.addEventListener('keydown',event=>{if(this.open&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();this.close(true);}},{...options,capture:true});
  window.addEventListener('resize',()=>this.position(),options);
  this.ports.shadow.addEventListener('scroll',()=>this.position(),{...options,capture:true});
  this.render();
 }
 containsEvent(event:Event):boolean{return event.composedPath().includes(this.#panel)||event.composedPath().includes(this.#trigger);}
 get open():boolean{return this.#panel.matches(':popover-open');}
 show():void{this.ports.closeOthers();this.#panel.showPopover();this.#trigger.setAttribute('aria-expanded','true');this.position();this.#panel.querySelector<HTMLButtonElement>('.ascii-tiles-close')?.focus();}
 close(focus=false):void{if(this.open)this.#panel.hidePopover();this.#trigger.setAttribute('aria-expanded','false');if(focus)this.#trigger.focus();}
 position():void{if(!this.open)return;const card=this.#trigger.closest('article')!.getBoundingClientRect(),edge=12,gap=8,width=Math.min(344,innerWidth-edge*2);this.#panel.style.width=`${width}px`;this.#panel.style.maxHeight=`${innerHeight-edge*2}px`;const left=card.right+gap+width<=innerWidth-edge?card.right+gap:Math.max(edge,innerWidth-edge-width);this.#panel.dataset.side=left===card.right+gap?'right':'overlay';this.#panel.style.left=`${Math.round(left)}px`;this.#panel.style.top=`${Math.round(Math.max(edge,Math.min(card.top,innerHeight-edge-Math.min(this.#panel.scrollHeight,innerHeight-edge*2))))}px`;}
 render():void{
  const {runtime}=this.ports,enabled=this.ports.enabled();
  this.#button.closest('article')!.setAttribute('aria-busy',String(runtime.pending));
  this.#panel.setAttribute('aria-busy',String(runtime.pending));
  for(const reset of this.#panel.querySelectorAll<HTMLButtonElement>('[data-ascii-reset]'))reset.disabled=runtime.pending;
  this.#button.textContent=runtime.pending?text('Applying…','正在应用…'):enabled?text('Disable','停用'):text('Enable','启用');
  this.#button.dataset.enabled=String(enabled);this.#button.setAttribute('aria-pressed',String(enabled));
  // Cold download owns its disabled flag; only manage runtime state after release.
  if(!this.#button.dataset.packageLoadingOwner)this.#button.disabled=this.ports.actions.busy;
  const status=this.ports.shadow.querySelector<HTMLElement>('.ascii-tiles-status')!;status.textContent=enabled?runtime.enabled?text('Enabled','已启用'):text('Enabled · Not applied','已启用 · 未应用'):text('Disabled','未启用');status.dataset.enabled=String(enabled&&runtime.enabled);status.dataset.pending=String(runtime.pending);
  this.#panel.lang=getLocale();this.#panel.dataset.language=getLocale()==='zh-CN'?'zh':'en';
  this.#panel.querySelector('[data-ascii-category]')!.textContent=text('Appearance','外观');
  this.#panel.querySelector('.ascii-tiles-close')!.setAttribute('aria-label',text('Close settings','关闭设置'));
  this.#trigger.setAttribute('aria-label',text('Configure ASCII Tiles Background','设置 ASCII Tiles Background'));
  groups.forEach(([en,zh],index)=>{this.#panel.querySelector(`[data-ascii-group="${index}"]`)!.textContent=text(en,zh);this.#panel.querySelector(`[data-ascii-reset="${index}"]`)!.textContent=text('Reset','重置');});
  for(const input of this.#panel.querySelectorAll<HTMLInputElement>('[data-ascii-control]')){const key=input.dataset.asciiControl!,value=runtime.settings[key as keyof typeof runtime.settings],label=labels[key]!;
   this.#panel.querySelector(`[data-ascii-label="${key}"]`)!.textContent=text(label[0],label[1]);
   if(input.type==='checkbox')input.checked=value===true;else input.value=String(value);
   input.disabled=runtime.pending;
   this.#panel.querySelector(`[data-ascii-output="${key}"]`)!.textContent=input.type==='range'?`${Number(Number(value).toFixed(2))}${label[2]??''}`:'';
  }
  const error=this.#panel.querySelector<HTMLElement>('.ascii-tiles-error')!;error.hidden=!runtime.error;error.textContent=runtime.error??'';
 }
 stop():void{this.close();this.#scope?.abort();this.#scope=undefined;this.#unsubscribe?.();this.#language?.();}
}
