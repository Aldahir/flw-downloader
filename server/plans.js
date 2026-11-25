// Business rules per plan: how many downloads run at once, how much disk space a finished
// download is allowed to use, how long it stays on the server before being deleted on its own,
// and the public API's daily quotas. Prices are in Kz (Kwanza), billed monthly, paid by bank
// transfer/Multicaixa with a human approving the proof (see server/payments.js) — there is no
// payment gateway for AOA wired in yet.
export const PLANS = {
  free: {
    label: 'Gratuito', price: 0,
    storageMB: 1024, ttlMinutes: 60,
    maxParallel: 5, priority: false,
    api: { qrPerDay: 5, videosPerDay: 5 },
    benefits: ['1 GB de armazenamento', 'Os ficheiros ficam 60 minutos disponíveis', '5 downloads em simultâneo', '5 códigos QR e 5 vídeos por dia na API'],
  },
  pro_base: {
    label: 'Pro Base', price: 4000,
    storageMB: 5 * 1024, ttlMinutes: 30 * 24 * 60,
    maxParallel: 5, priority: true,
    api: { qrPerDay: 50, videosPerDay: 50 },
    benefits: ['5 GB de armazenamento', 'Os ficheiros ficam 30 dias disponíveis', 'Fila prioritária', '50 códigos QR e 50 vídeos por dia na API'],
  },
  pro_plus: {
    label: 'Pro Plus', price: 8000,
    storageMB: 15 * 1024, ttlMinutes: 30 * 24 * 60,
    maxParallel: 5, priority: true,
    api: { qrPerDay: 150, videosPerDay: 150 },
    benefits: ['15 GB de armazenamento', 'Os ficheiros ficam 30 dias disponíveis', 'Fila prioritária', '150 códigos QR e 150 vídeos por dia na API'],
  },
  pro_max: {
    label: 'Pro Max', price: 12000,
    storageMB: 30 * 1024, ttlMinutes: 60 * 24 * 60,
    maxParallel: 5, priority: true,
    api: { qrPerDay: 500, videosPerDay: 500 },
    benefits: ['30 GB de armazenamento', 'Os ficheiros ficam 60 dias disponíveis', 'Fila prioritária', '500 códigos QR e 500 vídeos por dia na API'],
  },
};
// Extra storage any Pro account (any pro_* plan) can buy on top of its plan's own quota.
export const STORAGE_ADDONS = [
  { id: 'addon_5gb', label: '+5 GB', mb: 5 * 1024, price: 1500 },
  { id: 'addon_15gb', label: '+15 GB', mb: 15 * 1024, price: 3500 },
  { id: 'addon_30gb', label: '+30 GB', mb: 30 * 1024, price: 6000 },
];
export const isPro = (plan) => plan !== 'free' && !!PLANS[plan];
export const planOrFree = (plan) => (PLANS[plan] ? plan : 'free');

// A single global safety cap on how many downloads run on this machine at once, independent of
// plan (protects the server itself; every plan's maxParallel above is currently the same number).
export const GLOBAL_MAX_PARALLEL = Number(process.env.MAX_GLOBAL_PARALLEL) || 20;
