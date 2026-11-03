import { escapeHtml } from '@/lib/utils'

export function renderFollowup(input: { projectName: string; organizationName: string; message: string; confirmationUrl?: string; filenames: string[] }) {
  const { projectName, organizationName, message, confirmationUrl, filenames } = input
  const text = `${organizationName}\n${projectName}\n\n${message}\n\n${confirmationUrl ? `Please confirm you have read this update: ${confirmationUrl}` : 'Your existing gig-details confirmation is unchanged.'}${filenames.length ? `\n\nAttached: ${filenames.join(', ')}` : ''}`
  const html = `<h2>${escapeHtml(organizationName)}</h2><h3>${escapeHtml(projectName)}</h3><div style="white-space:pre-wrap">${escapeHtml(message)}</div>${confirmationUrl ? `<p>This update changes the gig details. Please read the message and attachments, then <a href="${escapeHtml(confirmationUrl)}">confirm this update</a>.</p>` : '<p>Your existing gig-details confirmation is unchanged.</p>'}${filenames.length ? `<p>Attached: ${filenames.map(escapeHtml).join(', ')}</p>` : ''}`
  return { html, text }
}
