// The open models AutoClip can download and run on your device, credited by name.

export interface ModelOption {
  id: string
  label: string
  name: string
  maker: string
  url: string
  size: string
  note: string
}

/** Whisper with word-level timestamps (cross-attention alignment heads), as ONNX for transformers.js. */
export const CAPTION_MODELS: ModelOption[] = [
  {
    id: 'onnx-community/whisper-base.en_timestamped',
    label: 'Balanced',
    name: 'Whisper Base (English)',
    maker: 'OpenAI',
    url: 'https://huggingface.co/openai/whisper-base.en',
    size: '~80 MB',
    note: 'Good default for English lyrics and speech',
  },
  {
    id: 'onnx-community/whisper-tiny.en_timestamped',
    label: 'Quick',
    name: 'Whisper Tiny (English)',
    maker: 'OpenAI',
    url: 'https://huggingface.co/openai/whisper-tiny.en',
    size: '~40 MB',
    note: 'Fastest; fine for clear speech',
  },
  {
    id: 'onnx-community/whisper-small_timestamped',
    label: 'Accurate',
    name: 'Whisper Small (99 languages)',
    maker: 'OpenAI',
    url: 'https://huggingface.co/openai/whisper-small',
    size: '~250 MB',
    note: 'Best for sung vocals and other languages',
  },
]

export const TTS_MODEL: ModelOption = {
  id: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  label: 'Kokoro',
  name: 'Kokoro 82M',
  maker: 'hexgrad',
  url: 'https://huggingface.co/hexgrad/Kokoro-82M',
  size: '~90 MB',
  note: 'Natural voices that run on your device',
}

export interface VoiceOption {
  id: string
  label: string
  note: string
}

export const VOICES: VoiceOption[] = [
  { id: 'am_michael', label: 'Announcer', note: 'Big, clear American male' },
  { id: 'am_onyx', label: 'Deep', note: 'Low and serious' },
  { id: 'am_fenrir', label: 'Hype', note: 'Punchy and energetic' },
  { id: 'bm_george', label: 'Narrator', note: 'Documentary British male' },
  { id: 'af_heart', label: 'Warm', note: 'Friendly American female' },
  { id: 'af_bella', label: 'Bright', note: 'Upbeat American female' },
  { id: 'bf_emma', label: 'Classic', note: 'Calm British female' },
  { id: 'am_puck', label: 'Playful', note: 'Light, a little cheeky' },
]
