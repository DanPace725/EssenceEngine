import { TcRandom } from '../../tcStorage.js';

// Build a portable snapshot of the running simulation state
export function buildStateSnapshot({ world, trail, signalField, config } = {}) {
  const metadata = {
    version: 1,
    exportedAt: new Date().toISOString()
  };

  const bundles = (world?.bundles || []).map((b) => ({
    id: b.id,
    x: b.x,
    y: b.y,
    vx: b.vx,
    vy: b.vy,
    heading: b.heading,
    chi: b.chi,
    alive: !!b.alive,
    generation: b.generation || 0,
    parentId: b.parentId || null,
    lastMitosisTick: b.lastMitosisTick || 0
  }));

  const resources = (world?.resources || []).map((r) => ({
    x: r.x,
    y: r.y,
    r: r.r,
    visible: !!r.visible,
    vitality: typeof r.vitality === 'number' ? r.vitality : 1,
    depleted: !!r.depleted,
    tcData: r.tcData || null
  }));

  // Trail snapshot (flattened arrays)
  const trailSnapshot = trail?.snapshot ? Array.from(trail.snapshot) : (trail?.buf ? Array.from(trail.buf) : null);
  const trailAuthor = trail?.authorSnapshot ? Array.from(trail.authorSnapshot) : null;
  const trailTimestamp = trail?.timestampSnapshot ? Array.from(trail.timestampSnapshot) : null;

  // Signal field snapshot
  const signalSnapshots = [];
  if (signalField && Array.isArray(signalField.snapshot)) {
    for (let c = 0; c < signalField.snapshot.length; c++) {
      const s = signalField.snapshot[c];
      signalSnapshots.push(s ? Array.from(s) : null);
    }
  }

  const rngState = (typeof TcRandom !== 'undefined' && TcRandom.getState) ? TcRandom.getState() : null;

  const snap = {
    metadata,
    // include a JSON-serializable copy of the full CONFIG object (if provided)
    config: config ? JSON.parse(JSON.stringify(config)) : null,
    rng: rngState,
    world: {
      nextAgentId: world?.nextAgentId || 0,
      totalBirths: world?.totalBirths || 0,
      collected: world?.collected || 0,
      carryingCapacity: world?.carryingCapacity || 0,
      resourcePressure: world?.resourcePressure || 0,
      lineageLinks: world?.lineageLinks || []
    },
    bundles,
    resources,
    trail: {
      snapshot: trailSnapshot,
      authorSnapshot: trailAuthor,
      timestampSnapshot: trailTimestamp,
      w: trail?.w || 0,
      h: trail?.h || 0,
      cell: trail?.cell || 0
    },
    signalField: {
      channelCount: signalField?.channelCount || 0,
      snapshots: signalSnapshots,
      w: signalField?.w || 0,
      h: signalField?.h || 0,
      cell: signalField?.cell || 0
    }
  };

  return snap;
}

// Apply a snapshot into running objects. Attempt to be forgiving: match bundles by id and resources by index.
export function applyStateSnapshot(snapshot = {}, { world, trail, signalField, config } = {}) {
  if (!snapshot) throw new Error('No snapshot provided');

  // Apply config snapshot by mutating the provided `config` object (if available).
  if (snapshot.config && config && typeof snapshot.config === 'object') {
    try {
      // shallow/deep merge helper
      const merge = (target, src) => {
        for (const k of Object.keys(src)) {
          const v = src[k];
          if (v && typeof v === 'object' && !Array.isArray(v) && typeof target[k] === 'object') {
            merge(target[k], v);
          } else {
            target[k] = v;
          }
        }
      };
      merge(config, snapshot.config);
    } catch (err) {
      console.warn('Failed to apply config snapshot to CONFIG object:', err);
    }
  }

  // Restore RNG seed if provided
  if (snapshot.rng && typeof TcRandom?.seed === 'function' && snapshot.rng.seed != null) {
    try { TcRandom.seed(snapshot.rng.seed); }
    catch (err) { console.warn('Failed to seed RNG from snapshot:', err); }
  }

  // World-level fields
  if (snapshot.world && world) {
    world.nextAgentId = snapshot.world.nextAgentId ?? world.nextAgentId;
    world.totalBirths = snapshot.world.totalBirths ?? world.totalBirths;
    world.collected = snapshot.world.collected ?? world.collected;
    world.carryingCapacity = snapshot.world.carryingCapacity ?? world.carryingCapacity;
    world.resourcePressure = snapshot.world.resourcePressure ?? world.resourcePressure;
    if (Array.isArray(snapshot.world.lineageLinks)) {
      world.lineageLinks = snapshot.world.lineageLinks.slice();
    }
  }

  // Bundles: try to match existing bundles by id and set core properties
  if (Array.isArray(snapshot.bundles) && world?.bundles) {
    for (const bSnap of snapshot.bundles) {
      const b = world.bundles.find(x => x.id === bSnap.id);
      if (!b) {
        console.warn('Bundle id not found when applying snapshot:', bSnap.id);
        continue;
      }
      b.x = bSnap.x ?? b.x;
      b.y = bSnap.y ?? b.y;
      if (typeof bSnap.vx === 'number') b.vx = bSnap.vx;
      if (typeof bSnap.vy === 'number') b.vy = bSnap.vy;
      if (typeof bSnap.heading === 'number') b.heading = bSnap.heading;
      if (typeof bSnap.chi === 'number') b.chi = bSnap.chi;
      if (typeof bSnap.alive === 'boolean') b.alive = bSnap.alive;
      if (typeof bSnap.generation === 'number') b.generation = bSnap.generation;
      b.parentId = bSnap.parentId ?? b.parentId;
      b.lastMitosisTick = bSnap.lastMitosisTick ?? b.lastMitosisTick;
    }
  }

  // Resources: match by index
  if (Array.isArray(snapshot.resources) && Array.isArray(world?.resources)) {
    for (let i = 0; i < snapshot.resources.length; i++) {
      const rSnap = snapshot.resources[i];
      const r = world.resources[i];
      if (!r) {
        console.warn('Resource index not present when applying snapshot:', i);
        continue;
      }
      r.x = rSnap.x ?? r.x;
      r.y = rSnap.y ?? r.y;
      if (typeof rSnap.r === 'number') r.r = rSnap.r;
      if (typeof rSnap.visible === 'boolean') r.visible = rSnap.visible;
      if (typeof rSnap.vitality === 'number') r.vitality = rSnap.vitality;
      if (typeof rSnap.depleted === 'boolean') r.depleted = rSnap.depleted;
      if (rSnap.tcData !== undefined) r.tcData = rSnap.tcData;
    }
  }

  // Trail: use applySnapshot if available, else copy buffers
  if (snapshot.trail && trail) {
    if (typeof trail.applySnapshot === 'function') {
      try { trail.applySnapshot(snapshot.trail); }
      catch (err) { console.warn('trail.applySnapshot failed:', err); }
    } else {
      if (Array.isArray(snapshot.trail.snapshot) && trail.buf && trail.snapshot) {
        const arr = snapshot.trail.snapshot;
        trail.buf.set(new Float32Array(arr));
        trail.captureSnapshot();
      }
      if (Array.isArray(snapshot.trail.authorSnapshot) && trail.authorBuf) {
        trail.authorBuf.set(new Uint32Array(snapshot.trail.authorSnapshot));
        trail.authorSnapshot.set(trail.authorBuf);
      }
      if (Array.isArray(snapshot.trail.timestampSnapshot) && trail.timestampBuf) {
        trail.timestampBuf.set(new Uint32Array(snapshot.trail.timestampSnapshot));
        trail.timestampSnapshot.set(trail.timestampBuf);
      }
    }
  }

  // Signal field
  if (snapshot.signalField && signalField) {
    if (typeof signalField.applySnapshot === 'function') {
      try { signalField.applySnapshot(snapshot.signalField); }
      catch (err) { console.warn('signalField.applySnapshot failed:', err); }
    } else if (Array.isArray(snapshot.signalField.snapshots)) {
      for (let c = 0; c < snapshot.signalField.snapshots.length; c++) {
        const s = snapshot.signalField.snapshots[c];
        if (!s || !signalField.buffers[c]) continue;
        signalField.buffers[c].set(new Float32Array(s));
        if (signalField.snapshot && signalField.snapshot[c]) signalField.snapshot[c].set(signalField.buffers[c]);
      }
    }
  }

  return true;
}

export default { buildStateSnapshot, applyStateSnapshot };
