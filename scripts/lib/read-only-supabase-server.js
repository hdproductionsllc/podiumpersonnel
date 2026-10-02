/**
 * Stand-in for src/lib/supabase/server.ts when app code is loaded by a
 * READ-ONLY script (scripts/preview-auto-cascade.js). The app's own server
 * clients can write; here any attempt to make one fails loudly instead, so the
 * script can only ever use the GET-only client it builds itself.
 */
function refuse(name) {
  return () => {
    throw new Error(`${name}() is not available in a read-only script`)
  }
}

module.exports = {
  createClient: refuse('createClient'),
  createServiceClient: refuse('createServiceClient'),
  getOrgAdminEmails: refuse('getOrgAdminEmails'),
  getOrgOwnerEmail: refuse('getOrgOwnerEmail'),
}
