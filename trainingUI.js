// Training UI for Slime-Bundle Learning System
// Provides controls and visualization for training

export class TrainingUI {
  constructor(container) {
    this.container = container;
    this.panel = null;
    this.isVisible = false;
    this.callbacks = {};
    
    this.createUI();
  }
  
  createUI() {
    // Create panel
    this.panel = document.createElement('div');
    this.panel.id = 'training-panel';
    this.panel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.85);
      color: #00ff88;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      padding: 15px;
      border: 2px solid #00ff88;
      border-radius: 5px;
      min-width: 320px;
      width: 320px;
      max-height: 80vh;
      overflow-y: auto;
      overflow-x: hidden;
      display: none;
      z-index: 1000;
      box-sizing: border-box;
    `;
    
    // Header
    const header = document.createElement('div');
    header.innerHTML = '<h3 style="margin:0 0 10px 0; color:#00ffff;">🧠 Training Control</h3>';
    this.panel.appendChild(header);
    
    // Mode selection
    const modeSection = this.createSection('Mode');
    modeSection.innerHTML += `
      <label style="display: block; margin: 5px 0;">
        <input type="radio" name="mode" value="play" checked> Play Mode (Heuristic AI)
      </label>
      <label style="display: block; margin: 5px 0;">
        <input type="radio" name="mode" value="train"> Training Mode (Learn Policy)
      </label>
    `;
    this.panel.appendChild(modeSection);
    
    // Training controls
    const trainingSection = this.createSection('Training');
    trainingSection.innerHTML += `
      <div style="margin: 10px 0;">
        <label style="display: block; margin-bottom: 5px;">Generations:</label>
        <input type="number" id="num-generations" value="10" min="1" max="100" 
               style="width: 100%; box-sizing: border-box; padding: 5px;">
      </div>
      <button id="start-training" style="margin: 5px 0;">▶️ Start Training</button>
      <button id="stop-training" style="margin: 5px 0;" disabled>⏸️ Stop</button>
      <button id="reset-learner" style="margin: 5px 0;">🔄 Reset Learner</button>
    `;
    this.panel.appendChild(trainingSection);
    
    // Stats display
    const statsSection = this.createSection('Statistics');
    statsSection.innerHTML += `
      <div id="training-stats" style="margin: 10px 0; font-size: 11px;">
        <div>Generation: <span id="stat-generation">0</span></div>
        <div>Policy: <span id="stat-policy">-</span></div>
        <div>Best Reward: <span id="stat-best">-</span></div>
        <div>Mean Reward: <span id="stat-mean">-</span></div>
        <div>Status: <span id="stat-status">Idle</span></div>
        <div style="margin-top:8px;">Signal Diversity: <span id="stat-signal-diversity">-</span></div>
        <div>Signal Coherence: <span id="stat-signal-coherence">-</span></div>
        <div>Signal SNR: <span id="stat-signal-snr">-</span></div>
        <div>Signal Power: <span id="stat-signal-power">-</span></div>
      </div>
    `;
    this.panel.appendChild(statsSection);
    
    // Policy management
    const policySection = this.createSection('Policy');
    policySection.innerHTML += `
      <button id="save-policy" style="margin: 5px 0;">💾 Save Best Policy</button>
      <button id="load-policy" style="margin: 5px 0;">📂 Load Policy</button>
      <div id="loaded-policy-info" style="margin: 10px 0; padding: 8px; background: rgba(255,255,0,0.1); border: 1px solid #ffff00; display: none; font-size: 10px;">
        <div style="font-weight: bold; color: #ffff00; margin-bottom: 4px;">📁 Loaded Policy:</div>
        <div id="policy-filename" style="color: #fff; margin-bottom: 4px;">None</div>
        <div id="policy-details" style="color: #aaa; font-size: 9px;">Generation: - | Reward: -</div>
      </div>
      <button id="use-policy" style="margin: 5px 0; display: none;">✅ Use This Policy</button>
      <button id="test-policy" style="margin: 5px 0;">🎮 Test Best Policy</button>
    `;
    this.panel.appendChild(policySection);
    
    // Chart placeholder
    const chartSection = this.createSection('Learning Curve');
    chartSection.innerHTML += `
      <canvas id="learning-chart" width="100" height="120" style="background: #111; border: 1px solid #333; display: block; max-width: 100%;"></canvas>
    `;
    this.panel.appendChild(chartSection);
    
    // Keyboard shortcut hint
    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top: 15px; font-size: 10px; color: #666; border-top: 1px solid #333; padding-top: 10px;';
    hint.innerHTML = 'Press [L] to toggle this panel';
    this.panel.appendChild(hint);
    
    this.container.appendChild(this.panel);
    
    // Attach event listeners
    this.attachEventListeners();
  }
  
  createSection(title) {
    const section = document.createElement('div');
    section.style.cssText = 'margin: 15px 0; padding: 10px; background: rgba(0,255,136,0.05); border-left: 3px solid #00ff88; box-sizing: border-box; overflow: hidden;';
    section.innerHTML = `<div style="font-weight: bold; margin-bottom: 8px; color: #00ffff;">${title}</div>`;
    return section;
  }
  
  attachEventListeners() {
    // Mode change
    this.panel.querySelectorAll('input[name="mode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (this.callbacks.onModeChange) {
          this.callbacks.onModeChange(e.target.value);
        }
      });
    });
    
    // Training buttons
    document.getElementById('start-training')?.addEventListener('click', () => {
      const gens = parseInt(document.getElementById('num-generations')?.value || 10);
      if (this.callbacks.onStartTraining) {
        this.callbacks.onStartTraining(gens);
      }
      document.getElementById('start-training').disabled = true;
      document.getElementById('stop-training').disabled = false;
    });
    
    document.getElementById('stop-training')?.addEventListener('click', () => {
      if (this.callbacks.onStopTraining) {
        this.callbacks.onStopTraining();
      }
      document.getElementById('start-training').disabled = false;
      document.getElementById('stop-training').disabled = true;
    });
    
    document.getElementById('reset-learner')?.addEventListener('click', () => {
      if (confirm('Reset learner and start fresh?')) {
        if (this.callbacks.onResetLearner) {
          this.callbacks.onResetLearner();
        }
      }
    });
    
    // Policy buttons
    document.getElementById('save-policy')?.addEventListener('click', () => {
      if (this.callbacks.onSavePolicy) {
        this.callbacks.onSavePolicy();
      }
    });
    
    document.getElementById('load-policy')?.addEventListener('click', () => {
      if (this.callbacks.onLoadPolicy) {
        this.callbacks.onLoadPolicy();
      }
    });
    
    document.getElementById('test-policy')?.addEventListener('click', () => {
      if (this.callbacks.onTestPolicy) {
        this.callbacks.onTestPolicy();
      }
    });
    
    document.getElementById('use-policy')?.addEventListener('click', () => {
      if (this.callbacks.onUsePolicy) {
        this.callbacks.onUsePolicy();
      }
    });
  }
  
  // Toggle visibility
  toggle() {
    this.isVisible = !this.isVisible;
    this.panel.style.display = this.isVisible ? 'block' : 'none';
  }
  
  show() {
    this.isVisible = true;
    this.panel.style.display = 'block';
  }
  
  hide() {
    this.isVisible = false;
    this.panel.style.display = 'none';
  }
  
  // Update statistics
  updateStats(stats) {
    document.getElementById('stat-generation').textContent = stats.generation || 0;
    document.getElementById('stat-policy').textContent = stats.currentPolicy !== undefined ?
      `${stats.currentPolicy + 1}/${stats.populationSize}` : '-';
    document.getElementById('stat-best').textContent = stats.bestReward ?
      stats.bestReward.toFixed(2) : '-';
    document.getElementById('stat-mean').textContent = stats.meanReward ?
      stats.meanReward.toFixed(2) : '-';
    document.getElementById('stat-status').textContent = stats.status || 'Idle';
  }

  updateSignalStats(signal) {
    if (!signal) return;
    const { channelCount = 0, diversity = 0, coherence = 0, snr = [], totalPower = [] } = signal;

    const diversityEl = document.getElementById('stat-signal-diversity');
    if (diversityEl) {
      const ratio = channelCount ? `${diversity}/${channelCount}` : `${diversity}`;
      diversityEl.textContent = ratio;
    }

    const coherenceEl = document.getElementById('stat-signal-coherence');
    if (coherenceEl) {
      coherenceEl.textContent = `${(coherence * 100).toFixed(1)}%`;
    }

    const snrEl = document.getElementById('stat-signal-snr');
    if (snrEl) {
      snrEl.textContent = snr.length ? snr.map((v, i) => `C${i}:${v.toFixed(2)}`).join(' ') : '-';
    }

    const powerEl = document.getElementById('stat-signal-power');
    if (powerEl) {
      powerEl.textContent = totalPower.length ? totalPower.map((v, i) => `C${i}:${v.toFixed(1)}`).join(' ') : '-';
    }
  }
  
  // Show loaded policy info
  showLoadedPolicyInfo(filename, generation, bestReward) {
    const infoDiv = document.getElementById('loaded-policy-info');
    const filenameDiv = document.getElementById('policy-filename');
    const detailsDiv = document.getElementById('policy-details');
    const useButton = document.getElementById('use-policy');
    
    if (infoDiv && filenameDiv && detailsDiv && useButton) {
      infoDiv.style.display = 'block';
      filenameDiv.textContent = filename;
      detailsDiv.textContent = `Generation: ${generation} | Best Reward: ${bestReward ? bestReward.toFixed(2) : 'N/A'}`;
      useButton.style.display = 'block';
    }
  }
  
  // Hide loaded policy info
  hideLoadedPolicyInfo() {
    const infoDiv = document.getElementById('loaded-policy-info');
    const useButton = document.getElementById('use-policy');
    
    if (infoDiv) infoDiv.style.display = 'none';
    if (useButton) useButton.style.display = 'none';
  }
  
  // Draw learning curve
  drawLearningCurve(history) {
    const canvas = document.getElementById('learning-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);
    
    if (!history || history.length === 0) return;
    
    // Find min/max rewards
    const bestRewards = history.map(h => h.bestReward);
    const meanRewards = history.map(h => h.meanReward);
    const minReward = Math.min(...bestRewards, ...meanRewards);
    const maxReward = Math.max(...bestRewards, ...meanRewards);
    const range = maxReward - minReward || 1;
    
    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = (i / 4) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Helper function to draw line
    const drawLine = (data, color) => {
      if (data.length < 2) return;
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      data.forEach((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((val - minReward) / range) * height;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
    };
    
    // Draw lines
    drawLine(meanRewards, '#ffaa00');  // orange for mean
    drawLine(bestRewards, '#00ff88');  // green for best
    
    // Legend
    ctx.fillStyle = '#ffaa00';
    ctx.fillText('Mean', 5, 15);
    ctx.fillStyle = '#00ff88';
    ctx.fillText('Best', 50, 15);
  }
  
  // Register callbacks
  on(event, callback) {
    this.callbacks[event] = callback;
  }
}

// Style button helper
function styleButton(btn) {
  btn.style.cssText = `
    background: #00ff88;
    color: #000;
    border: none;
    padding: 8px 15px;
    cursor: pointer;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    width: 100%;
    font-weight: bold;
  `;
  
  btn.onmouseenter = () => {
    btn.style.background = '#00ffff';
  };
  
  btn.onmouseleave = () => {
    btn.style.background = '#00ff88';
  };
}

// Apply button styles
setTimeout(() => {
  document.querySelectorAll('#training-panel button').forEach(styleButton);
}, 0);

