/**
 * Indonesian Voice Engine (Web Speech API STT + TTS + Lip-Sync Cadence Driver)
 */
export class VoiceEngine {
  constructor(callbacks = {}) {
    this.onListeningStart = callbacks.onListeningStart || (() => {});
    this.onListeningEnd = callbacks.onListeningEnd || (() => {});
    this.onInterimTranscript = callbacks.onInterimTranscript || (() => {});
    this.onFinalTranscript = callbacks.onFinalTranscript || (() => {});
    this.onSpeechStart = callbacks.onSpeechStart || (() => {});
    this.onSpeechEnd = callbacks.onSpeechEnd || (() => {});
    this.onLipSync = callbacks.onLipSync || (() => {});
    this.onError = callbacks.onError || (() => {});

    this.isListening = false;
    this.isSpeaking = false;
    this.rate = 1.05;
    this.pitch = 1.0;
    this.selectedVoiceURI = '';
    this.voices = [];
    this.lipSyncRaf = null;
    this.syllablePulse = 0;

    this._initSTT();
    this._initTTS();
  }

  _initSTT() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.sttSupported = Boolean(SpeechRec);
    if (!SpeechRec) return;

    this.recognition = new SpeechRec();
    this.recognition.lang = 'id-ID';
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.onListeningStart();
    };

    this.recognition.onresult = (event) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const txt = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += txt;
        } else {
          interim += txt;
        }
      }
      if (interim) this.onInterimTranscript(interim.trim());
      if (finalText.trim()) {
        this.onFinalTranscript(finalText.trim());
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        this.onError(`Mikrofon: ${event.error}`);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.onListeningEnd();
    };
  }

  _initTTS() {
    this.ttsSupported = 'speechSynthesis' in window;
    if (!this.ttsSupported) return;

    const loadVoices = () => {
      this.voices = window.speechSynthesis.getVoices() || [];
      if (!this.selectedVoiceURI) {
        const preferred = this.pickBestIndonesianVoice();
        if (preferred) this.selectedVoiceURI = preferred.voiceURI;
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  pickBestIndonesianVoice() {
    if (!this.voices.length) return null;
    // Prefer Indonesian voices (Google Bahasa Indonesia / Microsoft Gadis / Ardi / Damayanti)
    const idVoices = this.voices.filter((v) =>
      v.lang.toLowerCase().startsWith('id') || v.name.toLowerCase().includes('indonesia')
    );
    if (idVoices.length > 0) {
      return (
        idVoices.find((v) => v.name.toLowerCase().includes('google')) ||
        idVoices.find((v) => v.name.toLowerCase().includes('gadis')) ||
        idVoices[0]
      );
    }
    return this.voices[0];
  }

  getVoices() {
    return this.voices;
  }

  setVoiceConfig({ rate, pitch, voiceURI }) {
    if (typeof rate === 'number' && !Number.isNaN(rate)) this.rate = rate;
    if (typeof pitch === 'number' && !Number.isNaN(pitch)) this.pitch = pitch;
    if (typeof voiceURI === 'string') this.selectedVoiceURI = voiceURI;
  }

  startListening() {
    if (!this.sttSupported) {
      this.onError('Browser ini tidak mendukung Web Speech Recognition. Gunakan Chrome atau Edge.');
      return false;
    }
    this.stopSpeaking();
    if (this.isListening) return true;
    try {
      this.recognition.start();
      return true;
    } catch {
      return false;
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
    }
  }

  sanitizeForSpeech(text) {
    return String(text || '')
      .replace(/\[(?:neutral|happy|thinking|alert)\]/gi, '')
      .replace(/[*_#`~>]/g, '')
      .replace(/https?:\/\/\S+/g, 'tautan')
      .replace(/\s+/g, ' ')
      .trim();
  }

  speak(rawText) {
    const clean = this.sanitizeForSpeech(rawText);
    if (!clean) return;

    this.stopSpeaking();

    if (!this.ttsSupported) {
      // Simulate brief speaking lip-sync if TTS unavailable
      this._startLipSyncLoop();
      this.onSpeechStart();
      setTimeout(() => {
        this._stopLipSyncLoop();
        this.onSpeechEnd();
      }, Math.min(5000, clean.length * 45));
      return;
    }

    // Split long responses into sentence chunks to prevent Chrome TTS cutoff bug
    const chunks = clean.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) || [clean];
    const voice =
      this.voices.find((v) => v.voiceURI === this.selectedVoiceURI) ||
      this.pickBestIndonesianVoice();

    this.isSpeaking = true;
    this.onSpeechStart();
    this._startLipSyncLoop();

    let index = 0;
    const speakNext = () => {
      if (!this.isSpeaking || index >= chunks.length) {
        this.isSpeaking = false;
        this._stopLipSyncLoop();
        this.onSpeechEnd();
        return;
      }

      const utter = new SpeechSynthesisUtterance(chunks[index]);
      utter.lang = voice?.lang || 'id-ID';
      if (voice) utter.voice = voice;
      utter.rate = this.rate;
      utter.pitch = this.pitch;

      utter.onboundary = () => {
        this.syllablePulse = 1.0;
      };

      utter.onend = () => {
        index += 1;
        speakNext();
      };

      utter.onerror = () => {
        this.isSpeaking = false;
        this._stopLipSyncLoop();
        this.onSpeechEnd();
      };

      window.speechSynthesis.speak(utter);
    };

    speakNext();
  }

  stopSpeaking() {
    this.isSpeaking = false;
    if (this.ttsSupported) {
      window.speechSynthesis.cancel();
    }
    this._stopLipSyncLoop();
  }

  _startLipSyncLoop() {
    this._stopLipSyncLoop();
    const visemes = ['aa', 'oh', 'ih', 'ee', 'ou'];
    let phase = 0;

    const tick = () => {
      phase += 0.24;
      this.syllablePulse *= 0.88;
      const baseCadence = (Math.sin(phase) * 0.5 + 0.5) * 0.55 + (Math.sin(phase * 2.3) * 0.5 + 0.5) * 0.35;
      const amp = Math.min(1.0, 0.15 + baseCadence * 0.72 + this.syllablePulse * 0.25);
      const viseme = visemes[Math.floor(phase * 0.75) % visemes.length];
      this.onLipSync(amp, viseme);
      this.lipSyncRaf = requestAnimationFrame(tick);
    };
    this.lipSyncRaf = requestAnimationFrame(tick);
  }

  _stopLipSyncLoop() {
    if (this.lipSyncRaf) {
      cancelAnimationFrame(this.lipSyncRaf);
      this.lipSyncRaf = null;
    }
    this.onLipSync(0, 'aa');
  }
}
