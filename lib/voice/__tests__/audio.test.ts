import { describe, expect, it } from 'vitest';
import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_AUDIO_BYTES,
  MAX_TITLE_CHARS,
  audioExtensionForMime,
  baseMimeType,
  defaultVoiceTitle,
  exceedsAudioSizeLimit,
  isAllowedAudioMime,
  isUuid,
  resolveVoiceTitle,
} from '@/lib/voice/audio';

describe('baseMimeType', () => {
  it('strips codec parameters', () => {
    expect(baseMimeType('audio/webm;codecs=opus')).toBe('audio/webm');
  });

  it('trims whitespace and lowercases', () => {
    expect(baseMimeType(' Audio/WEBM ;codecs=opus')).toBe('audio/webm');
  });

  it('passes through a mime with no parameters', () => {
    expect(baseMimeType('audio/mpeg')).toBe('audio/mpeg');
  });
});

describe('isAllowedAudioMime', () => {
  it('allows every mime in the allow-list', () => {
    for (const mime of ALLOWED_AUDIO_MIME_TYPES) {
      expect(isAllowedAudioMime(mime)).toBe(true);
    }
  });

  it('allows an allow-listed mime with codec parameters attached', () => {
    expect(isAllowedAudioMime('audio/webm;codecs=opus')).toBe(true);
    expect(isAllowedAudioMime('audio/ogg;codecs=vorbis')).toBe(true);
  });

  it('rejects a mime not on the allow-list', () => {
    expect(isAllowedAudioMime('video/mp4')).toBe(false);
    expect(isAllowedAudioMime('application/octet-stream')).toBe(false);
    expect(isAllowedAudioMime('')).toBe(false);
  });
});

describe('audioExtensionForMime', () => {
  it('maps every allow-listed mime to a non-empty extension', () => {
    for (const mime of ALLOWED_AUDIO_MIME_TYPES) {
      const ext = audioExtensionForMime(mime);
      expect(ext).not.toBeNull();
      expect(ext?.length).toBeGreaterThan(0);
    }
  });

  it('matches the base type when codec parameters are present', () => {
    expect(audioExtensionForMime('audio/webm;codecs=opus')).toBe(
      audioExtensionForMime('audio/webm'),
    );
  });

  it('returns null for an unsupported mime', () => {
    expect(audioExtensionForMime('video/mp4')).toBeNull();
  });
});

describe('exceedsAudioSizeLimit', () => {
  it('is false at exactly the limit', () => {
    expect(exceedsAudioSizeLimit(MAX_AUDIO_BYTES)).toBe(false);
  });

  it('is true one byte over the limit', () => {
    expect(exceedsAudioSizeLimit(MAX_AUDIO_BYTES + 1)).toBe(true);
  });

  it('is false for a small file', () => {
    expect(exceedsAudioSizeLimit(1024)).toBe(false);
  });
});

describe('isUuid', () => {
  it('accepts a well-formed UUID', () => {
    expect(isUuid('11111111-1111-1111-1111-111111111111')).toBe(true);
  });

  it('accepts a UUID regardless of case', () => {
    expect(isUuid('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE')).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('11111111111111111111111111111111')).toBe(false);
  });
});

describe('defaultVoiceTitle', () => {
  it('formats as "Voice note — <ISO date>"', () => {
    const now = new Date('2026-07-25T12:34:56.000Z');
    expect(defaultVoiceTitle(now)).toBe('Voice note — 2026-07-25T12:34:56.000Z');
  });
});

describe('resolveVoiceTitle', () => {
  const now = new Date('2026-07-25T12:34:56.000Z');

  it('uses a trimmed caller-supplied title', () => {
    expect(resolveVoiceTitle('  Kitchen visit  ', now)).toBe('Kitchen visit');
  });

  it('falls back to the default when the field is empty, blank, or not a string', () => {
    const fallback = defaultVoiceTitle(now);
    expect(resolveVoiceTitle('', now)).toBe(fallback);
    expect(resolveVoiceTitle('   ', now)).toBe(fallback);
    expect(resolveVoiceTitle(null, now)).toBe(fallback);
    // FormData.get() returns a File for a non-text part — must fall back.
    expect(resolveVoiceTitle({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }, now)).toBe(
      fallback,
    );
  });

  it('caps an over-long title at MAX_TITLE_CHARS', () => {
    const long = 'a'.repeat(MAX_TITLE_CHARS + 50);
    expect(resolveVoiceTitle(long, now)).toHaveLength(MAX_TITLE_CHARS);
  });
});
