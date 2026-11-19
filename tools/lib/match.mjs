// Deterministic residue and multi-chain atom matching by label_seq_id and atom name.

function toResidues(chainOrResidues, label) {
  if (Array.isArray(chainOrResidues)) return chainOrResidues;
  if (chainOrResidues && Array.isArray(chainOrResidues.residues)) return chainOrResidues.residues;
  throw new Error(`${label}: expected a chain object with residues[] or an array of residues`);
}

function getChain(chains, id, label) {
  if (chains instanceof Map) {
    if (!chains.has(id)) throw new Error(`${label}: chain "${id}" not found`);
    return chains.get(id);
  }
  if (chains && typeof chains === 'object' && Object.prototype.hasOwnProperty.call(chains, id)) {
    return chains[id];
  }
  throw new Error(`${label}: chain "${id}" not found`);
}

/**
 * Match residues present in both chains with the same sequence key (`seq` / label_seq_id by default,
 * or `authSeq` / auth_seq_id per DEC-011) where both carry `atoms[atomName]`.
 * When `opts.matchComp` is true, mismatched residue names (`comp`) are excluded and counted in `mismatches`.
 * Accepts chain objects from `polymerChains(parsed)` or arrays of residue objects.
 * Returns { mobilePts, targetPts, pairs: [{ seq, mobileComp, targetComp, mobileAtom, targetAtom }], n, mismatches }.
 */
export function matchResidueAtoms(mobileChain, targetChain, atomName = 'CA', opts = {}) {
  const { key = 'seq', matchComp = false } = opts || {};
  const mobileRes = toResidues(mobileChain, 'matchResidueAtoms(mobileChain)');
  const targetRes = toResidues(targetChain, 'matchResidueAtoms(targetChain)');

  const mobileBySeq = new Map();
  for (const r of mobileRes) {
    if (r && r[key] != null && r.atoms && r.atoms[atomName] && !mobileBySeq.has(r[key])) {
      mobileBySeq.set(r[key], r);
    }
  }
  const targetBySeq = new Map();
  for (const r of targetRes) {
    if (r && r[key] != null && r.atoms && r.atoms[atomName] && !targetBySeq.has(r[key])) {
      targetBySeq.set(r[key], r);
    }
  }

  const seqs = [...mobileBySeq.keys()].filter(s => targetBySeq.has(s)).sort((a, b) => a - b);
  const mobilePts = [];
  const targetPts = [];
  const pairs = [];
  let mismatches = 0;
  for (const seq of seqs) {
    const m = mobileBySeq.get(seq);
    const t = targetBySeq.get(seq);
    if (matchComp && m.comp !== t.comp) {
      mismatches++;
      continue;
    }
    const mobileAtom = m.atoms[atomName];
    const targetAtom = t.atoms[atomName];
    mobilePts.push(mobileAtom);
    targetPts.push(targetAtom);
    pairs.push({
      seq,
      mobileComp: m.comp,
      targetComp: t.comp,
      mobileAtom,
      targetAtom,
    });
  }

  return { mobilePts, targetPts, pairs, n: pairs.length, mismatches };
}

/**
 * Match atoms across multiple [mobileChainId, targetChainId] chain pairs in deterministic order.
 * mobileChains and targetChains are Maps returned by `polymerChains(parsed)`.
 * Optional `opts` (`{ key = 'seq', matchComp = false }`) is forwarded to `matchResidueAtoms`.
 * Returns { mobilePts, targetPts, pairs, byChain, n, mismatches }.
 */
export function matchChains(mobileChains, targetChains, chainPairs, atomName = 'P', opts = {}) {
  if (!Array.isArray(chainPairs)) {
    throw new Error('matchChains: chainPairs must be an array of [mobileChainId, targetChainId] tuples');
  }

  const mobilePts = [];
  const targetPts = [];
  const pairs = [];
  const byChain = [];
  let mismatches = 0;

  for (const tuple of chainPairs) {
    if (!Array.isArray(tuple) || tuple.length !== 2) {
      throw new Error(`matchChains: invalid chain pair ${JSON.stringify(tuple)}`);
    }
    const [mobileChainId, targetChainId] = tuple;
    const mChain = getChain(mobileChains, mobileChainId, 'matchChains(mobile)');
    const tChain = getChain(targetChains, targetChainId, 'matchChains(target)');
    const res = matchResidueAtoms(mChain, tChain, atomName, opts);
    mismatches += res.mismatches;

    for (let i = 0; i < res.n; i++) {
      mobilePts.push(res.mobilePts[i]);
      targetPts.push(res.targetPts[i]);
      pairs.push({
        mobileChain: mobileChainId,
        targetChain: targetChainId,
        ...res.pairs[i],
      });
    }
    byChain.push({
      mobileChain: mobileChainId,
      targetChain: targetChainId,
      n: res.n,
      mismatches: res.mismatches,
      pairs: res.pairs,
    });
  }

  return { mobilePts, targetPts, pairs, byChain, n: pairs.length, mismatches };
}
