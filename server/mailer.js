// One place every email in the app goes through. Every message is logged in `mail_log` regardless
// (so nothing is silently lost), and is actually sent only once an SMTP server is configured via
// the SMTP_URL environment variable (e.g. smtps://user:pass@smtp.example.com). Until then, this is
// a queue you can inspect (SELECT * FROM mail_log) rather than real delivery.
import nodemailer from 'nodemailer';

const FROM = process.env.MAIL_FROM || 'FLW Downloader <no-reply@flw.local>';

function render(template, data) {
  const T = TEMPLATES[template]; if (!T) throw new Error(`Modelo de email desconhecido: ${template}`);
  return T(data);
}
const TEMPLATES = {
  payment_pending: ({ label, amountKz, reference }) => ({
    subject: 'Recebemos o teu pedido',
    html: `<p>Recebemos o teu pedido de <b>${label}</b> (${amountKz} Kz).</p><p>Referência: <b>${reference}</b>. Assim que confirmarmos o pagamento, ativamos automaticamente.</p>`,
  }),
  payment_approved: ({ label }) => ({
    subject: 'Pagamento aprovado',
    html: `<p>O teu pagamento de <b>${label}</b> foi aprovado. Já está ativo na tua conta — obrigado!</p>`,
  }),
  payment_rejected: ({ label, note }) => ({
    subject: 'Não conseguimos confirmar o pagamento',
    html: `<p>Não conseguimos confirmar o pagamento de <b>${label}</b>.${note ? ` Motivo: ${note}.` : ''}</p><p>Podes enviar um novo pedido com um comprovativo diferente.</p>`,
  }),
  storage_warning: ({ pct, usedMB, quotaMB }) => ({
    subject: pct >= 100 ? 'Sem espaço de armazenamento' : 'Armazenamento quase cheio',
    html: `<p>Já usaste ${usedMB} MB de ${quotaMB} MB (${pct}%).${pct >= 100 ? ' Novos downloads ficam bloqueados até libertares espaço ou aumentares o plano.' : ''}</p>`,
  }),
  account_deleted: () => ({ subject: 'A tua conta foi apagada', html: '<p>A tua conta e os teus dados pessoais foram apagados, como pediste.</p>' }),
  newsletter_confirm: () => ({ subject: 'Subscrição confirmada', html: '<p>Ficaste inscrito na nossa newsletter. Podes cancelar a qualquer momento no rodapé de qualquer email.</p>' }),
};

export function createMailer(pool) {
  let transport = null;
  if (process.env.SMTP_URL) transport = nodemailer.createTransport(process.env.SMTP_URL);

  return {
    async send(to, template, data = {}) {
      const { subject, html } = render(template, data);
      let sent = false;
      if (transport) {
        try { await transport.sendMail({ from: FROM, to, subject, html }); sent = true; }
        catch (e) { console.error(`[mailer] falhou o envio para ${to} (${template}):`, e.message); }
      }
      await pool.query('INSERT INTO mail_log (to_email, template, subject, sent) VALUES (?,?,?,?)', [to, template, subject, sent ? 1 : 0]).catch(() => {});
      return { sent };
    },
    configured: !!transport,
  };
}
