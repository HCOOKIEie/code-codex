import { DEFAULTS, RANGES, normalizeOptions } from './options.mjs';
import { recordCaughtRuntimeError } from '../../runtime-operations';
export { RANGES };
export const ASCII_TILES_BACKGROUND_PLUGIN_ID='code-codex.ascii-tiles-background';
export const ASCII_TILES_SETTINGS_KEY='code-codex:ascii-tiles-background:v1';
export type AsciiTilesSettings=Record<keyof typeof DEFAULTS,number|string|boolean>&{paused:boolean};
export const DEFAULT_ASCII_TILES_SETTINGS={...DEFAULTS,paused:false} as AsciiTilesSettings;
export function normalizeAsciiTilesSettings(input:unknown):AsciiTilesSettings {const value=input&&typeof input==='object'?input as Record<string,unknown>:{};return {...normalizeOptions(value),paused:value.paused===true};}
export function readAsciiTilesSettings():AsciiTilesSettings {try{return normalizeAsciiTilesSettings(JSON.parse(localStorage.getItem(ASCII_TILES_SETTINGS_KEY)??'{}'));}catch(error){recordCaughtRuntimeError('ASCII settings read',error);return {...DEFAULT_ASCII_TILES_SETTINGS};}}
