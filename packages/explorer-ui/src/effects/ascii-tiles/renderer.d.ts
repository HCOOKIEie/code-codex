import type {AsciiTilesSettings} from './model';
export class AsciiTilesRenderer {readonly ready:Promise<void>;constructor(host:HTMLElement,canvas:HTMLCanvasElement,settings:AsciiTilesSettings,onError?:(message?:string)=>void);setSettings(settings:AsciiTilesSettings):void;replay():void;dispose():void;}
