// Test script for adaptive reward system
// Run with: node test-adaptive-rewards.js

import { CONFIG } from './config.js';
import { calculateAdaptiveReward } from './rewards.js';

console.log('🧪 Testing Adaptive Reward System\n');
console.log('='.repeat(60));

// Test 1: Configuration loaded correctly
console.log('\n1. Configuration Check:');
console.log(`   Adaptive rewards enabled: ${CONFIG.adaptiveReward.enabled}`);
console.log(`   Gain factor: ${CONFIG.adaptiveReward.gainFactor}`);
console.log(`   EMA alpha: ${CONFIG.adaptiveReward.emaAlpha}`);
console.log(`   Min/Max rewards: ${CONFIG.adaptiveReward.minReward} / ${CONFIG.adaptiveReward.maxReward}χ`);

// Test 2: Reward calculation with different find times
console.log('\n2. Reward Calculation Tests:');
const testTimes = [5, 8, 10, 12, 15, 20];
console.log('   Expected metabolic cost: 0.15 + 0.7 × 0.35 = 0.395 χ/s');
console.log('   Formula: reward = 6.0 × 0.395 × avgFindTime');
console.log('');

testTimes.forEach(time => {
  const reward = calculateAdaptiveReward(time);
  const expected = 6.0 * (0.15 + 0.7 * 0.35) * time;
  console.log(`   avgFindTime = ${time}s → reward = ${reward.toFixed(2)}χ (expected: ${expected.toFixed(2)}χ)`);
});

// Test 3: Safety bounds
console.log('\n3. Safety Bounds Tests:');
const extremeTimes = [0.1, 0.5, 50, 100];
extremeTimes.forEach(time => {
  const reward = calculateAdaptiveReward(time);
  console.log(`   avgFindTime = ${time}s → reward = ${reward.toFixed(2)}χ (bounded)`);
});

// Test 4: EMA tracking simulation
console.log('\n4. EMA Tracking Simulation:');
console.log('   Simulating resource collections at various intervals...');

const mockWorld = {
  avgFindTime: 8.0,
  avgAlpha: 0.1,
  lastFindTimestamp: null,
  rewardStats: {
    minFindTime: Infinity,
    maxFindTime: 0
  }
};

// Simulate collection times (in seconds from start)
const collections = [0, 5, 12, 20, 35, 42, 50];
let prevTime = 0;

collections.forEach((time, i) => {
  mockWorld.lastFindTimestamp = time;
  const dtFind = i === 0 ? 8.0 : time - prevTime;
  
  // Manually update EMA
  const alpha = 0.1;
  mockWorld.avgFindTime = (1 - alpha) * mockWorld.avgFindTime + alpha * dtFind;
  mockWorld.rewardStats.minFindTime = Math.min(mockWorld.rewardStats.minFindTime, dtFind);
  mockWorld.rewardStats.maxFindTime = Math.max(mockWorld.rewardStats.maxFindTime, dtFind);
  
  const reward = calculateAdaptiveReward(mockWorld.avgFindTime);
  
  console.log(`   Collection ${i+1}: dt=${dtFind.toFixed(1)}s, avgFind=${mockWorld.avgFindTime.toFixed(2)}s → reward=${reward.toFixed(2)}χ`);
  
  prevTime = time;
});

console.log(`   Final stats: min=${mockWorld.rewardStats.minFindTime.toFixed(1)}s, max=${mockWorld.rewardStats.maxFindTime.toFixed(1)}s`);

// Test 5: Comparison with fixed reward
console.log('\n5. Fixed vs Adaptive Comparison:');
const fixedReward = CONFIG.rewardChi;
const avgFindTime = 8.0;
const adaptiveReward = calculateAdaptiveReward(avgFindTime);
const improvementFactor = adaptiveReward / fixedReward;

console.log(`   Fixed reward: ${fixedReward}χ`);
console.log(`   Adaptive reward (8s avg): ${adaptiveReward.toFixed(2)}χ`);
console.log(`   Improvement: ${improvementFactor.toFixed(2)}x stronger signal`);

// Test 6: Verify absolute anchor mode (if interested)
console.log('\n6. Absolute Biological Anchor (optional):');
const absoluteConfig = {
  ...CONFIG.adaptiveReward,
  useAbsoluteAnchor: true
};
const absoluteReward = calculateAdaptiveReward(8.0, absoluteConfig);
console.log(`   With useAbsoluteAnchor=true: ${absoluteReward.toFixed(2)}χ`);
console.log(`   (Based on ~1 femtomole glucose = 6×10⁸ molecules × 30 ATP/glucose)`);

console.log('\n' + '='.repeat(60));
console.log('✅ All tests completed!\n');
console.log('Next steps:');
console.log('1. Open index.html in browser');
console.log('2. Watch HUD for "Adaptive Reward" line (orange text)');
console.log('3. Collect resources and observe reward values changing');
console.log('4. Check console for debug logs (every 10 collections)');
console.log('5. Compare avgFindTime with actual resource collection intervals\n');

