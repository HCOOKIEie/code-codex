// A coupled spring lattice: one displacement/velocity pair per glass brick.
// The simulation is independent of glyph animation and never runs per pixel.
export function gridPoint(width, height, density, shear, x, y) {
  const edge = Math.max(width, height, 1);
  const px = (x - width * 0.5) / edge;
  const py = (height * 0.5 - y) / edge;
  return [(px - shear * py) * density + 0.42, (shear * px + py) * density + 0.35];
}

export function createWaveGrid(width, height, density, shear) {
  const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => gridPoint(width, height, density, shear, x, y));
  const originX = Math.floor(Math.min(...corners.map(p => p[0]))) - 2;
  const originY = Math.floor(Math.min(...corners.map(p => p[1]))) - 2;
  const columns = Math.floor(Math.max(...corners.map(p => p[0]))) + 3 - originX;
  const rows = Math.floor(Math.max(...corners.map(p => p[1]))) + 3 - originY;
  const size = columns * rows;
  return {
    width, height, density, shear, columns, rows, originX, originY,
    layoutKey: `${width}:${height}:${density}:${shear}`,
    heights: new Float32Array(size), velocities: new Float32Array(size),
    accelerations: new Float32Array(size), data: new Float32Array(size * 4),
    active: false, dirty: true, quietFor: 0,
  };
}

export function clearWaves(grid) {
  grid.heights.fill(0); grid.velocities.fill(0); grid.data.fill(0);
  grid.active = false; grid.dirty = true; grid.quietFor = 0;
}

export function kickWave(grid, x, y, impulse, radius) {
  if (!Number.isFinite(impulse) || impulse === 0) return;
  const [gx, gy] = gridPoint(grid.width, grid.height, grid.density, grid.shear, x, y);
  const pitch = Math.max(grid.width, grid.height) / (grid.density * Math.sqrt(1 + grid.shear * grid.shear));
  const sigma = Math.max(0.42, radius / pitch);
  const dxNear = gx - (Math.floor(gx) + 0.5), dyNear = gy - (Math.floor(gy) + 0.5);
  const nearestSquared = dxNear * dxNear + dyNear * dyNear;
  for (let iy = 0; iy < grid.rows; iy++) for (let ix = 0; ix < grid.columns; ix++) {
    const dx = grid.originX + ix + 0.5 - gx, dy = grid.originY + iy + 0.5 - gy;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > sigma * sigma * 9) continue;
    const weight = Math.exp(-(distanceSquared - nearestSquared) / (2 * sigma * sigma));
    const i = iy * grid.columns + ix;
    // Inject velocity; never replace the existing displacement or earlier waves.
    grid.velocities[i] = Math.max(-36, Math.min(36, grid.velocities[i] + impulse * weight));
  }
  grid.active = true; grid.quietFor = 0;
}

export function strokeWave(grid, fromX, fromY, x, y, seconds, radius, strength) {
  const distance = Math.hypot(x - fromX, y - fromY);
  if (distance < 0.5 || strength <= 0) return;
  const speed = distance / Math.max(seconds, 0.004);
  const boost = 0.7 + Math.min(2, speed / 1000);
  const pitch = Math.max(grid.width, grid.height) / grid.density;
  const samples = Math.min(64, Math.max(1, Math.ceil(distance / Math.min(24, pitch * 0.22))));
  const impulse = -Math.min(distance, 120) * 0.08 * strength * boost / samples;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    kickWave(grid, fromX + (x - fromX) * t, fromY + (y - fromY) * t, impulse, radius);
  }
}

function heightAt(grid, x, y) {
  return x < 0 || x >= grid.columns || y < 0 || y >= grid.rows ? 0 : grid.heights[y * grid.columns + x];
}

export function packWaves(grid) {
  for (let y = 0; y < grid.rows; y++) for (let x = 0; x < grid.columns; x++) {
    const i = y * grid.columns + x;
    grid.data[i * 4] = grid.heights[i];
    grid.data[i * 4 + 1] = (heightAt(grid, x + 1, y) - heightAt(grid, x - 1, y)) * 0.5;
    grid.data[i * 4 + 2] = (heightAt(grid, x, y + 1) - heightAt(grid, x, y - 1)) * 0.5;
    grid.data[i * 4 + 3] = grid.velocities[i];
  }
  grid.dirty = true;
}

export function advanceWaves(grid, seconds, propagationSpeed, duration) {
  if (!grid.active || seconds <= 0) return;
  grid.quietFor += seconds;
  if (grid.quietFor >= duration) { clearWaves(grid); return; }
  // Fixed-size substeps keep the coupled system stable at all exposed speeds.
  const elapsed = Math.min(seconds, 0.05);
  const steps = Math.ceil(elapsed * 120), dt = elapsed / steps;
  const coupling = propagationSpeed * propagationSpeed;
  const damping = 12 / Math.max(duration, 0.4);
  for (let step = 0; step < steps; step++) {
    for (let y = 0; y < grid.rows; y++) for (let x = 0; x < grid.columns; x++) {
      const i = y * grid.columns + x, h = grid.heights[i];
      const laplacian = heightAt(grid, x - 1, y) + heightAt(grid, x + 1, y)
        + heightAt(grid, x, y - 1) + heightAt(grid, x, y + 1) - h * 4;
      const boundary = x < 2 || y < 2 || x >= grid.columns - 2 || y >= grid.rows - 2 ? 1.6 : 1;
      grid.accelerations[i] = coupling * laplacian - 36 * h - damping * boundary * grid.velocities[i];
    }
    for (let i = 0; i < grid.heights.length; i++) {
      grid.velocities[i] += grid.accelerations[i] * dt;
      grid.heights[i] += grid.velocities[i] * dt;
    }
  }
  let peakHeight = 0, peakVelocity = 0;
  for (let i = 0; i < grid.heights.length; i++) {
    peakHeight = Math.max(peakHeight, Math.abs(grid.heights[i]));
    peakVelocity = Math.max(peakVelocity, Math.abs(grid.velocities[i]));
  }
  if (peakHeight < 0.0002 && peakVelocity < 0.002) clearWaves(grid);
  else packWaves(grid);
}
