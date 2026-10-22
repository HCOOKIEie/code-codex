export const DEFAULTS: {speed:number;glyphSize:number;tileDensity:number;tileShear:number;tileGap:number;outlineWidth:number;outlineStrength:number;bevelWidth:number;bevelSoftness:number;refractionStrength:number;chromaticSpread:number;specularExponent:number;specularStrength:number;patternFreqX:number;patternFreqY:number;patternFreqXY:number;glyphColor:string;recessColor:string;backgroundColor:string;opacity:number;dpr:number;cursorInteraction:boolean;cursorRadius:number;cursorIntensity:number;cursorRecovery:number;waveSpeed:number;waveHeight:number;clickStrength:number};
export const RANGES:Record<string,readonly [number,number,number]>;
export function normalizeOptions(value?:Record<string,unknown>):typeof DEFAULTS;
export function rgb(value:string):number[];
