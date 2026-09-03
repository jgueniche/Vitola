import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ReportDialog } from '@/components/moderation/report-dialog'
import { REPORT_REASONS } from '@/lib/compliance/dsa'
import fr from '@/messages/fr.json'

/**
 * The « Signaler » control on a public page, refusal by refusal.
 *
 * Until the shop moved in front of the age gate (25 août 2026) every page
 * carrying this dialog implied a cleared gate and, in practice, a session —
 * so a 401 and a 403 could share one sentence. On `/boutique` they are two
 * ordinary situations with two different doors, and each door must carry the
 * way back to the product being reported: `docs/decisions-log.md` chose that
 * detour over moving the notice route in front of the gate. This is where the
 * detour is proved, without a browser.
 */

const copy = fr.moderation.report
const PRODUCT_ID = '0f6a5c0e-4b3a-4e8b-9c8a-2c3d4e5f6a7b'
const HERE = '/boutique/hygrometre-a-cheveu?onglet=avis'

/** A fetch that answers one status; the dialog reads nothing else. */
function answering(status: number) {
  return vi.fn(async () => ({ status, json: async () => ({}) }))
}

function form(): HTMLFormElement {
  const submit = screen.getByRole('button', { name: copy.submit })
  const element = submit.closest('form')
  if (!element) throw new Error('the submit button is not inside the report form')
  return element
}

function openDialog(kind: 'product' | 'vendor' = 'product') {
  render(<ReportDialog kind={kind} id={PRODUCT_ID} slaHours={72} label={copy.triggerProduct} />)
  fireEvent.click(screen.getByRole('button', { name: copy.triggerProduct }))
}

beforeEach(() => {
  window.history.pushState({}, '', HERE)
  // jsdom does not always ship one; the dialog only uses it to move focus.
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the reasons offered on a product', () => {
  it('are the six of the queue, the §2 one first', () => {
    openDialog('product')
    const options = within(screen.getByRole('combobox')).getAllByRole('option')
    expect(options.map((option) => option.getAttribute('value'))).toEqual([...REPORT_REASONS])
    expect(options[0]?.getAttribute('value')).toBe('tobacco_promotion')
    expect(options[0]?.textContent).toBe(copy.reasons.tobacco_promotion)
  })
})

describe('what the dialog sends', () => {
  it('posts the kind, the id and the chosen reason to the notice route', async () => {
    const fetchMock = answering(201)
    vi.stubGlobal('fetch', fetchMock)
    openDialog('vendor')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'spam' } })
    fireEvent.submit(form())

    await waitFor(() => expect(screen.getByText(copy.sentTitle)).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/signalements')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      kind: 'vendor',
      id: PRODUCT_ID,
      reason: 'spam',
    })
    expect(screen.getByText(copy.sentBody.replace('{hours}', '72'))).toBeTruthy()
  })
})

describe('a refusal is a door with the way back', () => {
  it('sends a visitor without a session to sign in, and back here after', async () => {
    vi.stubGlobal('fetch', answering(401))
    openDialog()
    fireEvent.submit(form())

    await waitFor(() => expect(screen.getByText(copy.signIn)).toBeTruthy())
    const link = screen.getByRole('link', { name: fr.comments.signInAction })
    expect(link.getAttribute('href')).toBe(`/connexion?suite=${encodeURIComponent(HERE)}`)
  })

  it('sends a member who never crossed the portal through it, and back here after', async () => {
    // The middleware's 403 in JSON. On a gated page it meant an expired
    // cookie; on the public shop it is the member who signed in from a public
    // page. Same door either way, and never « connectez-vous » to someone who
    // already is.
    vi.stubGlobal('fetch', answering(403))
    openDialog()
    fireEvent.submit(form())

    await waitFor(() => expect(screen.getByText(copy.ageGate)).toBeTruthy())
    expect(screen.queryByText(copy.signIn)).toBeNull()
    const link = screen.getByRole('link', { name: copy.ageGateAction })
    expect(link.getAttribute('href')).toBe(`/majorite?suite=${encodeURIComponent(HERE)}`)
  })

  it('offers no door on the refusals that have none', async () => {
    vi.stubGlobal('fetch', answering(404))
    openDialog()
    fireEvent.submit(form())

    await waitFor(() => expect(screen.getByText(copy.gone)).toBeTruthy())
    expect(screen.queryByRole('link')).toBeNull()
  })
})
