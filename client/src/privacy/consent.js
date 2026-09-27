export const PRIVACY_VERSION = "2026-09-27";
export const CONSENT_KEY = "ktga-privacy-choice";
export const CONSENT_DURATION = 180 * 86400000;
export function readConsent(storage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(CONSENT_KEY));
    return value?.version === PRIVACY_VERSION && Number.isFinite(value.chosenAt) && value.chosenAt <= now && now - value.chosenAt < CONSENT_DURATION ? value : null;
  } catch { return null; }
}
export function extractMarkers(search, allowed) {
  const params = new URLSearchParams(search);
  return allowed.filter((marker) => {
    if (!/^(secret|challenge):[a-z0-9-]{1,48}$/.test(marker)) return false;
    const [key, value] = marker.split(":");
    return params.get(key) === value;
  });
}
