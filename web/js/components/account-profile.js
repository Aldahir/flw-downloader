import { h, fill, icon } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { store, emit } from '../lib/store.js';
import { toast } from '../lib/toast.js';
import { Avatar, bumpAvatar } from './avatar.js';
import { cropImage } from './image-cropper.js';

const MAX_RAW = 6 * 1024 * 1024;
const GENDERS = [['', 'Prefiro não dizer'], ['feminino', 'Feminino'], ['masculino', 'Masculino'], ['outro', 'Outro']];

export function ProfileTab() {
  const root = h('div', { class: 'panel' });
  function draw() {
    const u = store.user; const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true });
    const note = h('p', { class: 'mut small', role: 'status' }, 'JPG, PNG, WebP ou GIF. Podes ajustar o enquadramento antes de enviar; a foto fica reduzida e comprimida para menos de 120 KB, em formato WebP.');
    const name = h('input', { class: 'input', value: u.name, maxlength: 60, id: 'pf-name', autocomplete: 'name' });
    const msg = h('p', { class: 'msg', role: 'status', hidden: true });
    file.onchange = async () => {
      const f = file.files[0]; file.value = ''; if (!f) return;
      if (f.size > MAX_RAW) { note.textContent = 'A imagem tem mais de 6 MB. Escolhe uma mais pequena.'; note.className = 'msg bad'; return; }
      const cropped = await cropImage(f); if (!cropped) return;
      note.className = 'mut small'; note.textContent = 'A comprimir e enviar…';
      try { const r = await api('/api/me/avatar', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: cropped }); store.user = r.user; bumpAvatar(); emit('user'); toast(`Foto atualizada (${Math.round(r.bytes / 1024)} KB).`); draw(); }
      catch (e) { note.textContent = e.message; note.className = 'msg bad'; }
    };

    const gender = h('select', { class: 'input' }, GENDERS.map(([val, l]) => h('option', { value: val, selected: (u.gender || '') === val }, l)));
    const birthYear = h('input', { class: 'input', type: 'number', placeholder: 'ex.: 1990', min: 1900, max: new Date().getFullYear(), value: u.birthYear || '' });
    const location = h('input', { class: 'input', placeholder: 'Cidade, país', maxlength: 120, value: u.location || '', autocomplete: 'address-level2' });
    const phone = h('input', { class: 'input', type: 'tel', placeholder: '+351 912 345 678', maxlength: 30, value: u.phone || '', autocomplete: 'tel' });

    fill(root, h('h2', {}, 'Perfil'),
      h('div', { class: 'card' }, h('div', { class: 'profile-top' }, Avatar(u, 96, 'avatar big'),
        h('div', { class: 'grow' }, h('h3', {}, u.name), h('p', { class: 'mut' }, u.email), h('div', { class: 'row', style: 'margin-top:10px' },
          h('button', { class: 'btn sm', onclick: () => file.click() }, icon('image'), u.avatarUrl ? 'Trocar foto' : 'Escolher foto'),
          u.avatarUrl ? h('button', { class: 'btn danger sm', onclick: async () => { try { store.user = (await api('/api/me/avatar', { method: 'DELETE' })).user; bumpAvatar(); emit('user'); draw(); } catch (e) { toast(e.message, 'bad'); } } }, icon('trash-2'), 'Remover') : null, file))),
        note),
      h('form', { class: 'card sheet', style: 'gap:14px', onsubmit: async (e) => {
        e.preventDefault(); msg.hidden = true;
        try {
          store.user = (await api('/api/me', { method: 'PATCH', body: { name: name.value } })).user;
          store.user = (await api('/api/me/profile', { method: 'PATCH', body: { gender: gender.value, birthYear: birthYear.value, location: location.value, phone: phone.value } })).user;
          emit('user'); msg.className = 'msg ok'; msg.textContent = 'Dados atualizados.'; msg.hidden = false;
        } catch (er) { msg.className = 'msg bad'; msg.textContent = er.message; msg.hidden = false; }
      } },
        h('h3', {}, 'Dados da conta'), h('label', { class: 'field' }, h('span', {}, 'Nome'), name), h('label', { class: 'field' }, h('span', {}, 'Email'), h('input', { class: 'input', value: u.email, disabled: true })),
        h('p', { class: 'mut small' }, `Conta criada em ${new Date(u.createdAt).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })}.`),
        h('h3', {}, 'Dados pessoais'), h('p', { class: 'mut small' }, 'Opcional. Ajuda-nos a perceber quem usa a app (só aparece de forma agregada nas estatísticas internas, nunca é partilhado).'),
        h('div', { class: 'row' }, h('label', { class: 'field', style: 'flex:1 1 160px' }, h('span', {}, 'Género'), gender), h('label', { class: 'field', style: 'flex:1 1 120px' }, h('span', {}, 'Ano de nascimento'), birthYear)),
        h('div', { class: 'row' }, h('label', { class: 'field', style: 'flex:1 1 200px' }, h('span', {}, 'Localização'), location), h('label', { class: 'field', style: 'flex:1 1 160px' }, h('span', {}, 'Telefone'), phone)),
        msg, h('button', { class: 'btn sm', type: 'submit', style: 'justify-self:start' }, 'Guardar')));
  }
  draw(); return root;
}
