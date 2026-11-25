// yt-dlp format selection for the quality cap: best resolution up to N, or the smallest one above if nothing
// fits. The height>0 filter keeps sites with odd metadata (e.g. PeerTube) from selecting an audio-only format.
export const videoFormatArgs = (h) => ['-f', 'bv*[height>0]+ba/b[height>0]/bv*+ba/b', ...(h ? ['-S', `res:${Number(h)}`] : [])];

// One entry per video height, with an approximate size when the site reports it (video stream only).
export function qualitiesFrom(formats = []) {
  const best = new Map();
  for (const f of formats) {
    if (!f.height || f.vcodec === 'none') continue;
    const size = f.filesize || f.filesize_approx || 0;
    const cur = best.get(f.height);
    if (!cur || size > cur.size) best.set(f.height, { height: f.height, size });
  }
  return [...best.values()].sort((a, b) => b.height - a.height);
}
