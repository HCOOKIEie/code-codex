// Shared production-WebGL probe: freeze only the animation uniform, never user settings.
export async function measureAsciiInteraction(browser, { recovery = 1.8, snapshot = async () => {} } = {}) {
  const evaluate = browser.evaluate;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  await evaluate(`(() => {
    if (window.__asciiInteractionProbe) throw Error('ASCII probe already installed');
    const canvas = document.querySelector('[data-code-codex-ascii-tiles-layer] canvas');
    if (!canvas) throw Error('ASCII canvas missing');
    const gl = canvas.getContext('webgl2'), program = gl.getParameter(gl.CURRENT_PROGRAM);
    const time = gl.getUniformLocation(program, 'uTime');
    const rect = canvas.getBoundingClientRect(), ratio = gl.drawingBufferWidth / rect.width;
    const x = Math.round(rect.width / 2), y = Math.round(rect.height / 2);
    const size = Math.min(512, gl.drawingBufferWidth, gl.drawingBufferHeight);
    const near = [Math.floor(gl.drawingBufferWidth / 2 - size / 2), Math.floor(gl.drawingBufferHeight / 2 - size / 2), size, size];
    const far = [[8, 8, 96, 96], [gl.drawingBufferWidth-104, 8, 96, 96],
      [8, gl.drawingBufferHeight-104, 96, 96], [gl.drawingBufferWidth-104, gl.drawingBufferHeight-104, 96, 96]];
    const p = window.__asciiInteractionProbe = {
      gl, canvas, program, time, frozenTime: gl.getUniform(program, time),
      original: gl.drawArrays, descriptor: Object.getOwnPropertyDescriptor(gl, 'drawArrays'),
      near, far, center: { x: rect.left + x, y: rect.top + y }, ratio,
      frames: 0, peak: { changed: 0, introduced: 0, farChanged: 0, meanDifference: 0 }, error: 0,
      maxTimeDeviation: 0, programChanged: false, pointerEvents: 0, minCenterBrightnessRatio: 1
    };
    p.pointerListener = () => p.pointerEvents++;
    window.addEventListener('pointermove', p.pointerListener, true);
    const read = area => { const bytes = new Uint8Array(area[2] * area[3] * 4); gl.readPixels(...area, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return bytes; };
    const difference = (a, b) => {
      let changed = 0, introduced = 0, total = 0;
      for (let i = 0; i < a.length; i += 4) {
        const delta = Math.abs(a[i]-b[i]) + Math.abs(a[i+1]-b[i+1]) + Math.abs(a[i+2]-b[i+2]);
        if (delta > 12) changed++;
        if (b[i]+b[i+1]+b[i+2] === 0 && a[i]+a[i+1]+a[i+2] > 24) introduced++;
        total += delta;
      }
      return { changed, introduced, meanDifference: total / (a.length / 4 * 3) };
    };
    gl.drawArrays = function(...args) {
      gl.uniform1f(time, p.frozenTime);
      p.original.apply(gl, args);
      p.programChanged ||= gl.getParameter(gl.CURRENT_PROGRAM) !== program;
      p.maxTimeDeviation = Math.max(p.maxTimeDeviation, Math.abs(gl.getUniform(program,time)-p.frozenTime));
      p.lastNear = read(near);
      p.lastFar = new Uint8Array(96 * 96 * 4 * far.length);
      far.forEach((area, i) => p.lastFar.set(read(area), i * 96 * 96 * 4));
      p.error ||= gl.getError();
      if (!p.baseNear) return;
      const a = difference(p.lastNear, p.baseNear), b = difference(p.lastFar, p.baseFar);
      p.current = { ...a, farChanged: b.changed };
      if (p.measuring) {
        let currentLight=0, baseLight=0;
        const left=Math.floor(near[2]/2)-64, top=Math.floor(near[3]/2)-64;
        for(let y=top;y<top+128;y++)for(let x=left;x<left+128;x++){
          const i=(y*near[2]+x)*4;
          currentLight+=p.lastNear[i]+p.lastNear[i+1]+p.lastNear[i+2];
          baseLight+=p.baseNear[i]+p.baseNear[i+1]+p.baseNear[i+2];
        }
        if(baseLight>1000)p.minCenterBrightnessRatio=Math.min(p.minCenterBrightnessRatio,currentLight/baseLight);
        p.frames++;
        for (const key of Object.keys(p.peak)) p.peak[key] = Math.max(p.peak[key], p.current[key]);
      }
    };
  })()`);
  try {
    await wait(recovery * 1000 + 200);
    await evaluate(`(() => { const p = window.__asciiInteractionProbe; if (!p.lastNear) throw Error('No visible GPU frames'); p.baseNear = p.lastNear.slice(); p.baseFar = p.lastFar.slice(); p.measuring = true; })()`);
    await snapshot('baseline');
    const center = await evaluate('window.__asciiInteractionProbe.center');
    for (let i = 0; i < 18; i++) {
      await browser.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: center.x - 80 + i * 9, y: center.y + Math.sin(i * .4) * 24 });
      await wait(25);
    }
    await wait(250);
    await snapshot('active');
    const active = await evaluate(`(() => { const p = window.__asciiInteractionProbe; p.measuring = false;p.pointerEventsAtRelease=p.pointerEvents;let farPainted=0;for(let i=0;i<p.baseFar.length;i+=4)if(p.baseFar[i]+p.baseFar[i+1]+p.baseFar[i+2]>24)farPainted++;return { ...p.peak, frames: p.frames, pixels: p.near[2] * p.near[3], farPainted, minCenterBrightnessRatio:p.minCenterBrightnessRatio, error: p.error, sameCanvas: p.canvas === document.querySelector('[data-code-codex-ascii-tiles-layer] canvas') }; })()`);
    // Physics uses bounded simulation substeps. Software WebGL under CPU load can
    // take longer than wall time to finish that interval; wait for the outcome
    // with a finite budget instead of assuming one sleep proves recovery.
    const recoveryStarted = Date.now();
    let recovered;
    do {
      await wait(100);
      recovered = await evaluate('window.__asciiInteractionProbe.current');
    } while (recovered.changed !== 0 && Date.now() - recoveryStarted < Math.max(5000, recovery * 3000));
    recovered.waitedMs = Date.now() - recoveryStarted;
    recovered.diagnostics = await evaluate(`(()=>{const p=window.__asciiInteractionProbe;return {programChanged:p.programChanged,maxTimeDeviation:p.maxTimeDeviation,pointerEvents:p.pointerEvents,additionalPointerEvents:p.pointerEvents-p.pointerEventsAtRelease,frozenTime:p.frozenTime};})()`);
    await snapshot('recovered');
    return { active, recovered };
  } finally {
    await evaluate(`(() => { const p = window.__asciiInteractionProbe; if (!p) return;window.removeEventListener('pointermove',p.pointerListener,true);if (p.descriptor) Object.defineProperty(p.gl, 'drawArrays', p.descriptor); else delete p.gl.drawArrays; delete window.__asciiInteractionProbe; })()`);
  }
}
