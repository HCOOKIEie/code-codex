import { runtimeEvent } from "./runtime-events";

let operationSequence = 0;
export function runtimeErrorDetails(error: unknown): Record<string, unknown> {
  try {
  const errorChain: string[] = [], seen = new Set<unknown>();
  let current = error;
  while (current != null && errorChain.length < 8 && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) { errorChain.push(`${current.name}: ${current.message}`); current = current.cause; }
    else { errorChain.push(typeof current === 'string' ? current : 'Non-Error rejection'); break; }
  }
  const code = error && typeof error === 'object' && 'code' in error ? (error as {code:unknown}).code : undefined;
  const result:Record<string,unknown> = { errorChain, ...(typeof code === 'string' || typeof code === 'number' ? {errorCode:typeof code==='string'?code.slice(0,160):code} : {}), ...(error instanceof Error && error.stack ? {exceptionStack:error.stack.slice(0,3000)} : {}), chainTruncated:current != null && errorChain.length >= 8 };
  const bytes=new TextEncoder().encode(JSON.stringify(result)).length;
  // Fit the existing shared 7 KB renderer queue without republishing immutable plugin bytes.
  if(bytes>5800){result.errorChain=errorChain.map(cause=>cause.slice(0,80));if(typeof result.exceptionStack==='string')result.exceptionStack=result.exceptionStack.slice(0,200);result.detailsTruncated=true;result.originalDetailBytes=bytes;}
  return result;
  } catch {return {errorChain:['Exception details could not be inspected safely.']};}
}
export function beginRuntimeOperation(source: string, action: string, details: Record<string,unknown> = {}) {
  const operationId = `renderer-${++operationSequence}`, started = performance.now();
  let finished = false;
  const event = (phase: string, outcome: string, extra: Record<string,unknown> = {}) => runtimeEvent(source,phase,outcome,{...details,...extra,operationId,durationMs:Math.round(performance.now()-started)});
  event(action,'started');
  return { event, finish(outcome: string, extra: Record<string,unknown> = {}) { if (!finished) {event(action,outcome,extra);finished=true;} } };
}

// Handled exceptions are otherwise invisible to window.error/unhandledrejection.
// This observer never throws or changes the existing handler/recovery behavior.
const caught = new Map<string, { start: number; count: number; suppressed: number }>();
export function recordCaughtRuntimeError(context: string, error: unknown): void {
  try {
    const now = performance.now();
    const key = caught.has(context) || caught.size < 256 ? context : 'other handlers';
    let state = caught.get(key);
    if (!state) { state = { start: now, count: 0, suppressed: 0 }; caught.set(key, state); }
    if (now - state.start > 10_000) {
      if (state.suppressed) runtimeEvent('handled-exception', key, 'throttled', { suppressedCount: state.suppressed });
      state.start = now; state.count = 0; state.suppressed = 0;
    }
    if (++state.count > 3) { state.suppressed++; return; }
    const details = runtimeErrorDetails(error);
    const cancelled = (error instanceof Error || error instanceof DOMException) && error.name === 'AbortError';
    runtimeEvent('handled-exception', key, cancelled ? 'cancelled' : 'failed', { ...details,
      recovery: 'Existing handler continues; recording does not retry, reset settings or prove recovery succeeded.' });
  } catch { /* Diagnostics cannot replace the original handler or throw another failure. */ }
}

export function flushCaughtRuntimeErrors(): void {
  const now=performance.now();
  for(const [context,state] of caught){
    if(state.suppressed&&now-state.start>=10_000){runtimeEvent('handled-exception',context,'throttled',{suppressedCount:state.suppressed});state.suppressed=0;state.count=0;state.start=now;}
  }
}
