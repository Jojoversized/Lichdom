#!/usr/bin/env python3
"""Summarise a LICH run-analytics export (Settings → Run analytics → Export JSON).

    python3 tools/analytics/report.py lich-analytics-2026-11-08.json [--last N] [--csv outdir]

Prints a Markdown report: runs, unit/tower efficiency (damage and kills per soul invested,
losses), crusade tiers, story events, level-up cards, buildings/towers and the economy curve.
With --csv it also writes one row per (run, wave) and per (run, wave, source) for spreadsheets.
"""
import csv
import json
import os
import sys
from collections import defaultdict


def load(path):
    with open(path, encoding='utf-8') as f:
        d = json.load(f)
    return d.get('runs', d if isinstance(d, list) else [])


def pct(a, b):
    return f"{100 * a / b:.1f}%" if b else '—'


def num(n):
    n = float(n)
    for unit, div in (('M', 1e6), ('k', 1e3)):
        if abs(n) >= div:
            return f"{n / div:.1f}{unit}"
    return f"{n:.0f}" if n == int(n) else f"{n:.1f}"


def table(head, rows):
    out = ['| ' + ' | '.join(head) + ' |', '|' + '|'.join('---' for _ in head) + '|']
    out += ['| ' + ' | '.join(str(c) for c in r) + ' |' for r in rows]
    return '\n'.join(out)


def src_name(key):
    kind, _, name = key.partition(':')
    return {'u': 'unit', 't': 'tower', 'x': 'other'}.get(kind, kind), name


def report(runs):
    out = []
    reached = lambda r: (r.get('end') or {}).get('wave', len(r['waves']) + 1) - 1 if r.get('end') else len(r['waves'])

    # ---------------- runs ----------------
    out.append(f"# LICH run analytics — {len(runs)} runs\n")
    rows = []
    for r in runs:
        e = r.get('end') or {}
        dur = sum(w.get('dur', 0) for w in r['waves'])
        rows.append([r['started'][:16].replace('T', ' '), r.get('version', '?'), r.get('fortress', ''), reached(r),
                     e.get('outcome', 'in progress'), e.get('level', '—'), e.get('essence', '—'),
                     f"{dur / 60:.0f} min", ', '.join(r.get('roster', [])), r.get('partialFrom') is not None and f"from w{r['partialFrom']}" or ''])
    out.append(table(['started', 'ver', 'fortress', 'waves', 'outcome', 'lvl', 'essence', 'battle time', 'start roster', 'note'], rows))
    w_all = [reached(r) for r in runs]
    if w_all:
        out.append(f"\nWaves repelled: mean {sum(w_all) / len(w_all):.1f}, best {max(w_all)}, worst {min(w_all)}.\n")

    # ---------------- sources ----------------
    dmg, kills, fallen, spent, waves_present, recruits = (defaultdict(float) for _ in range(6))
    total_dmg = 0
    for r in runs:
        for p in r.get('picks', []):
            if p['k'] == 'unearth':
                spent['u:' + p['id']] += p.get('cost', 0)
        for w in r['waves']:
            for key, d, n, *_ in w.get('src', []):
                dmg[key] += d; kills[key] += n; total_dmg += d
            for t, n in w.get('fallen', {}).items():
                fallen['u:' + t] += n
            for t, c in w.get('spent', {}).items():
                spent['u:' + t] += c
            for t, n in w.get('recruits', {}).items():
                recruits['u:' + t] += n
            for t in w.get('host', {}):
                waves_present['u:' + t] += 1
    out.append('## Damage sources\n')
    out.append('Damage per 1k souls counts recruits and crypt unearthings only (free squads, events and cards are not priced), '
               'so starting-roster types look better than they are; compare like with like.\n')
    rows = []
    for key in sorted(dmg, key=lambda k: -dmg[k]):
        kind, name = src_name(key)
        rows.append([name, kind, num(dmg[key]), pct(dmg[key], total_dmg), num(kills[key]), num(fallen.get(key, 0)) if kind == 'unit' else '',
                     f"{kills[key] / fallen[key]:.2f}" if fallen.get(key) else '',
                     int(recruits.get(key, 0)) if kind == 'unit' else '', num(spent.get(key, 0)) if spent.get(key) else '',
                     num(1000 * dmg[key] / spent[key]) if spent.get(key) else '',
                     int(waves_present.get(key, 0)) if kind == 'unit' else ''])
    out.append(table(['source', 'kind', 'damage', 'share', 'kills', 'fallen', 'kills/fallen', 'squads bought', 'souls spent', 'dmg / 1k souls', 'waves fielded'], rows))

    # ---------------- who kills what ----------------
    vs = defaultdict(lambda: defaultdict(int))
    for r in runs:
        for w in r['waves']:
            for row in w.get('src', []):
                if len(row) > 3 and row[3]:
                    for enemy, n in row[3].items():
                        vs[enemy][src_name(row[0])[1]] += n
    if vs:
        out.append('\n## Who kills what (top killers per enemy type)\n')
        rows = []
        for enemy in sorted(vs, key=lambda e: -sum(vs[e].values())):
            tot = sum(vs[enemy].values())
            top = sorted(vs[enemy].items(), key=lambda kv: -kv[1])[:4]
            rows.append([enemy, num(tot), ', '.join(f"{k} {pct(n, tot)}" for k, n in top)])
        out.append(table(['enemy', 'killed', 'by'], rows))

    # ---------------- crusade tiers ----------------
    tiers = defaultdict(lambda: [0, 0.0, 0.0, 0.0, 0.0])
    for r in runs:
        for w in r['waves']:
            t = tiers[w.get('tier', '?')]
            t[0] += 1; t[1] += w.get('dur', 0); t[2] += w.get('keepLost', 0); t[3] += w.get('souls', 0) + w.get('bonus', 0); t[4] += w.get('mats', 0)
    deaths = defaultdict(int)
    for r in runs:
        e = r.get('end') or {}
        lw = e.get('lastWave')
        if e.get('outcome') == 'defeat' and lw:
            deaths[{0: 'Skirmish', 1: 'Crusade', 2: 'Holy War'}.get(lw.get('tier'), '?')] += 1
    out.append('\n## Crusade tiers\n')
    out.append(table(['tier', 'waves', 'avg duration', 'avg keep dmg', 'avg souls', 'avg materials', 'defeats in it'],
                     [[k, v[0], f"{v[1] / v[0]:.0f} s", num(v[2] / v[0]), num(v[3] / v[0]), f"{v[4] / v[0]:.1f}", deaths.get(k, 0)] for k, v in sorted(tiers.items(), key=lambda kv: -kv[1][0])]))

    # ---------------- decisions ----------------
    def decision_table(kind, label, keyf=lambda p: p['id']):
        cnt, runs_with = defaultdict(int), defaultdict(list)
        for r in runs:
            seen = set()
            for p in r.get('picks', []):
                if p['k'] == kind:
                    k = keyf(p); cnt[k] += 1
                    if k not in seen:
                        seen.add(k); runs_with[k].append(reached(r))
        if not cnt:
            return
        mean = sum(w_all) / len(w_all) if w_all else 0
        out.append(f"\n## {label}\n")
        out.append(f"'avg waves' is the mean result of runs that took it (all runs: {mean:.1f}) — correlation, not cause.\n")
        out.append(table([label.lower().rstrip('s'), 'taken', 'runs', 'avg waves'],
                         [[k, cnt[k], len(runs_with[k]), f"{sum(runs_with[k]) / len(runs_with[k]):.1f}"] for k in sorted(cnt, key=lambda k: -cnt[k])]))

    decision_table('event', 'Story events', lambda p: f"{p['id']} → {p.get('choice', '?') + 1}")
    decision_table('card', 'Level-up cards')
    decision_table('well', 'Soul Well purchases')
    decision_table('unearth', 'Crypts unearthed')
    decision_table('building', 'Buildings raised')
    decision_table('tower', 'Towers built')
    decision_table('wall', 'Ramparts raised', lambda p: f"{p['id']} t{p.get('tier', '?')}")

    # ---------------- economy ----------------
    out.append('\n## Economy & host by wave (mean over runs that reached it)\n')
    by = defaultdict(list)
    for r in runs:
        for w in r['waves']:
            by[w['n']].append(w)
    rows = []
    for n in sorted(by):
        if n % 5 and n != 1:
            continue
        ws = by[n]
        m = lambda f: sum(f(w) for w in ws) / len(ws)
        rows.append([n, len(ws), num(m(lambda w: w['bank']['souls'])), f"{m(lambda w: w['bank']['materials']):.0f}",
                     num(m(lambda w: sum(w.get('host', {}).values()))), num(m(lambda w: sum(w.get('summons', {}).values()))),
                     f"{m(lambda w: w.get('level', 0)):.1f}", f"{m(lambda w: w.get('fervor', 1)):.2f}", f"{m(lambda w: w.get('dur', 0)):.0f} s",
                     pct(m(lambda w: w.get('keepHp', 0)), m(lambda w: w.get('keepMax', 1)))])
    out.append(table(['wave', 'runs', 'souls banked', 'materials', 'undead', 'summons', 'level', 'fervor', 'duration', 'keep hp'], rows))
    return '\n'.join(out) + '\n'


def write_csv(runs, outdir):
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, 'waves.csv'), 'w', newline='') as f:
        c = csv.writer(f)
        c.writerow(['run', 'wave', 'tier', 'theme', 'boss', 'dur', 'souls', 'bonus', 'mats', 'kills', 'keepLost', 'keepHp', 'keepMax',
                    'bankSouls', 'bankMats', 'level', 'fervor', 'undead', 'summons', 'towers', 'buildings'])
        for r in runs:
            for w in r['waves']:
                c.writerow([r['id'], w['n'], w.get('tier'), w.get('theme'), w.get('boss') or '', w.get('dur'), w.get('souls'), w.get('bonus'),
                            w.get('mats'), w.get('kills'), w.get('keepLost'), w.get('keepHp'), w.get('keepMax'), w['bank']['souls'],
                            w['bank']['materials'], w.get('level'), w.get('fervor'), sum(w.get('host', {}).values()),
                            sum(w.get('summons', {}).values()), len(w.get('towers', [])), sum(w.get('buildings', {}).values())])
    with open(os.path.join(outdir, 'sources.csv'), 'w', newline='') as f:
        c = csv.writer(f)
        c.writerow(['run', 'wave', 'tier', 'source', 'kind', 'damage', 'kills', 'fallen', 'fielded', 'recruited', 'souls_spent'])
        for r in runs:
            for w in r['waves']:
                for key, d, n, *_ in w.get('src', []):
                    kind, name = src_name(key)
                    c.writerow([r['id'], w['n'], w.get('tier'), name, kind, d, n, w.get('fallen', {}).get(name, '') if kind == 'unit' else '',
                                w.get('host', {}).get(name, '') if kind == 'unit' else '', w.get('recruits', {}).get(name, ''), w.get('spent', {}).get(name, '')])


def main(argv):
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__); return 0
    runs = load(argv[0])
    if '--last' in argv:
        runs = runs[-int(argv[argv.index('--last') + 1]):]
    runs = [r for r in runs if r.get('waves')]
    if not runs:
        print('No runs with a completed wave in this export.'); return 1
    sys.stdout.write(report(runs))
    if '--csv' in argv:
        d = argv[argv.index('--csv') + 1]
        write_csv(runs, d)
        print(f"\nCSV written to {d}/waves.csv and {d}/sources.csv")
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
