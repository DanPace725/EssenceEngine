// Essence Engine v0.1 — one bundle, one resource, minimal movement, honest χ.
// Keys: [←→↑↓]/[WASD]=move  [Space]=pause  [R]=reset  [C]=+5χ

(() => {
    const canvas = document.getElementById("view");
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  
    // --- DPR-aware sizing ---
    const resize = () => {
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
      canvas.width  = Math.floor(innerWidth  * dpr);
      canvas.height = Math.floor(innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    window.addEventListener("resize", resize, { passive: true });
    resize();
  
    // --- config (kept tiny) ---
    const CONFIG = {
      startChi: 12,                   // initial vitality
      baseDecayPerSecond: 0.15,       // idle metabolic leak
      moveSpeedPxPerSec: 160,         // bundle speed
      moveCostPerSecond: 0.35,        // movement energy cost
      rewardChi: 6,                   // χ gained when touching the resource
      resourceRadius: 8,
      bundleSize: 40,
      hud: { show: true },
    };
  
    // --- input (held keys) ---
    const held = new Set();
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (["arrowup","w","arrowdown","s","arrowleft","a","arrowright","d"].includes(e.key.toLowerCase()))
        held.add(k);
      if (e.code === "Space") { World.paused = !World.paused; e.preventDefault(); }
      else if (e.code === "KeyR") { World.reset(); }
      else if (e.code === "KeyC") { World.bundle.chi += 5; World.bundle.alive = true; }
    });
    window.addEventListener("keyup", (e) => held.delete(e.key.toLowerCase()));
  
    // --- tiny helpers ---
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  
    // --- entities ---
    class Bundle {
      constructor(x, y, size, chi) {
        this.x = x; this.y = y;
        this.size = size;
        this.chi = chi;
        this.alive = true;
      }
      update(dt) {
        if (!this.alive) return;
  
        // base leak
        let chiSpend = CONFIG.baseDecayPerSecond * dt;
  
        // movement (costs χ)
        let dx = 0, dy = 0;
        if (held.has("w") || held.has("arrowup")) dy -= 1;
        if (held.has("s") || held.has("arrowdown")) dy += 1;
        if (held.has("a") || held.has("arrowleft")) dx -= 1;
        if (held.has("d") || held.has("arrowright")) dx += 1;
  
        if (dx !== 0 || dy !== 0) {
          const len = Math.hypot(dx, dy);
          dx /= len; dy /= len;
          const dist = CONFIG.moveSpeedPxPerSec * dt;
          this.x += dx * dist;
          this.y += dy * dist;
          chiSpend += CONFIG.moveCostPerSecond * dt;
        }
  
        // stay inside viewport
        const half = this.size / 2;
        this.x = clamp(this.x, half, innerWidth - half);
        this.y = clamp(this.y, half, innerHeight - half);
  
        // apply χ spend
        this.chi = Math.max(0, this.chi - chiSpend);
        if (this.chi === 0) this.alive = false;
      }
      draw(ctx) {
        ctx.fillStyle = this.alive ? "#ffffff" : "#555555";
        const half = this.size / 2;
        ctx.fillRect(this.x - half, this.y - half, this.size, this.size);
      }
      // rect-circle overlap
      overlapsResource(res) {
        const half = this.size / 2;
        const rx = clamp(res.x, this.x - half, this.x + half);
        const ry = clamp(res.y, this.y - half, this.y + half);
        const dx = res.x - rx, dy = res.y - ry;
        return (dx*dx + dy*dy) <= (res.r * res.r);
      }
    }
  
    class Resource {
      constructor(x, y, r) { this.x = x; this.y = y; this.r = r; }
      draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI*2);
        ctx.fillStyle = "#00ff88";
        ctx.fill();
      }
      respawn() {
        const margin = 20;
        this.x = margin + Math.random() * (innerWidth  - 2*margin);
        this.y = margin + Math.random() * (innerHeight - 2*margin);
      }
    }
  
    // --- field (background) ---
    const Field = {
      clear() { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    };
  
    // --- world state ---
    const World = {
      paused: false,
      bundle: null,
      resource: null,
      collected: 0,
      reset() {
        const cx = innerWidth / 2, cy = innerHeight / 2;
        this.bundle   = new Bundle(cx, cy, CONFIG.bundleSize, CONFIG.startChi);
        this.resource = new Resource(cx + 120, cy, CONFIG.resourceRadius);
        this.resource.respawn(); // randomize
        this.collected = 0;
      }
    };
    World.reset();
  
    // --- HUD ---
    function drawHUD() {
      if (!CONFIG.hud.show) return;
      ctx.save();
      ctx.fillStyle = "#00ff88";
      ctx.font = "12px ui-mono, monospace";
      const chi = World.bundle.chi.toFixed(2);
      const status = World.bundle.alive ? "ALIVE" : "IDLE";
      ctx.fillText(
        `χ: ${chi}  |  ${status}  |  collected: ${World.collected}  |  [WASD/Arrows]=move  [Space]=pause  [R]=reset  [C]=+5χ`,
        10, 18
      );
      ctx.restore();
    }
  
    // --- main loop ---
    let last = performance.now();
    function loop(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
  
      if (!World.paused) {
        World.bundle.update(dt);
  
        // reward on overlap
        if (World.bundle.alive && World.bundle.overlapsResource(World.resource)) {
          World.bundle.chi += CONFIG.rewardChi;
          World.bundle.alive = true;
          World.collected += 1;
          World.resource.respawn();
        }
      }
  
      Field.clear();
      World.resource.draw(ctx);
      World.bundle.draw(ctx);
      drawHUD();
  
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  })();
  