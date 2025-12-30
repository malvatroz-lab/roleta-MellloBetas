
import { SOUND_URLS } from '../constants';

class AudioService {
  private play(url: string) {
    const audio = new Audio(url);
    audio.play().catch(e => console.error("Audio playback blocked", e));
  }

  playWin() { this.play(SOUND_URLS.WIN); }
  playLoss() { this.play(SOUND_URLS.LOSS); }
  playObservation() { this.play(SOUND_URLS.OBSERVATION); }
}

export const audioService = new AudioService();
