// yt-dlp format selection for the quality cap: best resolution up to N, or the smallest one above if nothing
// fits. The height>0 filter keeps sites with odd metadata (e.g. PeerTube) from selecting an audio-only format.
export const videoFormatArgs = (h) => ['-f', 'bv*[height>0]+ba/b[height>0]/bv*+ba/b', ...(h ? ['-S', `res:${Number(h)}`] : [])];
