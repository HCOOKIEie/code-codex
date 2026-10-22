import type {Parameters} from './model';

/** The normal renderer and startup copy share presentation, never media state. */
export function applyMediaParameters(media:HTMLImageElement|HTMLVideoElement,p:Parameters):void {
 media.style.objectFit=p.fit;
 media.style.transform=`translate(${p.x}%,${p.y}%) rotate(${p.rotation}deg) scale(${p.scale/100})`;
 media.style.opacity=String(p.opacity/100);
 media.style.filter=`blur(${p.blur}px) brightness(${p.brightness/100}) contrast(${p.contrast/100}) saturate(${p.saturation/100})`;
 if(media instanceof HTMLVideoElement)media.playbackRate=p.speed;
}
