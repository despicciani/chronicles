export interface MusicPlaybackSnapshot {
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  currentUrl: string;
  loop: boolean;
  playbackRate: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private reverbNode: ConvolverNode | null = null;
  private sfxMasterGain: GainNode | null = null;
  private sfxLimiter: DynamicsCompressorNode | null = null;
  private ambientGainNode: GainNode | null = null;
  private ambientStopper: (() => void) | null = null;
  private activeAudioEl: HTMLAudioElement | null = null;
  private activeAudioUrl = '';
  private musicVolume = (() => {
    try {
      const v = Number(localStorage.getItem('chronicle_music_vol'));
      return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.38;
    } catch {
      return 0.38;
    }
  })();
  private sfxVolume = (() => {
    try {
      const v = Number(localStorage.getItem('chronicle_sfx_vol'));
      return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.24;
    } catch {
      return 0.24;
    }
  })();
  private muted = (() => {
    try {
      return localStorage.getItem('chronicle_muted') === '1';
    } catch {
      return false;
    }
  })();
  private loopEnabled = true;
  private shuffleEnabled = false;
  private playbackRate = 1.0;
  private fadeTimer: number | null = null;
  private duckTimer: number | null = null;
  private duckRestoreTimer: number | null = null;
  private preDomainMusicUrl: string | null = null;
  private onTrackEndedCb: (() => void) | null = null;
  private playlistTracks: Array<{ title: string; url: string }> = [];
  private playlistTrigger: ((track: { title: string; url: string }) => void) | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getSfxOutput(ctx: AudioContext): GainNode {
    if (this.sfxMasterGain && this.sfxMasterGain.context === ctx) {
      this.sfxMasterGain.gain.value = this.muted ? 0 : 0.55;
      return this.sfxMasterGain;
    }
    // Master SFX bus with soft-knee DynamicsCompressor limiter so layered SFX never clip/distort
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 12;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.16;
    limiter.connect(ctx.destination);

    const bus = ctx.createGain();
    bus.gain.value = this.muted ? 0 : 0.55;
    bus.connect(limiter);

    this.sfxLimiter = limiter;
    this.sfxMasterGain = bus;
    return bus;
  }

  private getReverb(ctx: AudioContext): ConvolverNode {
    if (this.reverbNode && this.reverbNode.context === ctx) {
      return this.reverbNode;
    }
    const len = Math.floor(ctx.sampleRate * 1.4);
    const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = impulse;
    this.reverbNode = conv;
    return conv;
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  setVolume(vol: number) {
    this.setMusicVolume(vol);
  }

  setMusicVolume(vol: number) {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem('chronicle_music_vol', String(this.musicVolume));
    } catch {
      // ignore
    }
    if (this.activeAudioEl && !this.fadeTimer) {
      this.activeAudioEl.volume = this.muted ? 0 : this.musicVolume;
    }
    if (this.ambientGainNode) {
      this.ambientGainNode.gain.value = this.muted ? 0 : this.musicVolume * 0.22;
    }
  }

  getMusicVolume() {
    return this.musicVolume;
  }

  setSfxVolume(vol: number) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem('chronicle_sfx_vol', String(this.sfxVolume));
    } catch {
      // ignore
    }
  }

  getSfxVolume() {
    return this.sfxVolume;
  }

  setLoop(loop: boolean) {
    this.loopEnabled = loop;
    if (this.activeAudioEl) {
      this.activeAudioEl.loop = loop;
    }
  }

  getLoop() {
    return this.loopEnabled;
  }

  setShuffle(shuffle: boolean) {
    this.shuffleEnabled = shuffle;
    if (shuffle && this.loopEnabled) {
      this.setLoop(false);
    }
  }

  getShuffle() {
    return this.shuffleEnabled;
  }

  configurePlaylist(
    tracks: Array<{ title: string; url: string }>,
    trigger: ((track: { title: string; url: string }) => void) | null
  ) {
    this.playlistTracks = tracks;
    this.playlistTrigger = trigger;
  }

  playNextInPlaylist() {
    if (!this.playlistTrigger || this.playlistTracks.length === 0) return;
    const curIdx = this.playlistTracks.findIndex(
      (t) => this.activeAudioUrl && this.activeAudioUrl.includes(t.url)
    );
    let nextIdx = curIdx >= 0 ? (curIdx + 1) % this.playlistTracks.length : 0;
    if (this.shuffleEnabled && this.playlistTracks.length > 1) {
      let rand = Math.floor(Math.random() * this.playlistTracks.length);
      if (rand === curIdx) rand = (rand + 1) % this.playlistTracks.length;
      nextIdx = rand;
    }
    this.playlistTrigger(this.playlistTracks[nextIdx]);
  }

  setPlaybackRate(rate: number) {
    this.playbackRate = Math.max(0.5, Math.min(1.5, rate));
    if (this.activeAudioEl) {
      this.activeAudioEl.playbackRate = this.playbackRate;
    }
  }

  getPlaybackRate() {
    return this.playbackRate;
  }

  setOnTrackEnded(cb: (() => void) | null) {
    this.onTrackEndedCb = cb;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem('chronicle_muted', muted ? '1' : '0');
    } catch {
      // ignore
    }
    this.clearFade();
    // Keep music & ambient alive at volume 0 so unmuting resumes smoothly right where it was!
    if (this.activeAudioEl) {
      this.activeAudioEl.volume = muted ? 0 : this.musicVolume;
      if (!muted && this.activeAudioEl.paused && this.activeAudioUrl) {
        this.activeAudioEl.play().catch(() => {});
      }
    }
    if (this.ambientGainNode) {
      this.ambientGainNode.gain.value = muted ? 0 : this.musicVolume * 0.22;
    }
    if (this.sfxMasterGain) {
      this.sfxMasterGain.gain.value = muted ? 0 : 0.55;
    }
  }

  getMuted() {
    return this.muted;
  }

  private clearFade() {
    if (this.fadeTimer !== null) {
      window.clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  stopAmbient() {
    this.clearFade();
    if (this.ambientStopper) {
      this.ambientStopper();
      this.ambientStopper = null;
    }
    this.ambientGainNode = null;
    if (this.activeAudioEl) {
      this.activeAudioEl.onended = null;
      this.activeAudioEl.pause();
      this.activeAudioEl.src = '';
      this.activeAudioEl = null;
      this.activeAudioUrl = '';
    }
  }

  fadeOutAndStop(durationMs = 1200, onDone?: () => void) {
    if (!this.activeAudioEl) {
      this.stopAmbient();
      onDone?.();
      return;
    }
    this.clearFade();
    const audio = this.activeAudioEl;
    const startVol = audio.volume;
    const steps = 20;
    let step = 0;
    this.fadeTimer = window.setInterval(() => {
      step++;
      const frac = Math.max(0, 1 - step / steps);
      audio.volume = startVol * frac;
      if (step >= steps) {
        this.stopAmbient();
        onDone?.();
      }
    }, Math.max(25, Math.round(durationMs / steps)));
  }

  togglePauseMusic(): boolean {
    if (!this.activeAudioEl) return false;
    if (this.activeAudioEl.paused) {
      this.activeAudioEl.play().catch(() => {});
      return true;
    }
    this.activeAudioEl.pause();
    return false;
  }

  seekMusic(seconds: number) {
    if (!this.activeAudioEl || !Number.isFinite(this.activeAudioEl.duration)) return;
    this.activeAudioEl.currentTime = Math.max(
      0,
      Math.min(this.activeAudioEl.duration, seconds)
    );
  }

  getPlaybackSnapshot(): MusicPlaybackSnapshot {
    const el = this.activeAudioEl;
    if (!el) {
      return {
        isPlaying: false,
        isPaused: false,
        currentTime: 0,
        duration: 0,
        currentUrl: '',
        loop: this.loopEnabled,
        playbackRate: this.playbackRate,
      };
    }
    return {
      isPlaying: !el.paused && !el.ended,
      isPaused: el.paused && el.currentTime > 0,
      currentTime: Number.isFinite(el.currentTime) ? el.currentTime : 0,
      duration: Number.isFinite(el.duration) ? el.duration : 0,
      currentUrl: this.activeAudioUrl,
      loop: el.loop,
      playbackRate: el.playbackRate,
    };
  }

  playCustomUrl(url: string, loop: boolean) {
    if (!loop && this.muted) return;
    if (loop) this.stopAmbient();
    const audio = new Audio(url);
    audio.loop = loop ? this.loopEnabled : false;
    audio.playbackRate = this.playbackRate;
    audio.volume = this.muted ? 0 : loop ? 0.01 : Math.min(0.75, this.sfxVolume * 0.72);
    audio.onended = () => {
      if (!audio.loop) {
        if (this.onTrackEndedCb) {
          this.onTrackEndedCb();
        } else if (loop && this.playlistTracks.length > 0 && this.playlistTrigger) {
          this.playNextInPlaylist();
        }
      }
    };
    audio.play().catch(() => {});
    if (loop) {
      this.activeAudioEl = audio;
      this.activeAudioUrl = url;
      if (this.muted) {
        audio.volume = 0;
        return;
      }
      // Gentle 450ms fade-in
      const targetVol = this.musicVolume;
      let step = 0;
      this.clearFade();
      this.fadeTimer = window.setInterval(() => {
        step++;
        if (!this.activeAudioEl || this.activeAudioEl !== audio || this.muted) {
          if (this.muted && this.activeAudioEl === audio) audio.volume = 0;
          this.clearFade();
          return;
        }
        audio.volume = Math.min(targetVol, (targetVol * step) / 10);
        if (step >= 10) {
          this.clearFade();
        }
      }, 45);
    }
  }

  playAmbientPreset(presetKey: string) {
    this.stopAmbient();
    const ctx = this.getCtx();
    const gain = ctx.createGain();
    gain.gain.value = this.muted ? 0 : this.musicVolume * 0.22;
    gain.connect(ctx.destination);
    this.ambientGainNode = gain;

    let stopped = false;

    if (presetKey === 'tavern' || presetKey === 'rain') {
      const buffer = this.createNoiseBuffer(ctx, 2.5);
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = presetKey === 'rain' ? 1100 : 420;

      noise.connect(filter);
      filter.connect(gain);
      noise.start();

      this.ambientStopper = () => {
        stopped = true;
        try {
          noise.stop();
          noise.disconnect();
        } catch {
          // ignore
        }
      };
    } else if (presetKey === 'dungeon' || presetKey === 'boss') {
      const freqs = presetKey === 'boss' ? [55, 82.41, 110, 123.47] : [65.41, 98.0, 130.81];
      const oscs = freqs.map((f) => {
        const osc = ctx.createOscillator();
        osc.type = presetKey === 'boss' ? 'sawtooth' : 'sine';
        osc.frequency.value = f;
        const subGain = ctx.createGain();
        subGain.gain.value = presetKey === 'boss' ? 0.08 : 0.14;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = presetKey === 'boss' ? 280 : 220;
        osc.connect(filter);
        filter.connect(subGain);
        subGain.connect(gain);
        osc.start();
        return osc;
      });

      this.ambientStopper = () => {
        stopped = true;
        oscs.forEach((o) => {
          try {
            o.stop();
            o.disconnect();
          } catch {
            // ignore
          }
        });
      };
    } else {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 110;
      const subGain = ctx.createGain();
      subGain.gain.value = 0.1;
      osc.connect(subGain);
      subGain.connect(gain);
      osc.start();

      const timer = window.setInterval(() => {
        if (stopped) return;
        const notes = [220, 261.63, 293.66, 329.63, 392.0];
        const freq = notes[Math.floor(Math.random() * notes.length)];
        const ping = ctx.createOscillator();
        const pGain = ctx.createGain();
        ping.type = 'sine';
        ping.frequency.value = freq;
        pGain.gain.setValueAtTime(0.001, ctx.currentTime);
        pGain.gain.exponentialRampToValueAtTime(this.musicVolume * 0.12, ctx.currentTime + 0.1);
        pGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.8);
        ping.connect(pGain);
        pGain.connect(gain);
        ping.start();
        ping.stop(ctx.currentTime + 1.9);
      }, 2400);

      this.ambientStopper = () => {
        stopped = true;
        window.clearInterval(timer);
        try {
          osc.stop();
        } catch {
          // ignore
        }
      };
    }
  }

  playSfxPreset(presetKey: string) {
    if (this.muted || this.sfxVolume <= 0.005) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const vol = Math.max(0.02, Math.min(0.65, this.sfxVolume * 0.65));
    const reverb = this.getReverb(ctx);
    const sfxOut = this.getSfxOutput(ctx);

    const connectWithReverb = (node: AudioNode, wetAmount = 0.2) => {
      node.connect(sfxOut);
      if (wetAmount > 0) {
        const wet = ctx.createGain();
        wet.gain.value = wetAmount;
        node.connect(reverb);
        reverb.connect(wet);
        wet.connect(sfxOut);
      }
    };

    switch (presetKey) {
      case 'dice': {
        // Realistic wooden table dice rattle (staggered bandpass clicks + resonant wood taps)
        const timings = [0, 0.048, 0.092, 0.145, 0.19, 0.24];
        timings.forEach((offset, idx) => {
          const decay = Math.pow(0.84, idx);
          const src = ctx.createBufferSource();
          src.buffer = this.createNoiseBuffer(ctx, 0.04);
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 950 + Math.random() * 1400;
          bp.Q.value = 3.2;
          const dg = ctx.createGain();
          dg.gain.setValueAtTime(vol * 0.34 * decay, now + offset);
          dg.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.038);
          src.connect(bp);
          bp.connect(dg);
          dg.connect(sfxOut);
          src.start(now + offset);
        });
        break;
      }

      case 'sword': {
        // Layered Steel Slash: Air Whoosh + Metallic Ring Partials + Low Impact Thud
        const whoosh = ctx.createBufferSource();
        whoosh.buffer = this.createNoiseBuffer(ctx, 0.26);
        const wFilter = ctx.createBiquadFilter();
        wFilter.type = 'bandpass';
        wFilter.frequency.setValueAtTime(2800, now);
        wFilter.frequency.exponentialRampToValueAtTime(620, now + 0.22);
        wFilter.Q.value = 1.6;
        const wGain = ctx.createGain();
        wGain.gain.setValueAtTime(0.001, now);
        wGain.gain.linearRampToValueAtTime(vol * 0.42, now + 0.03);
        wGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        whoosh.connect(wFilter);
        wFilter.connect(wGain);
        connectWithReverb(wGain, 0.22);
        whoosh.start(now);

        // Metallic steel shimmer partials
        [1820, 2740, 4190, 5680].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          osc.type = i % 2 === 0 ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(freq, now + 0.02);
          osc.frequency.exponentialRampToValueAtTime(freq * 0.92, now + 0.36);
          const mg = ctx.createGain();
          mg.gain.setValueAtTime(vol * (0.14 / (i + 1)), now + 0.02);
          mg.gain.exponentialRampToValueAtTime(0.0008, now + 0.36);
          osc.connect(mg);
          connectWithReverb(mg, 0.3);
          osc.start(now + 0.02);
          osc.stop(now + 0.38);
        });

        // Sub impact thud
        const thud = ctx.createOscillator();
        thud.type = 'sine';
        thud.frequency.setValueAtTime(140, now + 0.03);
        thud.frequency.exponentialRampToValueAtTime(42, now + 0.16);
        const tg = ctx.createGain();
        tg.gain.setValueAtTime(vol * 0.36, now + 0.03);
        tg.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
        thud.connect(tg);
        tg.connect(sfxOut);
        thud.start(now + 0.03);
        thud.stop(now + 0.18);
        break;
      }

      case 'shield': {
        // Heavy Metallic Shield Clang + Resonant Ring
        const clangPartials = [420, 685, 1140, 1790, 2610];
        clangPartials.forEach((f, idx) => {
          const osc = ctx.createOscillator();
          osc.type = idx < 2 ? 'square' : 'triangle';
          osc.frequency.setValueAtTime(f, now);
          osc.frequency.exponentialRampToValueAtTime(f * 0.96, now + 0.45);
          const cg = ctx.createGain();
          cg.gain.setValueAtTime(vol * (0.16 / (idx + 1)), now);
          cg.gain.exponentialRampToValueAtTime(0.0008, now + 0.45);
          osc.connect(cg);
          connectWithReverb(cg, 0.35);
          osc.start(now);
          osc.stop(now + 0.46);
        });
        const thump = ctx.createOscillator();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(160, now);
        thump.frequency.exponentialRampToValueAtTime(48, now + 0.18);
        const thg = ctx.createGain();
        thg.gain.setValueAtTime(vol * 0.45, now);
        thg.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        thump.connect(thg);
        thg.connect(sfxOut);
        thump.start(now);
        thump.stop(now + 0.22);
        break;
      }

      case 'teleport': {
        // Ethereal Misty Step Whoosh + Arcane Spatial Shimmer + Arrival Pop
        const mist = ctx.createBufferSource();
        mist.buffer = this.createNoiseBuffer(ctx, 0.55);
        const mf = ctx.createBiquadFilter();
        mf.type = 'bandpass';
        mf.frequency.setValueAtTime(650, now);
        mf.frequency.exponentialRampToValueAtTime(2800, now + 0.22);
        mf.frequency.exponentialRampToValueAtTime(480, now + 0.52);
        mf.Q.value = 2.4;
        const mg = ctx.createGain();
        mg.gain.setValueAtTime(0.001, now);
        mg.gain.linearRampToValueAtTime(vol * 0.28, now + 0.12);
        mg.gain.exponentialRampToValueAtTime(0.0008, now + 0.54);
        mist.connect(mf);
        mf.connect(mg);
        connectWithReverb(mg, 0.45);
        mist.start(now);

        const shimmerFreqs = [523.25, 783.99, 1046.5, 1318.5];
        shimmerFreqs.forEach((f, idx) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f * 0.85, now + idx * 0.035);
          osc.frequency.exponentialRampToValueAtTime(f * 1.15, now + idx * 0.035 + 0.28);
          const sg = ctx.createGain();
          sg.gain.setValueAtTime(vol * 0.11, now + idx * 0.035);
          sg.gain.exponentialRampToValueAtTime(0.0008, now + idx * 0.035 + 0.34);
          osc.connect(sg);
          connectWithReverb(sg, 0.4);
          osc.start(now + idx * 0.035);
          osc.stop(now + idx * 0.035 + 0.36);
        });
        break;
      }

      case 'arrow': {
        // Bowstring Twang + Air Whistle + Impact Thwack
        const twang = ctx.createOscillator();
        twang.type = 'triangle';
        twang.frequency.setValueAtTime(190, now);
        twang.frequency.exponentialRampToValueAtTime(95, now + 0.12);
        const twg = ctx.createGain();
        twg.gain.setValueAtTime(vol * 0.28, now);
        twg.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        twang.connect(twg);
        twg.connect(sfxOut);
        twang.start(now);
        twang.stop(now + 0.14);

        const zip = ctx.createBufferSource();
        zip.buffer = this.createNoiseBuffer(ctx, 0.2);
        const zf = ctx.createBiquadFilter();
        zf.type = 'bandpass';
        zf.frequency.setValueAtTime(3400, now + 0.03);
        zf.frequency.exponentialRampToValueAtTime(1400, now + 0.2);
        zf.Q.value = 3.5;
        const zg = ctx.createGain();
        zg.gain.setValueAtTime(vol * 0.32, now + 0.03);
        zg.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
        zip.connect(zf);
        zf.connect(zg);
        zg.connect(sfxOut);
        zip.start(now + 0.03);
        break;
      }

      case 'fireball': {
        // Ignition Whoosh + Deep Sub-Bass Explosion + Crackling Flame Tail
        const boom = ctx.createOscillator();
        boom.type = 'sine';
        boom.frequency.setValueAtTime(115, now);
        boom.frequency.exponentialRampToValueAtTime(26, now + 0.55);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(vol * 0.62, now);
        bg.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        boom.connect(bg);
        connectWithReverb(bg, 0.25);
        boom.start(now);
        boom.stop(now + 0.62);

        const fire = ctx.createBufferSource();
        fire.buffer = this.createNoiseBuffer(ctx, 1.05);
        const ff = ctx.createBiquadFilter();
        ff.type = 'lowpass';
        ff.frequency.setValueAtTime(1800, now);
        ff.frequency.exponentialRampToValueAtTime(180, now + 0.95);
        const fg = ctx.createGain();
        fg.gain.setValueAtTime(0.001, now);
        fg.gain.linearRampToValueAtTime(vol * 0.52, now + 0.04);
        fg.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
        fire.connect(ff);
        ff.connect(fg);
        connectWithReverb(fg, 0.4);
        fire.start(now);
        break;
      }

      case 'thunder': {
        // Sharp Lightning Crack + Multi-Roll Cathedral Thunder
        const crack = ctx.createBufferSource();
        crack.buffer = this.createNoiseBuffer(ctx, 0.16);
        const cf = ctx.createBiquadFilter();
        cf.type = 'highpass';
        cf.frequency.value = 1400;
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(vol * 0.55, now);
        cg.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        crack.connect(cf);
        cf.connect(cg);
        connectWithReverb(cg, 0.5);
        crack.start(now);

        const rumble = ctx.createBufferSource();
        rumble.buffer = this.createNoiseBuffer(ctx, 1.8);
        const rf = ctx.createBiquadFilter();
        rf.type = 'lowpass';
        rf.frequency.setValueAtTime(420, now + 0.05);
        rf.frequency.exponentialRampToValueAtTime(75, now + 1.7);
        const rg = ctx.createGain();
        rg.gain.setValueAtTime(0.001, now + 0.04);
        rg.gain.linearRampToValueAtTime(vol * 0.58, now + 0.18);
        rg.gain.exponentialRampToValueAtTime(0.001, now + 1.75);
        rumble.connect(rf);
        rf.connect(rg);
        connectWithReverb(rg, 0.55);
        rumble.start(now + 0.04);
        break;
      }

      case 'heal': {
        // Celestial Harp Arpeggio with Warm Shimmer Reverb
        const notes = [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.5];
        notes.forEach((freq, i) => {
          const t = now + i * 0.065;
          const osc = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          osc.type = 'sine';
          osc2.type = 'triangle';
          osc.frequency.value = freq;
          osc2.frequency.value = freq * 2.002;
          const hg = ctx.createGain();
          hg.gain.setValueAtTime(0.001, t);
          hg.gain.linearRampToValueAtTime(vol * 0.18, t + 0.025);
          hg.gain.exponentialRampToValueAtTime(0.0008, t + 0.65);
          osc.connect(hg);
          osc2.connect(hg);
          connectWithReverb(hg, 0.45);
          osc.start(t);
          osc2.start(t);
          osc.stop(t + 0.68);
          osc2.stop(t + 0.68);
        });
        break;
      }

      case 'spell': {
        // Arcane Ethereal Sweep + Crystalline Chime
        const sweep = ctx.createOscillator();
        sweep.type = 'sine';
        sweep.frequency.setValueAtTime(240, now);
        sweep.frequency.exponentialRampToValueAtTime(920, now + 0.38);
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.001, now);
        sg.gain.linearRampToValueAtTime(vol * 0.24, now + 0.08);
        sg.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
        sweep.connect(sg);
        connectWithReverb(sg, 0.45);
        sweep.start(now);
        sweep.stop(now + 0.54);

        [587.33, 880, 1174.66].forEach((f, idx) => {
          const c = ctx.createOscillator();
          c.type = 'triangle';
          c.frequency.value = f;
          const cg = ctx.createGain();
          cg.gain.setValueAtTime(0.001, now + 0.06 + idx * 0.04);
          cg.gain.linearRampToValueAtTime(vol * 0.12, now + 0.1 + idx * 0.04);
          cg.gain.exponentialRampToValueAtTime(0.0008, now + 0.6);
          c.connect(cg);
          connectWithReverb(cg, 0.5);
          c.start(now + 0.06 + idx * 0.04);
          c.stop(now + 0.62);
        });
        break;
      }

      case 'roar': {
        // Layered Beast Growl: Vocal-Cord Flutter + Breath Formant Noise
        const growl = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        growl.type = 'sawtooth';
        growl.frequency.setValueAtTime(118, now);
        growl.frequency.exponentialRampToValueAtTime(54, now + 0.85);
        lfo.frequency.value = 26;
        lfoGain.gain.value = 18;
        lfo.connect(lfoGain);
        lfoGain.connect(growl.frequency);

        const gf = ctx.createBiquadFilter();
        gf.type = 'bandpass';
        gf.frequency.setValueAtTime(380, now);
        gf.frequency.exponentialRampToValueAtTime(190, now + 0.85);
        gf.Q.value = 2.0;

        const gg = ctx.createGain();
        gg.gain.setValueAtTime(0.001, now);
        gg.gain.linearRampToValueAtTime(vol * 0.42, now + 0.09);
        gg.gain.exponentialRampToValueAtTime(0.001, now + 0.92);
        growl.connect(gf);
        gf.connect(gg);
        connectWithReverb(gg, 0.4);
        growl.start(now);
        lfo.start(now);
        growl.stop(now + 0.95);
        lfo.stop(now + 0.95);

        const breath = ctx.createBufferSource();
        breath.buffer = this.createNoiseBuffer(ctx, 0.9);
        const bf = ctx.createBiquadFilter();
        bf.type = 'bandpass';
        bf.frequency.setValueAtTime(650, now);
        bf.frequency.exponentialRampToValueAtTime(240, now + 0.85);
        bf.Q.value = 1.4;
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(vol * 0.34, now + 0.05);
        bg.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        breath.connect(bf);
        bf.connect(bg);
        connectWithReverb(bg, 0.45);
        breath.start(now + 0.05);
        break;
      }

      case 'coin': {
        // Crisp Gold Coin Clink / Treasure Jingle
        const pairs = [
          [2489, 3729, 0],
          [2793, 4186, 0.065],
          [3135, 4698, 0.13],
        ];
        pairs.forEach(([f1, f2, off]) => {
          [f1, f2].forEach((f, idx) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = f;
            const cg = ctx.createGain();
            cg.gain.setValueAtTime(vol * (idx === 0 ? 0.18 : 0.1), now + off);
            cg.gain.exponentialRampToValueAtTime(0.0008, now + off + 0.28);
            osc.connect(cg);
            connectWithReverb(cg, 0.25);
            osc.start(now + off);
            osc.stop(now + off + 0.3);
          });
        });
        break;
      }

      case 'potion': {
        // Bubbling Liquid Glug
        [0, 0.09, 0.18].forEach((off, idx) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          const base = 310 + idx * 85;
          osc.frequency.setValueAtTime(base, now + off);
          osc.frequency.exponentialRampToValueAtTime(base * 1.65, now + off + 0.07);
          const pg = ctx.createGain();
          pg.gain.setValueAtTime(vol * 0.24, now + off);
          pg.gain.exponentialRampToValueAtTime(0.001, now + off + 0.075);
          osc.connect(pg);
          pg.connect(sfxOut);
          osc.start(now + off);
          osc.stop(now + off + 0.08);
        });
        break;
      }

      case 'levelup': {
        // Heroic Brass/Bell Fanfare (D4 - F#4 - A4 - D5)
        const chord = [293.66, 369.99, 440.0, 587.33];
        chord.forEach((f, idx) => {
          const t = now + idx * 0.09;
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = f;
          const lg = ctx.createGain();
          lg.gain.setValueAtTime(0.001, t);
          lg.gain.linearRampToValueAtTime(vol * 0.24, t + 0.04);
          lg.gain.exponentialRampToValueAtTime(0.0008, t + 0.95);
          osc.connect(lg);
          connectWithReverb(lg, 0.45);
          osc.start(t);
          osc.stop(t + 1.0);
        });
        break;
      }

      case 'crit': {
        // Cinematic Critical Hit Boom + Bright Bell Impact
        const boom = ctx.createOscillator();
        boom.type = 'sine';
        boom.frequency.setValueAtTime(150, now);
        boom.frequency.exponentialRampToValueAtTime(34, now + 0.4);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(vol * 0.6, now);
        bg.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
        boom.connect(bg);
        connectWithReverb(bg, 0.3);
        boom.start(now);
        boom.stop(now + 0.44);

        [880, 1318.5, 1760].forEach((f, idx) => {
          const bell = ctx.createOscillator();
          bell.type = 'triangle';
          bell.frequency.value = f;
          const cg = ctx.createGain();
          cg.gain.setValueAtTime(vol * (0.2 / (idx + 1)), now);
          cg.gain.exponentialRampToValueAtTime(0.0008, now + 0.55);
          bell.connect(cg);
          connectWithReverb(cg, 0.45);
          bell.start(now);
          bell.stop(now + 0.58);
        });
        break;
      }

      case 'blessing': {
        // Warm Golden Choir/Chime Triad Ascending (Buff / Blessing)
        const notes = [392.0, 493.88, 587.33, 783.99, 987.77];
        notes.forEach((freq, i) => {
          const t = now + i * 0.055;
          const osc = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          osc.type = 'triangle';
          osc2.type = 'sine';
          osc.frequency.value = freq;
          osc2.frequency.value = freq * 1.5;
          const bg = ctx.createGain();
          bg.gain.setValueAtTime(0.001, t);
          bg.gain.linearRampToValueAtTime(vol * 0.16, t + 0.04);
          bg.gain.exponentialRampToValueAtTime(0.0008, t + 0.85);
          osc.connect(bg);
          osc2.connect(bg);
          connectWithReverb(bg, 0.55);
          osc.start(t);
          osc2.start(t);
          osc.stop(t + 0.9);
          osc2.stop(t + 0.9);
        });
        break;
      }

      case 'curse': {
        // Dark Dissonant Descending Pulse (Debuff / Curse / Negative Condition)
        const tritone = [311.13, 220.0, 146.83];
        tritone.forEach((freq, i) => {
          const t = now + i * 0.07;
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, t);
          osc.frequency.exponentialRampToValueAtTime(freq * 0.72, t + 0.55);
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.setValueAtTime(920, t);
          f.frequency.exponentialRampToValueAtTime(190, t + 0.55);
          const cg = ctx.createGain();
          cg.gain.setValueAtTime(0.001, t);
          cg.gain.linearRampToValueAtTime(vol * 0.22, t + 0.04);
          cg.gain.exponentialRampToValueAtTime(0.0008, t + 0.62);
          osc.connect(f);
          f.connect(cg);
          connectWithReverb(cg, 0.5);
          osc.start(t);
          osc.stop(t + 0.65);
        });
        break;
      }

      case 'frost': {
        // Crystalline Ice Shatter + Cold Wind Shimmer
        const wind = ctx.createBufferSource();
        wind.buffer = this.createNoiseBuffer(ctx, 0.55);
        const wf = ctx.createBiquadFilter();
        wf.type = 'bandpass';
        wf.frequency.setValueAtTime(2800, now);
        wf.frequency.exponentialRampToValueAtTime(900, now + 0.5);
        wf.Q.value = 3.0;
        const wg = ctx.createGain();
        wg.gain.setValueAtTime(0.001, now);
        wg.gain.linearRampToValueAtTime(vol * 0.24, now + 0.05);
        wg.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
        wind.connect(wf);
        wf.connect(wg);
        connectWithReverb(wg, 0.45);
        wind.start(now);

        [1760, 2349.32, 3135.96, 3520].forEach((freq, idx) => {
          const t = now + idx * 0.035;
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = freq;
          const cg = ctx.createGain();
          cg.gain.setValueAtTime(vol * 0.14, t);
          cg.gain.exponentialRampToValueAtTime(0.0008, t + 0.32);
          osc.connect(cg);
          connectWithReverb(cg, 0.4);
          osc.start(t);
          osc.stop(t + 0.35);
        });
        break;
      }

      case 'turn': {
        // Crisp Dark-Fantasy Brass/Chime Turn Herald
        const notes = [392.0, 587.33];
        notes.forEach((freq, i) => {
          const t = now + i * 0.085;
          const osc = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          osc.type = 'triangle';
          osc2.type = 'sine';
          osc.frequency.value = freq;
          osc2.frequency.value = freq * 2;
          const tg = ctx.createGain();
          tg.gain.setValueAtTime(0.001, t);
          tg.gain.linearRampToValueAtTime(vol * 0.22, t + 0.02);
          tg.gain.exponentialRampToValueAtTime(0.0008, t + 0.42);
          osc.connect(tg);
          osc2.connect(tg);
          connectWithReverb(tg, 0.4);
          osc.start(t);
          osc2.start(t);
          osc.stop(t + 0.45);
          osc2.stop(t + 0.45);
        });
        break;
      }

      case 'campfire': {
        // Warm Campfire Crackle + Restful Harp Chord
        const crackle = ctx.createBufferSource();
        crackle.buffer = this.createNoiseBuffer(ctx, 1.1);
        const cf = ctx.createBiquadFilter();
        cf.type = 'bandpass';
        cf.frequency.setValueAtTime(1600, now);
        cf.Q.value = 2.2;
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.001, now);
        cg.gain.linearRampToValueAtTime(vol * 0.14, now + 0.08);
        cg.gain.exponentialRampToValueAtTime(0.001, now + 1.05);
        crackle.connect(cf);
        cf.connect(cg);
        connectWithReverb(cg, 0.35);
        crackle.start(now);

        [261.63, 329.63, 392.0, 523.25].forEach((freq, i) => {
          const t = now + 0.06 + i * 0.09;
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = freq;
          const hg = ctx.createGain();
          hg.gain.setValueAtTime(0.001, t);
          hg.gain.linearRampToValueAtTime(vol * 0.17, t + 0.04);
          hg.gain.exponentialRampToValueAtTime(0.0008, t + 1.1);
          osc.connect(hg);
          connectWithReverb(hg, 0.55);
          osc.start(t);
          osc.stop(t + 1.15);
        });
        break;
      }

      case 'scene-transition': {
        const freqs = [146.83, 220.0, 293.66, 369.99];
        const g = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(320, now);
        filter.frequency.exponentialRampToValueAtTime(2200, now + 0.45);
        filter.frequency.exponentialRampToValueAtTime(680, now + 1.5);
        filter.connect(g);
        connectWithReverb(g, 0.45);

        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(vol * 0.28, now + 0.14);
        g.gain.exponentialRampToValueAtTime(0.0008, now + 1.55);

        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          osc.type = idx === 0 ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.045);
          const partialGain = ctx.createGain();
          partialGain.gain.value = idx === 0 ? 0.45 : idx === 3 ? 0.24 : 0.34;
          osc.connect(partialGain);
          partialGain.connect(filter);
          osc.start(now + idx * 0.045);
          osc.stop(now + 1.6);
        });
        break;
      }

      default: {
        // Heavy Dungeon Door Creak + Wooden Latch Thud
        const thud = ctx.createOscillator();
        thud.type = 'triangle';
        thud.frequency.setValueAtTime(145, now);
        thud.frequency.exponentialRampToValueAtTime(52, now + 0.26);
        const tg = ctx.createGain();
        tg.gain.setValueAtTime(vol * 0.42, now);
        tg.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        thud.connect(tg);
        connectWithReverb(tg, 0.35);
        thud.start(now);
        thud.stop(now + 0.3);
      }
    }
  }

  /**
   * Temporarily ducks background music / ambient down to ~14% during an Ultimate Cut-In,
   * then smoothly restores it so the Ultimate commands the entire room.
   */
  duckMusicTemporarily(durationMs = 3100, targetRatio = 0.14) {
    if (this.muted) return;
    if (this.duckTimer !== null) {
      window.clearInterval(this.duckTimer);
      this.duckTimer = null;
    }
    if (this.duckRestoreTimer !== null) {
      window.clearTimeout(this.duckRestoreTimer);
      this.duckRestoreTimer = null;
    }
    const audio = this.activeAudioEl;
    const amb = this.ambientGainNode;
    const origMusicVol = this.musicVolume;
    const duckedMusicVol = Math.max(0.01, origMusicVol * targetRatio);

    if (audio) {
      audio.volume = duckedMusicVol;
    }
    if (amb) {
      amb.gain.value = duckedMusicVol * 0.22;
    }

    this.duckRestoreTimer = window.setTimeout(() => {
      this.duckRestoreTimer = null;
      let step = 0;
      const steps = 14;
      this.duckTimer = window.setInterval(() => {
        step++;
        const t = Math.min(1, step / steps);
        const curVol = this.muted
          ? 0
          : duckedMusicVol + (this.musicVolume - duckedMusicVol) * t;
        if (this.activeAudioEl) {
          this.activeAudioEl.volume = curVol;
        }
        if (this.ambientGainNode) {
          this.ambientGainNode.gain.value = curVol * 0.22;
        }
        if (step >= steps && this.duckTimer !== null) {
          window.clearInterval(this.duckTimer);
          this.duckTimer = null;
        }
      }, 48);
    }, Math.max(400, durationMs - 680));
  }

  pushDomainMusic(url: string) {
    if (!url || !url.trim()) return;
    if (this.preDomainMusicUrl === null && this.activeAudioUrl && this.activeAudioUrl !== url) {
      this.preDomainMusicUrl = this.activeAudioUrl;
    }
    this.playCustomUrl(url, true);
  }

  popDomainMusic() {
    const prev = this.preDomainMusicUrl;
    this.preDomainMusicUrl = null;
    if (prev) {
      this.playCustomUrl(prev, true);
    }
  }

  /**
   * 3-Beat Cinema Ultimate SFX Synthesizer (Riser -> Silence Breath -> Sub-Bass Drop + Impact!)
   * OR plays a custom uploaded MP3/WAV SFX with automatic background music ducking.
   */
  playUltimateSfx(
    preset:
      | 'bass-drop'
      | 'sonic-boom'
      | 'anime-slash'
      | 'dimension-rift'
      | 'demonic-roar'
      | 'time-stop'
      | 'celestial-choir'
      | 'inferno-nova' = 'bass-drop',
    customAudioUrl?: string
  ) {
    if (this.muted) return;
    this.duckMusicTemporarily(3200, 0.14);

    if (customAudioUrl && customAudioUrl.trim()) {
      const audio = new Audio(customAudioUrl);
      audio.volume = Math.min(1, Math.max(0.68, this.sfxVolume * 2.4));
      audio.play().catch(() => {});
      return;
    }

    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const vol = Math.min(0.95, Math.max(0.42, this.sfxVolume * 2.1));
    const sfxOut = this.getSfxOutput(ctx);
    const reverb = this.getReverb(ctx);

    const routeWet = (node: AudioNode, wet = 0.45) => {
      node.connect(sfxOut);
      if (wet > 0) {
        const wg = ctx.createGain();
        wg.gain.value = wet;
        node.connect(wg);
        wg.connect(reverb);
        reverb.connect(sfxOut);
      }
    };

    // Soft-clipping warmth waveshaper for cinematic sub-bass punch
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1;
      curve[i] = ((3 + 10) * x * 20 * (Math.PI / 180)) / (Math.PI + 10 * Math.abs(x));
    }
    shaper.curve = curve;

    const dropAt = now + 0.46; // Synced to the 440-460ms Impact Frame!

    if (preset === 'sonic-boom') {
      // BEAT 1 (0.00 -> 0.40s): Harmonic Resonance Swell
      const riserOsc = ctx.createOscillator();
      riserOsc.type = 'sine';
      riserOsc.frequency.setValueAtTime(280, now);
      riserOsc.frequency.exponentialRampToValueAtTime(1650, now + 0.39);
      const riserGain = ctx.createGain();
      riserGain.gain.setValueAtTime(0.001, now);
      riserGain.gain.exponentialRampToValueAtTime(vol * 0.36, now + 0.36);
      riserGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.41);
      riserOsc.connect(riserGain);
      routeWet(riserGain, 0.5);
      riserOsc.start(now);
      riserOsc.stop(now + 0.42);

      // BEAT 2 (0.46s): ACOUSTIC SHOCKWAVE BOOM + SUB DROP + HARMONIC CHORD
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(124, dropAt);
      sub.frequency.exponentialRampToValueAtTime(28, dropAt + 1.35);
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.001, dropAt);
      subGain.gain.linearRampToValueAtTime(vol * 0.95, dropAt + 0.025);
      subGain.gain.exponentialRampToValueAtTime(0.001, dropAt + 1.65);
      sub.connect(shaper);
      shaper.connect(subGain);
      routeWet(subGain, 0.25);
      sub.start(dropAt);
      sub.stop(dropAt + 1.7);

      const noise = ctx.createBufferSource();
      noise.buffer = this.createNoiseBuffer(ctx, 1.3);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 3.2;
      bp.frequency.setValueAtTime(2800, dropAt);
      bp.frequency.exponentialRampToValueAtTime(75, dropAt + 0.95);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vol * 0.72, dropAt);
      ng.gain.exponentialRampToValueAtTime(0.001, dropAt + 1.2);
      noise.connect(bp);
      bp.connect(ng);
      routeWet(ng, 0.55);
      noise.start(dropAt);

      [261.63, 392.0, 587.33, 783.99].forEach((freq, idx) => {
        const chordOsc = ctx.createOscillator();
        chordOsc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        chordOsc.frequency.setValueAtTime(freq, dropAt + idx * 0.015);
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.001, dropAt + idx * 0.015);
        cg.gain.linearRampToValueAtTime(vol * 0.16, dropAt + 0.08 + idx * 0.015);
        cg.gain.exponentialRampToValueAtTime(0.0008, dropAt + 1.9);
        chordOsc.connect(cg);
        routeWet(cg, 0.75);
        chordOsc.start(dropAt + idx * 0.015);
        chordOsc.stop(dropAt + 1.95);
      });
      return;
    }

    if (preset === 'anime-slash') {
      // BEAT 1: Katana metallic ring + electric charge
      const steel = ctx.createOscillator();
      steel.type = 'sawtooth';
      steel.frequency.setValueAtTime(2200, now);
      steel.frequency.exponentialRampToValueAtTime(4400, now + 0.36);
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 3400;
      hp.Q.value = 6;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.001, now);
      sg.gain.exponentialRampToValueAtTime(vol * 0.34, now + 0.32);
      sg.gain.exponentialRampToValueAtTime(0.0008, now + 0.4);
      steel.connect(hp);
      hp.connect(sg);
      routeWet(sg, 0.5);
      steel.start(now);
      steel.stop(now + 0.41);

      // BEAT 2: Double Lightning Katana Slash + Heavy Thunder Sub
      [0, 0.15].forEach((offset, idx) => {
        const t = dropAt + offset;
        const slashNoise = ctx.createBufferSource();
        slashNoise.buffer = this.createNoiseBuffer(ctx, 0.55);
        const sf = ctx.createBiquadFilter();
        sf.type = 'bandpass';
        sf.Q.value = 1.6;
        sf.frequency.setValueAtTime(idx === 0 ? 4200 : 3200, t);
        sf.frequency.exponentialRampToValueAtTime(160, t + 0.35);
        const sng = ctx.createGain();
        sng.gain.setValueAtTime(vol * (idx === 0 ? 0.85 : 0.62), t);
        sng.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
        slashNoise.connect(sf);
        sf.connect(sng);
        routeWet(sng, 0.5);
        slashNoise.start(t);
      });

      const sub = ctx.createOscillator();
      sub.type = 'triangle';
      sub.frequency.setValueAtTime(105, dropAt);
      sub.frequency.exponentialRampToValueAtTime(26, dropAt + 1.15);
      const subG = ctx.createGain();
      subG.gain.setValueAtTime(vol * 0.95, dropAt);
      subG.gain.exponentialRampToValueAtTime(0.001, dropAt + 1.35);
      sub.connect(shaper);
      shaper.connect(subG);
      routeWet(subG, 0.35);
      sub.start(dropAt);
      sub.stop(dropAt + 1.4);
      return;
    }

    if (preset === 'dimension-rift') {
      // BEAT 1: Eerie abyssal beating hum
      [62, 66.5].forEach((f) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, now);
        o.frequency.linearRampToValueAtTime(f * 1.45, now + 0.39);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(260, now);
        lp.frequency.exponentialRampToValueAtTime(1400, now + 0.39);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(vol * 0.25, now + 0.35);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.41);
        o.connect(lp);
        lp.connect(g);
        routeWet(g, 0.6);
        o.start(now);
        o.stop(now + 0.42);
      });

      // BEAT 2: Reality Glass Shatter Cascade + Abyssal Sub Drop
      [1980, 2640, 3320, 4180, 2960, 4860].forEach((freq, i) => {
        const t = dropAt + i * 0.032;
        const shard = ctx.createOscillator();
        shard.type = 'triangle';
        shard.frequency.setValueAtTime(freq, t);
        shard.frequency.exponentialRampToValueAtTime(freq * 0.72, t + 0.45);
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(vol * 0.24, t);
        sg.gain.exponentialRampToValueAtTime(0.0008, t + 0.55);
        shard.connect(sg);
        routeWet(sg, 0.75);
        shard.start(t);
        shard.stop(t + 0.58);
      });

      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(84, dropAt);
      sub.frequency.exponentialRampToValueAtTime(22, dropAt + 1.85);
      const subG = ctx.createGain();
      subG.gain.setValueAtTime(0.001, dropAt);
      subG.gain.linearRampToValueAtTime(vol * 1.0, dropAt + 0.03);
      subG.gain.exponentialRampToValueAtTime(0.001, dropAt + 2.1);
      sub.connect(shaper);
      shaper.connect(subG);
      routeWet(subG, 0.4);
      sub.start(dropAt);
      sub.stop(dropAt + 2.15);
      return;
    }

    if (preset === 'demonic-roar') {
      // BEAT 1 (0.00 -> 0.40s): Dark abyssal inhale + low sub dread groan
      const inhale = ctx.createBufferSource();
      inhale.buffer = this.createNoiseBuffer(ctx, 0.42);
      const ihf = ctx.createBiquadFilter();
      ihf.type = 'bandpass';
      ihf.frequency.setValueAtTime(180, now);
      ihf.frequency.exponentialRampToValueAtTime(980, now + 0.38);
      ihf.Q.value = 2.6;
      const ihg = ctx.createGain();
      ihg.gain.setValueAtTime(0.001, now);
      ihg.gain.exponentialRampToValueAtTime(vol * 0.42, now + 0.36);
      ihg.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      inhale.connect(ihf);
      ihf.connect(ihg);
      routeWet(ihg, 0.55);
      inhale.start(now);

      // BEAT 2 (0.46s): COLOSSAL DEMONIC ROAR + FM VOCAL GROWL + TRITONE WAR HORN
      const growl = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      growl.type = 'sawtooth';
      growl.frequency.setValueAtTime(142, dropAt);
      growl.frequency.exponentialRampToValueAtTime(46, dropAt + 1.75);
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(34, dropAt);
      lfo.frequency.linearRampToValueAtTime(18, dropAt + 1.7);
      lfoGain.gain.setValueAtTime(32, dropAt);
      lfoGain.gain.exponentialRampToValueAtTime(6, dropAt + 1.7);
      lfo.connect(lfoGain);
      lfoGain.connect(growl.frequency);

      const formant = ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.setValueAtTime(620, dropAt);
      formant.frequency.exponentialRampToValueAtTime(195, dropAt + 1.65);
      formant.Q.value = 2.4;

      const gg = ctx.createGain();
      gg.gain.setValueAtTime(0.001, dropAt);
      gg.gain.linearRampToValueAtTime(vol * 0.85, dropAt + 0.05);
      gg.gain.exponentialRampToValueAtTime(0.001, dropAt + 1.9);
      growl.connect(shaper);
      shaper.connect(formant);
      formant.connect(gg);
      routeWet(gg, 0.65);
      growl.start(dropAt);
      lfo.start(dropAt);
      growl.stop(dropAt + 1.95);
      lfo.stop(dropAt + 1.95);

      // Breath snarl noise burst
      const snarl = ctx.createBufferSource();
      snarl.buffer = this.createNoiseBuffer(ctx, 1.55);
      const sf = ctx.createBiquadFilter();
      sf.type = 'bandpass';
      sf.frequency.setValueAtTime(950, dropAt);
      sf.frequency.exponentialRampToValueAtTime(210, dropAt + 1.4);
      sf.Q.value = 1.6;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(vol * 0.68, dropAt);
      sg.gain.exponentialRampToValueAtTime(0.001, dropAt + 1.5);
      snarl.connect(sf);
      sf.connect(sg);
      routeWet(sg, 0.6);
      snarl.start(dropAt);

      // Hellish Tritone Doom Brass + Sub Earthquake
      [55, 77.78, 110].forEach((freq, idx) => {
        const horn = ctx.createOscillator();
        horn.type = idx === 0 ? 'sine' : 'sawtooth';
        horn.frequency.setValueAtTime(freq, dropAt);
        horn.frequency.exponentialRampToValueAtTime(freq * 0.84, dropAt + 1.95);
        const hlp = ctx.createBiquadFilter();
        hlp.type = 'lowpass';
        hlp.frequency.setValueAtTime(idx === 0 ? 180 : 620, dropAt);
        const hg = ctx.createGain();
        hg.gain.setValueAtTime(0.001, dropAt);
        hg.gain.linearRampToValueAtTime(vol * (idx === 0 ? 0.92 : 0.2), dropAt + 0.04);
        hg.gain.exponentialRampToValueAtTime(0.001, dropAt + 2.05);
        horn.connect(hlp);
        hlp.connect(hg);
        routeWet(hg, 0.7);
        horn.start(dropAt);
        horn.stop(dropAt + 2.1);
      });
      return;
    }

    if (preset === 'time-stop') {
      // BEAT 1 (0.00 -> 0.40s): Rapid clockwork ticks slowing/pitching down into stillness
      const tickOffsets = [0.0, 0.09, 0.19, 0.31];
      tickOffsets.forEach((off, idx) => {
        const t = now + off;
        const tick = ctx.createOscillator();
        tick.type = 'triangle';
        const baseF = 1600 - idx * 240;
        tick.frequency.setValueAtTime(baseF, t);
        tick.frequency.exponentialRampToValueAtTime(baseF * 0.45, t + 0.045);
        const tg = ctx.createGain();
        tg.gain.setValueAtTime(vol * (0.34 + idx * 0.05), t);
        tg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        tick.connect(tg);
        routeWet(tg, 0.4);
        tick.start(t);
        tick.stop(t + 0.055);
      });

      // BEAT 2 (0.46s): ICONIC TIME-STOP HEAVY PITCH-WARP BASS DIVE + STASIS RING
      const warp = ctx.createOscillator();
      warp.type = 'sawtooth';
      warp.frequency.setValueAtTime(240, dropAt);
      warp.frequency.exponentialRampToValueAtTime(23, dropAt + 1.55);
      const wlp = ctx.createBiquadFilter();
      wlp.type = 'lowpass';
      wlp.frequency.setValueAtTime(2200, dropAt);
      wlp.frequency.exponentialRampToValueAtTime(85, dropAt + 1.45);
      const wg = ctx.createGain();
      wg.gain.setValueAtTime(0.001, dropAt);
      wg.gain.linearRampToValueAtTime(vol * 0.92, dropAt + 0.025);
      wg.gain.exponentialRampToValueAtTime(0.001, dropAt + 1.85);
      warp.connect(shaper);
      shaper.connect(wlp);
      wlp.connect(wg);
      routeWet(wg, 0.55);
      warp.start(dropAt);
      warp.stop(dropAt + 1.9);

      // Sub-sine drop punch
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(118, dropAt);
      sub.frequency.exponentialRampToValueAtTime(24, dropAt + 1.6);
      const subG = ctx.createGain();
      subG.gain.setValueAtTime(vol * 0.96, dropAt);
      subG.gain.exponentialRampToValueAtTime(0.001, dropAt + 1.9);
      sub.connect(subG);
      routeWet(subG, 0.35);
      sub.start(dropAt);
      sub.stop(dropAt + 1.95);

      // Frozen crystalline stasis overtone
      [1046.5, 1567.98, 2093.0].forEach((f, idx) => {
        const chime = ctx.createOscillator();
        chime.type = 'sine';
        chime.frequency.setValueAtTime(f, dropAt + 0.04);
        chime.frequency.exponentialRampToValueAtTime(f * 0.985, dropAt + 1.95);
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.001, dropAt + 0.04);
        cg.gain.linearRampToValueAtTime(vol * (0.14 / (idx + 1)), dropAt + 0.14);
        cg.gain.exponentialRampToValueAtTime(0.0008, dropAt + 2.05);
        chime.connect(cg);
        routeWet(cg, 0.8);
        chime.start(dropAt + 0.04);
        chime.stop(dropAt + 2.1);
      });
      return;
    }

    if (preset === 'celestial-choir') {
      // BEAT 1 (0.00 -> 0.40s): Ascending angelic harp arpeggio
      const arp = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
      arp.forEach((f, idx) => {
        const t = now + idx * 0.055;
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(vol * 0.2, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0008, t + 0.36);
        o.connect(g);
        routeWet(g, 0.65);
        o.start(t);
        o.stop(t + 0.38);
      });

      // BEAT 2 (0.46s): CATHEDRAL BELL STRIKE + RADIANT CHOIR CHORD + ORGAN SUB PEDAL
      [261.63, 523.25, 783.99, 1046.5, 1567.98].forEach((freq, idx) => {
        const bell = ctx.createOscillator();
        bell.type = idx % 2 === 0 ? 'sine' : 'triangle';
        bell.frequency.setValueAtTime(freq, dropAt);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(vol * (0.28 / (idx * 0.55 + 1)), dropAt);
        bg.gain.exponentialRampToValueAtTime(0.0008, dropAt + 2.2);
        bell.connect(bg);
        routeWet(bg, 0.8);
        bell.start(dropAt);
        bell.stop(dropAt + 2.25);
      });

      // Radiant detuned Major-9th choir pad (C4 - G4 - B4 - D5 - E5)
      [261.63, 392.0, 493.88, 587.33, 659.25].forEach((freq) => {
        [-4, 4].forEach((detune) => {
          const voice = ctx.createOscillator();
          voice.type = 'triangle';
          voice.frequency.value = freq;
          voice.detune.value = detune;
          const vbp = ctx.createBiquadFilter();
          vbp.type = 'lowpass';
          vbp.frequency.setValueAtTime(1800, dropAt);
          vbp.frequency.exponentialRampToValueAtTime(650, dropAt + 2.2);
          const vg = ctx.createGain();
          vg.gain.setValueAtTime(0.001, dropAt);
          vg.gain.linearRampToValueAtTime(vol * 0.085, dropAt + 0.14);
          vg.gain.exponentialRampToValueAtTime(0.0008, dropAt + 2.3);
          voice.connect(vbp);
          vbp.connect(vg);
          routeWet(vg, 0.85);
          voice.start(dropAt);
          voice.stop(dropAt + 2.35);
        });
      });

      // Deep Cathedral Organ Bass Pedal
      const organ = ctx.createOscillator();
      organ.type = 'sine';
      organ.frequency.setValueAtTime(65.41, dropAt);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.001, dropAt);
      og.gain.linearRampToValueAtTime(vol * 0.78, dropAt + 0.05);
      og.gain.exponentialRampToValueAtTime(0.001, dropAt + 2.1);
      organ.connect(shaper);
      shaper.connect(og);
      routeWet(og, 0.5);
      organ.start(dropAt);
      organ.stop(dropAt + 2.15);
      return;
    }

    if (preset === 'inferno-nova') {
      // BEAT 1 (0.00 -> 0.40s): Imploding Vacuum Flame Suction
      const suck = ctx.createBufferSource();
      suck.buffer = this.createNoiseBuffer(ctx, 0.42);
      const slp = ctx.createBiquadFilter();
      slp.type = 'bandpass';
      slp.frequency.setValueAtTime(3200, now);
      slp.frequency.exponentialRampToValueAtTime(220, now + 0.38);
      slp.Q.value = 1.8;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.001, now);
      sg.gain.exponentialRampToValueAtTime(vol * 0.48, now + 0.36);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      suck.connect(slp);
      slp.connect(sg);
      routeWet(sg, 0.45);
      suck.start(now);

      // BEAT 2 (0.46s): PYROCLASTIC SUPERNOVA DETONATION + SEISMIC SHOCK + ROARING FIRE TAIL
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(132, dropAt);
      sub.frequency.exponentialRampToValueAtTime(22, dropAt + 1.55);
      const subG = ctx.createGain();
      subG.gain.setValueAtTime(vol * 1.0, dropAt);
      subG.gain.exponentialRampToValueAtTime(0.001, dropAt + 1.85);
      sub.connect(shaper);
      shaper.connect(subG);
      routeWet(subG, 0.35);
      sub.start(dropAt);
      sub.stop(dropAt + 1.9);

      const blast = ctx.createBufferSource();
      blast.buffer = this.createNoiseBuffer(ctx, 2.0);
      const blp = ctx.createBiquadFilter();
      blp.type = 'lowpass';
      blp.frequency.setValueAtTime(3600, dropAt);
      blp.frequency.exponentialRampToValueAtTime(140, dropAt + 1.85);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(vol * 0.92, dropAt);
      bg.gain.exponentialRampToValueAtTime(0.001, dropAt + 1.95);
      blast.connect(blp);
      blp.connect(bg);
      routeWet(bg, 0.65);
      blast.start(dropAt);

      // Fiery brass flare overtone
      [110, 164.81, 220].forEach((freq, idx) => {
        const flare = ctx.createOscillator();
        flare.type = 'sawtooth';
        flare.frequency.setValueAtTime(freq, dropAt);
        flare.frequency.exponentialRampToValueAtTime(freq * 0.72, dropAt + 1.6);
        const flp = ctx.createBiquadFilter();
        flp.type = 'lowpass';
        flp.frequency.setValueAtTime(1100, dropAt);
        flp.frequency.exponentialRampToValueAtTime(180, dropAt + 1.55);
        const fg = ctx.createGain();
        fg.gain.setValueAtTime(vol * (0.22 / (idx + 1)), dropAt);
        fg.gain.exponentialRampToValueAtTime(0.001, dropAt + 1.65);
        flare.connect(flp);
        flp.connect(fg);
        routeWet(fg, 0.7);
        flare.start(dropAt);
        flare.stop(dropAt + 1.7);
      });
      return;
    }

    // DEFAULT: 'bass-drop' (Monumental Domain Expansion / Time-Stop Bass Drop!)
    // BEAT 1 (0.00 -> 0.40s): Vacuum Riser Noise + Sub Tension Climb
    const riserNoise = ctx.createBufferSource();
    riserNoise.buffer = this.createNoiseBuffer(ctx, 0.45);
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.setValueAtTime(180, now);
    rlp.frequency.exponentialRampToValueAtTime(4200, now + 0.39);
    const rng = ctx.createGain();
    rng.gain.setValueAtTime(0.001, now);
    rng.gain.exponentialRampToValueAtTime(vol * 0.44, now + 0.37);
    rng.gain.exponentialRampToValueAtTime(0.001, now + 0.41);
    riserNoise.connect(rlp);
    rlp.connect(rng);
    routeWet(rng, 0.4);
    riserNoise.start(now);

    const climb = ctx.createOscillator();
    climb.type = 'triangle';
    climb.frequency.setValueAtTime(48, now);
    climb.frequency.exponentialRampToValueAtTime(128, now + 0.39);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.001, now);
    cg.gain.exponentialRampToValueAtTime(vol * 0.36, now + 0.37);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.41);
    climb.connect(cg);
    routeWet(cg, 0.3);
    climb.start(now);
    climb.stop(now + 0.42);

    // BEAT 2 (0.46s after 60ms dead-air breath): COLOSSAL SUB-BASS DROP + POWER FIFTH CHORD
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(102, dropAt);
    sub.frequency.exponentialRampToValueAtTime(26, dropAt + 1.65);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.001, dropAt);
    subGain.gain.linearRampToValueAtTime(vol * 1.0, dropAt + 0.02);
    subGain.gain.exponentialRampToValueAtTime(0.001, dropAt + 1.95);
    sub.connect(shaper);
    shaper.connect(subGain);
    routeWet(subGain, 0.32);
    sub.start(dropAt);
    sub.stop(dropAt + 2.0);

    // Sharp Impact Crack at exact drop
    const punchNoise = ctx.createBufferSource();
    punchNoise.buffer = this.createNoiseBuffer(ctx, 0.65);
    const plp = ctx.createBiquadFilter();
    plp.type = 'lowpass';
    plp.frequency.setValueAtTime(2400, dropAt);
    plp.frequency.exponentialRampToValueAtTime(90, dropAt + 0.55);
    const png = ctx.createGain();
    png.gain.setValueAtTime(vol * 0.78, dropAt);
    png.gain.exponentialRampToValueAtTime(0.001, dropAt + 0.6);
    punchNoise.connect(plp);
    plp.connect(png);
    routeWet(png, 0.6);
    punchNoise.start(dropAt);

    // Dark Cathedral Power-Fifth Chord Ringing Out
    [73.42, 110.0, 146.83, 220.0].forEach((freq, idx) => {
      const pad = ctx.createOscillator();
      pad.type = idx < 2 ? 'sawtooth' : 'triangle';
      pad.frequency.setValueAtTime(freq, dropAt);
      const padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.setValueAtTime(920, dropAt);
      padFilter.frequency.exponentialRampToValueAtTime(220, dropAt + 2.0);
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(0.001, dropAt);
      pg.gain.linearRampToValueAtTime(vol * 0.14, dropAt + 0.09);
      pg.gain.exponentialRampToValueAtTime(0.0008, dropAt + 2.2);
      pad.connect(padFilter);
      padFilter.connect(pg);
      routeWet(pg, 0.8);
      pad.start(dropAt);
      pad.stop(dropAt + 2.25);
    });
  }

  /**
   * Visceral Jujutsu-style BLACK FLASH (Kokusen) SFX:
   * Razor electric snap -> 45ms vacuum silence -> Distorted sub-bass slam + crimson lightning whip!
   */
  playBlackFlashSfx() {
    if (this.muted) return;
    this.duckMusicTemporarily(1150, 0.18);
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const vol = Math.min(0.95, Math.max(0.48, this.sfxVolume * 2.2));
    const sfxOut = this.getSfxOutput(ctx);
    const reverb = this.getReverb(ctx);

    const routeWet = (node: AudioNode, wet = 0.45) => {
      node.connect(sfxOut);
      if (wet > 0) {
        const wg = ctx.createGain();
        wg.gain.value = wet;
        node.connect(wg);
        wg.connect(reverb);
        reverb.connect(sfxOut);
      }
    };

    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1;
      curve[i] = Math.tanh(x * 3.8);
    }
    shaper.curve = curve;

    // 1) Initial sharp electric spatial snap (0.00 -> 0.06s)
    const snap = ctx.createBufferSource();
    snap.buffer = this.createNoiseBuffer(ctx, 0.07);
    const shp = ctx.createBiquadFilter();
    shp.type = 'highpass';
    shp.frequency.value = 2400;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(vol * 0.72, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    snap.connect(shp);
    shp.connect(sg);
    routeWet(sg, 0.35);
    snap.start(now);

    // 2) 45ms dead-air breath -> BLACK FLASH DISTORTED SUB-BASS SLAM + ELECTRIC CRACKLE (0.105s)
    const hitAt = now + 0.105;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(148, hitAt);
    sub.frequency.exponentialRampToValueAtTime(24, hitAt + 0.72);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(vol * 1.0, hitAt);
    subG.gain.exponentialRampToValueAtTime(0.001, hitAt + 0.85);
    sub.connect(shaper);
    shaper.connect(subG);
    routeWet(subG, 0.35);
    sub.start(hitAt);
    sub.stop(hitAt + 0.88);

    // Jagged lightning whip sweep
    const whip = ctx.createBufferSource();
    whip.buffer = this.createNoiseBuffer(ctx, 0.45);
    const wbp = ctx.createBiquadFilter();
    wbp.type = 'bandpass';
    wbp.Q.value = 2.2;
    wbp.frequency.setValueAtTime(5200, hitAt);
    wbp.frequency.exponentialRampToValueAtTime(240, hitAt + 0.38);
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(vol * 0.85, hitAt);
    wg.gain.exponentialRampToValueAtTime(0.001, hitAt + 0.44);
    whip.connect(wbp);
    wbp.connect(wg);
    routeWet(wg, 0.6);
    whip.start(hitAt);

    // Dark crimson metallic tritone sting
    [311.13, 440.0, 880.0].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, hitAt);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.82, hitAt + 0.55);
      const og = ctx.createGain();
      og.gain.setValueAtTime(vol * (0.2 / (idx + 1)), hitAt);
      og.gain.exponentialRampToValueAtTime(0.0008, hitAt + 0.6);
      osc.connect(og);
      routeWet(og, 0.65);
      osc.start(hitAt);
      osc.stop(hitAt + 0.62);
    });
  }

  /**
   * Visceral EXECUTION ("COMO VOCÊ QUER FAZER ISSO?") SFX:
   * Heavy fatal steel cleave + visceral impact boom (+ dark cathedral bell on Boss execution!)
   */
  playExecutionSfx(isBoss = false) {
    if (this.muted) return;
    this.duckMusicTemporarily(isBoss ? 2200 : 1400, 0.18);
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const vol = Math.min(0.95, Math.max(0.45, this.sfxVolume * 2.1));
    const sfxOut = this.getSfxOutput(ctx);
    const reverb = this.getReverb(ctx);

    const routeWet = (node: AudioNode, wet = 0.5) => {
      node.connect(sfxOut);
      if (wet > 0) {
        const wg = ctx.createGain();
        wg.gain.value = wet;
        node.connect(wg);
        wg.connect(reverb);
        reverb.connect(sfxOut);
      }
    };

    // 1) Heavy executioner blade cleave whoosh
    const cleave = ctx.createBufferSource();
    cleave.buffer = this.createNoiseBuffer(ctx, 0.42);
    const cbp = ctx.createBiquadFilter();
    cbp.type = 'bandpass';
    cbp.Q.value = 1.9;
    cbp.frequency.setValueAtTime(3800, now);
    cbp.frequency.exponentialRampToValueAtTime(190, now + 0.34);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(vol * 0.78, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    cleave.connect(cbp);
    cbp.connect(cg);
    routeWet(cg, 0.5);
    cleave.start(now);

    // 2) Visceral fatal sub impact at 0.08s
    const boomAt = now + 0.08;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(isBoss ? 112 : 130, boomAt);
    sub.frequency.exponentialRampToValueAtTime(isBoss ? 22 : 30, boomAt + (isBoss ? 1.45 : 0.75));
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(vol * (isBoss ? 0.98 : 0.82), boomAt);
    subG.gain.exponentialRampToValueAtTime(0.001, boomAt + (isBoss ? 1.65 : 0.85));
    sub.connect(subG);
    routeWet(subG, 0.45);
    sub.start(boomAt);
    sub.stop(boomAt + (isBoss ? 1.7 : 0.9));

    // 3) Metallic execution bell toll (richer cathedral chord for Boss kills!)
    const partials = isBoss ? [146.83, 293.66, 440.0, 587.33, 880.0] : [220.0, 440.0, 659.25];
    partials.forEach((freq, idx) => {
      const bell = ctx.createOscillator();
      bell.type = idx % 2 === 0 ? 'triangle' : 'sine';
      bell.frequency.setValueAtTime(freq, boomAt);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(vol * ((isBoss ? 0.24 : 0.16) / (idx * 0.65 + 1)), boomAt);
      bg.gain.exponentialRampToValueAtTime(0.0008, boomAt + (isBoss ? 2.0 : 1.1));
      bell.connect(bg);
      routeWet(bg, 0.75);
      bell.start(boomAt);
      bell.stop(boomAt + (isBoss ? 2.05 : 1.15));
    });
  }
}

export const ABILITY_SFX_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Automático (Inteligente)' },
  { value: 'sword', label: '⚔️ Espada / Golpe Físico' },
  { value: 'arrow', label: '🏹 Arco / Projétil' },
  { value: 'shield', label: '🛡️ Escudo / Defesa' },
  { value: 'heal', label: '💚 Cura / Harpa Celestial' },
  { value: 'blessing', label: '✨ Bênção / Buff Positivo' },
  { value: 'curse', label: '☠️ Maldição / Condição Negativa' },
  { value: 'spell', label: '🔮 Magia Arcana' },
  { value: 'fireball', label: '🔥 Bola de Fogo / Explosão' },
  { value: 'thunder', label: '⚡ Relâmpago / Trovão' },
  { value: 'frost', label: '❄️ Gelo / Cristal' },
  { value: 'roar', label: '🐉 Rugido / Fera' },
  { value: 'potion', label: '🧪 Poção / Alquimia' },
  { value: 'crit', label: '💥 Impacto Crítico' },
];

const POSITIVE_CONDITION_HINTS = [
  'abencoado',
  'abençoado',
  'bencao',
  'benção',
  'inspirado',
  'velocidade',
  'haste',
  'protegido',
  'escudo',
  'invisivel',
  'invisível',
  'furia',
  'fúria',
  'regenera',
  'fortalec',
  'heroi',
  'herói',
];

export function resolveAbilitySfxPreset(params: {
  explicitSfxPreset?: string;
  title?: string;
  damageType?: string;
  range?: string;
  applyConditionId?: string;
  conditionName?: string;
  isAttack?: boolean;
}): string {
  if (params.explicitSfxPreset && params.explicitSfxPreset.trim()) {
    return params.explicitSfxPreset.trim();
  }
  const dt = (params.damageType || '').toLowerCase();
  const title = (params.title || '').toLowerCase();
  const range = (params.range || '').toLowerCase();
  const cond = `${params.applyConditionId || ''} ${params.conditionName || ''}`.toLowerCase();

  if (dt === 'cura' || title.includes('curar') || title.includes('cura') || title.includes('palavra curativa')) {
    return 'heal';
  }
  if (dt.includes('fogo') || dt.includes('chama') || title.includes('fogo') || title.includes('chama')) {
    return 'fireball';
  }
  if (dt.includes('elétric') || dt.includes('eletric') || dt.includes('trov') || dt.includes('relâmpago') || dt.includes('raio')) {
    return 'thunder';
  }
  if (dt.includes('frio') || dt.includes('gelo') || dt.includes('gélid') || title.includes('gelo') || title.includes('cone de frio')) {
    return 'frost';
  }
  if (dt.includes('radiante') || title.includes('bênção') || title.includes('bencao') || title.includes('sagrad')) {
    return 'blessing';
  }
  if (dt.includes('necrót') || dt.includes('necrot') || dt.includes('veneno') || dt.includes('psíquic') || dt.includes('ácido')) {
    return 'curse';
  }
  if (title.includes('escudo') || title.includes('defesa') || title.includes('armadura')) {
    return 'shield';
  }
  if (params.applyConditionId && !dt) {
    const isPositive = POSITIVE_CONDITION_HINTS.some(
      (hint) => cond.includes(hint) || title.includes(hint)
    );
    return isPositive ? 'blessing' : 'curse';
  }
  if (
    title.includes('arco') ||
    title.includes('flecha') ||
    title.includes('besta') ||
    title.includes('tiro') ||
    title.includes('disparo') ||
    dt.includes('perfur') && (range.includes('dist') || range.includes('m'))
  ) {
    return 'arrow';
  }
  if (dt.includes('cort') || dt.includes('concuss') || dt.includes('impact') || dt.includes('perfur')) {
    return 'sword';
  }
  if (params.isAttack) {
    return dt.includes('arcano') || dt.includes('energia') || dt.includes('força') ? 'spell' : 'sword';
  }
  return 'spell';
}

export const soundEngine = new SoundEngine();
