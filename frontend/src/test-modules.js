/**
 * Test import to verify module system works
 */

import { log } from './core/utils.js';
import { PEER_TIMEOUT } from './core/constants.js';
import { myId } from './core/peers.js';

// Test that imports work
console.log('✅ Module imports working');
console.log('My ID:', myId);
console.log('Peer timeout:', PEER_TIMEOUT);

// Import main browser logic
import('./browser.js').then(() => {
  console.log('✅ browser.js loaded');
}).catch(err => {
  console.error('❌ Failed to load browser.js:', err);
});
