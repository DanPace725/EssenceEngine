const MAX_HISTORY = 2048;

class ChannelTracker {
  constructor() {
    this.stimuli = [];
    this.responses = [];
    this.latencyHistory = [];
    this.coherenceSum = 0;
    this.responseCount = 0;
    this.lastStimulusByAgent = new Map();
    this.lastResponseTickByAgent = new Map();
  }

  pushStimulus(event) {
    this.stimuli.push(event);
    if (this.stimuli.length > MAX_HISTORY) {
      this.stimuli.shift();
    }
    this.lastStimulusByAgent.set(event.agentId, event.tick);
  }

  pushResponse(event) {
    this.responses.push(event);
    if (this.responses.length > MAX_HISTORY) {
      this.responses.shift();
    }
    if (typeof event.latency === 'number') {
      this.latencyHistory.push(event.latency);
      if (this.latencyHistory.length > MAX_HISTORY) {
        this.latencyHistory.shift();
      }
    }
    if (typeof event.alignment === 'number') {
      this.coherenceSum += event.alignment;
    }
    this.responseCount += 1;
    this.lastResponseTickByAgent.set(event.agentId, event.tick);
  }

  averageLatency() {
    if (!this.latencyHistory.length) return 0;
    const sum = this.latencyHistory.reduce((acc, v) => acc + v, 0);
    return sum / this.latencyHistory.length;
  }

  averageCoherence() {
    if (!this.responseCount) return 0;
    return Math.max(0, Math.min(1, this.coherenceSum / this.responseCount));
  }
}

export const SignalResponseAnalytics = {
  _channels: new Map(),

  _getChannel(channel) {
    if (!this._channels.has(channel)) {
      this._channels.set(channel, new ChannelTracker());
    }
    return this._channels.get(channel);
  },

  reset() {
    this._channels.clear();
  },

  logStimulus(channel, tick, agentId, meta = {}) {
    if (!channel && channel !== 0) return;
    const tracker = this._getChannel(channel);
    tracker.pushStimulus({
      channel,
      tick,
      agentId,
      amplitude: meta.amplitude ?? 0,
      gradient: meta.gradient ?? 0
    });
  },

  logResponse(channel, tick, agentId, meta = {}) {
    if (!channel && channel !== 0) return;
    const tracker = this._getChannel(channel);
    const lastTick = tracker.lastResponseTickByAgent.get(agentId);
    if (lastTick === tick) {
      return; // Avoid duplicate logs in the same tick
    }

    const stimTick = tracker.lastStimulusByAgent.get(agentId);
    const latency = typeof stimTick === 'number' ? Math.max(0, tick - stimTick) : undefined;

    tracker.pushResponse({
      channel,
      tick,
      agentId,
      latency,
      alignment: meta.alignment ?? 0,
      magnitude: meta.magnitude ?? 0,
      mode: meta.mode || 'unknown'
    });
  },

  getSummary() {
    const perChannel = {};
    let totalStimuli = 0;
    let totalResponses = 0;
    let latencySum = 0;
    let latencyCount = 0;
    let coherenceSum = 0;

    for (const [channel, tracker] of this._channels.entries()) {
      const avgLatency = tracker.averageLatency();
      const avgCoherence = tracker.averageCoherence();
      const stimuliCount = tracker.stimuli.length;
      const responseCount = tracker.responseCount;

      perChannel[channel] = {
        stimuli: stimuliCount,
        responses: responseCount,
        averageLatency: avgLatency,
        coherence: avgCoherence
      };

      totalStimuli += stimuliCount;
      totalResponses += responseCount;
      if (tracker.latencyHistory.length) {
        latencySum += tracker.latencyHistory.reduce((acc, v) => acc + v, 0);
        latencyCount += tracker.latencyHistory.length;
      }
      coherenceSum += avgCoherence * responseCount;
    }

    const averageLatency = latencyCount ? latencySum / latencyCount : 0;
    const averageCoherence = totalResponses ? coherenceSum / totalResponses : 0;

    return {
      totalStimuli,
      totalResponses,
      averageLatency,
      coherence: Math.max(0, Math.min(1, averageCoherence)),
      perChannel
    };
  }
};

if (typeof window !== 'undefined') {
  window.SignalResponseAnalytics = SignalResponseAnalytics;
}
