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
  private ambientStopper: (() => void) | null = null;
  private activeAudioEl: HTMLAudioElement | null = null;
  private activeAudioUrl = '';
  private musicVolume = 0.45;
  private sfxVolume = 0.55;
  private muted = false;
  private loopEnabled = true;
  private playbackRate = 1.0;
  private fadeTimer: number | null = null;
  private onTrackEndedCb: (() => void) | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
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
    if (this.activeAudioEl && !this.fadeTimer) {
      this.activeAudioEl.volume = this.muted ? 0 : this.musicVolume;
    }
  }

  getMusicVolume() {
    return this.musicVolume;
  }

  setSfxVolume(vol: number) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
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
    if (this.activeAudioEl) {
      this.activeAudioEl.volume = muted ? 0 : this.musicVolume;
    }
    if (muted) {
      this.stopAmbient();
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
    if (this.muted) return;
    if (loop) this.stopAmbient();
    const audio = new Audio(url);
    audio.loop = loop ? this.loopEnabled : false;
    audio.playbackRate = this.playbackRate;
    audio.volume = 0.01;
    audio.onended = () => {
      if (!audio.loop && this.onTrackEndedCb) {
        this.onTrackEndedCb();
      }
    };
    audio.play().catch(() => {});
    if (loop) {
      this.activeAudioEl = audio;
      this.activeAudioUrl = url;
      // Gentle 450ms fade-in
      const targetVol = this.muted ? 0 : this.musicVolume;
      let step = 0;
      this.clearFade();
      this.fadeTimer = window.setInterval(() => {
        step++;
        if (!this.activeAudioEl || this.activeAudioEl !== audio) {
          this.clearFade();
          return;
        }
        audio.volume = Math.min(targetVol, (targetVol * step) / 10);
        if (step >= 10) {
          this.clearFade();
        }
      }, 45);
    } else {
      audio.volume = this.muted ? 0 : this.sfxVolume;
    }
  }

  playAmbientPreset(presetKey: string) {
    this.stopAmbient();
    if (this.muted) return;
    const ctx = this.getCtx();
    const gain = ctx.createGain();
    gain.gain.value = this.musicVolume * 0.25;
    gain.connect(ctx.destination);

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
        pGain.connect(ctx.destination);
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
    if (this.muted) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const vol = Math.max(0.05, this.sfxVolume);
    const reverb = this.getReverb(ctx);

    const connectWithReverb = (node: AudioNode, wetAmount = 0.25) => {
      node.connect(ctx.destination);
      if (wetAmount > 0) {
        const wet = ctx.createGain();
        wet.gain.value = wetAmount;
        node.connect(reverb);
        reverb.connect(wet);
        wet.connect(ctx.destination);
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
          dg.connect(ctx.destination);
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
        tg.connect(ctx.destination);
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
        thg.connect(ctx.destination);
        thump.start(now);
        thump.stop(now + 0.22);
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
        twg.connect(ctx.destination);
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
        zg.connect(ctx.destination);
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
          pg.connect(ctx.destination);
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
