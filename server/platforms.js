// Which site a link comes from. Used for the platform filter and per-platform counts.
export const PLATFORMS = [
  { id: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'] },
  { id: 'instagram', label: 'Instagram', hosts: ['instagram.com'] },
  { id: 'tiktok', label: 'TikTok', hosts: ['tiktok.com'] },
  { id: 'facebook', label: 'Facebook', hosts: ['facebook.com', 'fb.watch', 'fb.com'] },
  { id: 'twitter', label: 'X / Twitter', hosts: ['twitter.com', 'x.com', 't.co'] },
  { id: 'vimeo', label: 'Vimeo', hosts: ['vimeo.com'] },
  { id: 'twitch', label: 'Twitch', hosts: ['twitch.tv'] },
  { id: 'reddit', label: 'Reddit', hosts: ['reddit.com', 'redd.it'] },
];

export function platformOf(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return 'other'; }
  const hit = PLATFORMS.find((p) => p.hosts.some((d) => host === d || host.endsWith(`.${d}`)));
  return hit ? hit.id : 'other';
}
