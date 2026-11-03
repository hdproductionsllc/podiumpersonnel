import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ send: vi.fn(), notify: vi.fn(), owner: vi.fn() }))
vi.mock('@/lib/email/send', () => ({ sendEmail: mocks.send }))
vi.mock('@/lib/notify', () => ({ notify: mocks.notify }))
vi.mock('@/lib/supabase/server', () => ({ getOrgOwnerEmail: mocks.owner }))
import { deliverFollowup } from '@/lib/gig-followups/deliver'
import type { SupabaseClient } from '@supabase/supabase-js'

function database(mode = 'followup') {
  const batch = { id:'batch', organization_id:'org', project_id:'project', project_name:'Gig', organization_name:'Org', mode, subject:'Parking', message:'North gate', status:'pending', attachments:[{ filename:'map.png', contentType:'image/png', content:'AAAA' }] }
  const recipient = { musician_id:'musician', recipient_email:'musician@example.test', recipient_name:'Test Musician', status:'pending', confirmation_token:mode === 'material_update' ? 'new-token' : null, provider_id: null }
  const db = { from(table: string) {
    let update: Record<string,unknown> | undefined
    const filters: [string,unknown][] = []
    const finish = () => {
      const row = table === 'gig_followups' ? batch : recipient
      const matches = filters.every(([k,v]) => k === 'followup_id' ? v === 'batch' : row[k as keyof typeof row] === v)
      if (!matches) return { data:null,error:null }
      if (update) Object.assign(row,update)
      return { data: table === 'gig_followup_recipients' && !update ? [recipient] : { ...row }, error:null }
    }
    const q = { update(value:Record<string,unknown>) { update=value; return q }, eq(k:string,v:unknown){ filters.push([k,v]); return q }, select(){return q}, maybeSingle:async()=>finish(), then(resolve:(value:unknown)=>unknown){return Promise.resolve(finish()).then(resolve)} }
    return q
  } }
  return { db: db as unknown as SupabaseClient, batch, recipient }
}
beforeEach(() => { vi.clearAllMocks(); mocks.owner.mockResolvedValue('admin@example.test'); mocks.send.mockResolvedValue({ id:'provider-id', suppressed:false, emailHtml:'body' }); mocks.notify.mockImplementation(async (_event,content) => content.email()) })
describe('durable follow-up dispatch', () => {
  it('claims once across concurrent requests and passes private attachments and stable idempotency keys', async () => {
    const { db,recipient } = database()
    await Promise.all([deliverFollowup(db,'batch','org'),deliverFollowup(db,'batch','org')])
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ idempotencyKey:'gig-followup/batch/musician', to:'musician@example.test', replyTo:'admin@example.test', attachments:[{filename:'map.png'}] })
    expect(mocks.send.mock.calls[0][0].html).not.toContain('/confirm-details/')
    expect(recipient.status).toBe('sent')
    expect(mocks.notify.mock.calls[0][0]).toMatchObject({ copyIdempotencyKey:'gig-followup-copy/batch/musician', copyAttachments:[{filename:'map.png'}] })
  })
  it('does not claim a different organization', async () => {
    const {db} = database(); await deliverFollowup(db,'batch','other-org'); expect(mocks.send).not.toHaveBeenCalled()
  })
  it('never retries an ambiguous provider timeout', async () => {
    mocks.send.mockRejectedValue(new Error('timeout'))
    const {db,recipient} = database(); await deliverFollowup(db,'batch','org'); await deliverFollowup(db,'batch','org')
    expect(recipient.status).toBe('uncertain'); expect(mocks.send).toHaveBeenCalledTimes(1)
  })
  it('keeps safe-mode suppression distinct from sent', async () => {
    mocks.send.mockResolvedValue({ id:null,suppressed:true })
    const {db,recipient} = database(); await deliverFollowup(db,'batch','org'); expect(recipient.status).toBe('suppressed')
  })
  it('uses the new token for material updates', async () => {
    const {db} = database('material_update'); await deliverFollowup(db,'batch','org')
    expect(mocks.send.mock.calls[0][0].html).toContain('/confirm-details/new-token')
  })
})
