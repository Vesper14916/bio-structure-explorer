// Minimal mmCIF (PDBx) reader for the offline asset pipeline. No dependencies.
// Supports single-row and loop_ categories, quoted values ('...' and "..." that close only before
// whitespace), and multi-line text fields delimited by lines that start with ';'.

/** Split mmCIF text into a flat list of tokens (strings). Text fields and quoted values lose their delimiters. */
export function tokenize(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (line.startsWith(';')) {                       // multi-line text field
      const buf = [line.slice(1)];
      li++;
      while (li < lines.length && !lines[li].startsWith(';')) buf.push(lines[li++]);
      out.push({ v: buf.join('\n').trim(), q: true });
      continue;
    }
    let i = 0;
    const n = line.length;
    while (i < n) {
      const c = line[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === '#') break;                            // comment to end of line
      if (c === "'" || c === '"') {
        let j = i + 1;
        while (j < n && !(line[j] === c && (j + 1 === n || line[j + 1] === ' ' || line[j + 1] === '\t'))) j++;
        out.push({ v: line.slice(i + 1, j), q: true });
        i = j + 1;
        continue;
      }
      let j = i;
      while (j < n && line[j] !== ' ' && line[j] !== '\t') j++;
      out.push({ v: line.slice(i, j), q: false });
      i = j;
    }
  }
  return out;
}

/** Parse tokens into categories: Map(category -> { cols: [field], rows: [[value]] }). Values '.' and '?' become null. */
export function parseCategories(text) {
  const toks = tokenize(text), cats = new Map();
  const val = t => (!t.q && (t.v === '.' || t.v === '?') ? null : t.v);
  const split = tag => { const k = tag.indexOf('.'); return [tag.slice(1, k), tag.slice(k + 1)]; };
  const isTag = t => !t.q && t.v[0] === '_';
  const isKey = t => !t.q && (t.v === 'loop_' || t.v.startsWith('data_') || t.v.startsWith('save_'));
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (!t.q && t.v === 'loop_') {
      i++;
      const cols = []; let cat = null;
      while (i < toks.length && isTag(toks[i])) { const [c, f] = split(toks[i].v); cat = c; cols.push(f); i++; }
      const vals = [];
      while (i < toks.length && !isTag(toks[i]) && !isKey(toks[i])) vals.push(val(toks[i++]));
      const rows = [];
      for (let k = 0; k + cols.length <= vals.length; k += cols.length) rows.push(vals.slice(k, k + cols.length));
      cats.set(cat, { cols, rows });
    } else if (isTag(t)) {
      const [c, f] = split(t.v);
      const v = i + 1 < toks.length ? val(toks[i + 1]) : null;
      if (!cats.has(c)) cats.set(c, { cols: [], rows: [[]] });
      const cat = cats.get(c); cat.cols.push(f); cat.rows[0].push(v);
      i += 2;
    } else i++;
  }
  return cats;
}

/** Rows of a category as objects keyed by field name (empty array when absent). */
export function categoryRows(cats, name) {
  const c = cats.get(name);
  if (!c) return [];
  return c.rows.map(r => Object.fromEntries(c.cols.map((k, i) => [k, r[i]])));
}

const POLY_CLASS = { 'polypeptide(L)': 'protein', polyribonucleotide: 'rna', polydeoxyribonucleotide: 'dna' };

/**
 * Parse an mmCIF entry.
 * Returns { title, method, resolutionA, revisionDate, entities, entityPolySeq, atoms }.
 * entities: [{ id, type, description, polyType, class, organism, strands }] (class null for non-polymers).
 * atoms: heavy atoms of model 1, altloc '.' or 'A', with fields
 *   { group, element, name, comp, labelAsym, authAsym, entity, labelSeq, authSeq, x, y, z }.
 * Throws when a polymer has a type other than protein, RNA, or DNA (for example a DNA/RNA hybrid).
 */
export function parseMmcif(text) {
  const cats = parseCategories(text);
  const one = (cat, field) => { const r = categoryRows(cats, cat)[0]; return r ? r[field] ?? null : null; };
  const organisms = new Map();
  for (const r of categoryRows(cats, 'entity_src_gen')) if (r.pdbx_gene_src_scientific_name) organisms.set(r.entity_id, r.pdbx_gene_src_scientific_name);
  for (const r of categoryRows(cats, 'entity_src_nat')) if (r.pdbx_organism_scientific) organisms.set(r.entity_id, r.pdbx_organism_scientific);
  for (const r of categoryRows(cats, 'pdbx_entity_src_syn')) if (r.organism_scientific) organisms.set(r.entity_id, r.organism_scientific);
  const polys = new Map(categoryRows(cats, 'entity_poly').map(r => [r.entity_id, r]));
  const entities = categoryRows(cats, 'entity').map(r => {
    const p = polys.get(r.id);
    const polyType = p ? p.type : null;
    let cls = null;
    if (p) {
      cls = POLY_CLASS[polyType];
      if (!cls) throw new Error(`entity ${r.id}: unsupported polymer type "${polyType}"`);
    }
    return {
      id: r.id, type: r.type, description: (r.pdbx_description || '').replace(/\s+/g, ' ').trim(),
      polyType, class: cls, organism: organisms.get(r.id) || null,
      strands: p && p.pdbx_strand_id ? p.pdbx_strand_id.split(',') : [],
    };
  });
  const res = Number(one('em_3d_reconstruction', 'resolution') ?? one('refine', 'ls_d_res_high'));
  const revs = categoryRows(cats, 'pdbx_audit_revision_history').map(r => r.revision_date).filter(Boolean).sort();

  const as = cats.get('atom_site');
  if (!as) throw new Error('no _atom_site loop');
  const col = name => as.cols.indexOf(name);
  const C = {
    group: col('group_PDB'), el: col('type_symbol'), name: col('label_atom_id'), alt: col('label_alt_id'),
    comp: col('label_comp_id'), labelAsym: col('label_asym_id'), authAsym: col('auth_asym_id'),
    entity: col('label_entity_id'), labelSeq: col('label_seq_id'), authSeq: col('auth_seq_id'),
    x: col('Cartn_x'), y: col('Cartn_y'), z: col('Cartn_z'), model: col('pdbx_PDB_model_num'),
  };
  for (const [k, v] of Object.entries(C)) if (v < 0 && k !== 'model' && k !== 'alt') throw new Error(`_atom_site column for ${k} missing`);
  let firstModel = null;
  const atoms = [];
  for (const r of as.rows) {
    const model = C.model >= 0 ? r[C.model] : '1';
    if (firstModel === null) firstModel = model;
    if (model !== firstModel) continue;
    const alt = C.alt >= 0 ? r[C.alt] : null;
    if (alt !== null && alt !== 'A') continue;
    const el = (r[C.el] || '').toUpperCase();
    if (el === 'H' || el === 'D') continue;
    atoms.push({
      group: r[C.group], element: el, name: r[C.name], comp: r[C.comp], labelAsym: r[C.labelAsym], authAsym: r[C.authAsym],
      entity: r[C.entity], labelSeq: r[C.labelSeq] === null ? null : Number(r[C.labelSeq]), authSeq: r[C.authSeq] === null ? null : Number(r[C.authSeq]),
      x: Number(r[C.x]), y: Number(r[C.y]), z: Number(r[C.z]),
    });
  }
  const entityPolySeq = Object.fromEntries([...polys.values()].map(r => [r.entity_id, (r.pdbx_seq_one_letter_code_can || '').replace(/\s+/g, '')]));
  return {
    title: one('struct', 'title'), method: one('exptl', 'method'), resolutionA: Number.isFinite(res) && res > 0 ? res : null,
    revisionDate: revs.length ? revs[revs.length - 1] : null, entities, entityPolySeq, atoms,
  };
}

/**
 * Group polymer atoms into chains of residues. Chain id = auth_asym_id; residues ordered by label_seq_id.
 * Returns Map(chainId -> { id, labelAsym, entity, residues: [{ seq, authSeq, comp, atoms: { name: [x,y,z] }, el: { name: element } }] }).
 */
export function polymerChains(parsed) {
  const polyEntities = new Set(parsed.entities.filter(e => e.class).map(e => e.id));
  const chains = new Map();
  for (const a of parsed.atoms) {
    if (!polyEntities.has(a.entity) || a.labelSeq === null) continue;
    if (!chains.has(a.authAsym)) chains.set(a.authAsym, { id: a.authAsym, labelAsym: a.labelAsym, entity: a.entity, byseq: new Map() });
    const c = chains.get(a.authAsym);
    if (!c.byseq.has(a.labelSeq)) c.byseq.set(a.labelSeq, { seq: a.labelSeq, authSeq: a.authSeq, comp: a.comp, atoms: {}, el: {} });
    const r = c.byseq.get(a.labelSeq);
    r.atoms[a.name] = [a.x, a.y, a.z]; r.el[a.name] = a.element;
  }
  for (const c of chains.values()) { c.residues = [...c.byseq.values()].sort((p, q) => p.seq - q.seq); delete c.byseq; }
  return chains;
}
