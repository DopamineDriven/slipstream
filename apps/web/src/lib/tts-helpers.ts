function isValidCodec(codec: string) {
  return (
    codec === "mp3" ||
    codec === "wav" ||
    codec === "pcm" ||
    codec === "mulaw" ||
    codec === "alaw"
  );
}

function isValidVoice(v: string) {
  return (
    v === "eve" ||
    v === "ara" ||
    v === "leo" ||
    v === "rex" ||
    v === "sal" ||
    v === "una"
  );
}

function isValidSampleRate(s: number) {
  return (
    s === 8000 ||
    s === 16000 ||
    s === 22050 ||
    s === 24000 ||
    s === 44100 ||
    s === 48000
  );
}

function isValidBitRate(s: number) {
  return (
    s === 32000 || s === 64000 || s === 96000 || s === 128000 || s === 192000
  );
}

function isValidLanguage(l: string) {
  return (
    l === "auto" ||
    l === "en" ||
    l === "es-MX" ||
    l === "es-ES" ||
    l === "id" ||
    l === "ar-EG" ||
    l === "ar-SA" ||
    l === "ar-AE" ||
    l === "bn" ||
    l === "zh" ||
    l === "fr" ||
    l === "de" ||
    l === "hi" ||
    l === "it" ||
    l === "ja" ||
    l === "ko" ||
    l === "pt-BR" ||
    l === "pt-PT" ||
    l === "ru" ||
    l === "tr" ||
    l === "vi"
  );
}

export {
  isValidBitRate,
  isValidCodec,
  isValidLanguage,
  isValidSampleRate,
  isValidVoice
};
