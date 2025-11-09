// Temporary module bridge for the legacy app entrypoint.
// Loads the existing app.js side effects and re-exports its window globals.
import '../app.js';

// Ensure refresh-like sizing at startup: run immediately and once next frame after load/pageshow
// CRITICAL: High-DPI displays (Surface laptops) need extra time for dimensions to stabilize
if (typeof window !== 'undefined') {
  const scheduleInitialResize = () => {
    if (typeof window.resizeCanvas === 'function') {
      console.log('[index.js] scheduleInitialResize called, devicePixelRatio:', window.devicePixelRatio);
      
      // First pass now
      window.resizeCanvas();
      
      // Second pass: wait for layout to fully settle (especially important on high-DPI)
      // Use double-RAF to ensure we're past the initial layout phase
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (typeof window.resizeCanvas === 'function') {
            console.log('[index.js] Second resize pass (after double RAF)');
            window.resizeCanvas();
          }
          
          // Third pass: aggressive timing for high-DPI displays
          // Surface laptops with scaling need extra time for display to stabilize
          if (window.devicePixelRatio > 1) {
            setTimeout(() => {
              if (typeof window.resizeCanvas === 'function') {
                console.log('[index.js] Third resize pass (high-DPI, after 50ms)');
                window.resizeCanvas();
              }
            }, 50);
            
            // Fourth pass: even more aggressive for stubborn Surface laptops
            setTimeout(() => {
              if (typeof window.resizeCanvas === 'function') {
                console.log('[index.js] Fourth resize pass (high-DPI, after 200ms)');
                window.resizeCanvas();
              }
            }, 200);
          }
        });
      });
    }
  };

  if (document.readyState === 'complete') {
    scheduleInitialResize();
  } else {
    window.addEventListener('load', scheduleInitialResize, { once: true });
  }

  // Handle bfcache restore or late visual adjustments
  window.addEventListener('pageshow', () => {
    window.requestAnimationFrame(() => {
      if (typeof window.resizeCanvas === 'function') {
        window.resizeCanvas();
      }
    });
  }, { once: true });
}

export const World = window.World;
export const resizeCanvas = window.resizeCanvas;
export const trainingUI = window.trainingUI;