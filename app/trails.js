// app/trails.js - Trail system management

export class TrailSystem {
    constructor(CONFIG) {
        this.CONFIG = CONFIG;
        this.w = 0;
        this.h = 0;
        this.cell = CONFIG.trailCell;
        this.buf = null;
        this.tmp = null;
        this.snapshot = null;
        this.authorBuf = null;
        this.authorSnapshot = null;
        this.timestampBuf = null;
        this.timestampSnapshot = null;
        this.img = null;
        this.offscreen = null;
        this.offscreenCtx = null;
    }

    resize(canvasWidth, canvasHeight, ctx) {
        // Preserve old dimensions and buffers
        const oldW = this.w;
        const oldH = this.h;
        const oldBuf = this.buf;
        const oldAuthorBuf = this.authorBuf;
        const oldTimestampBuf = this.timestampBuf;
        
        // Calculate new dimensions
        this.cell = this.CONFIG.trailCell;
        this.w = Math.max(1, Math.floor(canvasWidth / this.cell));
        this.h = Math.max(1, Math.floor(canvasHeight / this.cell));
        const len = this.w * this.h;
        
        // Create new buffers
        this.buf = new Float32Array(len);
        this.tmp = new Float32Array(len);
        this.snapshot = new Float32Array(len);
        this.authorBuf = new Uint32Array(len);
        this.authorSnapshot = new Uint32Array(len);
        this.timestampBuf = new Uint32Array(len);
        this.timestampSnapshot = new Uint32Array(len);
        this.img = ctx.createImageData(this.w, this.h);
        this.offscreen = document.createElement('canvas');
        this.offscreen.width = this.w;
        this.offscreen.height = this.h;
        this.offscreenCtx = this.offscreen.getContext('2d');
        
        // Copy old data to new buffers if possible
        if (oldBuf && oldW > 0 && oldH > 0) {
            const copyW = Math.min(oldW, this.w);
            const copyH = Math.min(oldH, this.h);
            for (let y = 0; y < copyH; y++) {
                for (let x = 0; x < copyW; x++) {
                    const oldIdx = y * oldW + x;
                    const newIdx = y * this.w + x;
                    this.buf[newIdx] = oldBuf[oldIdx];
                    if (oldAuthorBuf) this.authorBuf[newIdx] = oldAuthorBuf[oldIdx];
                    if (oldTimestampBuf) this.timestampBuf[newIdx] = oldTimestampBuf[oldIdx];
                }
            }
        }
    }

    clear() {
        if (this.buf) this.buf.fill(0);
        if (this.authorBuf) this.authorBuf.fill(0);
        if (this.timestampBuf) this.timestampBuf.fill(0);
    }

    index(ix, iy) {
        return iy * this.w + ix;
    }

    inBounds(ix, iy) {
        return ix >= 0 && iy >= 0 && ix < this.w && iy < this.h;
    }

    deposit(px, py, amount, authorId) {
        const ix = Math.floor(px / this.cell);
        const iy = Math.floor(py / this.cell);
        if (!this.inBounds(ix, iy)) return;
        const i = this.index(ix, iy);
        this.buf[i] = Math.min(1, this.buf[i] + amount);
        this.authorBuf[i] = authorId;
        this.timestampBuf[i] = globalTick;
    }

    sample(px, py) {
        const ix = Math.floor(px / this.cell);
        const iy = Math.floor(py / this.cell);
        if (!this.inBounds(ix, iy)) return { value: 0, authorId: 0, age: Infinity };
        const i = this.index(ix, iy);
        const value = this.snapshot[i];
        const authorId = this.authorSnapshot[i];
        const timestamp = this.timestampSnapshot[i];
        const age = globalTick - timestamp;
        return { value, authorId, age };
    }

    captureSnapshot() {
        if (this.buf) {
            this.snapshot.set(this.buf);
            this.authorSnapshot.set(this.authorBuf);
            this.timestampSnapshot.set(this.timestampBuf);
        }
    }

    applySnapshot(snapshot) {
        if (!snapshot) return;
        if (Array.isArray(snapshot.snapshot) && this.buf && this.snapshot) {
            try {
                this.buf.set(new Float32Array(snapshot.snapshot));
                this.captureSnapshot();
            } catch (err) {
                console.warn('Failed to apply trail snapshot:', err);
            }
        }
        if (Array.isArray(snapshot.authorSnapshot) && this.authorBuf) {
            try { this.authorBuf.set(new Uint32Array(snapshot.authorSnapshot)); this.authorSnapshot.set(this.authorBuf); }
            catch (err) { console.warn('Failed to apply trail author snapshot:', err); }
        }
        if (Array.isArray(snapshot.timestampSnapshot) && this.timestampBuf) {
            try { this.timestampBuf.set(new Uint32Array(snapshot.timestampSnapshot)); this.timestampSnapshot.set(this.timestampBuf); }
            catch (err) { console.warn('Failed to apply trail timestamp snapshot:', err); }
        }
    }

    step(dt) {
        if (!this.buf) return;

        // Evaporation
        const k = this.CONFIG.evapPerSec * dt;
        for (let i = 0; i < this.buf.length; i++) {
            const v = this.buf[i];
            this.buf[i] = v > 0 ? Math.max(0, v - k * v) : 0;
        }

        // Diffusion (if enabled)
        if (this.CONFIG.enableDiffusion) {
            const a = this.CONFIG.diffusePerSec * dt;
            if (a > 0) {
                this.diffuse(a);
            }
        }
    }

    diffuse(a) {
        const w = this.w;
        const h = this.h;
        const src = this.buf;
        const dst = this.tmp;

        for (let y = 0; y < h; y++) {
            const yUp = (y > 0) ? y-1 : y;
            const yDn = (y < h-1) ? y+1 : y;
            for (let x = 0; x < w; x++) {
                const xLt = (x > 0) ? x-1 : x;
                const xRt = (x < w-1) ? x+1 : x;
                const iC = y*w + x;
                const vC = src[iC];
                const vUp = src[yUp*w + x];
                const vDn = src[yDn*w + x];
                const vLt = src[y*w + xLt];
                const vRt = src[y*w + xRt];
                const mean = (vUp + vDn + vLt + vRt) * 0.25;
                dst[iC] = clamp(vC + a * (mean - vC), 0, 1);
            }
        }

        // Swap buffers
        [this.buf, this.tmp] = [this.tmp, this.buf];
    }

    draw(ctx, getAgentColorRGB) {
        if (!this.CONFIG.renderTrail || !this.buf || !this.offscreen) return;
        const data = this.img.data;

        for (let i = 0; i < this.buf.length; i++) {
            const v = this.buf[i];
            const authorId = this.authorBuf[i];
            const baseStrength = Math.pow(v, 0.55);
            const glowStrength = Math.pow(v, 0.85);
            const highlightStrength = Math.pow(v, 1.35);
            const o = i * 4;

            // Get color based on author ID
            const color = authorId !== 0 ? getAgentColorRGB(authorId) : { r: 140, g: 140, b: 140 };
            const highlightedColor = {
                r: Math.min(255, color.r + (255 - color.r) * highlightStrength * 0.45),
                g: Math.min(255, color.g + (255 - color.g) * highlightStrength * 0.45),
                b: Math.min(255, color.b + (255 - color.b) * highlightStrength * 0.45)
            };

            data[o+0] = Math.floor(highlightedColor.r * baseStrength);
            data[o+1] = Math.floor(highlightedColor.g * baseStrength);
            data[o+2] = Math.floor(highlightedColor.b * baseStrength);
            data[o+3] = Math.min(255, glowStrength * 210 + highlightStrength * 45);
        }

        const octx = this.offscreenCtx;
        if (!octx) return;

        octx.putImageData(this.img, 0, 0);

        const destW = this.w * this.cell;
        const destH = this.h * this.cell;
        const blurPx = Math.max(1.5, this.cell * 0.85);
        const outerPad = Math.max(this.cell * 0.8, 2);
        const midBlur = Math.max(0.75, this.cell * 0.45);

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.imageSmoothingEnabled = true;

        // Outer glow
        ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
        ctx.globalAlpha = 0.55;
        ctx.drawImage(
            this.offscreen,
            0, 0, this.w, this.h,
            -outerPad, -outerPad,
            destW + outerPad * 2,
            destH + outerPad * 2
        );

        // Middle glow
        ctx.filter = `blur(${midBlur.toFixed(2)}px)`;
        ctx.globalAlpha = 0.35;
        ctx.drawImage(
            this.offscreen,
            0, 0, this.w, this.h,
            -this.cell * 0.4,
            -this.cell * 0.4,
            destW + this.cell * 0.8,
            destH + this.cell * 0.8
        );

        // Core trail
        ctx.filter = 'none';
        ctx.globalAlpha = 0.9;
        ctx.drawImage(
            this.offscreen,
            0, 0, this.w, this.h,
            0, 0, destW, destH
        );

        ctx.restore();
    }
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}