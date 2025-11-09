// Policy Batch Analyzer - Compare multiple policies and export results
// Usage: node policyBatchAnalyzer.js policy1.json policy2.json policy3.json --format csv

const fs = require('fs');

function loadPolicy(filename) {
  try {
    const data = fs.readFileSync(filename, 'utf8');
    const policy = JSON.parse(data);
    policy._filename = filename;
    return policy;
  } catch (err) {
    console.error(`Error loading ${filename}: ${err.message}`);
    return null;
  }
}

function parseWeights(weights) {
  return {
    turn: { weights: weights.slice(0, 15), bias: weights[45] },
    thrust: { weights: weights.slice(15, 30), bias: weights[46] },
    senseFrac: { weights: weights.slice(30, 45), bias: weights[47] }
  };
}

function calculateResourceSeekingScore(weights) {
  const parsed = parseWeights(weights);
  
  const resDxTurn = Math.abs(parsed.turn.weights[8]);
  const resDyTurn = Math.abs(parsed.turn.weights[9]);
  const resDxThrust = Math.abs(parsed.thrust.weights[8]);
  const resDyThrust = Math.abs(parsed.thrust.weights[9]);
  const resVisThrust = Math.max(0, parsed.thrust.weights[10]);
  
  return (resDxTurn + resDyTurn + resDxThrust + resDyThrust + resVisThrust) / 5;
}

function analyzePolicy(policy) {
  const parsed = parseWeights(policy.bestWeights);
  const sigmaAvg = policy.sigma.reduce((a, b) => a + b, 0) / policy.sigma.length;
  const collapsed = policy.sigma.filter(s => s <= 0.01).length;
  
  const history = policy.history || [];
  const lastGen = history[history.length - 1] || {};
  
  // Key weights for resource-seeking
  const resourceWeights = {
    turn_resDx: parsed.turn.weights[8],
    turn_resDy: parsed.turn.weights[9],
    turn_resVis: parsed.turn.weights[10],
    thrust_resDx: parsed.thrust.weights[8],
    thrust_resDy: parsed.thrust.weights[9],
    thrust_resVis: parsed.thrust.weights[10],
    sense_resVis: parsed.senseFrac.weights[10]
  };
  
  // Key weights for survival
  const survivalWeights = {
    turn_wallMag: parsed.turn.weights[7],
    thrust_wallMag: parsed.thrust.weights[7],
    turn_chi: parsed.turn.weights[0],
    thrust_chi: parsed.thrust.weights[0]
  };
  
  return {
    filename: policy._filename,
    generation: policy.generation,
    bestReward: policy.bestReward,
    meanReward: lastGen.meanReward || 0,
    eliteMeanReward: lastGen.eliteMeanReward || 0,
    sigmaAvg: sigmaAvg,
    sigmaMin: Math.min(...policy.sigma),
    sigmaMax: Math.max(...policy.sigma),
    collapsedPct: (collapsed / 48) * 100,
    resourceScore: calculateResourceSeekingScore(policy.bestWeights),
    resourceWeights: resourceWeights,
    survivalWeights: survivalWeights,
    historyLength: history.length
  };
}

function exportToCSV(analyses, outputFile) {
  const headers = [
    'Filename', 'Generation', 'BestReward', 'MeanReward', 'EliteMean',
    'AvgSigma', 'MinSigma', 'MaxSigma', 'CollapsedPct', 'ResourceScore',
    'Turn_resDx', 'Turn_resDy', 'Turn_resVis',
    'Thrust_resDx', 'Thrust_resDy', 'Thrust_resVis',
    'Sense_resVis',
    'Turn_wallMag', 'Thrust_wallMag', 'Turn_chi', 'Thrust_chi'
  ];
  
  const rows = analyses.map(a => [
    a.filename,
    a.generation,
    a.bestReward.toFixed(4),
    a.meanReward.toFixed(4),
    a.eliteMeanReward.toFixed(4),
    a.sigmaAvg.toFixed(6),
    a.sigmaMin.toFixed(6),
    a.sigmaMax.toFixed(6),
    a.collapsedPct.toFixed(2),
    a.resourceScore.toFixed(6),
    a.resourceWeights.turn_resDx.toFixed(6),
    a.resourceWeights.turn_resDy.toFixed(6),
    a.resourceWeights.turn_resVis.toFixed(6),
    a.resourceWeights.thrust_resDx.toFixed(6),
    a.resourceWeights.thrust_resDy.toFixed(6),
    a.resourceWeights.thrust_resVis.toFixed(6),
    a.resourceWeights.sense_resVis.toFixed(6),
    a.survivalWeights.turn_wallMag.toFixed(6),
    a.survivalWeights.thrust_wallMag.toFixed(6),
    a.survivalWeights.turn_chi.toFixed(6),
    a.survivalWeights.thrust_chi.toFixed(6)
  ]);
  
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  
  fs.writeFileSync(outputFile, csv);
  console.log(`\n✓ CSV exported to: ${outputFile}`);
}

function exportToJSON(analyses, policies, outputFile) {
  const data = {
    timestamp: new Date().toISOString(),
    numPolicies: analyses.length,
    summary: {
      generations: analyses.map(a => a.generation),
      bestRewards: analyses.map(a => a.bestReward),
      resourceScores: analyses.map(a => a.resourceScore),
      avgSigmas: analyses.map(a => a.sigmaAvg)
    },
    policies: analyses,
    fullPolicies: policies
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
  console.log(`✓ JSON exported to: ${outputFile}`);
}

function exportToHTML(analyses, outputFile) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Policy Comparison Report</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #1a1a2e;
      color: #eee;
      padding: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }
    h1 { color: #00ffaa; text-align: center; }
    h2 { color: #00ccff; border-bottom: 2px solid #00ccff; padding-bottom: 10px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      background: #16213e;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    }
    th {
      background: #0f3460;
      padding: 12px;
      text-align: left;
      color: #00ffaa;
      font-weight: bold;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #2a2a4e;
    }
    tr:hover { background: #1f2b4e; }
    .good { color: #00ff88; font-weight: bold; }
    .warn { color: #ffaa00; font-weight: bold; }
    .bad { color: #ff5555; font-weight: bold; }
    .metric { font-size: 0.9em; color: #aaa; }
    .chart-container {
      background: #16213e;
      padding: 20px;
      margin: 20px 0;
      border-radius: 8px;
    }
    .bar {
      display: inline-block;
      background: linear-gradient(90deg, #00ffaa, #00ccff);
      height: 20px;
      margin: 2px 0;
      border-radius: 4px;
    }
    .stat-box {
      display: inline-block;
      background: #16213e;
      padding: 15px 25px;
      margin: 10px;
      border-radius: 8px;
      border: 2px solid #0f3460;
      min-width: 150px;
    }
    .stat-label { color: #888; font-size: 0.9em; }
    .stat-value { color: #00ffaa; font-size: 1.5em; font-weight: bold; }
  </style>
</head>
<body>
  <h1>🧠 Essence Engine Policy Comparison Report</h1>
  <p style="text-align: center; color: #888;">Generated: ${new Date().toLocaleString()}</p>
  
  <h2>📊 Summary Statistics</h2>
  <div style="text-align: center;">
    <div class="stat-box">
      <div class="stat-label">Policies Analyzed</div>
      <div class="stat-value">${analyses.length}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Generation Range</div>
      <div class="stat-value">${Math.min(...analyses.map(a => a.generation))} - ${Math.max(...analyses.map(a => a.generation))}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Best Reward</div>
      <div class="stat-value">${Math.max(...analyses.map(a => a.bestReward)).toFixed(2)}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Avg Resource Score</div>
      <div class="stat-value">${(analyses.reduce((s, a) => s + a.resourceScore, 0) / analyses.length).toFixed(3)}</div>
    </div>
  </div>

  <h2>📈 Performance Comparison</h2>
  <table>
    <tr>
      <th>File</th>
      <th>Gen</th>
      <th>Best Reward</th>
      <th>Mean Reward</th>
      <th>Resource Score</th>
      <th>Convergence</th>
      <th>Status</th>
    </tr>
    ${analyses.map(a => {
      const statusClass = a.resourceScore > 0.3 ? 'good' : a.resourceScore > 0.1 ? 'warn' : 'bad';
      const status = a.resourceScore > 0.3 ? '✓ Strong' : a.resourceScore > 0.1 ? '⚠ Moderate' : '✗ Weak';
      const convClass = a.collapsedPct > 80 ? 'bad' : a.collapsedPct > 50 ? 'warn' : 'good';
      
      return `<tr>
        <td>${a.filename}</td>
        <td>${a.generation}</td>
        <td>${a.bestReward.toFixed(2)}</td>
        <td>${a.meanReward.toFixed(2)}</td>
        <td class="${statusClass}">${a.resourceScore.toFixed(3)}</td>
        <td class="${convClass}">${a.collapsedPct.toFixed(1)}% collapsed</td>
        <td class="${statusClass}">${status}</td>
      </tr>`;
    }).join('')}
  </table>

  <h2>🎯 Resource-Seeking Weights</h2>
  <table>
    <tr>
      <th>File</th>
      <th>Gen</th>
      <th>Turn→resDx</th>
      <th>Turn→resDy</th>
      <th>Thrust→resVis</th>
      <th>Overall Score</th>
    </tr>
    ${analyses.map(a => {
      const colorWeight = (w) => Math.abs(w) > 0.2 ? 'good' : Math.abs(w) > 0.05 ? 'warn' : 'bad';
      return `<tr>
        <td>${a.filename}</td>
        <td>${a.generation}</td>
        <td class="${colorWeight(a.resourceWeights.turn_resDx)}">${a.resourceWeights.turn_resDx.toFixed(4)}</td>
        <td class="${colorWeight(a.resourceWeights.turn_resDy)}">${a.resourceWeights.turn_resDy.toFixed(4)}</td>
        <td class="${a.resourceWeights.thrust_resVis > 0.2 ? 'good' : 'bad'}">${a.resourceWeights.thrust_resVis.toFixed(4)}</td>
        <td class="${a.resourceScore > 0.3 ? 'good' : a.resourceScore > 0.1 ? 'warn' : 'bad'}">${a.resourceScore.toFixed(3)}</td>
      </tr>`;
    }).join('')}
  </table>

  <h2>📉 Learning Progress</h2>
  <div class="chart-container">
    <h3>Best Reward Over Generations</h3>
    ${analyses.map(a => {
      const maxReward = Math.max(...analyses.map(x => Math.abs(x.bestReward)));
      const width = (Math.abs(a.bestReward) / maxReward) * 100;
      const color = a.bestReward > 20 ? '#00ff88' : a.bestReward > 0 ? '#00ccff' : '#ff5555';
      return `
        <div style="margin: 10px 0;">
          <span style="display: inline-block; width: 150px; color: #aaa;">Gen ${a.generation}</span>
          <div class="bar" style="width: ${width}%; background: ${color};"></div>
          <span style="margin-left: 10px; color: ${color};">${a.bestReward.toFixed(2)}</span>
        </div>
      `;
    }).join('')}
  </div>

  <div class="chart-container">
    <h3>Resource-Seeking Score Over Generations</h3>
    ${analyses.map(a => {
      const width = (a.resourceScore / 0.5) * 100; // Scale to max 0.5
      const color = a.resourceScore > 0.3 ? '#00ff88' : a.resourceScore > 0.1 ? '#ffaa00' : '#ff5555';
      return `
        <div style="margin: 10px 0;">
          <span style="display: inline-block; width: 150px; color: #aaa;">Gen ${a.generation}</span>
          <div class="bar" style="width: ${Math.min(100, width)}%; background: ${color};"></div>
          <span style="margin-left: 10px; color: ${color};">${a.resourceScore.toFixed(3)}</span>
        </div>
      `;
    }).join('')}
  </div>

  <h2>🔍 Detailed Weight Analysis</h2>
  <table>
    <tr>
      <th>Generation</th>
      <th>Avg Sigma</th>
      <th>Collapsed %</th>
      <th>Turn→wallMag</th>
      <th>Thrust→wallMag</th>
      <th>Turn→chi</th>
      <th>Thrust→chi</th>
    </tr>
    ${analyses.map(a => `<tr>
      <td>${a.generation}</td>
      <td class="${a.sigmaAvg < 0.02 ? 'bad' : a.sigmaAvg < 0.05 ? 'warn' : 'good'}">${a.sigmaAvg.toFixed(4)}</td>
      <td class="${a.collapsedPct > 80 ? 'bad' : a.collapsedPct > 50 ? 'warn' : 'good'}">${a.collapsedPct.toFixed(1)}%</td>
      <td>${a.survivalWeights.turn_wallMag.toFixed(4)}</td>
      <td>${a.survivalWeights.thrust_wallMag.toFixed(4)}</td>
      <td>${a.survivalWeights.turn_chi.toFixed(4)}</td>
      <td>${a.survivalWeights.thrust_chi.toFixed(4)}</td>
    </tr>`).join('')}
  </table>

  <h2>💡 Key Insights</h2>
  <div class="chart-container">
    ${analyses.length > 1 ? `
      <p><strong>Performance Trend:</strong> 
        ${analyses[analyses.length - 1].bestReward > analyses[0].bestReward ? 
          '<span class="good">Improving ↑</span>' : 
          '<span class="bad">Declining ↓</span>'}
        (${((analyses[analyses.length - 1].bestReward - analyses[0].bestReward) / Math.abs(analyses[0].bestReward) * 100).toFixed(1)}%)
      </p>
      <p><strong>Resource-Seeking Trend:</strong>
        ${analyses[analyses.length - 1].resourceScore > analyses[0].resourceScore ?
          '<span class="good">Improving ↑</span>' :
          '<span class="bad">Declining ↓</span>'}
        (${analyses[0].resourceScore.toFixed(3)} → ${analyses[analyses.length - 1].resourceScore.toFixed(3)})
      </p>
      <p><strong>Convergence Status:</strong>
        ${analyses[analyses.length - 1].collapsedPct > 80 ?
          '<span class="bad">⚠ Highly converged - may be stuck</span>' :
          analyses[analyses.length - 1].collapsedPct > 50 ?
          '<span class="warn">⚠ Converging</span>' :
          '<span class="good">✓ Still exploring</span>'}
      </p>
    ` : '<p>Load multiple policies to see trends!</p>'}
    
    <p><strong>Best Performing Policy:</strong> 
      ${analyses.reduce((best, a) => a.bestReward > best.bestReward ? a : best).filename}
      (Gen ${analyses.reduce((best, a) => a.bestReward > best.bestReward ? a : best).generation}, 
      Reward: ${Math.max(...analyses.map(a => a.bestReward)).toFixed(2)})
    </p>
    
    <p><strong>Best Resource-Seeking Policy:</strong>
      ${analyses.reduce((best, a) => a.resourceScore > best.resourceScore ? a : best).filename}
      (Gen ${analyses.reduce((best, a) => a.resourceScore > best.resourceScore ? a : best).generation},
      Score: ${Math.max(...analyses.map(a => a.resourceScore)).toFixed(3)})
    </p>
  </div>

  <div style="margin-top: 40px; padding: 20px; background: #16213e; border-radius: 8px; border-left: 4px solid #00ffaa;">
    <h3 style="margin-top: 0;">📊 Interpretation Guide</h3>
    <p><strong>Resource Score:</strong> < 0.1 = Weak, 0.1-0.3 = Moderate, > 0.3 = Strong</p>
    <p><strong>Collapsed %:</strong> < 50% = Exploring, 50-80% = Converging, > 80% = Stuck</p>
    <p><strong>Best Reward:</strong> Negative = dying early, 0-20 = collecting 1-2 resources, > 20 = good performance</p>
    <p><strong>Weights:</strong> > 0.2 = Strong influence, 0.05-0.2 = Moderate, < 0.05 = Weak/ignored</p>
  </div>
</body>
</html>`;
  
  fs.writeFileSync(outputFile, html);
  console.log(`✓ HTML report exported to: ${outputFile}`);
}

function printSummary(analyses) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 BATCH POLICY ANALYSIS SUMMARY');
  console.log('='.repeat(80) + '\n');
  
  console.log(`Policies analyzed: ${analyses.length}`);
  console.log(`Generation range: ${Math.min(...analyses.map(a => a.generation))} - ${Math.max(...analyses.map(a => a.generation))}`);
  console.log(`Best reward: ${Math.max(...analyses.map(a => a.bestReward)).toFixed(2)}`);
  console.log(`Worst reward: ${Math.min(...analyses.map(a => a.bestReward)).toFixed(2)}`);
  
  const avgResourceScore = analyses.reduce((s, a) => s + a.resourceScore, 0) / analyses.length;
  console.log(`Average resource-seeking score: ${avgResourceScore.toFixed(3)}`);
  
  console.log('\n' + '-'.repeat(80));
  console.log('Gen | Filename                      | Reward  | ResScore | Collapsed | Status');
  console.log('-'.repeat(80));
  
  analyses.forEach(a => {
    const status = a.resourceScore > 0.3 ? '✓ Strong' : 
                   a.resourceScore > 0.1 ? '⚠ Moderate' : 
                   '✗ Weak';
    const filename = a.filename.padEnd(28).substring(0, 28);
    console.log(
      `${String(a.generation).padStart(3)} | ${filename} | ` +
      `${a.bestReward.toFixed(2).padStart(7)} | ` +
      `${a.resourceScore.toFixed(3).padStart(8)} | ` +
      `${(a.collapsedPct.toFixed(1) + '%').padStart(9)} | ${status}`
    );
  });
  
  if (analyses.length > 1) {
    console.log('\n' + '-'.repeat(80));
    console.log('TRENDS:');
    const first = analyses[0];
    const last = analyses[analyses.length - 1];
    const rewardChange = last.bestReward - first.bestReward;
    const resourceChange = last.resourceScore - first.resourceScore;
    
    console.log(`  Reward:   ${first.bestReward.toFixed(2)} → ${last.bestReward.toFixed(2)} (${rewardChange > 0 ? '+' : ''}${rewardChange.toFixed(2)})`);
    console.log(`  Resource: ${first.resourceScore.toFixed(3)} → ${last.resourceScore.toFixed(3)} (${resourceChange > 0 ? '+' : ''}${resourceChange.toFixed(3)})`);
    console.log(`  Sigma:    ${first.sigmaAvg.toFixed(4)} → ${last.sigmaAvg.toFixed(4)}`);
  }
  
  console.log('\n');
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log('Essence Engine Policy Batch Analyzer\n');
    console.log('Usage:');
    console.log('  node policyBatchAnalyzer.js <policy1> <policy2> ... [options]\n');
    console.log('Options:');
    console.log('  --format csv         Export to CSV file');
    console.log('  --format json        Export to JSON file');
    console.log('  --format html        Export to HTML report');
    console.log('  --output <filename>  Specify output filename\n');
    console.log('Examples:');
    console.log('  node policyBatchAnalyzer.js slime-policy-gen*.json');
    console.log('  node policyBatchAnalyzer.js gen10.json gen20.json gen30.json --format csv');
    console.log('  node policyBatchAnalyzer.js gen*.json --format html --output report.html');
    process.exit(0);
  }
  
  // Parse arguments
  const formatIdx = args.indexOf('--format');
  const format = formatIdx !== -1 ? args[formatIdx + 1] : null;
  
  const outputIdx = args.indexOf('--output');
  const outputFilename = outputIdx !== -1 ? args[outputIdx + 1] : null;
  
  // Get policy files
  const policyFiles = args.filter(arg => 
    !arg.startsWith('--') && 
    arg !== format && 
    arg !== outputFilename
  );
  
  if (policyFiles.length === 0) {
    console.error('Error: No policy files specified');
    process.exit(1);
  }
  
  // Load policies
  console.log(`Loading ${policyFiles.length} policies...`);
  const policies = policyFiles.map(loadPolicy).filter(p => p !== null);
  
  if (policies.length === 0) {
    console.error('Error: No valid policies loaded');
    process.exit(1);
  }
  
  // Analyze all policies
  const analyses = policies.map(analyzePolicy);
  
  // Sort by generation
  analyses.sort((a, b) => a.generation - b.generation);
  
  // Print summary
  printSummary(analyses);
  
  // Export if requested
  if (format) {
    const defaultFilenames = {
      csv: 'policy-comparison.csv',
      json: 'policy-comparison.json',
      html: 'policy-comparison.html'
    };
    
    const outputFile = outputFilename || defaultFilenames[format] || `policy-comparison.${format}`;
    
    switch (format) {
      case 'csv':
        exportToCSV(analyses, outputFile);
        break;
      case 'json':
        exportToJSON(analyses, policies, outputFile);
        break;
      case 'html':
        exportToHTML(analyses, outputFile);
        break;
      default:
        console.error(`Unknown format: ${format}`);
        console.log('Supported formats: csv, json, html');
        process.exit(1);
    }
  } else {
    console.log('Tip: Use --format csv|json|html to export results');
  }
}

main();

