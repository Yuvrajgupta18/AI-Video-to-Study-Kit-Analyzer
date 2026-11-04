import { describe, expect, it } from 'vitest'
import { AxiosError, CanceledError } from 'axios'
import { getErrorMessage } from './api'

const responseError = (status, data) => Object.assign(new AxiosError('fail'), { response: { status, data } })

describe('getErrorMessage', () => {
  it('shows the backend detail message', () => {
    expect(getErrorMessage(responseError(429, { detail: 'Rate limit reached.' }))).toBe('Rate limit reached.')
  })

  it('joins FastAPI validation errors', () => {
    const error = responseError(422, { detail: [{ msg: 'List should have at least 1 item' }, { msg: 'Field required' }] })
    expect(getErrorMessage(error)).toBe('List should have at least 1 item; Field required')
  })

  it('reports an offline backend when the proxy returns 502 without detail', () => {
    expect(getErrorMessage(responseError(502, ''))).toMatch(/Couldn't reach the transcription server/)
  })

  it('appends a hint to unexpected 500 errors only when given', () => {
    expect(getErrorMessage(responseError(500, 'Internal Server Error'))).toBe(
      'The server hit an unexpected error. Check the backend terminal for details.',
    )
    expect(getErrorMessage(responseError(500, ''), { serverErrorHint: 'Is FFmpeg installed?' })).toMatch(/Is FFmpeg installed\?$/)
  })

  it('handles timeouts, network failures, and cancellation', () => {
    expect(getErrorMessage(Object.assign(new AxiosError('timeout'), { code: 'ECONNABORTED', request: {} }))).toMatch(/timed out/)
    expect(getErrorMessage(Object.assign(new AxiosError('Network Error'), { request: {} }))).toMatch(/Couldn't reach/)
    expect(getErrorMessage(new CanceledError())).toBe('The request was cancelled.')
  })
})
