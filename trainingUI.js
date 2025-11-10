// Training UI for Essence Engine Learning System
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
      top: 60px;
      right: 10px;
      background: rgba(0, 0, 0, 0.9);
      color: #00ff88;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      padding: 15px;
      border: 2px solid #00ff88;
      border-radius: 5px;
      min-width: 380px;
      width: 380px;
      max-height: 85vh;
      overflow-y: auto;
      overflow-x: hidden;
      display: none;
      z-index: 1001;
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
      <div style="display: flex; gap: 5px; margin-bottom: 8px;">
        <button id="start-training" style="flex: 1;">▶️ Start Training</button>
        <button id="stop-training" style="flex: 1;" disabled>⏸️ Stop</button>
      </div>
      <button id="reset-learner" style="width: 100%; margin: 5px 0;">🔄 Reset Learner</button>
    `;
    this.panel.appendChild(trainingSection);
    
    // Stats display
    const statsSection = this.createSection('Statistics');
    statsSection.innerHTML += `
      <div id="training-stats" style="margin: 10px 0; font-size: 12px;">
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
      <div style="display: flex; gap: 5px; margin-bottom: 8px;">
        <button id="save-policy" style="flex: 1;">💾 Save Best</button>
        <button id="load-policy" style="flex: 1;">📂 Load</button>
      </div>
      <div id="loaded-policy-info" style="margin: 10px 0; padding: 8px; background: rgba(255,255,0,0.1); border: 1px solid #ffff00; display: none; font-size: 12px;">
        <div style="font-weight: bold; color: #ffff00; margin-bottom: 4px;">📁 Loaded Policy:</div>
        <div id="policy-filename" style="color: #fff; margin-bottom: 4px;">None</div>
        <div id="policy-details" style="color: #aaa; font-size: 12px;">Generation: - | Reward: -</div>
      </div>
      <div style="display: flex; gap: 5px; margin-bottom: 8px;">
        <button id="use-policy" style="flex: 1; display: none;">✅ Use Policy</button>
        <button id="test-policy" style="flex: 1;">🎮 Test Best</button>
      </div>
      <div style="margin-top: 10px; border-top: 1px solid #333; padding-top: 10px;">
        <div style="font-size: 12px; color: #888; margin-bottom: 5px;">Training Metrics Export:</div>
        <button id="export-metrics" style="width: 100%; margin: 5px 0;">📊 Export Training Metrics</button>
        <div style="display: flex; gap: 5px; margin-top: 8px;">
          <button id="export-state" style="flex: 1;">📁 Export State</button>
          <button id="import-state" style="flex: 1;">📂 Import State</button>
        </div>
      </div>
    `;
    this.panel.appendChild(policySection);
    
    // Baseline metrics collection
    const baselineSection = this.createSection('Baseline Metrics');
    baselineSection.innerHTML += `
      <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">
        Collect metrics from heuristic AI in play mode to establish baseline performance.
      </div>
      <div style="display: flex; gap: 5px; margin-bottom: 8px;">
        <button id="start-baseline" style="flex: 1;">▶️ Start</button>
        <button id="stop-baseline" style="flex: 1;" disabled>⏸️ Stop</button>
      </div>
      <div id="baseline-status" style="font-size: 12px; color: #888; margin: 5px 0; min-height: 14px;">
        Not collecting
      </div>
      <button id="export-baseline" style="width: 100%; margin: 5px 0;">📊 Export Baseline Metrics</button>
    `;
    this.panel.appendChild(baselineSection);


    // Config Optimization section
    const configOptSection = this.createSection('Config Optimization');
    configOptSection.innerHTML += `
      <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">
        Use CEM to optimize CONFIG parameters based on composite metrics.
      </div>
      <div style="margin: 10px 0;">
        <label style="display: block; margin-bottom: 5px; font-size: 12px;">Objective:</label>
        <select id="config-objective" style="width: 100%; box-sizing: border-box; padding: 5px; background: #222; color: #0f8; border: 1px solid #444;">
          <option value="balanced">Balanced (F+C+R)</option>
          <option value="F">Foraging (F)</option>
          <option value="C">Collective (C)</option>
          <option value="R">Resilient (R)</option>
        </select>
      </div>
      <div style="margin: 10px 0;">
        <label style="display: block; margin-bottom: 5px; font-size: 12px;">Generations:</label>
        <input type="number" id="config-generations" value="5" min="1" max="50"
               style="width: 100%; box-sizing: border-box; padding: 5px; background: #222; color: #0f8; border: 1px solid #444;">
      </div>
      <div style="display: flex; gap: 5px; margin-bottom: 8px;">
        <button id="start-config-opt" style="flex: 1;">🚀 Start</button>
        <button id="stop-config-opt" style="flex: 1;" disabled>⏸️ Stop</button>
      </div>
      <div id="config-opt-stats" style="font-size: 12px; color: #888; margin: 8px 0; padding: 8px; background: rgba(0,0,0,0.3); border: 1px solid #333;">
        <div>Generation: <span id="config-gen">0</span></div>
        <div>Best Fitness: <span id="config-best-fit">-</span></div>
        <div>Convergence: <span id="config-convergence">-</span></div>
        <div style="margin-top: 5px; color: #666; font-size: 12px;">Status: <span id="config-status">Idle</span></div>
      </div>
      <div style="display: flex; gap: 5px; margin-bottom: 5px;">
        <button id="save-config" style="flex: 1; font-size: 12px;">💾 Save</button>
        <button id="load-config" style="flex: 1; font-size: 12px;">📂 Load</button>
      </div>
      <div style="display: flex; gap: 5px;">
        <button id="apply-config" style="flex: 1; font-size: 12px;" disabled>✅ Apply</button>
        <button id="test-config" style="flex: 1; font-size: 12px;" disabled>🎮 Test</button>
      </div>
      <div style="font-size: 12px; color: #666; margin-top: 5px; padding: 5px; background: rgba(0,0,0,0.3); border-radius: 3px;">
        💡 <strong>Apply</strong> updates CONFIG values<br>
        💡 <strong>Test</strong> applies + resets world for visual testing
      </div>
    `;
    this.panel.appendChild(configOptSection);
    
    // Chart placeholder
    const chartSection = this.createSection('Learning Curve');
    chartSection.innerHTML += `
      <canvas id="learning-chart" width="100" height="120" style="background: #111; border: 1px solid #333; display: block; max-width: 100%;"></canvas>
    `;
    this.panel.appendChild(chartSection);
    
    // Keyboard shortcut hint
    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top: 15px; font-size: 12px; color: #666; border-top: 1px solid #333; padding-top: 10px;';
    hint.innerHTML = 'Press [L] to toggle this panel';
    this.panel.appendChild(hint);
    
    this.container.appendChild(this.panel);
    
    // Attach event listeners
    this.attachEventListeners();
  }
  
  createSection(title) {
    const section = document.createElement('div');
    section.style.cssText = 'margin: 12px 0; padding: 8px; background: rgba(0,255,136,0.05); border-left: 2px solid #00ff88; box-sizing: border-box;';
    section.innerHTML = `<div style="font-weight: bold; margin-bottom: 6px; color: #00ffff; font-size: 11px;">${title}</div>`;
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
    
    document.getElementById('export-metrics')?.addEventListener('click', () => {
      if (this.callbacks.onExportMetrics) {
        this.callbacks.onExportMetrics();
      }
    });

    document.getElementById('export-state')?.addEventListener('click', () => {
      if (this.callbacks.onExportState) {
        this.callbacks.onExportState();
      }
    });

    document.getElementById('import-state')?.addEventListener('click', () => {
      if (this.callbacks.onLoadState) {
        this.callbacks.onLoadState();
      }
    });
    
    // Baseline collection buttons
    document.getElementById('start-baseline')?.addEventListener('click', () => {
      if (this.callbacks.onStartBaseline) {
        this.callbacks.onStartBaseline();
      }
    });
    
    document.getElementById('stop-baseline')?.addEventListener('click', () => {
      if (this.callbacks.onStopBaseline) {
        this.callbacks.onStopBaseline();
      }
    });
    
    document.getElementById('export-baseline')?.addEventListener('click', () => {
      if (this.callbacks.onExportBaseline) {
        this.callbacks.onExportBaseline();
      }
    });
    
    // Config optimization buttons
    document.getElementById('start-config-opt')?.addEventListener('click', () => {
      const objective = document.getElementById('config-objective')?.value || 'balanced';
      const generations = parseInt(document.getElementById('config-generations')?.value || 5);
      if (this.callbacks.onStartConfigOpt) {
        this.callbacks.onStartConfigOpt(objective, generations);
      }
      document.getElementById('start-config-opt').disabled = true;
      document.getElementById('stop-config-opt').disabled = false;
    });
    
    document.getElementById('stop-config-opt')?.addEventListener('click', () => {
      if (this.callbacks.onStopConfigOpt) {
        this.callbacks.onStopConfigOpt();
      }
    });
    
    document.getElementById('save-config')?.addEventListener('click', () => {
      if (this.callbacks.onSaveConfig) {
        this.callbacks.onSaveConfig();
      }
    });
    
    document.getElementById('load-config')?.addEventListener('click', () => {
      if (this.callbacks.onLoadConfig) {
        this.callbacks.onLoadConfig();
      }
    });
    
    document.getElementById('apply-config')?.addEventListener('click', () => {
      if (this.callbacks.onApplyConfig) {
        this.callbacks.onApplyConfig();
      }
    });
    
    document.getElementById('test-config')?.addEventListener('click', () => {
      if (this.callbacks.onTestConfig) {
        this.callbacks.onTestConfig();
      }
    });

  }


  // Update baseline collection status
  updateBaselineStatus(isCollecting, snapshotCount = 0) {
    const statusEl = document.getElementById('baseline-status');
    const startBtn = document.getElementById('start-baseline');
    const stopBtn = document.getElementById('stop-baseline');
    
    if (statusEl) {
      if (isCollecting) {
        statusEl.textContent = `✅ Collecting... (${snapshotCount} snapshots)`;
        statusEl.style.color = '#00ff88';
      } else {
        statusEl.textContent = snapshotCount > 0 
          ? `Ready to export (${snapshotCount} snapshots)`
          : 'Not collecting';
        statusEl.style.color = snapshotCount > 0 ? '#ffaa00' : '#888';
      }
    }
    
    if (startBtn) startBtn.disabled = isCollecting;
    if (stopBtn) stopBtn.disabled = !isCollecting;
  }
  
  // Update config optimization stats
  updateConfigOptStats(stats) {
    const genEl = document.getElementById('config-gen');
    const fitEl = document.getElementById('config-best-fit');
    const convEl = document.getElementById('config-convergence');
    const statusEl = document.getElementById('config-status');
    const applyBtn = document.getElementById('apply-config');
    const testBtn = document.getElementById('test-config');
    
    if (genEl) genEl.textContent = stats.generation !== undefined ? stats.generation : '0';
    if (fitEl) fitEl.textContent = stats.bestFitness !== undefined ? stats.bestFitness.toFixed(3) : '-';
    if (convEl) {
      const convergence = stats.convergence !== undefined ? stats.convergence : 0;
      convEl.textContent = `${(convergence * 100).toFixed(1)}%`;
    }
    if (statusEl) statusEl.textContent = stats.status || 'Idle';
    
    // Enable apply/test buttons if we have a best config
    const hasConfig = stats.hasBestConfig;
    if (applyBtn) {
      applyBtn.disabled = !hasConfig;
    }
    if (testBtn) {
      testBtn.disabled = !hasConfig;
    }
  }
  
  // Reset config optimization UI
  resetConfigOptUI() {
    const startBtn = document.getElementById('start-config-opt');
    const stopBtn = document.getElementById('stop-config-opt');
    
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    
    this.updateConfigOptStats({
      status: 'Idle',
      hasBestConfig: false
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

// Adaptive Heuristics Panel - Dedicated UI for real-time parameter learning
export class AdaptiveHeuristicsUI {
  constructor(container, trainingModule) {
    this.container = container;
    this.trainingModule = trainingModule;
    this.panel = null;
    this.isVisible = false;
    this.parameterHistory = [];
    this.maxHistoryPoints = 100;

    this.createUI();
    this.startPeriodicUpdates();
  }

  createUI() {
    // Create panel
    this.panel = document.createElement('div');
    this.panel.id = 'adaptive-heuristics-panel';
    this.panel.style.cssText = `
      position: fixed;
      top: 60px;
      right: 10px;
      background: rgba(0, 0, 0, 0.9);
      color: #00ff88;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      padding: 15px;
      border: 2px solid #00ff88;
      border-radius: 5px;
      min-width: 380px;
      width: 380px;
      max-height: 85vh;
      overflow-y: auto;
      overflow-x: hidden;
      display: none;
      z-index: 1001;
      box-sizing: border-box;
    `;

    // Header
    const header = document.createElement('div');
    header.innerHTML = '<h3 style="margin:0 0 8px 0; color:#00ffff;">🧠 Adaptive Heuristics</h3>';
    this.panel.appendChild(header);

    // Status section
    const statusSection = this.createSection('Status');
    statusSection.innerHTML += `
      <div id="ah-status" style="font-size: 12px; color: #888; margin: 5px 0;">
        Disabled
      </div>
      <div id="ah-stats" style="font-size: 12px; color: #ccc; margin: 5px 0;">
        <div>Samples: <span id="ah-samples">0</span></div>
        <div>Avg Reward: <span id="ah-reward">0.00</span></div>
      </div>
    `;
    this.panel.appendChild(statusSection);

    // Quick controls
    const controlsSection = this.createSection('Controls');
    controlsSection.innerHTML += `
      <div style="display: flex; gap: 5px; margin-bottom: 8px;">
        <button id="ah-toggle" style="flex: 1;">▶️ Start Learning</button>
        <button id="ah-reset" style="flex: 1;">🔄 Reset</button>
      </div>
      <div style="display: flex; gap: 5px;">
        <button id="ah-save" style="flex: 1;">💾 Save</button>
        <button id="ah-load" style="flex: 1;">📂 Load</button>
      </div>
    `;
    this.panel.appendChild(controlsSection);

    // Live parameters
    const paramsSection = this.createSection('Live Parameters');
    paramsSection.innerHTML += `
      <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">
        Color coding: <span style="color: #4dffaa;">🟢 >1.0</span> <span style="color: #ff8866;">🔴 <1.0</span> <span style="color: #ccc;">⚪ =1.0</span>
      </div>
      <div id="ah-params" style="font-size: 12px; color: #ccc;">
        <div style="margin-bottom: 4px;"><strong style="color: #88ffff;">Movement:</strong></div>
        <div>• Speed: <span id="ah-speed">1.00</span> • Cost: <span id="ah-cost">1.00</span> • Wall Avoid: <span id="ah-wall">1.00</span></div>
        <div>• Resource Seek: <span id="ah-resource">1.00</span></div>

        <div style="margin: 6px 0 4px 0;"><strong style="color: #88ffff;">Exploration:</strong></div>
        <div>• Noise Base: <span id="ah-noise-base">1.00</span> • Noise Gain: <span id="ah-noise-gain">1.00</span> • Sense Range: <span id="ah-sense">1.00</span></div>

        <div style="margin: 6px 0 4px 0;"><strong style="color: #88ffff;">Trails:</strong></div>
        <div>• Deposit: <span id="ah-deposit">1.00</span> • Follow: <span id="ah-follow">1.00</span> • Sample Dist: <span id="ah-sample">1.00</span></div>

        <div style="margin: 6px 0 4px 0;"><strong style="color: #88ffff;">Frustration:</strong></div>
        <div>• Build Rate: <span id="ah-build">1.00</span> • Decay Rate: <span id="ah-decay">1.00</span></div>

        <div style="margin: 6px 0 4px 0;"><strong style="color: #88ffff;">Hunger Amps:</strong></div>
        <div>• Explore: <span id="ah-hunger-exp">1.00</span> • Frust: <span id="ah-hunger-frust">1.00</span> • Sense: <span id="ah-hunger-sense">1.00</span></div>
      </div>
    `;
    this.panel.appendChild(paramsSection);

    // Learning curves section
    const curvesSection = this.createSection('Learning Curves');
    curvesSection.innerHTML += `
      <div style="font-size: 12px; color: #aaa; margin-bottom: 5px;">
        Reward trends (last ${this.maxHistoryPoints} samples)
      </div>
      <canvas id="ah-learning-chart" width="100" height="80" style="background: #111; border: 1px solid #333; display: block; max-width: 100%;"></canvas>
      <div style="font-size: 12px; color: #666; margin-top: 5px;">
        <span style="color: #00ff88;">▬ Best</span> <span style="color: #ffaa00;">▬ Avg</span>
      </div>
    `;
    this.panel.appendChild(curvesSection);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = 'margin-top: 15px; font-size: 12px; color: #666; border-top: 1px solid #333; padding-top: 8px;';
    footer.innerHTML = 'Press [Y] to toggle • Learns in real-time during play';
    this.panel.appendChild(footer);

    this.container.appendChild(this.panel);

    // Attach event listeners
    this.attachEventListeners();

    // Style buttons
    setTimeout(() => {
      this.panel.querySelectorAll('button').forEach(styleButton);
    }, 0);
  }

  createSection(title) {
    const section = document.createElement('div');
    section.style.cssText = 'margin: 12px 0; padding: 8px; background: rgba(0,255,136,0.05); border-left: 2px solid #00ff88; box-sizing: border-box;';
    section.innerHTML = `<div style="font-weight: bold; margin-bottom: 6px; color: #00ffff; font-size: 11px;">${title}</div>`;
    return section;
  }

  attachEventListeners() {
    document.getElementById('ah-toggle')?.addEventListener('click', () => {
      const ah = this.trainingModule?.getAdaptiveHeuristics?.();
      if (!ah) return;

      const isActive = ah.isActive;
      if (isActive) {
        ah.toggle(); // Stop learning
        this.updateStatus(ah.getStats());
      } else {
        ah.toggle(); // Start learning
        this.updateStatus(ah.getStats());
      }
    });

    document.getElementById('ah-reset')?.addEventListener('click', () => {
      if (confirm('Reset adaptive heuristics learning?')) {
        this.trainingModule?.resetAdaptiveHeuristics?.();
        const ah = this.trainingModule?.getAdaptiveHeuristics?.();
        this.updateStatus(ah ? ah.getStats() : null);
      }
    });

    document.getElementById('ah-save')?.addEventListener('click', () => {
      const ah = this.trainingModule?.getAdaptiveHeuristics?.();
      if (!ah) return;

      const state = ah.save();
      const json = JSON.stringify(state, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `adaptive-heuristics-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log('Adaptive heuristics state saved!');
    });

    document.getElementById('ah-load')?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const state = JSON.parse(event.target.result);
            this.trainingModule?.getAdaptiveHeuristics?.()?.load(state);
            const ah = this.trainingModule?.getAdaptiveHeuristics?.();
            this.updateStatus(ah ? ah.getStats() : null);
            console.log('Adaptive heuristics state loaded!');
          } catch (err) {
            console.error('Failed to load adaptive heuristics:', err);
            alert('Failed to load file');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });
  }

  updateStatus(stats) {
    const statusEl = document.getElementById('ah-status');
    const samplesEl = document.getElementById('ah-samples');
    const rewardEl = document.getElementById('ah-reward');

    if (statusEl && stats) {
      statusEl.textContent = stats.isActive ? '✅ ACTIVE - Learning' : '⏸️ Disabled';
      statusEl.style.color = stats.isActive ? '#00ff88' : '#888';
    }

    if (samplesEl) {
      samplesEl.textContent = stats ? (stats.rewardHistory?.length || 0).toLocaleString() : '0';
    }

    if (rewardEl) {
      rewardEl.textContent = stats ? stats.avgReward?.toFixed(2) : '0.00';
    }

    this.updateParameters(stats);
    this.updateLearningCurve(stats);
  }

  updateParameters(stats) {
    if (!stats?.currentMultipliers) return;

    const m = stats.currentMultipliers;

    // Movement
    this.updateParam('ah-speed', m.moveSpeedPxPerSec);
    this.updateParam('ah-cost', m.moveCostPerSecond);
    this.updateParam('ah-wall', m.wallAvoidStrength);
    this.updateParam('ah-resource', m.resourceAttractionStrength);

    // Exploration
    this.updateParam('ah-noise-base', m.exploreNoiseBase);
    this.updateParam('ah-noise-gain', m.exploreNoiseGain);
    this.updateParam('ah-sense', m.sensoryRangeBase);

    // Trails
    this.updateParam('ah-deposit', m.depositPerSec);
    this.updateParam('ah-follow', m.trailFollowingFar);
    this.updateParam('ah-sample', m.aiSampleDistance);

    // Frustration
    this.updateParam('ah-build', m.frustrationBuildRate);
    this.updateParam('ah-decay', m.frustrationDecayRate);

    // Hunger Amplifiers
    this.updateParam('ah-hunger-exp', m.hungerExplorationAmp);
    this.updateParam('ah-hunger-frust', m.hungerFrustrationAmp);
    this.updateParam('ah-hunger-sense', m.hungerSenseAmp);
  }

  updateParam(id, value) {
    const el = document.getElementById(id);
    if (el) {
      const val = value?.toFixed(2) || '1.00';
      el.textContent = val;

      // Color coding
      if (value > 1.1) {
        el.style.color = '#4dffaa';
      } else if (value < 0.9) {
        el.style.color = '#ff8866';
      } else {
        el.style.color = '#ccc';
      }
    }
  }

  updateLearningCurve(stats) {
    const canvas = document.getElementById('ah-learning-chart');
    if (!canvas || !stats?.parameterHistory?.length) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);

    const history = stats.parameterHistory.slice(-this.maxHistoryPoints);
    if (history.length < 2) return;

    // Get reward values
    const rewards = history.map(h => h.reward);
    const minReward = Math.min(...rewards);
    const maxReward = Math.max(...rewards);
    const range = maxReward - minReward || 1;

    // Draw curves
    this.drawCurve(ctx, rewards, '#ffaa00', width, height, minReward, range); // Avg (orange)

    // Legend
    ctx.fillStyle = '#ffaa00';
    ctx.font = '9px monospace';
    ctx.fillText('Reward', 5, 12);
  }

  drawCurve(ctx, data, color, width, height, minVal, range) {
    if (data.length < 2) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();

    data.forEach((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - minVal) / range) * height;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
  }

  startPeriodicUpdates() {
    setInterval(() => {
      if (this.isVisible && this.trainingModule?.getAdaptiveHeuristics) {
        const ah = this.trainingModule.getAdaptiveHeuristics();
        if (ah) {
          this.updateStatus(ah.getStats());
        }
      }
    }, 250); // Update every 250ms when visible
  }

  toggle() {
    this.isVisible = !this.isVisible;
    this.panel.style.display = this.isVisible ? 'block' : 'none';

    if (this.isVisible) {
      // Refresh data when shown
      const ah = this.trainingModule?.getAdaptiveHeuristics?.();
      if (ah) {
        this.updateStatus(ah.getStats());
      }
    }
  }

  show() {
    this.isVisible = true;
    this.panel.style.display = 'block';

    const ah = this.trainingModule?.getAdaptiveHeuristics?.();
    if (ah) {
      this.updateStatus(ah.getStats());
    }
  }

  hide() {
    this.isVisible = false;
    this.panel.style.display = 'none';
  }
}

// Style button helper
function styleButton(btn) {
  btn.style.cssText = `
    background: #00ff88;
    color: #000;
    border: none;
    padding: 6px 10px;
    cursor: pointer;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 10px;
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
  document.querySelectorAll('#training-panel button, #adaptive-heuristics-panel button').forEach(styleButton);
}, 0);

