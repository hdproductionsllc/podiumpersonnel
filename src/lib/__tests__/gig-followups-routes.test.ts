import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({auth:vi.fn(),db:vi.fn(),images:vi.fn(),deliver:vi.fn(),rpc:vi.fn()}))
vi.mock('@/lib/api-helpers',()=>({requireOrgPlan:mocks.auth,requireOrgAdmin:mocks.auth,serverError:()=>new Response('error',{status:500})}))
vi.mock('@/lib/supabase/server',()=>({createServiceClient:mocks.db}))
vi.mock('@/lib/plan',()=>({canUseEmailFeatures:()=>true}))
vi.mock('@/lib/gig-followups/images',()=>({normalizeImages:mocks.images}))
vi.mock('@/lib/gig-followups/deliver',()=>({deliverFollowup:mocks.deliver}))
import { GET,POST } from '@/app/api/projects/[projectId]/followups/route'
import { GET as download } from '@/app/api/projects/[projectId]/followups/[followupId]/attachments/[index]/route'
const context={params:Promise.resolve({projectId:'project'})}
const request=()=>new Request('https://app.example.test/api/projects/project/followups',{method:'POST',headers:{'content-type':'application/json','origin':'https://app.example.test'},body:JSON.stringify({requestId:'12345678-1234-4234-8234-123456789012',mode:'followup',subject:'Parking',message:'North gate',recipientIds:['12345678-1234-4234-8234-123456789013'],attachments:[]})})
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({user:{id:'actor'},membership:{organization_id:'org'},plan:{},error:null});mocks.images.mockResolvedValue([])})
describe('follow-up HTTP security boundary',()=>{
 it('requires authentication before accessing private data',async()=>{
  mocks.auth.mockResolvedValue({error:new Response('Unauthorized',{status:401})})
  expect((await GET(new Request('https://app.example.test'),context))?.status).toBe(401)
  expect((await POST(request(),context))?.status).toBe(401)
  expect(mocks.db).not.toHaveBeenCalled();expect(mocks.deliver).not.toHaveBeenCalled()
 })
 it('rejects browser cross-origin sending before database access',async()=>{
  const req=request();req.headers.set('origin','https://evil.example.test')
  expect((await POST(req,context))?.status).toBe(403);expect(mocks.db).not.toHaveBeenCalled()
 })
 it('scopes project lookup to the authenticated org, rejecting another tenant',async()=>{
  const eq=vi.fn();const q={select:()=>q,eq:(...args:unknown[])=>{eq(...args);return q},maybeSingle:async()=>({data:null,error:null})}
  mocks.db.mockReturnValue({from:()=>q})
  expect((await POST(request(),context))?.status).toBe(404)
  expect(eq).toHaveBeenCalledWith('organization_id','org');expect(mocks.deliver).not.toHaveBeenCalled()
 })
 it('private downloads require both project and organization match',async()=>{
  const eq=vi.fn();const q={select:()=>q,eq:(...args:unknown[])=>{eq(...args);return q},maybeSingle:async()=>({data:null,error:null})}
  mocks.db.mockReturnValue({from:()=>q})
  expect((await download(new Request('https://app.example.test'),{params:Promise.resolve({projectId:'project',followupId:'foreign',index:'0'})})).status).toBe(404)
  expect(eq).toHaveBeenCalledWith('organization_id','org');expect(eq).toHaveBeenCalledWith('project_id','project')
 })
 it('never dispatches when atomic preparation rejects a stale roster',async()=>{
  const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{id:'project'},error:null})}
  mocks.rpc.mockResolvedValue({error:{code:'22023',message:'The roster changed. Review the recipients again.'}})
  mocks.db.mockReturnValue({from:()=>q,rpc:mocks.rpc})
  expect((await POST(request(),context))?.status).toBe(409)
  expect(mocks.deliver).not.toHaveBeenCalled()
  expect(mocks.rpc.mock.calls[0][1]).toMatchObject({p_org:'org',p_project:'project',p_actor:'actor',p_mode:'followup'})
 })
})
