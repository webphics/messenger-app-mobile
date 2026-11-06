import {
  SERVER_HANG_UP_RETRY_WINDOW_MS,
  shouldRetryAfterServerHangUp,
} from '@/lib/realtime-reconnect'

describe('shouldRetryAfterServerHangUp', () => {
  it('retries the first time the server closes the socket', () => {
    expect(shouldRetryAfterServerHangUp('io server disconnect', null, 1_000)).toBe(true)
  })

  it('does not retry again inside the window, so a refused reconnect is final', () => {
    expect(shouldRetryAfterServerHangUp('io server disconnect', 1_000, 1_500)).toBe(false)
  })

  it('retries again once the window has passed', () => {
    expect(
      shouldRetryAfterServerHangUp(
        'io server disconnect',
        1_000,
        1_000 + SERVER_HANG_UP_RETRY_WINDOW_MS,
      ),
    ).toBe(true)
  })

  it("leaves every other close to socket.io's own reconnect or to the app", () => {
    expect(shouldRetryAfterServerHangUp('transport close', null, 1_000)).toBe(false)
    expect(shouldRetryAfterServerHangUp('io client disconnect', null, 1_000)).toBe(false)
  })
})
