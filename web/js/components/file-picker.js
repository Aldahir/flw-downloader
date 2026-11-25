import { h } from '../lib/dom.js';
import { store, jobList } from '../lib/store.js';
import { mediaOf, isActive } from '../lib/format.js';

// Pick which downloaded / opened file a tool works on. Remembers the choice in store.selection.
export function FilePicker({ onChange }) {
  const jobs = jobList().filter((j) => !isActive(j) && mediaOf(j).length);
  if (!jobs.length) return { el: h('p', { class: 'msg warn' }, 'Ainda não há ficheiros. Descarrega primeiro um vídeo.', ' ', h('a', { href: '#/' }, 'Ir descarregar')), value: () => null };
  let { jobId, file } = store.selection;
  if (!jobs.find((j) => j.id === jobId)) { jobId = jobs[0].id; file = ''; }
  const files = () => mediaOf(store.jobs.get(jobId));
  if (!files().find((f) => f.name === file)) file = files()[0].name;
  store.selection = { jobId, file };
  const jobSel = h('select', { class: 'input', 'aria-label': 'Trabalho' }, jobs.map((j) => h('option', { value: j.id, selected: j.id === jobId }, j.title || j.id)));
  const fileSel = h('select', { class: 'input', 'aria-label': 'Ficheiro' });
  const fill = () => { fileSel.replaceChildren(...files().map((f) => h('option', { value: f.name, selected: f.name === file }, f.name))); fileSel.hidden = files().length < 2; };
  jobSel.onchange = () => { jobId = jobSel.value; file = files()[0].name; fill(); store.selection = { jobId, file }; onChange(); };
  fileSel.onchange = () => { file = fileSel.value; store.selection = { jobId, file }; onChange(); };
  fill();
  return { el: h('div', { class: 'row', style: 'align-items:stretch' }, h('div', { style: 'flex:1 1 260px' }, jobSel), h('div', { style: 'flex:1 1 220px' }, fileSel)), value: () => ({ id: jobId, file }) };
}
