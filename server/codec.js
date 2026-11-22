// Codec reader: inspects a media file with ffprobe, explains it in plain language, checks that this
// FFmpeg can decode it and that browsers can play it, and picks an encoder for conversion.
import { run } from './run.js';

const VIDEO = {
  h264: 'H.264 (AVC)', hevc: 'H.265 (HEVC)', av1: 'AV1', vp9: 'VP9', vp8: 'VP8', mpeg4: 'MPEG-4 Part 2',
  mpeg2video: 'MPEG-2', prores: 'Apple ProRes', dnxhd: 'DNxHD', mjpeg: 'Motion JPEG', theora: 'Theora', wmv3: 'WMV 9', vc1: 'VC-1',
};
const AUDIO = {
  aac: 'AAC', mp3: 'MP3', opus: 'Opus', vorbis: 'Vorbis', ac3: 'Dolby Digital (AC-3)', eac3: 'Dolby Digital Plus (E-AC-3)',
  dts: 'DTS', flac: 'FLAC', alac: 'Apple Lossless', pcm_s16le: 'PCM (WAV)', pcm_s24le: 'PCM 24-bit', wmav2: 'WMA',
};
const label = (map, c) => map[c] || (c ? c.toUpperCase() : 'desconhecido');

// ---- FFmpeg capabilities (cached per binary) ----
const capCache = new Map();
export async function capabilities(ffmpeg) {
  if (capCache.has(ffmpeg)) return capCache.get(ffmpeg);
  const list = async (flag) => new Set((await run(ffmpeg, ['-hide_banner', flag])).split('\n')
    .map((l) => l.match(/^\s[A-Z.]{6}\s(\S+)/)?.[1]).filter(Boolean));
  const [encoders, decoders, filters] = await Promise.all([list('-encoders'), list('-decoders'), list('-filters')]);
  const cap = { encoders, decoders, filters, libass: filters.has('subtitles') };
  capCache.set(ffmpeg, cap);
  return cap;
}

export function pickH264Encoder(cap) {
  const order = process.platform === 'darwin' ? ['libx264', 'h264_videotoolbox'] : ['libx264', 'h264_nvenc', 'h264_amf', 'h264_qsv', 'h264_mf'];
  return order.find((e) => cap.encoders.has(e)) || null;
}

export function capabilitySummary(cap) {
  const has = (...n) => n.some((x) => cap.encoders.has(x));
  return [
    { id: 'h264', label: 'Converter para H.264 (compatível)', ok: !!pickH264Encoder(cap) },
    { id: 'hevc', label: 'Converter para H.265 (HEVC)', ok: has('libx265', 'hevc_videotoolbox', 'hevc_nvenc') },
    { id: 'av1', label: 'Converter para AV1', ok: has('libsvtav1', 'libaom-av1', 'librav1e') },
    { id: 'vp9', label: 'Converter para VP9 (WebM)', ok: has('libvpx-vp9') },
    { id: 'aac', label: 'Áudio AAC', ok: has('aac', 'libfdk_aac', 'aac_at') },
    { id: 'mp3', label: 'Áudio MP3', ok: has('libmp3lame') },
    { id: 'opus', label: 'Áudio Opus', ok: has('libopus') },
    { id: 'libass', label: 'Gravar legendas no vídeo (libass)', ok: cap.libass },
  ];
}

// ---- Probe ----
export async function probe(ffprobe, filePath, signal) {
  const j = JSON.parse(await run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath], { signal }));
  const v = j.streams?.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  const a = j.streams?.find((s) => s.codec_type === 'audio');
  const subs = (j.streams || []).filter((s) => s.codec_type === 'subtitle');
  const [n, d] = (v?.avg_frame_rate || v?.r_frame_rate || '0/1').split('/').map(Number);
  return {
    container: (j.format?.format_name || '').split(',')[0],
    containerLong: j.format?.format_long_name,
    duration: Number(j.format?.duration) || 0,
    size: Number(j.format?.size) || 0,
    bitrate: Number(j.format?.bit_rate) || 0,
    video: v && {
      codec: v.codec_name || 'unknown', label: label(VIDEO, v.codec_name), profile: v.profile, width: v.width, height: v.height,
      fps: d ? Math.round((n / d) * 100) / 100 : 0, pixFmt: v.pix_fmt,
      bitDepth: Number(v.bits_per_raw_sample) || (/10(le|be)|p10/.test(v.pix_fmt || '') ? 10 : 8),
    },
    audio: a && { codec: a.codec_name || 'unknown', label: label(AUDIO, a.codec_name), channels: a.channels, sampleRate: Number(a.sample_rate) || 0 },
    subtitles: subs.map((s) => ({ codec: s.codec_name, lang: s.tags?.language || '' })),
  };
}

// ---- Analysis in plain language ----
export function analyze(info, cap, platform = process.platform) {
  const reasons = [];
  const missing = [];
  let level = 'yes';
  const worse = (l) => { if (l === 'no' || (l === 'partial' && level === 'yes')) level = l; };

  const how = platform === 'win32' ? 'winget install Gyan.FFmpeg (versão "full")' : 'brew install ffmpeg (ou um build "full")';
  for (const [kind, s] of [['vídeo', info.video], ['áudio', info.audio]]) {
    if (!s) continue;
    if (s.codec === 'unknown' || !cap.decoders.has(s.codec)) {
      missing.push({
        what: `Descodificador de ${kind}: ${s.label}`,
        explain: s.codec === 'unknown'
          ? `O ficheiro usa um formato de ${kind} que este FFmpeg não reconhece. Pode ser um formato raro ou protegido.`
          : `Este FFmpeg não consegue ler ${kind} em ${s.label}.`,
        how: `Instala um FFmpeg completo: ${how}. Depois reinicia a app.`,
      });
      worse('no');
    }
  }

  if (!['mov', 'mp4', 'webm', 'matroska', 'ogg', 'mp3', 'wav', 'flac', 'aac'].includes(info.container) && !/mp4|mov/.test(info.container)) {
    reasons.push(`O contentor "${info.container}" não abre bem em browsers.`); worse('no');
  } else if (info.container === 'matroska') {
    reasons.push('Ficheiros MKV só abrem em alguns browsers.'); worse('partial');
  }
  const v = info.video;
  if (v) {
    if (v.codec === 'h264') {
      if (v.pixFmt && v.pixFmt !== 'yuv420p') { reasons.push(`O H.264 usa ${v.pixFmt}; muitos players só aceitam yuv420p.`); worse('partial'); }
      if (v.bitDepth > 8) { reasons.push('H.264 de 10 bits não abre na maioria dos browsers.'); worse('no'); }
    } else if (v.codec === 'hevc') { reasons.push('H.265 (HEVC) só abre em Safari, Edge e alguns Chrome com aceleração de hardware.'); worse('partial'); }
    else if (v.codec === 'av1' || v.codec === 'vp9') { reasons.push(`${v.label} abre nos browsers recentes, mas não em Safari/Macs mais antigos.`); worse('partial'); }
    else if (v.codec !== 'vp8') { reasons.push(`${v.label} não abre em browsers.`); worse('no'); }
  }
  const a = info.audio;
  if (a) {
    if (['aac', 'mp3', 'opus', 'flac'].includes(a.codec)) { /* ok */ }
    else if (a.codec === 'vorbis') { reasons.push('Vorbis não toca em Safari.'); worse('partial'); }
    else { reasons.push(`Áudio ${a.label} não toca nos browsers.`); worse('no'); }
  }

  const summary = missing.length
    ? 'Formato desconhecido para este FFmpeg: faltam componentes.'
    : level === 'yes' ? 'Abre em praticamente todo o lado.'
      : level === 'partial' ? 'Abre em alguns dispositivos, mas não em todos.' : 'Não abre em browsers e na maioria dos players.';
  const encoder = pickH264Encoder(cap);
  const canConvert = !missing.length && level !== 'yes' && (encoder || !v);
  const actions = [];
  if (canConvert) actions.push({ id: 'transcode', label: v ? 'Converter para MP4 (H.264 + AAC)' : 'Converter para MP3' });
  if (level !== 'yes' && !encoder && v && !missing.length) {
    missing.push({ what: 'Codificador H.264', explain: 'Este FFmpeg não consegue criar vídeo H.264 para converter.', how: `Instala um FFmpeg completo: ${how}.` });
  }
  return { level, summary, reasons, missing, actions, encoder };
}

// ---- Transcode to a widely playable format ----
export async function transcode({ ffmpeg, cap, src, cwd, hasVideo, duration, signal, onProgress }) {
  const out = hasVideo ? 'compatible.mp4' : 'compatible.mp3';
  const args = ['-y', '-i', src, '-sn', '-dn'];
  if (hasVideo) {
    const enc = pickH264Encoder(cap);
    if (!enc) throw new Error('Unknown encoder h264');
    args.push('-c:v', enc);
    if (enc === 'libx264') args.push('-preset', 'veryfast', '-crf', '22');
    else args.push('-b:v', '6M');
    args.push('-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart');
  } else args.push('-vn', '-c:a', 'libmp3lame', '-b:a', '192k');
  args.push('-progress', 'pipe:1', '-nostats', out);
  await run(ffmpeg, args, {
    cwd, signal,
    onLine: (l) => {
      const m = l.match(/^out_time_(?:us|ms)=(\d+)/);
      if (m && duration) onProgress?.(Math.min(99, (Number(m[1]) / 1e6 / duration) * 100));
    },
  });
  return out;
}
