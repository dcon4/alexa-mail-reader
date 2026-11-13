'use strict';

const textx = require('./text');

function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function clip(s, max) {
  const str = String(s == null ? '' : s).trim();
  if (str.length <= max) return str;
  let cut = str.lastIndexOf(' ', max);
  if (cut < max * 0.5) cut = max;
  return str.slice(0, cut).trim() + '...';
}

function relativeTime(dateStr) {
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return min === 1 ? '1 minute ago' : min + ' minutes ago';
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return hrs === 1 ? '1 hour ago' : hrs + ' hours ago';
  const days = Math.floor(hrs / 24);
  if (days <= 1) return 'yesterday';
  if (days < 7) return days + ' days ago';
  return new Date(t).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function sanitize(s) {
  return textx.stripEmoji(textx.scrubUrls(String(s == null ? '' : s)));
}

function senderName(from) {
  if (!from) return 'someone';
  const angle = from.match(/^(.*?)<(.+?)>/s);
  let name = (angle ? angle[1] : from).trim();
  name = name.replace(/^"|"$/g, '').trim();
  if (!name) {
    const addr = angle ? angle[2] : from;
    name = addr.split('@')[0];
  } else if (!angle && name.includes('@')) {
    name = name.split('@')[0];
  }
  return clip(name, 40);
}

function summaryLine(meta) {
  const from = escapeXml(clip(sanitize(senderName(meta.from)), 40));
  const subj = meta.subject && meta.subject.trim()
    ? escapeXml(clip(sanitize(meta.subject.trim()), 60))
    : 'no subject';
  const when = relativeTime(meta.date);
  return `From ${from}, ${subj}${when ? ', ' + when : ''}.`;
}

function countText(count, cap) {
  if (count >= cap) return cap + ' or more unread messages';
  if (count === 0) return 'no unread messages';
  return count + (count === 1 ? ' unread message' : ' unread messages');
}

function senderDomain(from) {
  const s = String(from || '');
  const m = s.match(/<[^>]*@([^>,;\s]+)>/) || s.match(/@([^-,;\s]+)/);
  return m ? m[1] : '';
}

function spellAddress(email) {
  const s = String(email || '').trim();
  const at = s.indexOf('@');
  if (at < 1) return s;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  const spelled = local.split('').join(' ');
  const dom = domain.split('.').filter(Boolean).join(' dot ');
  return spelled + ' at ' + dom;
}

module.exports = {
  escapeXml,
  clip,
  relativeTime,
  senderName,
  summaryLine,
  countText,
  sanitize,
  senderDomain,
  spellAddress,
};
