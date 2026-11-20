// Every sound in the game is synthesized here with WebAudio: no audio files.
// Meows are a sawtooth voice through two moving formant filters, placed in 3D
// with an HRTF panner. The listener sits on the laser dot, so a hidden kitten
// gets louder as the dot gets closer: you can find it by ear.
const midi = (m) => 440 * 2 ** ((m - 69) / 12)

export class Sound {
  constructor(settings) {
    this.settings = settings
    this.ctx = null
    this.voices = 0
    this.amb = null
    this.musicMode = 'off'
    this.step = 0
    this.nextNote = 0
    this.timer = null
    this.dripT = 1
    this.drips = false
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running' && this.settings.sound
  }

  // must be called from a user gesture
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const ctx = (this.ctx = new AC())
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.ratio.value = 4
    comp.attack.value = 0.004
    comp.release.value = 0.2
    this.master = ctx.createGain()
    this.master.gain.value = this.settings.sound ? 0.9 : 0
    this.master.connect(comp).connect(ctx.destination)
    this.sfx = ctx.createGain()
    this.sfx.gain.value = 1
    this.ambBus = ctx.createGain()
    this.ambBus.gain.value = 0.9
    this.musicBus = ctx.createGain()
    this.musicBus.gain.value = this.settings.music ? 0.16 : 0
    this.sfx.connect(this.master)
    this.ambBus.connect(this.master)
    this.musicBus.connect(this.master)

    const len = ctx.sampleRate * 2
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

    this.startAmbience()
    this.startMusicLoop()
  }

  setSound(on) {
    this.settings.sound = on
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05)
  }
  setMusic(on) {
    this.settings.music = on
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.2)
  }

  // ---- building blocks ----------------------------------------------------------------
  noise(t, dur, { rate = 1, loop = false } = {}) {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = loop
    src.playbackRate.value = rate
    src.start(t, Math.random() * 1.5)
    if (!loop) src.stop(t + dur)
    return src
  }
  filter(type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    return f
  }
  env(t, attack, peak, decay, sustainFor = 0) {
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + attack)
    if (sustainFor) g.gain.setValueAtTime(peak, t + attack + sustainFor)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + sustainFor + decay)
    return g
  }
  pan(x, y, z, hrtf = true) {
    return new PannerNode(this.ctx, {
      panningModel: hrtf ? 'HRTF' : 'equalpower',
      distanceModel: 'inverse',
      refDistance: 1.6,
      maxDistance: 40,
      rolloffFactor: 1.15,
      positionX: x,
      positionY: y,
      positionZ: z,
    })
  }
  tone(t, freq, { type = 'sine', attack = 0.005, peak = 0.3, decay = 0.4, to = null, dest = this.sfx } = {}) {
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay)
    const g = this.env(t, attack, peak, decay)
    o.connect(g).connect(dest)
    o.start(t)
    o.stop(t + attack + decay + 0.05)
    return o
  }

  listen(x, y, z, fx, fz) {
    if (!this.ctx) return
    const L = this.ctx.listener
    const t = this.ctx.currentTime
    if (L.positionX) {
      L.positionX.setTargetAtTime(x, t, 0.06)
      L.positionY.setTargetAtTime(y + 1.2, t, 0.06)
      L.positionZ.setTargetAtTime(z, t, 0.06)
      L.forwardX.setTargetAtTime(fx, t, 0.1)
      L.forwardY.setTargetAtTime(-0.4, t, 0.1)
      L.forwardZ.setTargetAtTime(fz, t, 0.1)
      L.upX.value = 0
      L.upY.value = 1
      L.upZ.value = 0
    } else {
      L.setPosition(x, y + 1.2, z)
      L.setOrientation(fx, -0.4, fz, 0, 1, 0)
    }
  }

  // ---- kittens ----------------------------------------------------------------------------
  meow(x, y, z, pitch = 1, kind = 'meow') {
    if (!this.ready || this.voices > 6) return
    const ctx = this.ctx
    const t = ctx.currentTime + 0.01
    const dur = kind === 'mew' ? 0.26 : kind === 'trill' ? 0.42 : kind === 'mrrp' ? 0.17 : 0.5 + Math.random() * 0.25
    const f0 = (kind === 'mew' ? 820 : kind === 'mrrp' ? 700 : 620) * pitch
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    const f = osc.frequency
    if (kind === 'trill') {
      f.setValueAtTime(f0 * 0.68, t)
      f.linearRampToValueAtTime(f0 * 1.06, t + dur * 0.7)
      f.linearRampToValueAtTime(f0 * 0.96, t + dur)
    } else if (kind === 'mrrp') {
      // a short rolled chirp, rising: the noise a cat makes when it is mildly interested
      f.setValueAtTime(f0 * 0.82, t)
      f.linearRampToValueAtTime(f0 * 1.16, t + dur * 0.8)
      f.linearRampToValueAtTime(f0 * 1.1, t + dur)
    } else {
      f.setValueAtTime(f0 * 0.8, t)
      f.linearRampToValueAtTime(f0 * 1.24, t + dur * 0.32)
      f.linearRampToValueAtTime(f0 * 0.7, t + dur)
    }
    const lfo = ctx.createOscillator()
    const rolled = kind === 'trill' || kind === 'mrrp'
    lfo.frequency.value = kind === 'mrrp' ? 31 : rolled ? 28 : 6.5
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = rolled ? f0 * 0.08 : f0 * 0.02
    lfo.connect(lfoGain).connect(f)
    const F1 = this.filter('bandpass', 700, 5)
    F1.frequency.setValueAtTime(650, t)
    F1.frequency.linearRampToValueAtTime(1150, t + dur * 0.35)
    F1.frequency.linearRampToValueAtTime(760, t + dur)
    const F2 = this.filter('bandpass', 2400, 7)
    F2.frequency.setValueAtTime(2500, t)
    F2.frequency.linearRampToValueAtTime(1650, t + dur)
    const g1 = ctx.createGain()
    g1.gain.value = 1.6
    const g2 = ctx.createGain()
    g2.gain.value = 0.9
    const vol = kind === 'mrrp' ? 0.26 : kind === 'mew' ? 0.38 : 0.5
    const e = this.env(t, 0.05, vol, dur * 0.42, dur * 0.5)
    osc.connect(F1).connect(g1).connect(e)
    osc.connect(F2).connect(g2).connect(e)
    e.connect(this.pan(x, y, z)).connect(this.sfx)
    osc.start(t)
    osc.stop(t + dur + 0.08)
    lfo.start(t)
    lfo.stop(t + dur + 0.08)
    this.voices++
    osc.onended = () => this.voices--
  }

  hiss(x, y, z) {
    if (!this.ready) return
    const t = this.ctx.currentTime
    const src = this.noise(t, 0.7)
    const e = this.env(t, 0.03, 0.28, 0.45, 0.15)
    src.connect(this.filter('highpass', 2800, 0.7)).connect(this.filter('peaking', 5000, 1)).connect(e).connect(this.pan(x, y, z)).connect(this.sfx)
  }
  rustle(x, y, z) {
    if (!this.ready) return
    const t = this.ctx.currentTime
    for (let k = 0; k < 3; k++) {
      const s = this.noise(t + k * 0.07, 0.12, { rate: 0.8 + Math.random() * 0.4 })
      s.connect(this.filter('bandpass', 1400 + Math.random() * 900, 0.9)).connect(this.env(t + k * 0.07, 0.01, 0.22, 0.09)).connect(this.pan(x, y, z, false)).connect(this.sfx)
    }
  }
  pounce(x, y, z) {
    if (!this.ready) return
    const t = this.ctx.currentTime
    const p = this.pan(x, y, z, false)
    p.connect(this.sfx)
    this.tone(t, 180, { peak: 0.12, decay: 0.12, to: 70, dest: p })
  }
  splash(x, y, z) {
    if (!this.ready) return
    const t = this.ctx.currentTime
    const p = this.pan(x, y, z, false)
    p.connect(this.sfx)
    this.noise(t, 0.5).connect(this.filter('lowpass', 1300, 0.8)).connect(this.env(t, 0.01, 0.3, 0.35)).connect(p)
    this.tone(t, 420, { peak: 0.12, decay: 0.2, to: 140, dest: p })
  }
  knock(x, y, z) {
    if (!this.ready) return
    const t = this.ctx.currentTime
    const p = this.pan(x, y, z, false)
    p.connect(this.sfx)
    this.tone(t, 1900, { peak: 0.18, decay: 0.12, dest: p })
    this.tone(t + 0.02, 2600, { peak: 0.08, decay: 0.08, dest: p })
  }
  clang(x, y, z) {
    if (!this.ready) return
    const t = this.ctx.currentTime
    const p = this.pan(x, y, z, false)
    p.connect(this.sfx)
    for (const [f, a] of [[1170, 0.2], [2310, 0.12], [3380, 0.08], [4720, 0.05]]) this.tone(t, f, { peak: a, decay: 0.9 + Math.random() * 0.3, dest: p })
    this.noise(t, 0.15).connect(this.filter('highpass', 2000, 0.7)).connect(this.env(t, 0.003, 0.2, 0.12)).connect(p)
  }
  gate(x, y, z) {
    if (!this.ready) return
    const t = this.ctx.currentTime
    const p = this.pan(x, y, z, false)
    p.connect(this.sfx)
    this.tone(t, 900, { type: 'square', peak: 0.06, decay: 0.05, dest: p })
    this.tone(t + 0.09, 700, { type: 'square', peak: 0.06, decay: 0.05, dest: p })
    const o = this.ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(160, t + 0.15)
    o.frequency.linearRampToValueAtTime(260, t + 0.7)
    o.connect(this.filter('bandpass', 900, 6)).connect(this.env(t + 0.15, 0.05, 0.08, 0.5)).connect(p)
    o.start(t + 0.15)
    o.stop(t + 0.8)
  }
  thunder(delay = 0.5, power = 1) {
    if (!this.ready) return
    const t = this.ctx.currentTime + delay
    const src = this.noise(t, 4.2, { rate: 0.55 })
    const lp = this.filter('lowpass', 900, 0.6)
    lp.frequency.setValueAtTime(1000 * (0.6 + power * 0.4), t)
    lp.frequency.exponentialRampToValueAtTime(110, t + 3.2)
    src.connect(lp).connect(this.env(t, 0.08, 0.7 * power, 3.6, 0.2)).connect(this.sfx)
    if (power > 0.7) this.noise(t, 0.3).connect(this.filter('highpass', 1800, 0.5)).connect(this.env(t, 0.004, 0.35, 0.25)).connect(this.sfx)
  }

  // ---- the menu's scratching post -------------------------------------------------------
  // claws raking sisal: a quick run of filtered noise, one burst per claw stroke
  scrape(x, y, z, dur = 0.5) {
    if (!this.ready) return
    const t = this.ctx.currentTime
    const p = this.pan(x, y, z, false)
    p.connect(this.sfx)
    const strokes = Math.max(2, Math.round(dur / 0.07))
    for (let k = 0; k < strokes; k++) {
      const at = t + (k * dur) / strokes + Math.random() * 0.015
      this.noise(at, 0.07, { rate: 0.9 + Math.random() * 0.3 })
        .connect(this.filter('bandpass', 2000 + Math.random() * 1800, 1.3))
        .connect(this.env(at, 0.006, 0.1, 0.055))
        .connect(p)
    }
  }

  // landing on the rope: a soft low thump, then the rope creaking under the weight
  thud(x, y, z) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const p = this.pan(x, y, z, false)
    p.connect(this.sfx)
    this.tone(t, 125, { peak: 0.24, decay: 0.16, to: 55, dest: p })
    this.noise(t, 0.08).connect(this.filter('lowpass', 520, 0.7)).connect(this.env(t, 0.004, 0.16, 0.07)).connect(p)
    const creak = ctx.createOscillator()
    creak.type = 'sawtooth'
    creak.frequency.setValueAtTime(96, t + 0.05)
    creak.frequency.linearRampToValueAtTime(132, t + 0.22)
    creak.frequency.linearRampToValueAtTime(104, t + 0.36)
    const judder = ctx.createOscillator()
    judder.frequency.value = 23
    const depth = ctx.createGain()
    depth.gain.value = 10
    judder.connect(depth).connect(creak.frequency)
    creak.connect(this.filter('bandpass', 1100, 9)).connect(this.env(t + 0.05, 0.03, 0.06, 0.28)).connect(p)
    for (const o of [creak, judder]) {
      o.start(t + 0.05)
      o.stop(t + 0.45)
    }
  }

  // a kitten saying "mrrp"
  mrrp(x, y, z, pitch = 1) {
    this.meow(x, y, z, pitch, 'mrrp')
  }

  // paper: a few crisp crackles over the softer sound of the sheet moving
  paper() {
    if (!this.ready) return
    const t = this.ctx.currentTime
    for (let k = 0; k < 5; k++) {
      const at = t + k * 0.045 + Math.random() * 0.02
      this.noise(at, 0.05, { rate: 1.2 + Math.random() * 0.6 })
        .connect(this.filter('highpass', 3200 + Math.random() * 2400, 0.8))
        .connect(this.env(at, 0.003, 0.07 + Math.random() * 0.05, 0.04))
        .connect(this.sfx)
    }
    this.noise(t, 0.3, { rate: 0.7 }).connect(this.filter('bandpass', 1200, 0.7)).connect(this.env(t, 0.04, 0.05, 0.24)).connect(this.sfx)
  }

  // ---- interface ------------------------------------------------------------------------------
  ui(kind) {
    if (!this.ready) return
    const t = this.ctx.currentTime
    const S = { dest: this.sfx }
    switch (kind) {
      case 'click':
        this.tone(t, 880, { ...S, peak: 0.12, decay: 0.07, to: 620 })
        break
      case 'tick':
        this.tone(t, 1500, { ...S, peak: 0.07, decay: 0.05 })
        break
      case 'start':
        ;[72, 76, 79, 84].forEach((m, i) => this.tone(t + i * 0.08, midi(m), { ...S, type: 'triangle', peak: 0.16, decay: 0.5 }))
        break
      case 'rescue':
        this.tone(t, midi(88), { ...S, type: 'triangle', peak: 0.16, decay: 0.6 })
        this.tone(t + 0.09, midi(95), { ...S, type: 'triangle', peak: 0.13, decay: 0.8 })
        this.tone(t + 0.09, midi(107), { ...S, peak: 0.04, decay: 0.5 })
        break
      case 'win':
        ;[72, 76, 79, 84, 88].forEach((m, i) => this.tone(t + i * 0.11, midi(m), { ...S, type: 'triangle', peak: 0.17, decay: 0.9 }))
        ;[60, 64, 67].forEach((m) => this.tone(t + 0.5, midi(m), { ...S, peak: 0.06, attack: 0.15, decay: 1.8 }))
        break
      case 'lose':
        ;[76, 72, 69, 64].forEach((m, i) => this.tone(t + i * 0.16, midi(m), { ...S, type: 'triangle', peak: 0.13, decay: 0.7 }))
        break
      case 'card': {
        const s = this.noise(t, 0.25)
        const bp = this.filter('bandpass', 800, 1.2)
        bp.frequency.exponentialRampToValueAtTime(3500, t + 0.2)
        s.connect(bp).connect(this.env(t, 0.02, 0.12, 0.18)).connect(this.sfx)
        this.tone(t + 0.12, midi(91), { ...S, type: 'triangle', peak: 0.08, decay: 0.4 })
        break
      }
      case 'warn':
        this.tone(t, 420, { ...S, type: 'triangle', peak: 0.08, decay: 0.25, to: 380 })
        break
    }
  }

  // ---- loops: rain, wind, purring, the vacuum ------------------------------------------------
  startAmbience() {
    const ctx = this.ctx
    const t = ctx.currentTime
    const loop = () => this.noise(t, 0, { loop: true })
    const rainGain = ctx.createGain()
    rainGain.gain.value = 0
    loop().connect(this.filter('highpass', 450, 0.5)).connect(this.filter('lowpass', 6500, 0.5)).connect(rainGain)
    const rumble = ctx.createGain()
    rumble.gain.value = 0.35
    loop().connect(this.filter('lowpass', 260, 0.7)).connect(rumble).connect(rainGain)
    rainGain.connect(this.ambBus)

    const windGain = ctx.createGain()
    windGain.gain.value = 0
    const windBand = this.filter('bandpass', 420, 0.9)
    loop().connect(windBand).connect(windGain).connect(this.ambBus)

    // purr: low noise chopped at ~24 Hz, breathing in and out
    const purrGain = ctx.createGain()
    purrGain.gain.value = 0
    const chop = ctx.createGain()
    chop.gain.value = 0.5
    const flutter = ctx.createOscillator()
    flutter.type = 'triangle'
    flutter.frequency.value = 24
    const flutterDepth = ctx.createGain()
    flutterDepth.gain.value = 0.5
    flutter.connect(flutterDepth).connect(chop.gain)
    flutter.start()
    const breath = ctx.createGain()
    breath.gain.value = 0.7
    const breathLfo = ctx.createOscillator()
    breathLfo.frequency.value = 0.38
    const breathDepth = ctx.createGain()
    breathDepth.gain.value = 0.3
    breathLfo.connect(breathDepth).connect(breath.gain)
    breathLfo.start()
    const purrPan = this.pan(0, 0, 0, false)
    loop().connect(this.filter('lowpass', 190, 0.8)).connect(chop).connect(breath).connect(purrGain).connect(purrPan).connect(this.ambBus)

    // vacuum: a buzzy motor and a hiss
    const vacGain = ctx.createGain()
    vacGain.gain.value = 0
    const vacPan = this.pan(0, 0, 0, false)
    for (const [type, f, a] of [['sawtooth', 96, 0.5], ['square', 192, 0.18]]) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f
      const g = ctx.createGain()
      g.gain.value = a
      o.connect(g).connect(this.filter('lowpass', 750, 0.8)).connect(vacGain)
      o.start()
    }
    const hissG = ctx.createGain()
    hissG.gain.value = 0.15
    loop().connect(this.filter('highpass', 3500, 0.6)).connect(hissG).connect(vacGain)
    vacGain.connect(vacPan).connect(this.ambBus)

    this.amb = { rainGain, windGain, windBand, purrGain, purrPan, vacGain, vacPan }
  }

  setAmbience({ rain = 0, wind = 0, purr = 0, purrAt = null, vacuum = null, drips = false, dt = 0.016 }) {
    if (!this.amb) return
    const t = this.ctx.currentTime
    const A = this.amb
    A.rainGain.gain.setTargetAtTime(rain * 0.32, t, 0.3)
    A.windGain.gain.setTargetAtTime(wind * 0.35, t, 0.15)
    A.windBand.frequency.setTargetAtTime(300 + wind * 700, t, 0.2)
    A.purrGain.gain.setTargetAtTime(purr * 0.9, t, 0.5)
    if (purrAt) {
      A.purrPan.positionX.setTargetAtTime(purrAt.x, t, 0.1)
      A.purrPan.positionY.setTargetAtTime(purrAt.y, t, 0.1)
      A.purrPan.positionZ.setTargetAtTime(purrAt.z, t, 0.1)
    }
    A.vacGain.gain.setTargetAtTime(vacuum ? 0.11 : 0, t, 0.2)
    if (vacuum) {
      A.vacPan.positionX.setTargetAtTime(vacuum.x, t, 0.05)
      A.vacPan.positionY.setTargetAtTime(0.2, t, 0.05)
      A.vacPan.positionZ.setTargetAtTime(vacuum.z, t, 0.05)
    }
    // the drain drips
    this.drips = drips
    if (drips && this.ready) {
      this.dripT -= dt
      if (this.dripT <= 0) {
        this.dripT = 0.6 + Math.random() * 2
        const f = 900 + Math.random() * 1400
        const p = this.pan((Math.random() - 0.5) * 14, 0.5, (Math.random() - 0.5) * 8, false)
        p.connect(this.ambBus)
        this.tone(t, f, { peak: 0.07, decay: 0.18, to: f * 1.6, dest: p })
      }
    }
  }

  // ---- music: a little generative music box ------------------------------------------------------
  music(mode) {
    this.musicMode = mode
  }

  startMusicLoop() {
    this.nextNote = this.ctx.currentTime + 0.3
    const delay = this.ctx.createDelay(1)
    delay.delayTime.value = 0.36
    const feedback = this.ctx.createGain()
    feedback.gain.value = 0.3
    const wet = this.ctx.createGain()
    wet.gain.value = 0.3
    delay.connect(feedback).connect(delay)
    delay.connect(wet).connect(this.musicBus)
    this.musicIn = this.ctx.createGain()
    this.musicIn.connect(this.filter('lowpass', 4800, 0.5)).connect(this.musicBus)
    this.musicIn.connect(delay)
    this.melody = 4
    this.timer = setInterval(() => this.schedule(), 90)
  }

  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return
    const mode = this.musicMode
    const tense = mode === 'tense'
    const tempo = tense ? 108 : mode === 'title' ? 84 : 94
    const eighth = 60 / tempo / 2
    while (this.nextNote < this.ctx.currentTime + 0.3) {
      if (mode !== 'off' && this.settings.music) this.playStep(this.step, this.nextNote, tense, mode)
      this.nextNote += eighth
      this.step++
    }
  }

  playStep(step, t, tense, mode) {
    const bar = Math.floor(step / 8) % 4
    const beat = step % 8
    const chords = tense
      ? [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]]
      : [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]]
    const chord = chords[bar]
    const scale = tense ? [57, 60, 62, 64, 67, 69, 72, 74, 76] : [60, 62, 64, 67, 69, 72, 74, 76, 79]
    if (beat === 0 || beat === 4) {
      const root = chord[0] - 12 - (beat === 4 ? -7 : 0)
      this.note(t, midi(root), 0.11, 1.8, 'sine')
    }
    const busy = mode === 'title' ? 0.4 : tense ? 0.7 : 0.55
    if (Math.random() < busy || beat === 0) {
      this.melody = Math.max(0, Math.min(scale.length - 1, this.melody + Math.round((Math.random() - 0.5) * 3.2)))
      let m = scale[this.melody] + 12
      if (beat === 0) m = chord[Math.floor(Math.random() * 3)] + 24
      this.note(t, midi(m), 0.09, 1.3, 'triangle')
    }
    if (tense && beat % 2 === 0) this.note(t, midi(chord[0] - 24), 0.05, 0.25, 'sine')
  }

  note(t, freq, peak, decay, type) {
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    const o2 = this.ctx.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = freq * 2
    const g = this.env(t, 0.005, peak, decay)
    const g2 = this.ctx.createGain()
    g2.gain.value = 0.25
    o.connect(g)
    o2.connect(g2).connect(g)
    g.connect(this.musicIn)
    o.start(t)
    o2.start(t)
    o.stop(t + decay + 0.1)
    o2.stop(t + decay + 0.1)
  }
}
