const root = `${(import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "")}/audio/`;
export const audioSamples = {
  dice: [1, 2, 3].map(index => `${root}dice-throw-${index}.wav`),
  card: [1, 2, 3, 4].map(index => `${root}card-slide-${index}.wav`)
};
export const loungeMusic = `${root}lounge-loop.mp3`;
export function nextAudioVariant(variants, previous, random = Math.random) {
  const candidates = variants.filter(value => value !== previous);
  const pool = candidates.length ? candidates : variants;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
