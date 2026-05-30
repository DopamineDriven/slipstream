/**
 * Safari-only AudioSession utilities.
 *
 * The AudioSession API (Safari 16.4+) allows setting the audio session
 * type to "playback", which overrides the iOS hardware mute switch
 * so TTS audio plays even in silent mode.
 */

/**
 * Returns `true` when the browser is Safari >= 16.4,
 * the minimum version that supports the AudioSession API.
 */
export function isSafariAudioSessionSupported(
  browserName: string | undefined,
  browserVersion: string | undefined
) {
  if (browserName !== "Safari" || !browserVersion) return false;
  const parts = browserVersion.split(".");
  const major = Number.parseInt(parts?.[0] ?? "0");
  const minor = Number.parseInt(parts?.[1] ?? "0");
  if (Number.isNaN(major) || Number.isNaN(minor)) return false;
  return major > 16 || (major === 16 && minor >= 4);
}
