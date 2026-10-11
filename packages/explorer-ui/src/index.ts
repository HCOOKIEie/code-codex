import { installInjector } from "./inject";

import { ExplorerBridge, getBootstrapConfig } from './bridge';
import { initializeRendererStorage } from './renderer-storage';
const bootstrap=getBootstrapConfig();
if(bootstrap.centralizedStorage && bootstrap.token){
  new ExplorerBridge(bootstrap.token,bootstrap.binding,bootstrap.receiver);
  void initializeRendererStorage().then(()=>installInjector());
}else installInjector();

export { ActiveThreadTracker, extractThreadIdFromDocument, extractThreadIdFromUrl, resolveActiveThread } from "./active-thread";
export { ExplorerBridge, ExplorerBridgeError, BridgeUnavailableError } from "./bridge";
export { CodeCodexElement } from "./explorer-element";
export { injectExplorer } from "./inject";
export { TreeModel } from "./tree-model";
export type * from "./types";
