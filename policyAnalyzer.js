// Policy Analyzer - Interprets and compares Essence Engine policies
// Usage: node policyAnalyzer.js slime-policy-gen6.json slime-policy-gen20.json

const fs = require('fs');

// Observation feature names (matching observations.js)
const OBS_NAMES = [
  'chi',           // 0
  'frustration',   // 1
  'alive',         // 2
  'vx',            // 3
  'vy',            // 4
  'wallNx',        // 5
  'wallNy',        // 6
  'wallMag',       // 7
  'resDx',         // 8  ← Resource direction X
  'resDy',         // 9  ← Resource direction Y
  'resVisible',    // 10 ← Resource visible flag
  'trailMean',     // 11
  'trailMax',      // 12
  'trailDirX',     // 13
  'trailDirY'      // 14
];

const ACTION_NAMES = ['turn', 'thrust', 'senseFrac'];

// Color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function loadPolicy(filename) {
  try {
    const data = fs.readFileSync(filename, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`${COLORS.red}Error loading ${filename}: ${err.message}${COLORS.reset}`);
    process.exit(1);
  }
}

function parseWeights(weights) {
  // 48 total weights: 15 obs × 3 actions = 45 weights + 3 biases
  const parsed = {
    turn: { weights: [], bias: 0 },
    thrust: { weights: [], bias: 0 },
    senseFrac: { weights: [], bias: 0 }
  };
  
  // First 15: obs → turn
  parsed.turn.weights = weights.slice(0, 15);
  parsed.turn.bias = weights[45];
  
  // Next 15: obs → thrust
  parsed.thrust.weights = weights.slice(15, 30);
  parsed.thrust.bias = weights[46];
  
  // Last 15: obs → senseFrac
  parsed.senseFrac.weights = weights.slice(30, 45);
  parsed.senseFrac.bias = weights[47];
  
  return parsed;
}

function analyzeWeights(weights, obsNames = OBS_NAMES) {
  const analysis = weights.map((w, i) => ({
    feature: obsNames[i],
    weight: w,
    magnitude: Math.abs(w),
    direction: w > 0 ? 'positive' : w < 0 ? 'negative' : 'neutral'
  }));
  
  // Sort by magnitude (most influential first)
  analysis.sort((a, b) => b.magnitude - a.magnitude);
  
  return analysis;
}

function colorWeight(weight) {
  if (Math.abs(weight) < 0.05) return COLORS.gray;
  if (weight > 0.2) return COLORS.green;
  if (weight < -0.2) return COLORS.red;
  if (weight > 0) return COLORS.cyan;
  return COLORS.yellow;
}

function printPolicyAnalysis(policy, showAll = false) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${COLORS.bright}${COLORS.cyan}Policy Analysis: Generation ${policy.generation}${COLORS.reset}`);
  console.log(`${'='.repeat(80)}`);
  
  console.log(`\n${COLORS.bright}Performance:${COLORS.reset}`);
  console.log(`  Best Reward: ${policy.bestReward.toFixed(2)}`);
  
  if (policy.history && policy.history.length > 0) {
    const lastGen = policy.history[policy.history.length - 1];
    console.log(`  Mean Reward: ${lastGen.meanReward.toFixed(2)}`);
    console.log(`  Elite Mean:  ${lastGen.eliteMeanReward.toFixed(2)}`);
  }
  
  console.log(`\n${COLORS.bright}Convergence:${COLORS.reset}`);
  const sigmaAvg = policy.sigma.reduce((a, b) => a + b, 0) / policy.sigma.length;
  const sigmaMin = Math.min(...policy.sigma);
  const sigmaMax = Math.max(...policy.sigma);
  const collapsed = policy.sigma.filter(s => s <= 0.01).length;
  
  console.log(`  Average σ:     ${sigmaAvg.toFixed(4)}`);
  console.log(`  σ Range:       ${sigmaMin.toFixed(4)} - ${sigmaMax.toFixed(4)}`);
  console.log(`  Collapsed:     ${collapsed}/48 weights (${(collapsed/48*100).toFixed(1)}%)`);
  if (collapsed > 40) {
    console.log(`  ${COLORS.yellow}⚠️  Warning: High convergence! May be stuck in local optimum${COLORS.reset}`);
  }
  
  // Parse best weights
  const parsed = parseWeights(policy.bestWeights);
  
  // Analyze each action
  for (const [actionName, data] of Object.entries(parsed)) {
    console.log(`\n${COLORS.bright}${COLORS.magenta}Action: ${actionName.toUpperCase()}${COLORS.reset}`);
    console.log(`  Bias: ${data.bias.toFixed(4)}`);
    
    const analysis = analyzeWeights(data.weights);
    
    console.log(`\n  Top Influential Features:`);
    const limit = showAll ? 15 : 5;
    for (let i = 0; i < Math.min(limit, analysis.length); i++) {
      const item = analysis[i];
      const color = colorWeight(item.weight);
      const bar = '█'.repeat(Math.floor(item.magnitude * 50));
      console.log(`    ${item.feature.padEnd(12)} ${color}${item.weight.toFixed(4)}${COLORS.reset} ${bar}`);
    }
  }
  
  // Highlight resource-seeking behavior
  console.log(`\n${COLORS.bright}${COLORS.cyan}Resource-Seeking Analysis:${COLORS.reset}`);
  
  const resDxTurn = parsed.turn.weights[8];
  const resDyTurn = parsed.turn.weights[9];
  const resVisTurn = parsed.turn.weights[10];
  
  const resDxThrust = parsed.thrust.weights[8];
  const resDyThrust = parsed.thrust.weights[9];
  const resVisThrust = parsed.thrust.weights[10];
  
  console.log(`  Turn Response:`);
  console.log(`    resDx      → ${colorWeight(resDxTurn)}${resDxTurn.toFixed(4)}${COLORS.reset} ${resDxTurn > 0.1 ? '✓ Good' : resDxTurn < -0.1 ? '✗ Wrong direction!' : '⚠ Weak'}`);
  console.log(`    resDy      → ${colorWeight(resDyTurn)}${resDyTurn.toFixed(4)}${COLORS.reset} ${Math.abs(resDyTurn) > 0.1 ? '✓' : '⚠ Weak'}`);
  console.log(`    resVisible → ${colorWeight(resVisTurn)}${resVisTurn.toFixed(4)}${COLORS.reset}`);
  
  console.log(`  Thrust Response:`);
  console.log(`    resDx      → ${colorWeight(resDxThrust)}${resDxThrust.toFixed(4)}${COLORS.reset}`);
  console.log(`    resDy      → ${colorWeight(resDyThrust)}${resDyThrust.toFixed(4)}${COLORS.reset}`);
  console.log(`    resVisible → ${colorWeight(resVisThrust)}${resVisThrust.toFixed(4)}${COLORS.reset} ${resVisThrust > 0.2 ? '✓ Good!' : '⚠ Should be positive'}`);
  
  const resourceScore = (Math.abs(resDxTurn) + Math.abs(resDyTurn) + Math.abs(resDxThrust) + Math.abs(resDyThrust) + Math.max(0, resVisThrust)) / 5;
  console.log(`\n  Resource-Seeking Score: ${resourceScore.toFixed(3)} ${resourceScore > 0.3 ? '✓ Strong' : resourceScore > 0.1 ? '⚠ Moderate' : '✗ Weak'}`);
}

function comparePolices(policy1, policy2) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${COLORS.bright}${COLORS.yellow}Comparison: Gen ${policy1.generation} → Gen ${policy2.generation}${COLORS.reset}`);
  console.log(`${'='.repeat(80)}`);
  
  // Performance improvement
  const rewardDiff = policy2.bestReward - policy1.bestReward;
  const rewardPct = (rewardDiff / Math.abs(policy1.bestReward)) * 100;
  
  console.log(`\n${COLORS.bright}Performance Change:${COLORS.reset}`);
  console.log(`  Best Reward:  ${policy1.bestReward.toFixed(2)} → ${policy2.bestReward.toFixed(2)}`);
  console.log(`  Change:       ${rewardDiff > 0 ? COLORS.green : COLORS.red}${rewardDiff > 0 ? '+' : ''}${rewardDiff.toFixed(2)} (${rewardPct > 0 ? '+' : ''}${rewardPct.toFixed(1)}%)${COLORS.reset}`);
  
  // Convergence change
  const sigma1Avg = policy1.sigma.reduce((a, b) => a + b, 0) / policy1.sigma.length;
  const sigma2Avg = policy2.sigma.reduce((a, b) => a + b, 0) / policy2.sigma.length;
  
  console.log(`\n${COLORS.bright}Exploration Change:${COLORS.reset}`);
  console.log(`  Avg σ:        ${sigma1Avg.toFixed(4)} → ${sigma2Avg.toFixed(4)}`);
  console.log(`  Change:       ${sigma2Avg < sigma1Avg ? '↓ Converging' : '↑ Exploring more'}`);
  
  // Weight changes for key features
  const parsed1 = parseWeights(policy1.bestWeights);
  const parsed2 = parseWeights(policy2.bestWeights);
  
  console.log(`\n${COLORS.bright}Key Weight Changes:${COLORS.reset}`);
  
  const keyFeatures = [
    { idx: 8, name: 'resDx', label: 'Resource Dir X' },
    { idx: 9, name: 'resDy', label: 'Resource Dir Y' },
    { idx: 10, name: 'resVisible', label: 'Resource Visible' },
    { idx: 0, name: 'chi', label: 'Chi Level' },
    { idx: 7, name: 'wallMag', label: 'Wall Proximity' }
  ];
  
  for (const action of ['turn', 'thrust', 'senseFrac']) {
    console.log(`\n  ${action.toUpperCase()}:`);
    for (const feature of keyFeatures) {
      const w1 = parsed1[action].weights[feature.idx];
      const w2 = parsed2[action].weights[feature.idx];
      const diff = w2 - w1;
      const color = Math.abs(diff) > 0.05 ? (diff > 0 ? COLORS.green : COLORS.red) : COLORS.gray;
      console.log(`    ${feature.label.padEnd(18)} ${w1.toFixed(4)} → ${w2.toFixed(4)}  ${color}${diff > 0 ? '+' : ''}${diff.toFixed(4)}${COLORS.reset}`);
    }
  }
  
  // Learning insights
  console.log(`\n${COLORS.bright}${COLORS.cyan}Learning Insights:${COLORS.reset}`);
  
  const resDxTurnChange = parsed2.turn.weights[8] - parsed1.turn.weights[8];
  const resVisThustChange = parsed2.thrust.weights[10] - parsed1.thrust.weights[10];
  
  if (Math.abs(resDxTurnChange) > 0.05) {
    console.log(`  • Turn response to resource direction ${resDxTurnChange > 0 ? 'IMPROVED' : 'WORSENED'} (${resDxTurnChange > 0 ? '+' : ''}${(resDxTurnChange * 100).toFixed(1)}%)`);
  }
  
  if (Math.abs(resVisThustChange) > 0.05) {
    console.log(`  • Thrust response when resource visible ${resVisThustChange > 0 ? 'IMPROVED' : 'WORSENED'} (${resVisThustChange > 0 ? '+' : ''}${(resVisThustChange * 100).toFixed(1)}%)`);
  }
  
  if (rewardDiff > 5) {
    console.log(`  ${COLORS.green}✓ Significant performance improvement!${COLORS.reset}`);
  } else if (rewardDiff < -5) {
    console.log(`  ${COLORS.red}✗ Performance regression detected${COLORS.reset}`);
  } else {
    console.log(`  ⚠ Minimal performance change - may be stuck`);
  }
  
  if (sigma2Avg < 0.02) {
    console.log(`  ${COLORS.yellow}⚠ Search space has collapsed - consider increasing mutation noise${COLORS.reset}`);
  }
}

function plotLearningCurve(policy) {
  if (!policy.history || policy.history.length === 0) {
    console.log('\nNo history data available for learning curve.');
    return;
  }
  
  console.log(`\n${COLORS.bright}Learning Curve (Gen 0-${policy.generation}):${COLORS.reset}\n`);
  
  const history = policy.history;
  const maxReward = Math.max(...history.map(h => h.bestReward));
  const minReward = Math.min(...history.map(h => h.bestReward));
  const range = maxReward - minReward || 1;
  
  const height = 20;
  const width = Math.min(60, history.length);
  
  // Create ASCII plot
  for (let y = height; y >= 0; y--) {
    const value = minReward + (y / height) * range;
    const label = value.toFixed(0).padStart(6);
    process.stdout.write(`${label} │`);
    
    for (let x = 0; x < width; x++) {
      const genIdx = Math.floor(x / width * history.length);
      const gen = history[genIdx];
      const normalized = (gen.bestReward - minReward) / range;
      const plotY = normalized * height;
      
      if (Math.abs(plotY - y) < 0.5) {
        process.stdout.write(gen.bestReward > 0 ? COLORS.green + '●' + COLORS.reset : COLORS.red + '●' + COLORS.reset);
      } else {
        process.stdout.write(' ');
      }
    }
    console.log('');
  }
  
  console.log(`${''.padStart(7)}└${'─'.repeat(width)}`);
  const labelSpace = Math.max(0, width - 10);
  console.log(`${''.padStart(8)}Gen 0${' '.repeat(labelSpace)}Gen ${policy.generation}`);
  
  // Statistics
  const firstReward = history[0].bestReward;
  const lastReward = history[history.length - 1].bestReward;
  const improvement = lastReward - firstReward;
  
  console.log(`\n  First Gen:  ${firstReward.toFixed(2)}`);
  console.log(`  Latest Gen: ${lastReward.toFixed(2)}`);
  console.log(`  Change:     ${improvement > 0 ? COLORS.green : COLORS.red}${improvement > 0 ? '+' : ''}${improvement.toFixed(2)}${COLORS.reset}`);
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`${COLORS.bright}Essence Engine Policy Analyzer${COLORS.reset}\n`);
    console.log('Usage:');
    console.log('  node policyAnalyzer.js <policy.json>              # Analyze single policy');
    console.log('  node policyAnalyzer.js <policy1.json> <policy2.json>  # Compare two policies');
    console.log('  node policyAnalyzer.js <policy.json> --all        # Show all weights\n');
    console.log('Examples:');
    console.log('  node policyAnalyzer.js slime-policy-gen20.json');
    console.log('  node policyAnalyzer.js slime-policy-gen6.json slime-policy-gen20.json');
    process.exit(0);
  }
  
  const showAll = args.includes('--all');
  const policyFiles = args.filter(arg => !arg.startsWith('--'));
  
  if (policyFiles.length === 1) {
    // Single policy analysis
    const policy = loadPolicy(policyFiles[0]);
    printPolicyAnalysis(policy, showAll);
    plotLearningCurve(policy);
  } else if (policyFiles.length >= 2) {
    // Compare two policies
    const policy1 = loadPolicy(policyFiles[0]);
    const policy2 = loadPolicy(policyFiles[1]);
    
    printPolicyAnalysis(policy1);
    printPolicyAnalysis(policy2);
    comparePolices(policy1, policy2);
    
    console.log(`\n${COLORS.bright}Learning Curve: ${policyFiles[0]}${COLORS.reset}`);
    plotLearningCurve(policy1);
    
    console.log(`\n${COLORS.bright}Learning Curve: ${policyFiles[1]}${COLORS.reset}`);
    plotLearningCurve(policy2);
  }
  
  console.log('\n');
}

main();

