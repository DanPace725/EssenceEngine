export function initializeCanvasManager({ canvas, ctx, getAvailableSize }) {
  if (!canvas) {
    throw new Error('initializeCanvasManager requires a canvas element');
  }

  let dpr = 1;
  // Use more stable dimension sources for high-DPI displays (Surface laptops, etc.)
  let canvasWidth = typeof window !== 'undefined' 
    ? (document.documentElement.clientWidth || window.innerWidth)
    : canvas?.width || 0;
  let canvasHeight = typeof window !== 'undefined' 
    ? (document.documentElement.clientHeight || window.innerHeight)
    : canvas?.height || 0;
  const resizeCallbacks = new Set();

  const applyResize = () => {
    if (typeof window !== 'undefined') {
      // Always read fresh DPR - critical for Surface laptops with display scaling
      dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    }

    const size = typeof getAvailableSize === 'function'
      ? getAvailableSize()
      : { width: canvasWidth, height: canvasHeight };

    canvasWidth = size?.width ?? canvasWidth;
    canvasHeight = size?.height ?? canvasHeight;

    const targetWidth = Math.floor(canvasWidth * dpr);
    const targetHeight = Math.floor(canvasHeight * dpr);

    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;

    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    if (canvas.style) {
      canvas.style.width = `${canvasWidth}px`;
      canvas.style.height = `${canvasHeight}px`;
      canvas.style.position = 'fixed';
      canvas.style.top = '0';
      canvas.style.left = '0';
    }

    for (const callback of resizeCallbacks) {
      callback({ width: canvasWidth, height: canvasHeight, dpr, canvas, ctx });
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', applyResize, { passive: true });
  }

  const onResize = (callback) => {
    if (typeof callback === 'function') {
      resizeCallbacks.add(callback);
      return () => resizeCallbacks.delete(callback);
    }
    return () => {};
  };

  const getState = () => ({ width: canvasWidth, height: canvasHeight, dpr });

  return { resizeCanvas: applyResize, onResize, getState };
}