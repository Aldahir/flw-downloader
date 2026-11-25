import { h, icon } from '../lib/dom.js';
import { store } from '../lib/store.js';
import { openAuth } from '../components/auth-dialog.js';
import { ProfileTab } from '../components/account-profile.js';
import { HistoryTab } from '../components/account-history.js';
import { QrTab } from '../components/account-qr.js';
import { SettingsTab } from '../components/account-settings.js';
import { SubscriptionTab } from '../components/account-subscription.js';
import { SecurityTab } from '../components/account-security.js';

const TABS = [['perfil', 'user', 'Perfil', ProfileTab], ['historico', 'history', 'Histórico', HistoryTab], ['qr', 'qr-code', 'Códigos QR e leituras', QrTab], ['definicoes', 'wrench', 'Definições', SettingsTab], ['subscricao', 'zap', 'Subscrição', SubscriptionTab], ['seguranca', 'lock-keyhole', 'Segurança', SecurityTab]];

export function ContaPage(ctx) {
  if (!store.user) return h('div', { class: 'wrap', style: 'padding:48px 0' }, h('div', { class: 'card empty' }, h('h1', { style: 'font-size:1.8rem' }, 'O teu perfil'), h('p', {}, 'Entra para ver o histórico, as leituras dos teus códigos QR e as definições.'), h('button', { class: 'btn', onclick: () => openAuth() }, icon('user'), 'Entrar ou criar conta')));
  const cur = TABS.find((t) => t[0] === ctx.route.sub) || TABS[0];
  return h('div', { class: 'wrap', style: 'padding-bottom:56px' },
    h('div', { class: 'page-head' }, h('h1', { style: 'font-size:clamp(1.8rem,4vw,2.6rem)' }, 'O meu perfil'), h('p', {}, 'Conta, histórico, leituras dos códigos QR, definições, subscrição e segurança.')),
    h('div', { class: 'tool-layout' },
      h('nav', { class: 'side', 'aria-label': 'Conta' }, TABS.map(([id, ic, label]) => h('a', { href: `#/conta/${id}`, 'aria-current': id === cur[0] ? 'page' : null }, icon(ic), label))),
      h('div', { style: 'min-width:0' }, cur[3](ctx))));
}
