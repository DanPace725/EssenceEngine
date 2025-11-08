const movementKeys = [
  'arrowup',
  'w',
  'arrowdown',
  's',
  'arrowleft',
  'a',
  'arrowright',
  'd'
];

export function initializeInputManager({
  canvas,
  getWorld,
  getTrail,
  getSignalField,
  getTrainingUI,
  getParticipationManager,
  CONFIG
}) {
  const held = new Set();
  const state = {
    showScentGradient: true,
    showFertility: false,
    hudDisplayMode: 'full',
    showAgentDashboard: false
  };
  let showHotkeyStrip = true;
  const modifierState = {
    shift: false,
    eKey: false
  };

  const updateModifierState = (event, isDown) => {
    const { code } = event || {};
    switch (code) {
      case 'ShiftLeft':
      case 'ShiftRight':
        modifierState.shift = isDown;
        break;
      case 'KeyE':
        modifierState.eKey = isDown;
        break;
      default:
        break;
    }
  };

  const getParticipation = () => {
    if (!CONFIG?.participation?.enabled) {
      return null;
    }
    if (typeof getParticipationManager !== 'function') {
      return null;
    }
    const manager = getParticipationManager();
    return manager && typeof manager.handlePointerEvent === 'function' ? manager : null;
  };

  const buildPointerPayload = (event) => {
    if (!event) return null;
    const rect = canvas?.getBoundingClientRect?.();
    const x = typeof event.offsetX === 'number'
      ? event.offsetX
      : typeof rect === 'object'
        ? event.clientX - rect.left
        : event.clientX;
    const y = typeof event.offsetY === 'number'
      ? event.offsetY
      : typeof rect === 'object'
        ? event.clientY - rect.top
        : event.clientY;

    return {
      x,
      y,
      button: event.button,
      buttons: event.buttons,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
      modifiers: {
        shift: Boolean(event.shiftKey || modifierState.shift),
        eKey: Boolean(modifierState.eKey),
        alt: Boolean(event.altKey),
        ctrl: Boolean(event.ctrlKey),
        meta: Boolean(event.metaKey)
      },
      nativeEvent: event
    };
  };

  const forwardPointerEvent = (type, event) => {
    const manager = getParticipation();
    if (!manager) {
      return;
    }
    const payload = buildPointerPayload(event);
    if (!payload) {
      return;
    }
    try {
      manager.handlePointerEvent(type, payload);
    } catch (error) {
      if (CONFIG?.participation?.debugLog && typeof console !== 'undefined' && console.debug) {
        console.debug('[Participation] Pointer handler error:', error);
      }
    }
  };

  const handlePointerDown = (event) => {
    forwardPointerEvent('pointerdown', event);
  };

  const handlePointerMove = (event) => {
    forwardPointerEvent('pointermove', event);
  };

  const handlePointerUp = (event) => {
    forwardPointerEvent('pointerup', event);
  };

  const handlePointerCancel = (event) => {
    forwardPointerEvent('pointercancel', event);
  };

  const handleKeydown = (event) => {
    const e = event || window.event;
    updateModifierState(e, true);
    const key = e.key.toLowerCase();
    if (movementKeys.includes(key)) {
      held.add(key);
    }

    const world = typeof getWorld === 'function' ? getWorld() : undefined;
    const trail = typeof getTrail === 'function' ? getTrail() : undefined;
    const signalField = typeof getSignalField === 'function' ? getSignalField() : undefined;
    const trainingUI = typeof getTrainingUI === 'function' ? getTrainingUI() : undefined;

    switch (e.code) {
      case 'Space':
        if (world) {
          if (typeof world.togglePause === 'function') {
            world.togglePause();
          } else if (typeof world.setPaused === 'function') {
            world.setPaused(!world.paused);
          } else {
            world.paused = !world.paused;
          }
          e.preventDefault();
        }
        break;
      case 'KeyR':
        world?.reset();
        break;
      case 'KeyK': {
        showHotkeyStrip = !showHotkeyStrip;
        const hotkeyStrip = document.getElementById('hotkey-strip');
        if (hotkeyStrip) {
          hotkeyStrip.classList.toggle('hidden', !showHotkeyStrip);
        }
        console.log(`⌨️  Hotkey strip ${showHotkeyStrip ? 'VISIBLE' : 'HIDDEN'}`);
        e.preventDefault();
        break;
      }
      case 'KeyC':
        world?.bundles?.forEach((bundle) => {
          bundle.chi += 5;
          bundle.alive = true;
          bundle.deathTick = -1;
          bundle.decayProgress = 0;
        });
        break;
      case 'KeyS':
        world?.bundles?.forEach((bundle) => {
          bundle.extendedSensing = !bundle.extendedSensing;
        });
        break;
      case 'KeyT':
        if (CONFIG) CONFIG.renderTrail = !CONFIG.renderTrail;
        break;
      case 'KeyX':
        trail?.clear?.();
        signalField?.clear?.();
        break;
      case 'KeyF':
        if (CONFIG) CONFIG.enableDiffusion = !CONFIG.enableDiffusion;
        break;
      case 'KeyA':
        if (CONFIG) CONFIG.autoMove = !CONFIG.autoMove;
        break;
      case 'KeyL':
        trainingUI?.toggle?.();
        break;
      case 'KeyG':
        state.showScentGradient = !state.showScentGradient;
        console.log(`🌸 Scent gradient visualization ${state.showScentGradient ? 'ENABLED' : 'DISABLED'}`);
        break;
      case 'KeyM':
        if (CONFIG?.mitosis) {
          CONFIG.mitosis.enabled = !CONFIG.mitosis.enabled;
          console.log(`🧫 Mitosis ${CONFIG.mitosis.enabled ? 'ENABLED' : 'DISABLED'}`);
        }
        break;
      case 'KeyP':
        state.showFertility = !state.showFertility;
        break;
      case 'KeyH':
        state.showAgentDashboard = !state.showAgentDashboard;
        break;
      case 'KeyU':
        if (state.hudDisplayMode === 'full') state.hudDisplayMode = 'minimal';
        else if (state.hudDisplayMode === 'minimal') state.hudDisplayMode = 'hidden';
        else state.hudDisplayMode = 'full';
        console.log(`📊 HUD mode: ${state.hudDisplayMode.toUpperCase()}`);
        break;
      case 'KeyV':
        world?.bundles?.forEach((bundle) => {
          bundle.visible = !bundle.visible;
        });
        break;
      case 'KeyE':
        if (canvas) {
          e.preventDefault();
          canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `essence-screenshot-${timestamp}.png`;
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            console.log(`📸 Screenshot saved: ${filename}`);
          }, 'image/png');
        }
        break;
      default:
        break;
    }
  };

  const handleKeyup = (event) => {
    const key = event.key.toLowerCase();
    held.delete(key);
    updateModifierState(event, false);
  };

  const handleBlur = () => {
    modifierState.shift = false;
    modifierState.eKey = false;
  };

  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('keyup', handleKeyup);
  window.addEventListener('blur', handleBlur);

  if (canvas && typeof canvas.addEventListener === 'function') {
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerCancel);
    canvas.addEventListener('pointerleave', handlePointerCancel);
  }

  const dispose = () => {
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('keyup', handleKeyup);
    window.removeEventListener('blur', handleBlur);
    if (canvas && typeof canvas.removeEventListener === 'function') {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerCancel);
      canvas.removeEventListener('pointerleave', handlePointerCancel);
    }
  };

  return { held, state, dispose };
}
