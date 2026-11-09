export type Clip = {
  id: string;
  bufferId: string;
  name: string;
  /** In-point inside the source buffer (seconds). */
  start: number;
  /** Out-point inside the source buffer (seconds). */
  end: number;
  /** Position on the timeline (seconds). */
  offset: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
};

export type Track = {
  id: string;
  name: string;
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  clips: Clip[];
};

export type Project = {
  tracks: Track[];
  bpm: number;
  masterVolume: number;
};

export const TRACK_COLORS = ["#ff5500", "#22c3a6", "#a78bfa", "#facc15", "#38bdf8", "#f472b6", "#84cc16"];

export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const clipLength = (clip: Clip) => clip.end - clip.start;
export const clipEndTime = (clip: Clip) => clip.offset + clipLength(clip);

export function projectEnd(project: Project): number {
  let end = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) end = Math.max(end, clipEndTime(clip));
  }
  return end;
}

export function effectiveTrackGain(track: Track, anySolo: boolean): number {
  if (track.muted || (anySolo && !track.solo)) return 0;
  return track.volume;
}

/** Max-abs peaks per bucket, mixed across channels, for fast waveform drawing. */
export const PEAKS_PER_SECOND = 200;
export function computePeaks(buffer: AudioBuffer): Float32Array {
  const buckets = Math.max(1, Math.ceil(buffer.duration * PEAKS_PER_SECOND));
  const peaks = new Float32Array(buckets);
  const size = buffer.length / buckets;
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let b = 0; b < buckets; b += 1) {
      const from = Math.floor(b * size);
      const to = Math.min(data.length, Math.floor((b + 1) * size));
      let max = peaks[b];
      for (let i = from; i < to; i += 1) {
        const v = Math.abs(data[i]);
        if (v > max) max = v;
      }
      peaks[b] = max;
    }
  }
  return peaks;
}

function scheduleClip(
  ctx: BaseAudioContext,
  clip: Clip,
  buffer: AudioBuffer,
  destination: AudioNode,
  when: number,
  from: number,
): AudioBufferSourceNode | null {
  const length = clipLength(clip);
  const endT = clip.offset + length;
  if (length <= 0 || endT <= from) return null;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const env = ctx.createGain();
  source.connect(env).connect(destination);

  const startT = Math.max(clip.offset, from);
  const at = (t: number) => when + (t - from);
  const fadeIn = Math.min(clip.fadeIn, length);
  const fadeOut = Math.min(clip.fadeOut, length);
  const envAt = (t: number) => {
    let v = clip.gain;
    const rel = t - clip.offset;
    if (fadeIn > 0 && rel < fadeIn) v *= rel / fadeIn;
    const remain = endT - t;
    if (fadeOut > 0 && remain < fadeOut) v *= remain / fadeOut;
    return Math.max(0, v);
  };

  env.gain.setValueAtTime(envAt(startT), at(startT));
  if (fadeIn > 0 && clip.offset + fadeIn > startT) {
    env.gain.linearRampToValueAtTime(envAt(clip.offset + fadeIn), at(clip.offset + fadeIn));
  }
  if (fadeOut > 0) {
    const fadeStart = Math.max(startT, endT - fadeOut);
    env.gain.setValueAtTime(envAt(fadeStart), at(fadeStart));
    env.gain.linearRampToValueAtTime(0, at(endT));
  }

  source.start(at(startT), clip.start + (startT - clip.offset), endT - startT);
  return source;
}

function buildGraph(
  ctx: BaseAudioContext,
  project: Project,
  buffers: Map<string, AudioBuffer>,
  output: AudioNode,
  when: number,
  from: number,
) {
  const anySolo = project.tracks.some((t) => t.solo);
  const trackNodes = new Map<string, { gain: GainNode; pan: StereoPannerNode }>();
  const sources: AudioBufferSourceNode[] = [];
  for (const track of project.tracks) {
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    gain.gain.value = effectiveTrackGain(track, anySolo);
    pan.pan.value = track.pan;
    gain.connect(pan).connect(output);
    trackNodes.set(track.id, { gain, pan });
    for (const clip of track.clips) {
      const buffer = buffers.get(clip.bufferId);
      if (!buffer) continue;
      const src = scheduleClip(ctx, clip, buffer, gain, when, from);
      if (src) sources.push(src);
    }
  }
  return { trackNodes, sources };
}

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly analyser: AnalyserNode;
  private trackNodes = new Map<string, { gain: GainNode; pan: StereoPannerNode }>();
  private sources: AudioScheduledSourceNode[] = [];
  private startedAt = 0;
  private startPos = 0;
  playing = false;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    this.master = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.master.connect(this.analyser).connect(this.ctx.destination);
  }

  decode(data: ArrayBuffer) {
    return this.ctx.decodeAudioData(data);
  }

  position(): number {
    if (!this.playing) return this.startPos;
    return Math.max(0, this.startPos + (this.ctx.currentTime - this.startedAt));
  }

  get latency(): number {
    return this.ctx.baseLatency + (this.ctx.outputLatency || 0);
  }

  async play(
    project: Project,
    buffers: Map<string, AudioBuffer>,
    from: number,
    options: { metronome: boolean; metronomeUntil: number },
  ) {
    this.stopSources();
    await this.ctx.resume();
    const when = this.ctx.currentTime + 0.04;
    this.master.gain.value = project.masterVolume;
    const graph = buildGraph(this.ctx, project, buffers, this.master, when, from);
    this.trackNodes = graph.trackNodes;
    this.sources = graph.sources;
    if (options.metronome) this.scheduleMetronome(project.bpm, when, from, options.metronomeUntil);
    this.startedAt = when;
    this.startPos = from;
    this.playing = true;
  }

  private scheduleMetronome(bpm: number, when: number, from: number, until: number) {
    const beat = 60 / bpm;
    for (let k = Math.ceil(from / beat - 1e-6); k * beat <= until; k += 1) {
      const t = when + (k * beat - from);
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.frequency.value = k % 4 === 0 ? 1600 : 1000;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.35, t + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      osc.connect(env).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.06);
      this.sources.push(osc);
    }
  }

  /** Apply volume/pan/mute/solo changes without restarting playback. */
  updateMix(project: Project) {
    const anySolo = project.tracks.some((t) => t.solo);
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(project.masterVolume, now, 0.01);
    for (const track of project.tracks) {
      const nodes = this.trackNodes.get(track.id);
      if (!nodes) continue;
      nodes.gain.gain.setTargetAtTime(effectiveTrackGain(track, anySolo), now, 0.01);
      nodes.pan.pan.setTargetAtTime(track.pan, now, 0.01);
    }
  }

  pause() {
    this.startPos = this.position();
    this.stopSources();
    this.playing = false;
  }

  seek(pos: number) {
    this.startPos = Math.max(0, pos);
  }

  /** Peak level (0..1) of the master output right now. */
  level(scratch: Float32Array<ArrayBuffer>): number {
    this.analyser.getFloatTimeDomainData(scratch);
    let peak = 0;
    for (let i = 0; i < scratch.length; i += 1) {
      const v = Math.abs(scratch[i]);
      if (v > peak) peak = v;
    }
    return peak;
  }

  private stopSources() {
    for (const src of this.sources) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
      src.disconnect();
    }
    this.sources = [];
    for (const nodes of this.trackNodes.values()) {
      nodes.gain.disconnect();
      nodes.pan.disconnect();
    }
    this.trackNodes.clear();
  }

  dispose() {
    this.stopSources();
    void this.ctx.close();
  }
}

export async function renderMix(
  project: Project,
  buffers: Map<string, AudioBuffer>,
  sampleRate = 44100,
): Promise<AudioBuffer> {
  const duration = Math.max(0.1, projectEnd(project));
  const offline = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  const master = offline.createGain();
  master.gain.value = project.masterVolume;
  master.connect(offline.destination);
  buildGraph(offline, project, buffers, master, 0, 0);
  return offline.startRendering();
}
