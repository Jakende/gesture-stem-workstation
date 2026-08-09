import WaveSurfer from "wavesurfer.js";

export interface WaveformLoadResult {
  buffer: AudioBuffer;
  duration: number;
}

export class WaveformView {
  readonly #waveSurfer: WaveSurfer;

  constructor(container: HTMLElement, onSeek: (seconds: number) => void) {
    const styles = getComputedStyle(document.body);
    this.#waveSurfer = WaveSurfer.create({
      container,
      height: 64,
      waveColor: styles.getPropertyValue("--muted").trim(),
      progressColor: styles.getPropertyValue("--ink").trim(),
      cursorColor: styles.getPropertyValue("--ink").trim(),
      cursorWidth: 1,
      normalize: true,
      interact: true,
      hideScrollbar: true,
      autoScroll: false,
      fillParent: true,
      dragToSeek: true
    });
    this.#waveSurfer.on("interaction", (newTime) => onSeek(newTime));
  }

  load(url: string): Promise<WaveformLoadResult> {
    return new Promise((resolve, reject) => {
      this.#waveSurfer.once("decode", (duration) => {
        const buffer = this.#waveSurfer.getDecodedData();
        if (!buffer) {
          reject(new Error("The waveform decoded without a reusable audio buffer."));
          return;
        }
        resolve({ buffer, duration });
      });
      this.#waveSurfer.once("error", (error) => reject(error));
      void this.#waveSurfer.load(url);
    });
  }

  setTime(seconds: number): void {
    this.#waveSurfer.setTime(Math.min(seconds, this.#waveSurfer.getDuration()));
  }

  destroy(): void {
    this.#waveSurfer.destroy();
  }
}
