export const fmtSize = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
export const fmtDur = (s) => { s = Math.round(s || 0); const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`; };
export const MEDIA = /\.(mp4|mkv|webm|mov|avi|flv|ts|mp3|m4a|opus|ogg|wav|flac|aac)$/i;
export const DERIVED = /^(burned|captioned|with-subtitles|compatible)/;
export const mediaOf = (job) => job.files.filter((f) => MEDIA.test(f.name) && !DERIVED.test(f.name));
export const STATUS = { queued: 'Na fila', running: 'A descarregar', done: 'Concluído', error: 'Erro', cancelled: 'Cancelado', interrupted: 'Interrompido', idle: '' };
export const isActive = (j) => j.status === 'queued' || j.status === 'running';
