class SoundEngine {
  private ctx: AudioContext | null = null;
  private ambientStopper: (() => void) | null = null;
  private activeAudioEl: HTMLAudioElement | null = null;
  private masterVolume = 0.45;
  private muted = false;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  setVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.activeAudioEl) {
      this.activeAudioEl.volume = this.muted ? 0 : this.masterVolume;
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.activeAudioEl) {
      this.activeAudioEl.volume = muted ? 0 : this.masterVolume;
    }
    if (muted) {
      this.stopAmbient();
    }
  }

  getMuted() {
    return this.muted;
  }

  stopAmbient() {
    if (this.ambientStopper) {
      this.ambientStopper();
      this.ambientStopper = null;
    }
    if (this.activeAudioEl) {
      this.activeAudioEl.pause();
      this.activeAudioEl.src = '';
      this.activeAudioEl = null;
    }
  }

  playCustomUrl(url: string, loop: boolean) {
    if (this.muted) return;
    if (loop) this.stopAmbient();
    const audio = new Audio(url);
    audio.loop = loop;
    audio.volume = this.masterVolume;
    audio.play().catch(() => {});
    if (loop) {
      this.activeAudioEl = audio;
    }
  }

  playAmbientPreset(presetKey: string) {
    this.stopAmbient();
    if (this.muted) return;
    const ctx = this.getCtx();
    const gain = ctx.createGain();
    gain.gain.value = this.masterVolume * 0.25;
    gain.connect(ctx.destination);

    let stopped = false;

    if (presetKey === 'tavern' || presetKey === 'rain') {
      // Soft filtered noise for cozy fireplace / rain
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = presetKey === 'rain' ? 950 : 380;

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
      // Deep atmospheric drone chord
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
      // Exploration soft chime drone
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
        pGain.gain.exponentialRampToValueAtTime(this.masterVolume * 0.12, ctx.currentTime + 0.1);
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
    const g = ctx.createGain();
    g.connect(ctx.destination);

    switch (presetKey) {
      case 'dice': {
        for (let i = 0; i < 4; i++) {
          const osc = ctx.createOscillator();
          const dg = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(280 + Math.random() * 240, now + i * 0.055);
          dg.gain.setValueAtTime(this.masterVolume * 0.18, now + i * 0.055);
          dg.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.05);
          osc.connect(dg);
          dg.connect(ctx.destination);
          osc.start(now + i * 0.055);
          osc.stop(now + i * 0.055 + 0.06);
        }
        break;
      }
      case 'sword': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.18);
        g.gain.setValueAtTime(this.masterVolume * 0.35, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(g);
        osc.start(now);
        osc.stop(now + 0.26);
        break;
      }
      case 'fireball':
      case 'thunder': {
        const bufferSize = Math.floor(ctx.sampleRate * 0.9);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.3));
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(presetKey === 'thunder' ? 500 : 850, now);
        filter.frequency.exponentialRampToValueAtTime(90, now + 0.85);
        g.gain.setValueAtTime(this.masterVolume * 0.55, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        src.connect(filter);
        filter.connect(g);
        src.start(now);
        break;
      }
      case 'heal': {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const hg = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          hg.gain.setValueAtTime(0.001, now + i * 0.08);
          hg.gain.linearRampToValueAtTime(this.masterVolume * 0.2, now + i * 0.08 + 0.04);
          hg.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.45);
          osc.connect(hg);
          hg.connect(ctx.destination);
          osc.start(now + i * 0.08);
          osc.stop(now + i * 0.08 + 0.46);
        });
        break;
      }
      case 'roar': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(130, now);
        osc.frequency.exponentialRampToValueAtTime(52, now + 0.75);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 340;
        g.gain.setValueAtTime(this.masterVolume * 0.4, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.connect(filter);
        filter.connect(g);
        osc.start(now);
        osc.stop(now + 0.82);
        break;
      }
      case 'scene-transition': {
        // Resonant dark-fantasy arrival chord (D3 - A3 - D4 - F#4) + crystalline shimmer
        const freqs = [146.83, 220.0, 293.66, 369.99];
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(320, now);
        filter.frequency.exponentialRampToValueAtTime(2200, now + 0.45);
        filter.frequency.exponentialRampToValueAtTime(680, now + 1.5);
        filter.connect(g);

        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(this.masterVolume * 0.28, now + 0.14);
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

        // Subtle high chime overtone on arrival
        const chime = ctx.createOscillator();
        const chimeGain = ctx.createGain();
        chime.type = 'sine';
        chime.frequency.setValueAtTime(880, now + 0.12);
        chimeGain.gain.setValueAtTime(0.001, now + 0.12);
        chimeGain.gain.linearRampToValueAtTime(this.masterVolume * 0.1, now + 0.18);
        chimeGain.gain.exponentialRampToValueAtTime(0.0008, now + 1.25);
        chime.connect(chimeGain);
        chimeGain.connect(ctx.destination);
        chime.start(now + 0.12);
        chime.stop(now + 1.3);
        break;
      }
      default: {
        // Door / Alert chime
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(190, now);
        osc.frequency.exponentialRampToValueAtTime(85, now + 0.35);
        g.gain.setValueAtTime(this.masterVolume * 0.35, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
        osc.connect(g);
        osc.start(now);
        osc.stop(now + 0.38);
      }
    }
  }
}

export const soundEngine = new SoundEngine();
