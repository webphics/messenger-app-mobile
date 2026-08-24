import {
  attachmentKindLabel,
  downsamplePeaks,
  formatDurationMs,
  messagePreviewText,
  meteringToLevel,
  quoteAttachmentText,
  quoteLayoutMode,
} from '@/lib/message-attachment'

const IMAGE = {
  kind: 'image' as const,
  uri: 'file:///x.jpg',
  name: 'x.jpg',
  size: 10,
}

const VIDEO = {
  kind: 'video' as const,
  uri: 'file:///v.mp4',
  name: 'v.mp4',
  size: null,
}

const AUDIO = {
  kind: 'audio' as const,
  uri: 'file:///a.m4a',
  name: 'voice.m4a',
  size: null,
  durationMs: 1000,
}

describe('attachmentKindLabel', () => {
  test('maps kinds', () => {
    expect(attachmentKindLabel('image')).toBe('Photo')
    expect(attachmentKindLabel('audio')).toBe('Voice note')
  })
})

describe('messagePreviewText', () => {
  test('plain body', () => {
    expect(messagePreviewText({ body: '  hi  ', attachment: undefined })).toBe('hi')
  })

  test('attachment without caption', () => {
    expect(
      messagePreviewText({
        body: '',
        attachment: {
          kind: 'image',
          uri: 'file:///x.jpg',
          name: 'x.jpg',
          size: 10,
        },
      }),
    ).toBe('Photo')
  })

  test('document uses file name', () => {
    expect(
      messagePreviewText({
        body: '',
        attachment: {
          kind: 'document',
          uri: 'file:///a.pdf',
          name: 'invoice.pdf',
          size: 100,
        },
      }),
    ).toBe('invoice.pdf')
  })

  test('caption joins label', () => {
    expect(
      messagePreviewText({
        body: 'see this',
        attachment: {
          kind: 'video',
          uri: 'file:///v.mp4',
          name: 'v.mp4',
          size: null,
        },
      }),
    ).toBe('Video · see this')
  })
})

describe('quoteAttachmentText', () => {
  test('truncates long previews', () => {
    const long = 'a'.repeat(90)
    const out = quoteAttachmentText({ body: long, attachment: undefined }, 72)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBe(73)
  })
})

describe('meteringToLevel', () => {
  test('maps silence low and loud high', () => {
    expect(meteringToLevel(-50)).toBe(0)
    expect(meteringToLevel(0)).toBe(1)
    expect(meteringToLevel(undefined)).toBeCloseTo(0.18)
  })
})

describe('downsamplePeaks', () => {
  test('pads short streams', () => {
    expect(downsamplePeaks([0.5], 4)).toEqual([0.5, 0.12, 0.12, 0.12])
  })

  test('buckets long streams by max', () => {
    expect(downsamplePeaks([0.1, 0.9, 0.2, 0.8], 2)).toEqual([0.9, 0.8])
  })
})

describe('formatDurationMs', () => {
  test('formats mm:ss', () => {
    expect(formatDurationMs(0)).toBe('0:00')
    expect(formatDurationMs(65_000)).toBe('1:05')
  })
})

describe('quoteLayoutMode', () => {
  test('text reply to image is fused-on-image', () => {
    expect(
      quoteLayoutMode(
        { body: '', attachment: IMAGE },
        { body: 'Looks good', attachment: undefined },
      ),
    ).toBe('fused-on-image')
  })

  test('image reply to image is header-only', () => {
    expect(
      quoteLayoutMode(
        { body: '', attachment: IMAGE },
        { body: 'That matches', attachment: IMAGE },
      ),
    ).toBe('header-only')
  })

  test('video reply to image is header-only', () => {
    expect(
      quoteLayoutMode(
        { body: '', attachment: IMAGE },
        { body: '', attachment: VIDEO },
      ),
    ).toBe('header-only')
  })

  test('text reply to text is standard', () => {
    expect(
      quoteLayoutMode(
        { body: 'Hello', attachment: undefined },
        { body: 'Hi back', attachment: undefined },
      ),
    ).toBe('standard')
  })

  test('text reply to voice note is standard', () => {
    expect(
      quoteLayoutMode(
        { body: '', attachment: AUDIO },
        { body: 'Got it', attachment: undefined },
      ),
    ).toBe('standard')
  })

  test('text reply to video is standard (not fused)', () => {
    expect(
      quoteLayoutMode(
        { body: '', attachment: VIDEO },
        { body: 'Nice clip', attachment: undefined },
      ),
    ).toBe('standard')
  })

  test('image reply to voice keeps standard label chip', () => {
    expect(
      quoteLayoutMode(
        { body: '', attachment: AUDIO },
        { body: '', attachment: IMAGE },
      ),
    ).toBe('standard')
  })
})
