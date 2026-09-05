import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundManager } from '../src/engine/audio/SoundManager.ts';
import { SpaceUiStore } from '../src/ui/react/store/SpaceUiStore.ts';

test('SoundManager supports setMuted, getMuted, and toggleMute', () => {
  const sound = new SoundManager();
  assert.equal(sound.getMuted(), false);

  sound.setMuted(true);
  assert.equal(sound.getMuted(), true);

  sound.toggleMute();
  assert.equal(sound.getMuted(), false);

  sound.toggleMute();
  assert.equal(sound.getMuted(), true);
});

test('SpaceUiStore setMuted syncs state, notifies controller, and updates snapshot', () => {
  const sound = new SoundManager();
  const controller: any = {
    sound,
    fov: 75,
    perspective: 'first_person',
    thirdPersonDistance: 4
  };

  const ui = new SpaceUiStore();
  ui.setController(controller);

  assert.equal(ui.getSnapshot().isMuted, false);

  ui.setMuted(true);
  assert.equal(ui.getSnapshot().isMuted, true);
  assert.equal(sound.getMuted(), true);

  ui.toggleMute();
  assert.equal(ui.getSnapshot().isMuted, false);
  assert.equal(sound.getMuted(), false);
});

test('SoundManager starts one sample-accurate looping music source after init', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const gainNodes: any[] = [];
  const sources: any[] = [];
  const requestedUrls: string[] = [];
  const decodedDuration = 11_768_192 / 48_000;
  const codecPreroll = 8_192 / 48_000;

  class FakeAudioContext {
    currentTime = 12;
    state = 'running';
    destination = { kind: 'destination' };

    createGain() {
      const events: any[] = [];
      const node = {
        events,
        gain: {
          setValueAtTime: (value: number, time: number) => events.push(['set', value, time]),
          cancelScheduledValues: (time: number) => events.push(['cancel', time]),
          linearRampToValueAtTime: (value: number, time: number) => events.push(['ramp', value, time])
        },
        connect: (target: any) => events.push(['connect', target])
      };
      gainNodes.push(node);
      return node;
    }

    createBufferSource() {
      const source: any = {
        buffer: null,
        loop: false,
        loopStart: -1,
        loopEnd: -1,
        connectedTo: null,
        startedAt: null,
        startedOffset: null,
        connect(target: any) { this.connectedTo = target; },
        start(time: number, offset: number) {
          this.startedAt = time;
          this.startedOffset = offset;
        }
      };
      sources.push(source);
      return source;
    }

    async decodeAudioData() {
      return { duration: decodedDuration };
    }

    async resume() {}
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { AudioContext: FakeAudioContext }
  });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (url: string) => {
      requestedUrls.push(String(url));
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(8)
      };
    }
  });

  try {
    const sound = new SoundManager();
    sound.init();
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(requestedUrls.length, 1);
    assert.match(requestedUrls[0], /bwv1043-ii-8bit\.ogg$/);
    assert.equal(gainNodes.length, 2);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].loop, true);
    assert.equal(sources[0].loopStart, codecPreroll);
    assert.equal(sources[0].loopEnd, decodedDuration);
    assert.equal(sources[0].connectedTo, gainNodes[1]);
    assert.equal(sources[0].startedAt, 12);
    assert.equal(sources[0].startedOffset, codecPreroll);
    assert.deepEqual(gainNodes[1].events.slice(-3), [
      ['cancel', 12],
      ['set', 0, 12],
      ['ramp', 0.5, 13.5]
    ]);

    // Repeated pointer-lock gestures call init again; playback stays singular.
    sound.init();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requestedUrls.length, 1);
    assert.equal(sources.length, 1);

    sound.setMuted(true);
    assert.deepEqual(gainNodes[0].events.at(-1), ['set', 0, 12]);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete (globalThis as any).window;
    if (previousFetch) Object.defineProperty(globalThis, 'fetch', previousFetch);
    else delete (globalThis as any).fetch;
  }
});

test('SoundManager plays cached, place-matched triangle fractures with bounded polyphony', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const gainNodes: any[] = [];
  const sources: any[] = [];
  const buffers: any[] = [];

  class FakeAudioContext {
    currentTime = 7;
    state = 'running';
    sampleRate = 48_000;
    destination = { kind: 'destination' };

    createGain() {
      const events: any[] = [];
      const node: any = {
        events,
        connectedTo: null,
        gain: {
          setValueAtTime: (value: number, time: number) => events.push(['set', value, time]),
          linearRampToValueAtTime: (value: number, time: number) => events.push(['linear', value, time]),
          cancelScheduledValues: (time: number) => events.push(['cancel', time])
        },
        connect(target: any) { this.connectedTo = target; },
        disconnect() { this.disconnected = true; }
      };
      gainNodes.push(node);
      return node;
    }

    createBuffer(_channels: number, frameCount: number, sampleRate: number) {
      const samples = new Float32Array(frameCount);
      const buffer = {
        duration: frameCount / sampleRate,
        length: frameCount,
        sampleRate,
        getChannelData: () => samples
      };
      buffers.push(buffer);
      return buffer;
    }

    createBufferSource() {
      const source: any = {
        buffer: null,
        connectedTo: null,
        startedAt: null,
        stopCalls: [] as number[],
        onended: null as null | (() => void),
        connect(target: any) { this.connectedTo = target; },
        start(time: number) { this.startedAt = time; },
        stop(time: number) { this.stopCalls.push(time); },
        disconnect() { this.disconnected = true; }
      };
      sources.push(source);
      return source;
    }

    async resume() {}
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { AudioContext: FakeAudioContext }
  });
  // Keep the unrelated music download pending so this test observes only the
  // procedural effect nodes.
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: () => new Promise(() => {})
  });

  try {
    const sound = new SoundManager();
    sound.init();
    sound.playBlockBreak({ kind: 'standard', count: 1 });

    assert.equal(sources.length, 1);
    assert.equal(buffers.length, 1);
    assert.equal(buffers[0].length, 5_520);
    assert.equal(sources[0].buffer, buffers[0]);
    assert.equal(sources[0].connectedTo, gainNodes[2]);
    assert.equal(gainNodes[2].connectedTo, gainNodes[0]);
    assert.equal(sources[0].startedAt, 7);
    assert.ok(Math.abs(sources[0].stopCalls[0] - 7.12) < 1e-9);
    assert.ok(Math.abs(gainNodes[2].events[0][1] - 0.194) < 1e-9);

    const standard = buffers[0].getChannelData(0);
    const peak = standard.reduce((highest: number, sample: number) => (
      Math.max(highest, Math.abs(sample))
    ), 0);
    assert.equal(standard[0], 0);
    assert.equal(standard.at(-1), 0);
    assert.ok(standard.every((sample: number) => Number.isFinite(sample)));
    assert.ok(peak > 0.87 && peak <= 0.89);
    const maxStep = standard.reduce((highest: number, sample: number, index: number) => (
      index === 0 ? highest : Math.max(highest, Math.abs(sample - standard[index - 1]))
    ), 0);
    assert.ok(maxStep < 0.1, 'the place-matched triangle must stay smooth and click-free');
    const rms = (values: Float32Array) => Math.sqrt(
      values.reduce((sum: number, sample: number) => sum + sample * sample, 0) / values.length
    );
    const quarter = Math.floor(standard.length / 4);
    assert.ok(
      rms(standard.slice(0, quarter)) > rms(standard.slice(-quarter)) * 2,
      'the baked envelope should decay like the placement sound'
    );

    const ctx = (sound as any).ctx;
    ctx.currentTime += 0.01;
    sound.playBlockBreak({ kind: 'micro' });
    sound.playBlockBreak({ kind: 'bulk', count: 64 });
    assert.equal(buffers[1].length, 3_072);
    assert.equal(buffers[2].length, 8_640);
    assert.ok(gainNodes[4].events[0][1] <= 0.21 * 1.18 * 1.03 + 1e-9);

    // Advance through the remaining variants. The seventh call reuses the
    // cached standard/variant-zero buffer, and active voices stay capped at 5.
    for (let index = 0; index < 4; index++) {
      sound.playBlockBreak({ kind: 'standard' });
    }
    assert.equal(buffers.length, 6);
    assert.equal(sources[6].buffer, buffers[0]);
    assert.equal((sound as any).activeBlockBreakVoices.size, 5);
    assert.equal(sources[0].stopCalls.length, 2);
    assert.deepEqual(gainNodes[2].events.slice(-3).map((event: any[]) => event[0]), [
      'cancel',
      'set',
      'linear'
    ]);
    assert.ok(Math.abs(sources[5].startedAt - 7.017) < 1e-9);
    assert.ok(Math.abs(sources[6].startedAt - 7.017) < 1e-9);

    // The evicted sources fade until the exact instant their replacements
    // start, so no event boundary has more than five live source nodes.
    const eventTimes = new Set<number>();
    for (const source of sources) {
      eventTimes.add(source.startedAt);
      eventTimes.add(source.stopCalls.at(-1));
    }
    for (const eventTime of eventTimes) {
      const live = sources.filter(source => (
        source.startedAt <= eventTime && eventTime < source.stopCalls.at(-1)
      ));
      assert.ok(live.length <= 5, `at most five sources may overlap at ${eventTime}`);
    }

    sources[6].onended();
    assert.equal((sound as any).activeBlockBreakVoices.size, 4);
    assert.equal(sources[6].disconnected, true);

    const sourceCount = sources.length;
    sound.setMuted(true);
    sound.playBlockBreak();
    assert.equal(sources.length, sourceCount);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete (globalThis as any).window;
    if (previousFetch) Object.defineProperty(globalThis, 'fetch', previousFetch);
    else delete (globalThis as any).fetch;
  }
});
