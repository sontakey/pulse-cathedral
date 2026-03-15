import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager } from '../js/audio.js';

/**
 * Create a mock AudioContext that tracks all node creation and scheduling calls.
 */
function mockAudioContext() {
  const nodes = [];

  function createMockParam(initial = 0) {
    return {
      value: initial,
      _calls: [],
      setValueAtTime(v, t) { this._calls.push({ method: 'setValueAtTime', v, t }); this.value = v; },
      exponentialRampToValueAtTime(v, t) { this._calls.push({ method: 'exponentialRamp', v, t }); },
      setTargetAtTime(v, t, tc) { this._calls.push({ method: 'setTargetAtTime', v, t, tc }); },
    };
  }

  function createMockNode(type) {
    const node = {
      type: null,
      _nodeType: type,
      frequency: createMockParam(440),
      detune: createMockParam(0),
      gain: createMockParam(0),
      _connected: false,
      _started: false,
      _stopped: false,
      _startTime: null,
      _stopTime: null,
      connect() { this._connected = true; },
      start(t) { this._started = true; this._startTime = t; },
      stop(t) { this._stopped = true; this._stopTime = t; },
      disconnect() { this._connected = false; },
    };
    nodes.push(node);
    return node;
  }

  const ctx = {
    currentTime: 0,
    state: 'running',
    destination: {},
    _nodes: nodes,
    createOscillator() { return createMockNode('oscillator'); },
    createGain() {
      const g = createMockNode('gain');
      g.gain = createMockParam(1);
      return g;
    },
    close() { this.state = 'closed'; return Promise.resolve(); },
  };

  return ctx;
}

/** Install a mock AudioContext globally so init() works. */
function installMockAudioContext() {
  const ctx = mockAudioContext();
  globalThis.window = globalThis.window || {};
  globalThis.window.AudioContext = function () { return ctx; };
  return ctx;
}

function cleanupGlobals() {
  if (globalThis.window) {
    delete globalThis.window.AudioContext;
    delete globalThis.window.webkitAudioContext;
  }
}

describe('AudioManager — construction', () => {
  it('can be constructed', () => {
    const mgr = new AudioManager();
    assert.ok(mgr);
    assert.strictEqual(mgr._initialized, false);
  });

  it('starts with drone not running', () => {
    const mgr = new AudioManager();
    assert.strictEqual(mgr._droneRunning, false);
    assert.strictEqual(mgr._droneOsc1, null);
    assert.strictEqual(mgr._droneOsc2, null);
  });

  it('starts with default HR of 72', () => {
    const mgr = new AudioManager();
    assert.strictEqual(mgr._currentHR, 72);
  });
});

describe('AudioManager — init', () => {
  beforeEach(cleanupGlobals);

  it('creates an audio context on init', () => {
    const ctx = installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    assert.strictEqual(mgr._initialized, true);
    assert.ok(mgr.ctx);
    assert.ok(mgr.masterGain);
  });

  it('sets master gain to 0.3 on init', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    assert.strictEqual(mgr.masterGain.gain.value, 0.3);
  });

  it('does not re-initialize if already initialized', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    const firstCtx = mgr.ctx;
    mgr.init();
    assert.strictEqual(mgr.ctx, firstCtx);
  });
});

describe('AudioManager — playBeat', () => {
  beforeEach(cleanupGlobals);

  it('does nothing before init', () => {
    const mgr = new AudioManager();
    // Should not throw
    mgr.playBeat(0.5);
  });

  it('creates oscillator nodes when playing a beat', () => {
    const ctx = installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    const nodesBefore = ctx._nodes.length;
    mgr.playBeat(0.8);
    // Should create sub osc + sub gain + click osc + click gain = 4 new nodes
    // (plus the master gain from init)
    const newNodes = ctx._nodes.length - nodesBefore;
    assert.strictEqual(newNodes, 4);
  });

  it('starts and schedules stop for both oscillators', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.playBeat(0.5);
    const oscs = mgr.ctx._nodes.filter(n => n._nodeType === 'oscillator' && n._started);
    assert.strictEqual(oscs.length, 2);
    for (const osc of oscs) {
      assert.ok(osc._stopped);
    }
  });

  it('scales sub gain with intensity', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.playBeat(1.0);
    // First gain node created for this beat (sub gain) should have intensity * 0.6
    const gains = mgr.ctx._nodes.filter(n => n._nodeType === 'gain');
    // gains[0] is master gain, gains[1] is sub gain, gains[2] is click gain
    const subGain = gains[1];
    assert.ok(subGain.gain._calls.some(c => c.method === 'setValueAtTime' && Math.abs(c.v - 0.6) < 0.01));
  });

  it('creates a click transient layer', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.playBeat(0.5);
    const oscs = mgr.ctx._nodes.filter(n => n._nodeType === 'oscillator');
    // One osc is sub (sine), one is click (square)
    const types = oscs.map(o => o.type);
    assert.ok(types.includes('sine'));
    assert.ok(types.includes('square'));
  });
});

describe('AudioManager — ambient drone', () => {
  beforeEach(cleanupGlobals);

  it('startDrone does nothing before init', () => {
    const mgr = new AudioManager();
    mgr.startDrone();
    assert.strictEqual(mgr._droneRunning, false);
  });

  it('starts two oscillators for the drone', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.startDrone();
    assert.strictEqual(mgr._droneRunning, true);
    assert.ok(mgr._droneOsc1);
    assert.ok(mgr._droneOsc2);
    assert.ok(mgr._droneGain);
  });

  it('drone osc1 is sine, osc2 is triangle', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.startDrone();
    assert.strictEqual(mgr._droneOsc1.type, 'sine');
    assert.strictEqual(mgr._droneOsc2.type, 'triangle');
  });

  it('drone osc2 is detuned by 700 cents', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.startDrone();
    assert.ok(mgr._droneOsc2.detune._calls.some(c => c.v === 700));
  });

  it('does not double-start the drone', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.startDrone();
    const osc1 = mgr._droneOsc1;
    mgr.startDrone();
    assert.strictEqual(mgr._droneOsc1, osc1); // same reference
  });

  it('drone gain fades in from near-zero', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.startDrone();
    const calls = mgr._droneGain.gain._calls;
    assert.ok(calls.some(c => c.method === 'setValueAtTime' && c.v === 0.001));
    assert.ok(calls.some(c => c.method === 'exponentialRamp' && c.v === 0.12));
  });

  it('stopDrone stops oscillators and clears references', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.startDrone();
    assert.strictEqual(mgr._droneRunning, true);
    mgr.stopDrone();
    assert.strictEqual(mgr._droneRunning, false);
    assert.strictEqual(mgr._droneOsc1, null);
    assert.strictEqual(mgr._droneOsc2, null);
    assert.strictEqual(mgr._droneGain, null);
  });

  it('stopDrone is safe to call when not running', () => {
    const mgr = new AudioManager();
    // Should not throw
    mgr.stopDrone();
    assert.strictEqual(mgr._droneRunning, false);
  });
});

describe('AudioManager — updateDrone', () => {
  beforeEach(cleanupGlobals);

  it('updateDrone stores HR even when drone is not running', () => {
    const mgr = new AudioManager();
    mgr.updateDrone(80);
    assert.strictEqual(mgr._currentHR, 80);
  });

  it('does not throw when drone is not running', () => {
    const mgr = new AudioManager();
    mgr.updateDrone(90);
  });

  it('shifts drone frequency based on HR', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.startDrone();
    mgr.updateDrone(90);
    // Frequency should be 55 * (90/72) ≈ 68.75
    const expectedFreq = 55 * (90 / 72);
    const osc1Calls = mgr._droneOsc1.frequency._calls;
    const targetCall = osc1Calls.find(c => c.method === 'setTargetAtTime');
    assert.ok(targetCall);
    assert.ok(Math.abs(targetCall.v - expectedFreq) < 0.01);
  });

  it('both oscillators get frequency update', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.startDrone();
    mgr.updateDrone(60);
    const osc1Target = mgr._droneOsc1.frequency._calls.find(c => c.method === 'setTargetAtTime');
    const osc2Target = mgr._droneOsc2.frequency._calls.find(c => c.method === 'setTargetAtTime');
    assert.ok(osc1Target);
    assert.ok(osc2Target);
    assert.strictEqual(osc1Target.v, osc2Target.v);
  });
});

describe('AudioManager — updateDroneIntensity', () => {
  beforeEach(cleanupGlobals);

  it('does nothing when drone is not running', () => {
    const mgr = new AudioManager();
    // Should not throw
    mgr.updateDroneIntensity(0.8);
  });

  it('adjusts drone gain based on quality', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.startDrone();
    mgr.updateDroneIntensity(0.8);
    const calls = mgr._droneGain.gain._calls;
    const targetCall = calls.find(c => c.method === 'setTargetAtTime' && c.v > 0);
    assert.ok(targetCall);
    // Expected: 0.12 * max(0.1, 0.8) = 0.12 * 0.8 = 0.096
    assert.ok(Math.abs(targetCall.v - 0.096) < 0.001);
  });

  it('enforces minimum intensity of 10%', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.startDrone();
    mgr.updateDroneIntensity(0);
    const calls = mgr._droneGain.gain._calls;
    const targetCall = calls.find(c => c.method === 'setTargetAtTime');
    // Expected: 0.12 * 0.1 = 0.012
    assert.ok(targetCall.v >= 0.012 - 0.001);
  });
});

describe('AudioManager — setVolume', () => {
  beforeEach(cleanupGlobals);

  it('does nothing before init', () => {
    const mgr = new AudioManager();
    mgr.setVolume(0.8); // Should not throw
  });

  it('clamps volume to [0, 1]', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.setVolume(-0.5);
    assert.strictEqual(mgr.masterGain.gain.value, 0);
    mgr.setVolume(1.5);
    assert.strictEqual(mgr.masterGain.gain.value, 1);
    mgr.setVolume(0.7);
    assert.strictEqual(mgr.masterGain.gain.value, 0.7);
  });
});

describe('AudioManager — dispose', () => {
  beforeEach(cleanupGlobals);

  it('closes the audio context', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.dispose();
    assert.strictEqual(mgr._initialized, false);
    assert.strictEqual(mgr.ctx.state, 'closed');
  });

  it('stops the drone if running', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.startDrone();
    assert.strictEqual(mgr._droneRunning, true);
    mgr.dispose();
    assert.strictEqual(mgr._droneRunning, false);
    assert.strictEqual(mgr._droneOsc1, null);
  });

  it('is safe to call when not initialized', () => {
    const mgr = new AudioManager();
    mgr.dispose(); // Should not throw
  });
});

describe('AudioManager — integration: beat + drone together', () => {
  beforeEach(cleanupGlobals);

  it('can play beats while drone is running', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.startDrone();
    // Should not throw or interfere
    mgr.playBeat(0.7);
    mgr.playBeat(1.0);
    assert.strictEqual(mgr._droneRunning, true);
  });

  it('can update drone pitch and play beat in sequence', () => {
    installMockAudioContext();
    const mgr = new AudioManager();
    mgr.init();
    mgr.startDrone();
    mgr.updateDrone(85);
    mgr.playBeat(0.9);
    mgr.updateDroneIntensity(0.6);
    assert.strictEqual(mgr._currentHR, 85);
    assert.strictEqual(mgr._droneRunning, true);
  });
});
