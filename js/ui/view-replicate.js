// "Copy" mode: transport, live caption, legend, counters.
import { h, setText, rafThrottle } from './dom.js';
import { icon } from './icons.js';
import { segmented, range, stat, sectionLabel } from './components.js';

export const DEFAULT_LEGEND = [
  { id: 'parental', label: 'Parental (old)', color: '#9fb2dc', kind: 'strand' },
  { id: 'leading', label: 'New leading strand', color: '#2fd9b9', kind: 'strand' },
  { id: 'lagging', label: 'New lagging strand', color: '#ffa34d', kind: 'strand' },
  { id: 'primer', label: 'RNA primer', color: '#ff4fa3', kind: 'strand' },
  { id: 'helicase', label: 'Helicase', color: '#8b6cff', kind: 'blob' },
  { id: 'polymerase', label: 'DNA polymerase', color: '#4fb6ff', kind: 'blob' },
  { id: 'primase', label: 'Primase', color: '#f472b6', kind: 'blob' },
  { id: 'ligase', label: 'DNA ligase', color: '#ffd84a', kind: 'blob' },
];

export function createReplicateView(ctx) {
  const { H } = ctx;
  let playing = false, scrubbing = false, progress = 0;

  const send = (action, value) => H.onReplication(value === undefined ? { action } : { action, value });
  const playBtn = h('button', { type: 'button', class: 'btn-play', 'aria-label': 'Play', onclick: () => { setPlaying(!playing); send(playing ? 'play' : 'pause'); } }, icon('play', 22));
  const restartBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Restart', onclick: () => { setPlaying(true); send('restart'); } }, icon('restart', 20));
  const seek = rafThrottle(v => send('seek', v));
  const scrub = range({
    min: 0, max: 1000, step: 1, value: 0, label: 'Replication progress', className: 'range-scrub',
    onInput: v => { progress = v / 1000; paintPct(); seek(progress); },
  });
  scrub.el.addEventListener('pointerdown', () => { scrubbing = true; });
  const endScrub = () => { scrubbing = false; };
  scrub.el.addEventListener('pointerup', endScrub); scrub.el.addEventListener('pointercancel', endScrub); scrub.el.addEventListener('blur', endScrub);
  const pct = h('span', { class: 'pct' }, '0 %');
  const caption = h('p', { class: 'caption', 'aria-live': 'polite', 'aria-atomic': 'true' }, 'Press play to watch the replication fork open and both strands being copied.');
  const phase = h('span', { class: 'phase', 'data-level': 'closed' }, 'Ready');

  function paintPct() { setText(pct, `${Math.round(progress * 100)} %`); }
  function setPlaying(p) {
    playing = !!p;
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play', 22));
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    playBtn.classList.toggle('is-playing', playing);
  }

  const speed = segmented({
    label: 'Playback speed', value: 1, className: 'seg-sm',
    options: [{ value: 0.5, label: '0.5×' }, { value: 1, label: '1×' }, { value: 2, label: '2×' }],
    onChange: v => send('speed', v),
  });

  const C = {
    unwound: stat({ label: 'Base pairs unwound', unit: 'bp', big: true }),
    frag: stat({ label: 'Okazaki fragments', unit: 'made', big: true }),
    lead: stat({ label: 'Leading strand', unit: 'nt added', big: true }),
    lag: stat({ label: 'Lagging strand', unit: 'nt added', big: true }),
  };
  Object.values(C).forEach(c => c.set('0'));

  const legendList = h('ul', { class: 'legend' });
  function setLegend(items) {
    legendList.replaceChildren(...items.map(it => h('li', {}, h('span', { class: `swatch swatch-${it.kind || 'strand'}`, style: { '--sw': it.color } }), it.label)));
  }
  setLegend(DEFAULT_LEGEND);

  const el = h('section', { class: 'view', id: 'view-replicate', 'aria-labelledby': 'tab-replicate', role: 'tabpanel', hidden: true },
    h('header', { class: 'view-head' }, h('h2', {}, 'Copy the double helix'), h('p', {}, 'Semi-conservative replication at a fork.')),
    h('div', { class: 'peek' },
      h('div', { class: 'transport' }, playBtn, restartBtn, h('div', { class: 'scrub' }, scrub.el), pct),
      caption),
    h('div', { class: 'group row-between' }, h('div', { class: 'grow' }, sectionLabel('Speed'), speed.el), phase),
    h('div', { class: 'stats stats-2' }, Object.values(C).map(c => c.el)),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, h('h3', {}, 'Legend')), legendList),
    h('div', { class: 'explain' }, h('h3', { class: 'label' }, 'What you are seeing'),
      h('p', {}, 'Helicase unzips the parent duplex. Polymerase can only extend a 3′ end, so the leading strand is copied continuously while the lagging strand is built backwards from RNA primers as short Okazaki fragments that ligase later joins. Each new duplex keeps one old and one new strand.'),
      h('p', { class: 'note' }, 'Not to scale in time or length: real primers are about 10 nucleotides of RNA, and Okazaki fragments are 100–200 nucleotides long in eukaryotes (1000–2000 in bacteria). Here they are shortened to a few nucleotides.')));

  return {
    el,
    setState(s) {
      if (!s) return;
      if ('playing' in s && !!s.playing !== playing) setPlaying(s.playing);
      if ('progress' in s) {
        progress = s.progress;
        if (!scrubbing) scrub.set(Math.round(s.progress * 1000));
        paintPct();
      }
      if ('speed' in s) speed.set(s.speed);
      if ('caption' in s && caption.textContent !== s.caption) caption.textContent = s.caption;
      if ('phase' in s) setText(phase, s.phase);
      if ('unwound' in s) C.unwound.set(String(s.unwound));
      if ('leadingCount' in s) C.lead.set(String(s.leadingCount));
      if ('laggingCount' in s) C.lag.set(String(s.laggingCount));
      if ('fragments' in s) {
        // number, or the sim's array of {start, end, primed, complete, ligated}
        const f = s.fragments;
        if (Array.isArray(f)) {
          const made = f.filter(x => x.complete).length;
          const joined = f.filter((x, i) => i > 0 && x.ligated).length;      // nicks sealed by ligase
          C.frag.set(`${made}/${f.length}`);
          C.frag.setUnit(joined ? `made · ${joined} joined` : 'made');
        } else C.frag.set(String(f ?? '—'));
      }
    },
    setLegend, togglePlay() { setPlaying(!playing); send(playing ? 'play' : 'pause'); },
    isPlaying: () => playing,
  };
}
