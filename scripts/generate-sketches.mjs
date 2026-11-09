import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const sampleRate = 22050;
const outputDir = path.join(process.cwd(), "public", "media");

function writeWav(fileName, samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    buffer.writeInt16LE(sample < 0 ? sample * 0x8000 : sample * 0x7fff, 44 + index * 2);
  }

  writeFileSync(path.join(outputDir, fileName), buffer);
}

function envelope(time, attack, release, duration) {
  if (time < attack) return time / attack;
  if (time > duration - release) return Math.max(0, (duration - time) / release);
  return 1;
}

function melody(notes, noteLength, harmonics, volume) {
  const duration = notes.length * noteLength;
  const samples = new Float32Array(Math.floor(sampleRate * duration));

  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const step = Math.min(notes.length - 1, Math.floor(time / noteLength));
    const local = time - step * noteLength;
    const frequency = notes[step];
    let sample = 0;
    harmonics.forEach((amount, harmonic) => {
      sample += Math.sin(2 * Math.PI * frequency * (harmonic + 1) * time) * amount;
    });
    const shape = Math.exp(-local * 3.2) * envelope(local, 0.03, 0.08, noteLength);
    samples[index] = sample * shape * envelope(time, 0.02, 0.25, duration) * volume;
  }

  return samples;
}

function mixBed() {
  const duration = 6;
  const samples = new Float32Array(Math.floor(sampleRate * duration));
  const tones = [196, 247, 294, 392];

  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const sample = tones.reduce(
      (sum, frequency) => sum + Math.sin(2 * Math.PI * frequency * time),
      0,
    );
    samples[index] = (sample / tones.length) * envelope(time, 0.15, 0.4, duration) * 0.45;
  }

  return samples;
}

mkdirSync(outputDir, { recursive: true });

writeWav(
  "neela-vocal.wav",
  melody([392, 440, 494, 523, 494, 440, 392, 349], 0.75, [0.7, 0.16, 0.06], 0.8),
);
writeWav(
  "sadia-vocal.wav",
  melody([523, 587, 659, 698, 784, 698, 659, 587], 0.75, [0.72, 0.12, 0.04], 0.75),
);
writeWav(
  "farhan-guitar.wav",
  melody([196, 247, 294, 330, 294, 247, 220, 196], 0.75, [0.8, 0.28, 0.1], 0.7),
);
writeWav(
  "rupa-tabla.wav",
  (() => {
    const duration = 6;
    const samples = new Float32Array(Math.floor(sampleRate * duration));
    const hits = [0, 0.5, 0.75, 1, 1.5, 2, 2.25, 2.5, 3, 3.5, 3.75, 4, 4.5, 5, 5.25, 5.5];
    for (let index = 0; index < samples.length; index += 1) {
      const time = index / sampleRate;
      let sample = 0;
      hits.forEach((hit, hitIndex) => {
        const delta = time - hit;
        if (delta < 0 || delta > 0.16) return;
        const tone = hitIndex % 2 === 0 ? 138 : 214;
        sample += Math.sin(2 * Math.PI * tone * delta) * Math.exp(-delta * 30);
      });
      samples[index] = Math.max(-1, Math.min(1, sample * 0.7));
    }
    return samples;
  })(),
);
writeWav(
  "anika-flute.wav",
  melody([523, 587, 659, 698, 659, 587, 523, 494], 0.75, [0.86, 0.08], 0.62),
);
writeWav("imran-mix.wav", mixBed());

console.log("Wrote sketches to public/media");
