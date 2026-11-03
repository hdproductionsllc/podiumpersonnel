import { beforeEach, describe, expect, it, vi } from 'vitest'
const fake=vi.hoisted(()=>({email:vi.fn(),log:vi.fn()}))
vi.mock('@/lib/email/send',()=>({sendEmail:fake.email}))
vi.mock('@/lib/email/log',()=>({logEmail:fake.log,hasRecentFailure:async()=>false}))
vi.mock('@/lib/supabase/server',()=>({getOrgAdminEmails:async()=>['owner@example.test','admin@example.test']}))
import { notify } from '@/lib/notify'
beforeEach(()=>{vi.clearAllMocks();fake.email.mockResolvedValue({id:'copy',suppressed:false})})
describe('follow-up owner copies',()=>{
 it.each(['gig_followup','gig_details_update'])('copies %s with pictures, disables personal confirmation links',async type=>{
  const html='<p>Updated venue map</p><a href="https://example.test/confirm-details/private-token">Confirm</a>'
  const attachments=[{filename:'map.png',contentType:'image/png',content:'AAAA'}]
  await notify({type,copyAttachments:attachments,copyIdempotencyKey:'copy/batch/musician',record:()=>({organizationId:'org',recipientEmail:'player@example.test',recipientName:'Player',subject:'Venue',emailType:type,body:html})},{email:async()=>({id:'original',emailHtml:html,suppressed:false})})
  expect(fake.email).toHaveBeenCalledTimes(1)
  expect(fake.email.mock.calls[0][0]).toMatchObject({to:['owner@example.test','admin@example.test'],attachments,idempotencyKey:'copy/batch/musician'})
  expect(fake.email.mock.calls[0][0].subject).toContain('Copy:')
  expect(fake.email.mock.calls[0][0].html).not.toContain('href="https://example.test/confirm-details/private-token"')
 })
 it('does not copy a safety-suppressed original',async()=>{
  await notify({type:'gig_followup',record:()=>({organizationId:'org',recipientEmail:'player@example.test',subject:'Venue',emailType:'gig_followup',body:'hello',status:'suppressed'})},{email:async()=>({id:null,suppressed:true})})
  expect(fake.email).not.toHaveBeenCalled()
 })
})
