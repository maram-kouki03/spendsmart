/**
 * Consent rules for shared expenses: who is connected to whom, invitation quotas, and the
 * clean-up when people stop being connected.
 *
 * Nobody becomes someone's contact or group member without accepting, and responses never reveal
 * whether an email address has a SpendSmart account.
 */
import { many, one, query } from '../db.js';
import { HttpError } from './util.js';
import { notify } from './finance.js';
import { sendMail, describeMailError } from './mailer.js';
import { leaveGroupPlans } from './plans.js';

export const INVITES_PER_DAY = 20;
export const INVITE_SENT = "If this person has a SpendSmart account, they'll get an invitation.";
export const GROUP_INVITES_SENT = "Group created. Everyone on the list who has a SpendSmart account will get an invitation.";

export const who = (p) => p?.full_name || p?.email || 'Someone';
export const normEmail = (e) => String(e).trim().toLowerCase();

/** "sarah@gmail.com" → "s•••h@gmail.com", for invited group members shown to other members. */
export function maskEmail(email) {
  const [user, domain] = String(email).split('@');
  if (!domain) return '•••';
  return `${user.length <= 2 ? user[0] : user[0] + '•••' + user.at(-1)}@${domain}`;
}

/** True when `a` and `b` are accepted contacts (contacts are always stored in both directions). */
export async function areContacts(a, b, ex) {
  const r = await one(
    `select count(*) as n from public.contacts
      where (owner_id = $1 and contact_id = $2) or (owner_id = $2 and contact_id = $1)`,
    [a, b], ex
  );
  return r.n === 2;
}

/** True when `userId` is an active (accepted) member of the group. */
export async function isActiveMember(groupId, userId, ex) {
  return !!(await one("select 1 from public.group_members where group_id = $1 and user_id = $2 and status = 'active'", [groupId, userId], ex));
}

/**
 * Inside transaction `c`: makes sure `uid` may send `n` more invitations today (429 otherwise).
 * Locks the sender's users row until the transaction ends, so two requests at once can't both pass
 * the check (a row lock rather than an advisory lock: safe through the Transaction pooler, and
 * NO KEY UPDATE doesn't block foreign-key checks that reference the user).
 */
export async function checkInviteQuota(c, uid, n) {
  await query('select 1 from public.users where id = $1 for no key update', [uid], c);
  const { sent } = await one(
    "select count(*) as sent from public.invite_sends where user_id = $1 and created_at > now() - interval '1 day'", [uid], c
  );
  if (sent + n > INVITES_PER_DAY) {
    const left = Math.max(0, INVITES_PER_DAY - sent);
    throw new HttpError(429, left
      ? `You can send ${left} more invitation${left === 1 ? '' : 's'} today.`
      : `You've sent ${INVITES_PER_DAY} invitations today — try again tomorrow.`, 'invite_limit', { left });
  }
}

/**
 * Inside `c`: logs one sent invitation and returns whether an invitation email should go to
 * `email` (only when it has no account, and no invitation email went to it in the last 7 days).
 */
export async function logInviteSend(c, uid, email, { hasAccount }) {
  let emailed = false;
  if (!hasAccount) {
    emailed = !(await one(
      "select 1 from public.invite_sends where to_email = $1 and emailed and created_at > now() - interval '7 days' limit 1", [email], c
    ));
  }
  await query('insert into public.invite_sends (user_id, to_email, emailed) values ($1, $2, $3)', [uid, email, emailed], c);
  await query("delete from public.invite_sends where user_id = $1 and created_at < now() - interval '8 days'", [uid], c);
  return emailed;
}

/** Inside `c`: cancels pending 1:1 split requests between `a` and `b` (accepted/declined ones stay as history). */
export function cancelPairSplits(c, a, b) {
  return query(
    `update public.split_requests set status = 'cancelled', responded_at = now()
      where status = 'pending' and group_id is null
        and ((from_user = $1 and to_user = $2) or (from_user = $2 and to_user = $1))`,
    [a, b], c
  );
}

/** Inside `c`: cancels pending split requests of a group — all of them, or only those involving `userId`. */
export function cancelGroupSplits(c, groupId, userId = null) {
  return query(
    `update public.split_requests set status = 'cancelled', responded_at = now()
      where status = 'pending' and group_id = $1 and ($2::uuid is null or from_user = $2 or to_user = $2)`,
    [groupId, userId], c
  );
}

/** Inside `c`: takes `userId` out of a group (row, pending splits, and their opt-in on the group's shared budgets). */
export async function removeFromGroup(c, groupId, userId) {
  await cancelGroupSplits(c, groupId, userId);
  // Their savings in the group's plans go back to their own cards.
  await leaveGroupPlans(c, groupId, userId);
  await query('delete from public.group_members where group_id = $1 and user_id = $2', [groupId, userId], c);
}

export const contactInviteNote = (fromProfile, inviteId) => ({
  type: 'invite',
  title: `${who(fromProfile)} wants to share expenses with you`,
  body: `${fromProfile.email} invited you as a contact on SpendSmart.`,
  data: { invite_id: inviteId },
  dedupe_key: `invite:${inviteId}`
});

export const groupInviteNote = (fromProfile, group) => ({
  type: 'invite',
  title: `${who(fromProfile)} invited you to the group ${group.name}`,
  body: 'Join to split costs and share budgets with the group.',
  data: { group_id: group.id },
  dedupe_key: `group-invite:${group.id}:${Date.now()}`
});

/**
 * Inside the sign-up transaction: invitations sent to this address before the account existed
 * now belong to the new user, and show up in their invitations and notification bell.
 */
export async function claimInvites(c, userId, email) {
  const addr = normEmail(email);
  const contacts = await many(
    `update public.contact_invites i set to_user = $1
       from public.profiles p
      where i.to_user is null and i.to_email = $2 and i.status = 'pending' and p.id = i.from_user and i.from_user <> $1
      returning i.id, p.full_name, p.email`,
    [userId, addr], c
  );
  for (const inv of contacts) await notify(userId, contactInviteNote(inv, inv.id), c);

  const groups = await many(
    `with moved as (
       insert into public.group_members (group_id, user_id, status, invited_by, invited_at)
       select e.group_id, $1, 'invited', e.invited_by, e.created_at from public.group_email_invites e where e.email = $2
       on conflict (group_id, user_id) do nothing
       returning group_id, invited_by
     )
     select g.id, g.name, p.full_name, p.email
       from moved m join public.groups g on g.id = m.group_id left join public.profiles p on p.id = m.invited_by`,
    [userId, addr], c
  );
  await query('delete from public.group_email_invites where email = $1', [addr], c);
  for (const g of groups) await notify(userId, groupInviteNote(g, g), c);
}

const appUrl = () => (process.env.APP_URL || (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0]).trim().replace(/\/$/, '');
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/**
 * Emails an invitation to join SpendSmart. Called after the response has been sent (so the
 * response time doesn't depend on whether the address has an account); failures are only logged.
 */
export function emailJoinInvite({ to, from, groupName = null }) {
  const name = who(from);
  const what = groupName ? `join the group "${groupName}" on SpendSmart` : 'share expenses with them on SpendSmart';
  const link = `${appUrl()}/login`;
  const text = `Hi,

${name} (${from.email}) invited you to ${what}.

Create a free account with this email address and the invitation will be waiting for you:
${link}

If you don't know ${name}, you can ignore this email.`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:32px 12px;background:#FFFBEF;font-family:Poppins,'Segoe UI',Helvetica,Arial,sans-serif;color:#3B2F12;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #F5E2A8;border-radius:24px;padding:32px;">
    <div style="font-size:20px;font-weight:700;margin-bottom:16px;">SpendSmart</div>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;"><b>${esc(name)}</b> (${esc(from.email)}) invited you to ${esc(what)}.</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">Create a free account with this email address and the invitation will be waiting for you.</p>
    <a href="${esc(link)}" style="display:inline-block;background:#F2D06B;color:#3B2F12;font-weight:700;text-decoration:none;border-radius:999px;padding:12px 24px;">Join SpendSmart</a>
    <p style="font-size:13px;color:#6B5A33;margin:24px 0 0;">If you don't know ${esc(name)}, you can ignore this email.</p>
  </div>
</body></html>`;
  setImmediate(() => {
    sendMail({ to, subject: `${name} invited you to SpendSmart`, text, html })
      .catch((err) => console.error(`[mail] Invitation email to ${to} failed: ${describeMailError(err)}`));
  });
}
