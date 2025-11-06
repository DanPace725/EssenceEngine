import { CONFIG } from './config.js';

const CHANNEL_COLORS = [
  [64, 224, 208],   // teal
  [255, 99, 132],   // pink/red
  [255, 206, 86],   // yellow
  [75, 192, 192],   // aqua
  [153, 102, 255],  // purple
  [255, 159, 64],   // orange
];

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const resolveChannelIndex = (channel, count) => {
  if (typeof channel === 'number') {
    if (!Number.isFinite(channel)) return 0;
    if (channel < 0) return 0;
    return Math.min(count - 1, Math.floor(channel));
  }
  if (typeof channel === 'string') {
    const idx = parseInt(channel, 10);
    if (Number.isNaN(idx)) return 0;
    return Math.min(count - 1, Math.max(0, idx));
  }
  return 0;
};

export const SignalField = {
  cell: CONFIG.signal.cell,
  w: 0,
  h: 0,
  len: 0,
  channelCount: 0,
  buffers: [],
  tmp: [],
  snapshot: [],
  img: null,
  offscreen: null,
  offscreenCtx: null,
  lastCtx: null,
  canvasWidth: 0,
  canvasHeight: 0,
  _totals: [],
  _sumSquares: [],
  _stats: null,
  _statsDirty: true,

  resize(width, height, ctx) {
    this.canvasWidth = width;
    this.canvasHeight = height;
    if (ctx) this.lastCtx = ctx;

    this.cell = CONFIG.signal.cell;
    this.channelCount = Math.max(1, Math.floor(CONFIG.signal.channels || 1));
    this.w = Math.max(1, Math.floor(width / this.cell));
    this.h = Math.max(1, Math.floor(height / this.cell));
    this.len = this.w * this.h;

    this.buffers = new Array(this.channelCount);
    this.tmp = new Array(this.channelCount);
    this.snapshot = new Array(this.channelCount);
    this._totals = new Float64Array(this.channelCount);
    this._sumSquares = new Float64Array(this.channelCount);

    for (let c = 0; c < this.channelCount; c++) {
      this.buffers[c] = new Float32Array(this.len);
      this.tmp[c] = new Float32Array(this.len);
      this.snapshot[c] = new Float32Array(this.len);
    }

    this._statsDirty = true;
    this._stats = null;

    const renderCtx = ctx || this.lastCtx;
    if (renderCtx) {
      this.img = renderCtx.createImageData(this.w, this.h);
    } else {
      this.img = new ImageData(this.w, this.h);
    }

    if (!this.offscreen) {
      this.offscreen = document.createElement('canvas');
      this.offscreenCtx = this.offscreen.getContext('2d');
    }
    if (this.offscreen) {
      this.offscreen.width = this.w;
      this.offscreen.height = this.h;
    }
  },

  clear(channel) {
    if (typeof channel === 'number') {
      const idx = resolveChannelIndex(channel, this.channelCount);
      this.buffers[idx]?.fill(0);
      this.snapshot[idx]?.fill(0);
      if (this._totals[idx] !== undefined) this._totals[idx] = 0;
      if (this._sumSquares[idx] !== undefined) this._sumSquares[idx] = 0;
      this._statsDirty = true;
      return;
    }
    for (let c = 0; c < this.channelCount; c++) {
      this.buffers[c]?.fill(0);
      this.snapshot[c]?.fill(0);
      if (this._totals[c] !== undefined) this._totals[c] = 0;
      if (this._sumSquares[c] !== undefined) this._sumSquares[c] = 0;
    }
    this._statsDirty = true;
  },

  index(ix, iy) {
    return iy * this.w + ix;
  },

  inBounds(ix, iy) {
    return ix >= 0 && iy >= 0 && ix < this.w && iy < this.h;
  },

  deposit(px, py, amount, channel = 0) {
    if (!CONFIG.signal.enabled) return;
    if (!this.buffers.length) return;
    const ix = Math.floor(px / this.cell);
    const iy = Math.floor(py / this.cell);
    if (!this.inBounds(ix, iy)) return;
    const i = this.index(ix, iy);
    const chan = resolveChannelIndex(channel, this.channelCount);
    const buf = this.buffers[chan];
    const prev = buf[i];
    const next = clamp01(prev + (amount || 0));
    if (next === prev) return;
    buf[i] = next;
    if (this._totals[chan] !== undefined) {
      this._totals[chan] += next - prev;
    }
    if (this._sumSquares[chan] !== undefined) {
      this._sumSquares[chan] += (next * next) - (prev * prev);
    }
    this._statsDirty = true;
  },

  sample(px, py, channel = 0) {
    if (!this.snapshot.length) return 0;
    const ix = Math.floor(px / this.cell);
    const iy = Math.floor(py / this.cell);
    if (!this.inBounds(ix, iy)) return 0;
    const chan = resolveChannelIndex(channel, this.channelCount);
    const snap = this.snapshot[chan];
    const i = this.index(ix, iy);
    return snap ? snap[i] : 0;
  },

  captureSnapshot() {
    if (!CONFIG.signal.enabled) return;
    if (!this.snapshot.length) return;
    for (let c = 0; c < this.channelCount; c++) {
      this.snapshot[c].set(this.buffers[c]);
    }
  },

  step(dt) {
    if (!CONFIG.signal.enabled) return;
    if (!this.buffers.length || !Number.isFinite(dt)) return;

    const decayRate = Math.max(0, CONFIG.signal.decayPerSec || 0) * dt;
    const diffuseRate = Math.max(0, CONFIG.signal.diffusePerSec || 0) * dt;

    for (let c = 0; c < this.channelCount; c++) {
      const buf = this.buffers[c];
      const tmp = this.tmp[c];
      let channelTotal = 0;
      let channelSumSq = 0;

      for (let i = 0; i < buf.length; i++) {
        const v = buf[i];
        buf[i] = v > 0 ? clamp01(v - decayRate * v) : 0;
      }

      if (diffuseRate > 0) {
        const w = this.w;
        const h = this.h;
        for (let y = 0; y < h; y++) {
          const yUp = y > 0 ? y - 1 : y;
          const yDn = y < h - 1 ? y + 1 : y;
          for (let x = 0; x < w; x++) {
            const xLt = x > 0 ? x - 1 : x;
            const xRt = x < w - 1 ? x + 1 : x;
            const i = y * w + x;
            const vC = buf[i];
            const vUp = buf[yUp * w + x];
            const vDn = buf[yDn * w + x];
            const vLt = buf[y * w + xLt];
            const vRt = buf[y * w + xRt];
            const mean = (vUp + vDn + vLt + vRt) * 0.25;
            const next = clamp01(vC + diffuseRate * (mean - vC));
            tmp[i] = next;
            channelTotal += next;
            channelSumSq += next * next;
          }
        }
        this.buffers[c] = tmp;
        this.tmp[c] = buf;
      } else {
        for (let i = 0; i < buf.length; i++) {
          const v = buf[i];
          channelTotal += v;
          channelSumSq += v * v;
        }
      }

      if (this._totals[c] !== undefined) this._totals[c] = channelTotal;
      if (this._sumSquares[c] !== undefined) this._sumSquares[c] = channelSumSq;
    }

    this._statsDirty = true;
    this._computeStats();
  },

  draw(ctx) {
    if (!CONFIG.signal.enabled) return;
    if (!this.buffers.length || !ctx) return;

    if (!this.img || this.img.width !== this.w || this.img.height !== this.h) {
      this.img = ctx.createImageData(this.w, this.h);
    }

    if (!this.offscreen) {
      this.offscreen = document.createElement('canvas');
      this.offscreenCtx = this.offscreen.getContext('2d');
    }

    if (!this.offscreenCtx) return;

    if (this.offscreen.width !== this.w || this.offscreen.height !== this.h) {
      this.offscreen.width = this.w;
      this.offscreen.height = this.h;
    }

    const data = this.img.data;
    const len = this.len;
    const palette = CHANNEL_COLORS;

    for (let i = 0; i < len; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let c = 0; c < this.channelCount; c++) {
        const value = this.buffers[c][i];
        if (value <= 0) continue;
        const strength = Math.pow(clamp01(value), 0.7);
        const color = palette[c % palette.length];
        r += color[0] * strength;
        g += color[1] * strength;
        b += color[2] * strength;
        a += strength;
      }
      const o = i * 4;
      data[o + 0] = Math.min(255, r);
      data[o + 1] = Math.min(255, g);
      data[o + 2] = Math.min(255, b);
      data[o + 3] = Math.min(255, a * 180);
    }

    this.offscreenCtx.putImageData(this.img, 0, 0);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(
      this.offscreen,
      0, 0, this.w, this.h,
      0, 0, this.w * this.cell, this.h * this.cell
    );
    ctx.restore();
  },

  _computeStats() {
    if (!this.buffers.length) {
      this._stats = {
        channels: 0,
        totalPower: [],
        mean: [],
        variance: [],
        localVariance: [],
        snr: [],
        diversity: 0
      };
      this._statsDirty = false;
      return;
    }

    const channelCount = this.channelCount;
    const len = Math.max(1, this.len);
    const totalPower = new Array(channelCount);
    const mean = new Array(channelCount);
    const variance = new Array(channelCount);
    const snr = new Array(channelCount);

    let diversity = 0;
    for (let c = 0; c < channelCount; c++) {
      const total = Number.isFinite(this._totals[c]) ? this._totals[c] : 0;
      const sumSq = Number.isFinite(this._sumSquares[c]) ? this._sumSquares[c] : 0;
      const m = total / len;
      const varValue = Math.max(0, (sumSq / len) - (m * m));
      totalPower[c] = total;
      mean[c] = m;
      variance[c] = varValue;
      snr[c] = varValue > 1e-9 ? (m * m) / (varValue + 1e-9) : 0;
      if (total > 1e-3) diversity += 1;
    }

    this._stats = {
      channels: channelCount,
      totalPower,
      mean,
      variance,
      localVariance: variance,
      snr,
      diversity
    };
    this._statsDirty = false;
  },

  getStats() {
    if (!CONFIG.signal.enabled || !this.buffers.length) {
      return {
        channels: this.channelCount,
        totalPower: [],
        mean: [],
        variance: [],
        localVariance: [],
        snr: [],
        diversity: 0
      };
    }
    if (this._statsDirty) {
      this._computeStats();
    }
    return this._stats;
  }
};

if (typeof window !== 'undefined') {
  window.SignalField = SignalField;
}
