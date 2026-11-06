// DOM user interface: HUD, build drawer, spells, info panel, modals
// (level-up, Soul Well, pause) and full screens (menu, Phylactery, codex...).
import * as Phaser from 'phaser';
import { G } from '../core/state';
import { hooks } from '../core/events';
import { clamp, fmt, makeCanvas } from '../core/util';
import { PAL, KEEP } from '../config/constants';
import { SHEETS } from '../config/manifest';
import { TOWERS, TOWER_ORDER, FORTS, FORT_ORDER } from '../data/towers';
import { UNITS, UNIT_ORDER, SUMMONS } from '../data/units';
import { SPELLS, SPELL_ORDER, WELL } from '../data/spells';
import { ENEMIES, BOSSES } from '../data/enemies';
import { META, META_BRANCHES, META_BY_ID, metaCost, ACHIEVEMENTS, CONTENT_GATES } from '../data/meta';
import { FORTRESSES } from '../data/world';
import { RARITY, rollCards, applyCard } from '../systems/cards';
import { metaLv, contentAvailable, towerStats, recruitCost, towerCost, fortCost, unitCap, capUsed, applyUnitStats, towerMaxHp } from '../systems/stats';
import { spawnUnit, removeStructure, addRing, explosion } from '../systems/combat';
import { startWave, previewWave, castSpell, canCast, spellCd, buyWell, wellCost, wellAvailable, newCampaign, loadRun } from '../systems/campaign';
import { essenceBreakdown, buyMeta, endCampaign, checkAchievements, codexSee } from '../systems/progression';
import { saveRun, saveRunSoon, saveMeta, saveMetaSoon, hasRunSave, clearRunSave, loadMeta, store, SAVE_META, SAVE_RUN } from '../systems/save';
import { startMusic, applyMusicVolume } from '../audio/audio';

const $ = (s: string, el: ParentNode = document) => el.querySelector(s) as HTMLElement;
const h = (tag: string, cls?: string, html?: string) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const icon = (name: string, scale = 1, cls = 'pix ico') => `<img class="${cls}" src="ui/icons/${name}.png" width="${16 * scale}" height="${16 * scale}">`;
const SOUL = () => icon('soul');
const ESS = () => icon('essence');
const sfx = (n: string, v = 1) => hooks.sfx(n, v);
const msgFn = (t: string, c?: string) => hooks.msg(t, c);

let game: Phaser.Game;
const iconCache = new Map<string, { url: string; w: number; h: number }>();
/** Crops one frame of a sprite sheet to its opaque bounds and returns an <img> tag. */
function spriteIcon(key: string, frame = 0, box = 32) {
  const id = key + ':' + frame;
  let c = iconCache.get(id);
  if (!c) {
    const meta = SHEETS[key];
    const img = game.textures.get(key).getSourceImage() as HTMLImageElement;
    const [cv, ctx] = makeCanvas(meta.fw, meta.fh);
    ctx.drawImage(img, frame * meta.fw, 0, meta.fw, meta.fh, 0, 0, meta.fw, meta.fh);
    const d = ctx.getImageData(0, 0, meta.fw, meta.fh).data;
    let x0 = meta.fw, y0 = meta.fh, x1 = 0, y1 = 0;
    for (let y = 0; y < meta.fh; y++) for (let x = 0; x < meta.fw; x++) if (d[(y * meta.fw + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const w = Math.max(1, x1 - x0 + 1), hh = Math.max(1, y1 - y0 + 1);
    const [o, octx] = makeCanvas(w, hh);
    octx.drawImage(cv, -x0, -y0);
    c = { url: o.toDataURL(), w, h: hh };
    iconCache.set(id, c);
  }
  const s = Math.max(1, Math.floor(box / Math.max(c.w, c.h)));
  return `<img class="pix" src="${c.url}" width="${c.w * s}" height="${c.h * s}">`;
}
const unitIcon = (type: string, box = 34) => { const t = G.run ? G.run.unitTier[type] || 0 : 0; return spriteIcon(UNITS[type].tiers[t].spr, 0, box); };
const towerIcon = (type: string, tier = 0, box = 34) => spriteIcon('tower_' + type, tier * 4, box);

export const UI: any = {
  tab: 'towers', collapsed: false, last: 0, lichT: 0, typing: null as any, infoKey: '', cards: null as any[], banishMode: false,

  init(g: Phaser.Game) {
    game = g;
    const ui = $('#ui');
    ui.innerHTML = `
      <div id="topbar" class="panel hud hud-el">
        <div class="stat" id="s-wave" data-tip="wave"></div>
        <div class="stat lvl" data-tip="level"><span id="s-level"></span><div class="bar"><i id="s-xp"></i></div></div>
        <div class="stat" id="s-souls" data-tip="souls"></div>
        <div class="stat" id="s-ess" data-tip="essence"></div>
        <div class="stat keep" data-tip="keep">${icon('keep')}<div class="bar big"><i id="s-keep"></i><b id="s-keeptxt"></b></div></div>
        <div class="stat" id="s-enemies" data-tip="enemies"></div>
        <div class="stat" id="s-units" data-tip="units"></div>
        <div class="stat" id="s-fervor" data-tip="fervor"></div>
      </div>
      <div id="bossbar" class="hidden hud-el"><div class="bname" id="b-name"></div><div class="bar boss"><i id="b-hp"></i></div><div class="btitle" id="b-title"></div></div>
      <div id="lichbox" class="panel hidden hud-el"><div id="lichface"></div><div id="lichtext"></div></div>
      <div id="objective" class="panel hud-el"></div>
      <div id="rightbar" class="hud-el">
        <div id="infopanel" class="panel hidden"></div>
        <button class="btn big green" id="b-wave"></button>
        <button class="btn" id="b-well">${icon('soul', 2, 'pix')} Soul Well <small>[E]</small></button>
        <div class="speed"><button class="btn sm" data-speed="0" title="Pause (Space)">❚❚</button><button class="btn sm" data-speed="1" title="Normal speed">▶</button><button class="btn sm" data-speed="2" title="Fast (F)">▶▶</button><button class="btn sm" data-speed="4" title="Very fast (F)">▶▶▶</button></div>
        <button class="btn sm" id="b-menu" title="Menu (Esc)">☰ Menu</button>
      </div>
      <div id="toasts" class="hud-el"></div>
      <div id="spellbar" class="panel hud-el"></div>
      <div id="buildbar" class="panel hud-el">
        <div class="tabs"><button data-tab="towers">Towers</button><button data-tab="fort">Fortify</button><button data-tab="army">Army</button><span class="spacer"></span><button class="close" id="b-collapse" title="Show/hide (B)">▼ Hide</button></div>
        <div id="buildlist"></div>
      </div>
      <div id="speech" class="hidden"></div>
      <div id="bossintro" class="hidden"></div>
      <div id="modal" class="hidden"></div>
      <div id="screen" class="hidden"></div>
      <div id="tooltip" class="hidden"></div>`;
    $('#lichface').innerHTML = spriteIcon('lich', 0, 48);
    ui.querySelectorAll('.tabs button[data-tab]').forEach((b: HTMLElement) => b.onclick = () => {
      if (this.tab === b.dataset.tab && !this.collapsed) this.collapsed = true; else { this.tab = b.dataset.tab; this.collapsed = false; }
      sfx('click'); this.renderBuild();
    });
    $('#b-collapse').onclick = () => { this.collapsed = !this.collapsed; sfx('click'); this.renderBuild(); };
    ui.querySelectorAll('.speed button').forEach((b: HTMLElement) => b.onclick = () => { const s = +b.dataset.speed; if (s === 0) G.paused = !G.paused; else { G.speed = s; G.paused = false; } sfx('click'); this.updateSpeed(); });
    $('#b-wave').onclick = () => { if (G.phase === 'prep') { startWave(); this.renderBuild(); } };
    $('#b-well').onclick = () => this.showWell();
    $('#b-menu').onclick = () => this.showPause();
    ui.addEventListener('mouseover', (e: any) => { const t = e.target.closest('[data-tip]'); if (t && t.dataset.tip !== 'x') this.showTip(t, this.tipFor(t)); });
    ui.addEventListener('mouseout', (e: any) => { const t = e.target.closest('[data-tip]'); if (t) this.hideTip(); });
    hooks.msg = (t, c) => this.toast(t, c || '#dddddd');
    hooks.say = (cat) => this.lichLine(cat);
    hooks.achievement = (a) => this.toastAchievement(a);
    hooks.defeat = (b) => this.showDefeat(b);
    hooks.refreshBuild = () => this.renderBuild();
    this.bindKeys();
  },

  tipFor(el: HTMLElement) {
    const k = el.dataset.tip, r = G.run;
    if (!r) return '';
    switch (k) {
      case 'wave': return `<b>Wave ${r.wave}</b><br>${G.phase === 'prep' ? 'Preparing. Build, recruit, then begin the next wave.' : G.wave ? G.wave.theme.name : ''}`;
      case 'level': return `<b>Level ${r.level}</b><br>XP ${Math.floor(r.xp)} / ${r.xpNext}<br>Each level grants a choice of 3 dark upgrades.`;
      case 'souls': return `<b>Souls</b><br>Harvested from slain mortals. Spend them on towers, troops and the Soul Well.`;
      case 'essence': return `<b>Life Essence</b><br>Permanent currency for the Phylactery.<br>Projected from this campaign: ${essenceBreakdown().total}`;
      case 'keep': return `<b>The Keep</b><br>${fmt(G.keep.hp)} / ${fmt(G.keep.maxHp)}<br>If it falls, the campaign ends.`;
      case 'enemies': return `<b>Mortals on the field</b>`;
      case 'units': return `<b>Recruited undead / capacity</b><br>Summoned and raised undead are free and uncapped.<br>Total host: ${G.units.length}`;
      case 'fervor': return `<b>Crusade Fervor ×${(r.fervor || 1).toFixed(2)}</b><br>The mortals send stronger soldiers to match your summoned host. Applied at the start of each wave.`;
      default: return '';
    }
  },
  showTip(el: HTMLElement | null, html: string, x?: number, y?: number) {
    if (!html) return;
    const tt = $('#tooltip'); tt.innerHTML = html; tt.classList.remove('hidden');
    const r = el ? el.getBoundingClientRect() : { left: x, top: y, right: x, bottom: y, width: 0 } as any;
    const tw = tt.offsetWidth, th = tt.offsetHeight;
    let tx = r.left + r.width / 2 - tw / 2, ty = r.top - th - 8;
    if (ty < 4) ty = r.bottom + 8;
    tt.style.left = clamp(tx, 4, window.innerWidth - tw - 4) + 'px'; tt.style.top = clamp(ty, 4, window.innerHeight - th - 4) + 'px';
  },
  hideTip() { $('#tooltip').classList.add('hidden'); },

  // ---------------- HUD ----------------
  update(dt: number, worldToScreen: (x: number, y: number) => [number, number]) {
    if (G.speech) {
      const sp = $('#speech'), e = G.speech.e, H = (SHEETS[e.spr] && SHEETS[e.spr].H) || 30;
      const [sx, sy] = worldToScreen(e.x, e.y - H - e.alt - 10);
      sp.textContent = G.speech.line; sp.classList.remove('hidden');
      sp.style.left = clamp(sx, 120, window.innerWidth - 120) + 'px'; sp.style.top = clamp(sy, 110, window.innerHeight - 160) + 'px';
    } else $('#speech').classList.add('hidden');
    const bi = $('#bossintro');
    if (G.bossIntro) { if (bi.classList.contains('hidden')) { bi.innerHTML = `<div class="bi-name">${G.bossIntro.name}</div><div class="bi-title">${G.bossIntro.title}</div>`; bi.classList.remove('hidden'); } bi.style.opacity = '' + (G.bossIntro.t < 3 ? 1 : 1 - (G.bossIntro.t - 3)); }
    else bi.classList.add('hidden');
    if (this.lichT > 0) { this.lichT -= dt; if (this.lichT <= 0) $('#lichbox').classList.add('hidden'); }
    if (this.typing) { this.typing.i += dt * 45; $('#lichtext').textContent = this.typing.s.slice(0, Math.floor(this.typing.i)); if (this.typing.i >= this.typing.s.length) this.typing = null; }
    const now = performance.now();
    if (now - this.last < 100 || !G.run || G.phase === 'menu') return;
    this.last = now;
    const r = G.run;
    $('#s-wave').innerHTML = `<span class="lbl">Wave</span> ${r.wave}${G.phase === 'prep' ? '<em> prep</em>' : ''}`;
    $('#s-level').innerHTML = `<span class="lbl">Lv</span> ${r.level}`;
    ($('#s-xp') as HTMLElement).style.width = (r.xp / r.xpNext) * 100 + '%';
    $('#s-souls').innerHTML = `${SOUL()} ${fmt(r.souls)}`;
    $('#s-ess').innerHTML = `${ESS()} ${fmt(G.meta.essence)}`;
    const kp = $('#s-keep'); kp.style.width = clamp((G.keep.hp / G.keep.maxHp) * 100, 0, 100) + '%'; kp.className = G.keep.hp / G.keep.maxHp < 0.3 ? 'low' : '';
    $('#s-keeptxt').textContent = fmt(Math.max(0, Math.ceil(G.keep.hp)));
    $('#s-enemies').innerHTML = `${icon('skull')} ${G.enemies.length}${G.phase === 'wave' && G.wave ? `<em>/${G.wave.total - G.wave.idx + G.enemies.length}</em>` : ''}`;
    $('#s-units').innerHTML = `${icon('rally')} ${capUsed()}/${unitCap()} <em>host ${G.units.length}</em>`;
    $('#s-fervor').innerHTML = (r.fervor || 1) > 1.01 ? `<span class="lbl">Fervor</span> ×${r.fervor.toFixed(2)}` : '';
    const wb = $('#b-wave') as HTMLButtonElement;
    if (G.phase === 'prep') {
      const pv = previewWave(r.wave + 1);
      wb.disabled = false;
      wb.innerHTML = `Begin Wave ${r.wave + 1}${pv.boss ? `<small class="bossw">BOSS: ${pv.boss}</small>` : (r.wave + 1) % 5 === 0 ? '<small>Champion wave</small>' : ''}${G.settings.autoWave ? `<small>auto in ${Math.max(0, Math.ceil(6 - G.autoT))}s</small>` : ''}`;
      wb.classList.add('pulse');
    } else { wb.disabled = true; wb.classList.remove('pulse'); wb.innerHTML = G.phase === 'over' ? 'The keep has fallen' : `Wave ${r.wave} in progress`; }
    const bb = G.bossBar;
    if (bb && !bb.dead) { $('#bossbar').classList.remove('hidden'); $('#b-name').textContent = bb.name; $('#b-title').textContent = bb.title || ''; $('#b-hp').style.width = (bb.hp / bb.maxHp) * 100 + '%'; }
    else $('#bossbar').classList.add('hidden');
    let obj = '';
    if (G.phase === 'prep') { const pv = previewWave(r.wave + 1); obj = r.wave === 0 ? 'The crusade marches from the <b>east</b>. Build towers along the roads, then <b>Begin Wave 1</b>.' : `Prepare for wave ${r.wave + 1}.` + (pv.boss ? ` <b class="bad">Boss: ${pv.boss}</b>` : '') + (pv.newLane ? ` <b class="bad">New road: ${pv.newLane.name}!</b>` : ''); }
    else if (G.phase === 'wave') obj = G.wave.boss ? `Destroy <b>${G.wave.boss.name}</b>.` : `Repel the ${G.wave.theme.name}.`;
    const nb = BOSSES.find(b => b.wave > r.wave);
    if (nb) obj += `<br><span class="dim">Next boss: ${nb.name} — wave ${nb.wave}</span>`;
    $('#objective').innerHTML = obj;
    this.updateSpells();
    this.refreshAffordability();
    if (G.selected) this.renderInfo(); else $('#infopanel').classList.add('hidden');
    this.updateSpeed();
  },
  updateSpeed() { document.querySelectorAll('.speed button').forEach((b: HTMLElement) => { const s = +b.dataset.speed; b.classList.toggle('on', s === 0 ? G.paused : !G.paused && G.speed === s); }); },

  renderSpells() {
    const bar = $('#spellbar'); bar.innerHTML = '';
    G.run.spells.forEach((id: string, i: number) => {
      const s = SPELLS[id];
      const b = h('button', 'spell', `${icon(s.icon, 2, 'pix')}<span class="key">${i + 1}</span><span class="cd"></span><span class="cdt"></span>`);
      b.dataset.spell = id;
      b.onclick = () => this.trySpell(id);
      b.onmouseenter = () => this.showTip(b, `<b>${s.name}</b> <span class="dim">[${i + 1}]</span><br>${s.desc}<br><span class="dim">Cooldown ${Math.round(spellCd(id))}s${s.cost ? ` · ${s.cost} souls` : ''}${s.target ? ' · click a target area' : ''}</span>`);
      b.onmouseleave = () => this.hideTip();
      bar.appendChild(b);
    });
    this.spellCount = G.run.spells.length;
  },
  updateSpells() {
    if (this.spellCount !== G.run.spells.length) this.renderSpells();
    document.querySelectorAll('#spellbar .spell').forEach((b: HTMLElement) => {
      const id = b.dataset.spell, cd = G.run.spellCd[id] || 0, tot = spellCd(id);
      ($('.cd', b)).style.height = (cd > 0 ? (cd / tot) * 100 : 0) + '%';
      $('.cdt', b).textContent = cd > 0 ? '' + Math.ceil(cd) : '';
      b.classList.toggle('dis', !canCast(id));
      b.classList.toggle('on', !!(G.build && G.build.kind === 'spell' && G.build.type === id));
    });
  },
  trySpell(id: string) {
    if (!canCast(id)) { sfx('error'); return; }
    if (SPELLS[id].target) { G.build = { kind: 'spell', type: id, cost: 0 }; sfx('click'); }
    else castSpell(id);
  },

  // ---------------- build drawer ----------------
  renderBuild() {
    if (!G.run) return;
    const bar = $('#buildbar');
    bar.classList.toggle('collapsed', this.collapsed);
    $('#b-collapse').textContent = this.collapsed ? '▲ Build' : '▼ Hide';
    document.querySelectorAll('.tabs button[data-tab]').forEach((b: HTMLElement) => b.classList.toggle('on', b.dataset.tab === this.tab && !this.collapsed));
    const L = $('#buildlist'); L.innerHTML = '';
    const r = G.run;
    const card = (iconHtml: string, name: string, cost: number | null, tip: string, onclick: (e: MouseEvent) => void, extra = '', on = false) => {
      const b = h('button', 'bitem' + (on ? ' on' : ''), `<div class="bico">${iconHtml}</div><div class="bname">${name}</div><div class="bcost">${cost != null ? SOUL() + fmt(cost) : ''}</div>${extra}`);
      b.dataset.cost = '' + (cost || 0);
      b.onclick = onclick as any;
      b.onmouseenter = () => this.showTip(b, tip); b.onmouseleave = () => this.hideTip();
      L.appendChild(b); return b;
    };
    if (this.tab === 'towers') {
      for (const t of TOWER_ORDER) {
        if (!r.unlockedTowers.includes(t)) continue;
        const d = TOWERS[t];
        card(towerIcon(t), d.name, towerCost(t), towerTip(t), () => { G.build = { kind: 'tower', type: t, cost: towerCost(t) }; G.selected = null; sfx('click'); this.renderBuild(); }, '', G.build && G.build.type === t);
      }
      const locked = TOWER_ORDER.filter(t => !r.unlockedTowers.includes(t)).length;
      if (locked) L.appendChild(h('div', 'bnote', `${locked} more tower${locked > 1 ? 's' : ''} can be unlocked through level-ups${TOWER_ORDER.some(t => !contentAvailable('tower', t)) ? ' and the Phylactery' : ''}.`));
    } else if (this.tab === 'fort') {
      for (const f of FORT_ORDER) {
        const d = FORTS[f], avail = !d.meta || metaLv(d.meta) > 0;
        const b = card(icon(d.icon, 2, 'pix'), d.name, fortCost(f), `<b>${d.name}</b><br>${d.desc}${avail ? '<br><span class="dim">Hold the mouse to paint. Right-click to stop.</span>' : `<br><span class="bad">Unlock in the Phylactery: ${META_BY_ID[d.meta].name}</span>`}`,
          () => { if (!avail) { sfx('error'); return; } G.build = { kind: 'fort', type: f, cost: fortCost(f) }; G.selected = null; sfx('click'); this.renderBuild(); }, '', G.build && G.build.type === f);
        if (!avail) b.classList.add('locked');
      }
    } else if (this.tab === 'army') {
      for (const u of UNIT_ORDER) {
        if (!r.unlockedUnits.includes(u)) continue;
        const d = UNITS[u], tier = r.unitTier[u] || 0, next = d.tiers[tier + 1];
        const canEvo = next && (tier < 1 || metaLv('n_evo'));
        const evoBtn = next ? `<div class="evo ${canEvo ? '' : 'locked'}" data-evo="${u}">⇧ ${fmt(next.cost)}</div>` : '';
        const b = card(unitIcon(u), d.tiers[tier].name, recruitCost(u), unitTip(u), (ev) => { if ((ev.target as HTMLElement).closest('.evo')) return; recruit(u); }, evoBtn);
        const eb = $('.evo', b);
        if (eb) {
          eb.onclick = (ev) => { ev.stopPropagation(); evolveUnit(u); };
          eb.onmouseenter = (ev) => { ev.stopPropagation(); this.showTip(eb, `<b>Evolve: ${next.name}</b><br>All ${d.name}s (present and future) are transformed.<br>${evoText(next)}${canEvo ? '' : '<br><span class="bad">Requires Rite of Ascension (Phylactery)</span>'}<br>${SOUL()} ${fmt(next.cost)}`); };
        }
      }
      L.appendChild(h('div', 'bnote', 'Your undead pick their own battles: they hold a line before the gate and rush to wherever the crusade presses hardest.'));
    }
    this.refreshAffordability();
  },
  refreshAffordability() {
    if (!G.run) return;
    document.querySelectorAll('#buildlist .bitem').forEach((b: HTMLElement) => b.classList.toggle('poor', +b.dataset.cost > G.run.souls));
    document.querySelectorAll('#buildlist .evo[data-evo]').forEach((e: HTMLElement) => { const u = e.dataset.evo, t = G.run.unitTier[u] || 0, nx = UNITS[u].tiers[t + 1]; e.classList.toggle('poor', !nx || nx.cost > G.run.souls); });
  },

  // ---------------- selection info ----------------
  renderInfo() {
    const s = G.selected, P = $('#infopanel');
    if (!s || s.dead) { P.classList.add('hidden'); G.selected = null; return; }
    const key = s.id + ':' + (s.tier || 0) + ':' + Math.round(s.hp) + ':' + (s.mode || '') + ':' + Math.floor(G.run.souls / 10) + ':' + (s.kills || 0) + ':' + (s.silT > 0);
    if (this.infoKey === key && !P.classList.contains('hidden')) return;
    this.infoKey = key;
    P.classList.remove('hidden');
    if (s.kind === 'tower') {
      const st = towerStats(s), d = s.def, next = d.tiers[s.tier + 1];
      const needEvo = next && s.tier + 1 === 2 && !metaLv('f_evo');
      const repairCost = Math.ceil(((s.maxHp - s.hp) / s.maxHp) * d.cost * 0.4);
      P.innerHTML = `<span class="x" id="i-x">✕</span><div class="ihead">${towerIcon(s.type, s.tier, 44)}<div><b>${st.name}</b><div class="dim">${['Tier I', 'Tier II', 'Tier III — Evolved'][s.tier]} · ${s.kills} kills</div></div></div>
        <div class="istats">${d.dmg ? `<span>Damage</span><b>${fmt(st.dmg)}</b>` : ''}<span>Range</span><b>${Math.round(st.range)}</b>${d.dmg ? `<span>Attack every</span><b>${st.cd.toFixed(2)}s</b>` : ''}<span>Durability</span><b>${fmt(s.hp)}/${fmt(s.maxHp)}</b></div>
        <div class="idesc">${d.desc}${s.tier ? `<br><span class="good">${d.evo.slice(1, s.tier + 1).join(' ')}</span>` : ''}${s.silT > 0 ? '<br><span class="bad">SILENCED</span>' : ''}</div>
        <div class="ibtns">
          ${next ? `<button class="btn ${needEvo ? 'locked' : ''}" id="i-up">${s.tier === 1 ? 'Evolve' : 'Upgrade'}: ${next.name}<small>${SOUL()} ${fmt(next.cost)} — ${d.evo[s.tier + 1]}</small></button>` : '<div class="dim">Fully evolved.</div>'}
          ${d.dmg && s.type !== 'abomination' ? `<button class="btn sm" id="i-mode">Target: ${s.mode}</button>` : ''}
          ${s.hp < s.maxHp ? `<button class="btn sm" id="i-rep">Repair ${SOUL()}${repairCost}</button>` : ''}
          <button class="btn sm red" id="i-sell">Dismantle +${fmt(Math.floor(towerInvested(s) * 0.6))}</button>
        </div>`;
      if (next) $('#i-up').onclick = () => { if (needEvo) { msgFn('Evolution requires Tower Apotheosis (Phylactery).', '#ff8080'); sfx('error'); return; } upgradeTower(s); };
      const m = $('#i-mode'); if (m) m.onclick = () => { s.mode = s.mode === 'first' ? 'strongest' : s.mode === 'strongest' ? 'closest' : 'first'; sfx('click'); this.infoKey = ''; };
      const rp = $('#i-rep'); if (rp) rp.onclick = () => { if (G.run.souls < repairCost) { sfx('error'); return; } G.run.souls -= repairCost; s.hp = s.maxHp; sfx('build'); this.infoKey = ''; };
      $('#i-sell').onclick = () => { G.run.souls += Math.floor(towerInvested(s) * 0.6); removeStructure(s); sfx('crumble'); saveRunSoon(); P.classList.add('hidden'); };
    } else if (s.kind === 'fort') {
      const d = s.def, repairCost = d.hp ? Math.ceil(((s.maxHp - s.hp) / s.maxHp) * d.cost * 0.6) : 0;
      P.innerHTML = `<span class="x" id="i-x">✕</span><div class="ihead">${icon(d.icon, 3, 'pix')}<div><b>${d.name}</b></div></div>
        <div class="idesc">${d.desc}</div>${d.hp ? `<div class="istats"><span>Durability</span><b>${fmt(s.hp)}/${fmt(s.maxHp)}</b></div>` : ''}
        <div class="ibtns">${s.hp < s.maxHp && d.hp ? `<button class="btn sm" id="i-rep">Repair ${SOUL()}${repairCost}</button>` : ''}<button class="btn sm red" id="i-sell">Remove +${Math.floor(fortCost(s.type) * 0.5)}</button></div>`;
      const rp = $('#i-rep'); if (rp) rp.onclick = () => { if (G.run.souls < repairCost) { sfx('error'); return; } G.run.souls -= repairCost; s.hp = s.maxHp; sfx('build'); this.infoKey = ''; };
      $('#i-sell').onclick = () => { G.run.souls += Math.floor(fortCost(s.type) * 0.5); removeStructure(s); sfx('crumble'); saveRunSoon(); };
    } else if (s.kind === 'unit') {
      const nm = s.summon ? SUMMONS[s.type].name : UNITS[s.type].tiers[s.tier || 0].name;
      P.innerHTML = `<span class="x" id="i-x">✕</span><div class="ihead">${spriteIcon(s.spr, 0, 44)}<div><b>${nm}</b><div class="dim">${s.summon ? 'Summoned · permanent' : s.temp ? 'Raised · temporary' : 'Recruited'}</div></div></div>
        <div class="istats"><span>Health</span><b>${fmt(s.hp)}/${fmt(s.maxHp)}</b><span>Damage</span><b>${fmt(s.dmg)}</b><span>Orders</span><b>${s.retreat ? 'mending at keep' : s.plan ? 'engaging' : 'guarding the gate'}</b></div>`;
    }
    const x = $('#i-x'); if (x) x.onclick = () => { G.selected = null; P.classList.add('hidden'); };
  },

  // ---------------- toasts & lich ----------------
  toast(text: string, color: string) {
    const box = $('#toasts');
    const t = h('div', 'toast', text); t.style.borderLeftColor = color; t.style.color = color;
    box.prepend(t);
    while (box.children.length > 5) box.lastChild.remove();
    setTimeout(() => t.classList.add('fade'), 4500); setTimeout(() => t.remove(), 5500);
  },
  toastAchievement(a: any) {
    const box = $('#toasts');
    const t = h('div', 'toast ach', `<b>Achievement: ${a.name}</b><br>${a.desc} <span class="ess">+${a.ess} ${ESS()}</span>`);
    box.prepend(t); sfx('levelup');
    setTimeout(() => t.classList.add('fade'), 6000); setTimeout(() => t.remove(), 7000);
  },
  lichLine(cat: string) {
    const lines = (DIALOGUE_REF as any)[cat]; if (!lines) return;
    const s = lines[Math.floor(Math.random() * lines.length)];
    $('#lichbox').classList.remove('hidden');
    this.typing = { s: '“' + s + '”', i: 0 };
    this.lichT = 6.5;
  },

  // ---------------- modals ----------------
  openModal(html: string, cls = 'modal', closable = true) {
    const m = $('#modal'); m.className = cls;
    m.innerHTML = `<div class="mbox panel">${closable ? '<span class="x" id="m-x" title="Close (Esc)">✕</span>' : ''}${html}</div>`;
    G.modal = cls; this.hideTip();
    document.body.classList.add('modal-open');
    const x = $('#m-x'); if (x) x.onclick = () => this.closeModal();
    if (closable) m.onclick = (e) => { if (e.target === m) this.closeModal(); };
    else m.onclick = null;
    return m;
  },
  closeModal() { const m = $('#modal'); m.className = 'hidden'; m.innerHTML = ''; G.modal = null; document.body.classList.remove('modal-open'); },

  showLevelUp() {
    const r = G.run;
    const cards = rollCards(3);
    if (!cards.length) { r.pendingLevels = 0; return; }
    sfx('levelup');
    if (Math.random() < 0.4) this.lichLine('levelUp');
    this.cards = cards; this.banishMode = false;
    const render = () => {
      const m = this.openModal(`<h2>The Dark Arts Reveal…</h2><div class="center dim">Level ${r.level} · choose one${r.pendingLevels > 1 ? ` · ${r.pendingLevels - 1} more waiting` : ''}</div>
        <div class="cards">${this.cards.map((c: any, i: number) => {
          const ra = RARITY[c.rar];
          const ic = c.tower ? towerIcon(c.tower, 0, 56) : c.unit ? unitIcon(c.unit, 56) : icon(c.icon || 'skull', 3, 'pix');
          return `<div class="card" data-i="${i}" style="--rc:${ra.color}"><div class="rar">${ra.name} · ${c.cat}</div><div class="cico">${ic}</div><div class="cname">${c.name}</div><div class="cdesc">${c.desc}</div>${r.picks[c.id] ? `<div class="dim">owned ×${r.picks[c.id]}</div>` : ''}<div class="key">${i + 1}</div></div>`;
        }).join('')}</div>
        <div class="lvbtns"><button class="btn sm" id="lv-reroll" ${r.rerolls > 0 ? '' : 'disabled'}>Reroll (${r.rerolls})</button><button class="btn sm ${this.banishMode ? 'on' : ''}" id="lv-ban" ${r.banishes > 0 ? '' : 'disabled'}>Banish a card (${r.banishes})</button></div>`, 'levelup', false);
      m.querySelectorAll('.card').forEach((el: HTMLElement) => el.onclick = () => this.pickCard(+el.dataset.i));
      $('#lv-reroll').onclick = () => { if (r.rerolls <= 0) return; r.rerolls--; this.cards = rollCards(3); sfx('click'); render(); };
      $('#lv-ban').onclick = () => { if (r.banishes <= 0) return; this.banishMode = !this.banishMode; render(); };
    };
    this.renderLv = render;
    render();
  },
  pickCard(i: number) {
    const c = this.cards && this.cards[i]; if (!c) return;
    const r = G.run;
    if (this.banishMode) {
      r.banishes--; r.banished.push(c.id); this.banishMode = false;
      const rest = rollCards(4).filter((x: any) => !this.cards.includes(x));
      this.cards[i] = rest[0] || this.cards[i];
      msgFn(`${c.name} banished from this campaign.`, '#aaaaaa');
      this.renderLv(); return;
    }
    applyCard(c);
    r.pendingLevels--;
    this.closeModal();
    sfx('well');
    this.renderBuild(); this.renderSpells();
    msgFn(`${RARITY[c.rar].name}: ${c.name}`, RARITY[c.rar].color);
    saveRunSoon();
  },

  showWell() {
    if (!G.run || G.phase === 'over') return;
    const r = G.run;
    const cats = ['Ascension', 'Advancement', 'Reinforcement', 'Summoning', 'Emergency'];
    const render = () => {
      const m = this.openModal(`<h2>${icon('soul', 2, 'pix')} The Soul Well</h2><div class="dim center">Souls: ${SOUL()} ${fmt(r.souls)} — spend now, or hoard for something greater. Summons are permanent and uncapped (the crusade's Fervor rises to match).</div>
        <div class="well">${cats.map(c => `<div class="wcat"><h3>${c}</h3>${WELL.filter(w => w.cat === c).map(w => {
          const av = wellAvailable(w), cost = wellCost(w);
          const lv = w.id === 'asc_dmg' ? r.asc.dmg : w.id === 'asc_hp' ? r.asc.hp : w.id === 'asc_souls' ? r.asc.souls : null;
          const cnt = w.summon ? ` ×${Math.max(1, Math.round(SUMMONS[w.summon].count * (1 + metaLv('m_reinforce') * 0.5)))}` : '';
          return `<button class="witem ${av ? '' : 'locked'} ${cost > r.souls ? 'poor' : ''}" data-id="${w.id}">${icon(w.icon, 2, 'pix')}<div><b>${w.name}${cnt}${lv != null ? ` <span class="dim">(${lv})</span>` : ''}</b><div class="wdesc">${av ? w.desc : 'Unlock in the Phylactery: ' + META_BY_ID[w.meta].name}</div></div><div class="wcost">${SOUL()} ${fmt(cost)}</div></button>`;
        }).join('')}</div>`).join('')}</div><div class="center"><button class="btn" id="w-close">Close [E]</button></div>`, 'wellm');
      m.querySelectorAll('.witem').forEach((b: HTMLElement) => b.onclick = () => {
        const it = WELL.find(w => w.id === b.dataset.id); if (!wellAvailable(it)) return;
        if (buyWell(b.dataset.id)) { if (it.id === 'insight') this.closeModal(); else render(); }
      });
      $('#w-close').onclick = () => this.closeModal();
    };
    render();
  },

  showPause() {
    if (G.phase === 'menu') return;
    this.openModal(`<h2>Paused</h2><div class="col">
      <button class="btn" id="p-res">Resume</button><button class="btn" id="p-codex">Codex</button><button class="btn" id="p-set">Settings</button>
      <button class="btn" id="p-help">How to play</button><button class="btn" id="p-menu">Save & return to menu</button>
      <button class="btn red" id="p-abandon">Abandon campaign (keep falls)</button></div>`, 'pause');
    $('#p-res').onclick = () => this.closeModal();
    $('#p-codex').onclick = () => { this.closeModal(); this.showCodex(true); };
    $('#p-set').onclick = () => { this.closeModal(); this.showSettings(true); };
    $('#p-help').onclick = () => { this.closeModal(); this.showHelp(true); };
    $('#p-menu').onclick = () => { saveRun(); this.closeModal(); toMenu(); };
    $('#p-abandon').onclick = () => { const b = $('#p-abandon'); if (b.dataset.sure) { this.closeModal(); G.run.phylUsed = true; G.keep.hp = 0; endCampaign(); } else { b.dataset.sure = '1'; b.textContent = 'Click again to confirm'; } };
  },

  // ---------------- full screens ----------------
  screen(html: string, cls = '') { const s = $('#screen'); s.className = cls; s.innerHTML = html; this.hideTip(); document.body.classList.add('modal-open'); return s; },
  closeScreen() { $('#screen').className = 'hidden'; $('#screen').innerHTML = ''; if (!G.modal) document.body.classList.remove('modal-open'); },
  screenOpen() { return !$('#screen').classList.contains('hidden'); },

  showMenu() {
    G.phase = 'menu';
    document.body.classList.add('menu');
    const has = hasRunSave();
    this.screen(`<div class="title"><div class="t1">LICH</div><div class="t2">Eternal Dominion</div></div>
      <div class="menu col">
        ${has ? '<button class="btn big green" id="m-cont">Continue Campaign</button>' : ''}
        <button class="btn big" id="m-new">${has ? 'Abandon & Begin Anew' : 'Begin Campaign'}</button>
        <button class="btn" id="m-meta">${ESS()} The Phylactery <small>${fmt(G.meta.essence)} Life Essence</small></button>
        <button class="btn" id="m-codex">Codex & Achievements</button>
        <button class="btn" id="m-help">How to Play</button>
        <button class="btn" id="m-set">Settings</button>
      </div>
      <div class="mstats">Best wave ${G.stats.bestWave} · ${fmt(G.stats.totalKills)} mortals slain · ${G.stats.runs} phylacteries spent</div>
      <div class="lore">Humanity has united at last. Kingdoms, orders and heroes march from the east to find your phylactery and end you forever.<br>Let them come.</div>`, 'menuscreen');
    if (has) $('#m-cont').onclick = () => { startMusic(); if (loadRun()) this.enterGame(); };
    $('#m-new').onclick = () => {
      startMusic();
      if (has) { const b = $('#m-new'); if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Click again: the current campaign will be lost'; return; } clearRunSave(); }
      this.showFortressSelect();
    };
    $('#m-meta').onclick = () => { startMusic(); this.showMeta(); };
    $('#m-codex').onclick = () => this.showCodex();
    $('#m-set').onclick = () => this.showSettings();
    $('#m-help').onclick = () => this.showHelp();
  },
  showFortressSelect() {
    const s = this.screen(`<h1>Choose Your Stronghold</h1><div class="dim center">Your phylactery seeks a new resting place. Each fortress grants its own dark advantage.</div>
      <div class="forts">${Object.entries(FORTRESSES).map(([k, f]: [string, any]) => {
        const ok = !f.meta || metaLv(f.meta) > 0;
        return `<button class="fortc ${ok ? '' : 'locked'}" data-k="${k}" style="--fc:${f.accent}"><div class="fsw">${f.ground.map((c: string) => `<i style="background:${c}"></i>`).join('')}<i style="background:${f.accent}"></i></div><b>${f.name}</b><div>${f.desc}</div>${ok ? '' : `<div class="bad">Unlock: ${META_BY_ID[f.meta].name}</div>`}</button>`;
      }).join('')}</div><div class="center"><button class="btn" id="f-back">Back</button></div>`, 'fortscreen');
    s.querySelectorAll('.fortc').forEach((b: HTMLElement) => b.onclick = () => { if (b.classList.contains('locked')) { sfx('error'); return; } newCampaign(b.dataset.k); this.enterGame(); });
    $('#f-back').onclick = () => this.showMenu();
  },
  enterGame() {
    this.closeScreen(); this.closeModal();
    document.body.classList.remove('menu');
    this.tab = 'towers'; this.collapsed = false;
    this.renderBuild(); this.renderSpells();
    if (!G.stats.seenHelp) { G.stats.seenHelp = true; saveMetaSoon(); this.showHelp(true); }
  },
  showDefeat(b: any) {
    const r = G.run;
    this.closeModal();
    this.screen(`<div class="defeat"><h1>Your Physical Form Is Destroyed</h1>
      <p class="lore">The mortal coalition storms the keep and shatters your vessel on wave ${r.wave}. They will sing of this victory for a generation.<br>But far away, in a hidden vault, a second phylactery begins to glow… and your consciousness stirs.</p>
      <div class="ebox"><div><span>Mortals slain (${fmt(r.kills)})</span><b>${b.kills}</b></div><div><span>Waves endured (${r.wave - 1})</span><b>${b.waves}</b></div><div><span>Champions & bosses</span><b>${b.bosses}</b></div><div><span>Power attained (level ${r.level})</span><b>${b.level}</b></div>${b.mult > 1 ? `<div><span>Eternal Hunger</span><b>×${b.mult.toFixed(1)}</b></div>` : ''}<div class="tot"><span>Life Essence gained</span><b>${ESS()} ${b.total}</b></div></div>
      <div class="col"><button class="btn big green" id="d-meta">Enter the Phylactery (${fmt(G.meta.essence)})</button><button class="btn big" id="d-again">Rise Again</button><button class="btn" id="d-menu">Main Menu</button></div></div>`, 'defeatscreen');
    $('#d-meta').onclick = () => this.showMeta('again');
    $('#d-again').onclick = () => this.showFortressSelect();
    $('#d-menu').onclick = () => toMenu();
  },
  showMeta(from?: string) {
    const render = () => {
      const s = this.screen(`<h1>${ESS()} The Phylactery</h1><div class="center">Life Essence: <b class="essv">${fmt(G.meta.essence)}</b> <span class="dim">· click a rite to empower it permanently</span></div>
        <div class="tree">${META_BRANCHES.map((B: any) => `<div class="branch" style="--bc:${B.color}"><h3>${B.name}</h3>${META.filter(m => m.b === B.id).map(m => {
          const lv = metaLv(m.id), maxed = lv >= m.max, reqOk = !m.req || m.req.every((q: string) => metaLv(q) > 0), cost = metaCost(m, lv);
          const cls = maxed ? 'maxed' : !reqOk ? 'locked' : cost > G.meta.essence ? 'poor' : 'buy';
          return `<button class="node ${cls} ${m.req ? 'child' : ''}" data-id="${m.id}"><div class="nn">${m.name}</div><div class="pips">${Array.from({ length: m.max }, (_, i) => `<i class="${i < lv ? 'f' : ''}"></i>`).join('')}</div><div class="nc">${maxed ? 'MASTERED' : `${ESS()} ${cost}`}</div></button>`;
        }).join('')}</div>`).join('')}</div>
        <div class="center">${from === 'again' ? '<button class="btn big green" id="mt-go">Rise Again</button> ' : ''}<button class="btn" id="mt-back">${from === 'again' ? 'Main Menu' : 'Back'}</button></div>`, 'metascreen');
      s.querySelectorAll('.node').forEach((n: HTMLElement) => {
        const m = META_BY_ID[n.dataset.id];
        n.onmouseenter = () => { const lv = metaLv(m.id); this.showTip(n, `<b>${m.name}</b> (${lv}/${m.max})<br>${lv ? 'Now: ' + m.desc(lv) + '<br>' : ''}${lv < m.max ? 'Next: ' + m.desc(lv + 1) : ''}${m.req && !m.req.every((q: string) => metaLv(q) > 0) ? `<br><span class="bad">Requires: ${m.req.map((q: string) => META_BY_ID[q].name).join(', ')}</span>` : ''}`); };
        n.onmouseleave = () => this.hideTip();
        n.onclick = () => { if (buyMeta(m.id)) render(); else sfx('error'); };
      });
      $('#mt-back').onclick = () => this.showMenu();
      const go = $('#mt-go'); if (go) go.onclick = () => this.showFortressSelect();
    };
    render();
  },
  showCodex(fromGame?: boolean, tab = 'enemy') {
    const C = G.stats.codex;
    const tabs = [['enemy', 'Mortals'], ['unit', 'Undead'], ['tower', 'Towers'], ['spell', 'Spells'], ['ach', 'Achievements']];
    let body = '';
    const unseen = '<div style="width:48px;height:48px;background:#1a1a1e"></div>';
    if (tab === 'enemy') {
      body = [...Object.keys(ENEMIES).map(k => [k, ENEMIES[k], false]), ...BOSSES.map(b => [b.id, b, true])].map(([k, d, boss]: any) => {
        const seen = C.enemy[k];
        return `<div class="centry ${seen ? '' : 'unseen'}">${seen ? spriteIcon(k, 0, 48) : unseen}<div><b>${seen ? d.name : '???'}</b>${boss ? ' <span class="gold">BOSS</span>' : ''}<div class="dim">${seen ? (boss ? d.title + ' · wave ' + d.wave : ({ iron: 'Iron Kingdoms', holy: 'Holy Dominion', arcane: 'Arcane Conclave', free: 'Freeborn Alliance' } as any)[d.fac]) : boss ? 'Appears at wave ' + d.wave : 'Not yet encountered'}</div>${seen ? `<div>${d.desc || d.line}</div>` : ''}</div></div>`;
      }).join('');
    } else if (tab === 'unit') {
      body = UNIT_ORDER.map(k => { const d = UNITS[k], av = contentAvailable('unit', k); return `<div class="centry ${av ? '' : 'unseen'}">${av ? spriteIcon(d.tiers[0].spr, 0, 48) : unseen}<div><b>${av ? d.name : '???'}</b><div class="dim">${av ? d.tiers.map((t: any) => t.name).join(' → ') : 'Unlock: ' + META_BY_ID[CONTENT_GATES.unit[k]].name}</div>${av ? `<div>${d.desc}</div>` : ''}</div></div>`; }).join('')
        + Object.values(SUMMONS).map((s: any) => `<div class="centry">${spriteIcon(s.spr, 0, 48)}<div><b>${s.name}</b> <span class="gold">SUMMON ×${s.count}</span><div>${s.desc}</div></div></div>`).join('');
    } else if (tab === 'tower') {
      body = TOWER_ORDER.map(k => { const d = TOWERS[k], av = contentAvailable('tower', k); return `<div class="centry ${av ? '' : 'unseen'}">${av ? towerIcon(k, 0, 40) + towerIcon(k, 2, 48) : unseen}<div><b>${av ? d.name : '???'}</b><div class="dim">${av ? d.tiers.map((t: any) => t.name).join(' → ') : 'Unlock: ' + META_BY_ID[CONTENT_GATES.tower[k]].name}</div>${av ? `<div>${d.desc}</div>` : ''}</div></div>`; }).join('');
    } else if (tab === 'spell') {
      body = SPELL_ORDER.map(k => { const s = SPELLS[k]; return `<div class="centry">${icon(s.icon, 3, 'pix')}<div><b>${s.name}</b><div>${s.desc}</div><div class="dim">Cooldown ${s.cd}s${s.cost ? ' · ' + s.cost + ' souls' : ''}${s.meta ? ' · Unlock: ' + META_BY_ID[s.meta].name : ' · Known from the start'}</div></div></div>`; }).join('');
    } else body = ACHIEVEMENTS.map(a => `<div class="centry ${G.stats.ach[a.id] ? '' : 'unseen'}">${icon(G.stats.ach[a.id] ? 'level' : 'skull', 2, 'pix')}<div><b>${a.name}</b> <span class="ess">${ESS()} ${a.ess}</span><div>${a.desc}</div></div></div>`).join('');
    const s = this.screen(`<h1>The Codex</h1><div class="ctabs">${tabs.map(([k, n]) => `<button class="btn sm ${k === tab ? 'on' : ''}" data-t="${k}">${n}</button>`).join('')}</div><div class="codex">${body}</div><div class="center"><button class="btn" id="c-back">Back</button></div>`, 'codexscreen');
    s.querySelectorAll('.ctabs button').forEach((b: HTMLElement) => b.onclick = () => this.showCodex(fromGame, b.dataset.t));
    $('#c-back').onclick = () => (fromGame ? this.closeScreen() : this.showMenu());
  },
  showHelp(fromGame?: boolean) {
    this.screen(`<h1>How to Rule Eternally</h1><div class="help">
      <p><b>Goal.</b> The crusade marches from the <b>east</b> along the roads toward your keep on the far west. If the keep falls the campaign ends — but Life Essence lets your next stronghold rise stronger.</p>
      <p><b>Build.</b> Pick a tower in the bottom drawer and click the battlefield. Walls reroute enemies (they batter through if you seal a road). Hold the mouse to paint walls. The drawer can be hidden with ▼ Hide or the B key.</p>
      <p><b>Army.</b> Recruit undead in the <b>Army</b> tab. They fight on their own: they hold a line before the gate, rush to wherever mortals press hardest, ranged troops stay behind the melee, and wounded soldiers fall back to the keep to mend. Every undead slain during a wave rises again when the wave is repelled.</p>
      <p><b>Souls & the Soul Well (E).</b> Kills give souls and experience. Each level offers three upgrades. In the Soul Well, <b>Ascensions</b> multiply your power and can be bought endlessly; <b>summons</b> raise whole packs of creatures that stay forever with no cap — but the crusade's <b>Fervor</b> rises to match your summoned host.</p>
      <p><b>Spells.</b> Keys 1–8. Some need a target area.</p>
      <p><b>Controls.</b> Drag with right/middle mouse or use WASD/arrows to pan. Wheel zooms. Space pauses, F cycles speed, Enter begins the wave, Esc closes windows.</p>
    </div><div class="center"><button class="btn big" id="h-ok">${fromGame ? 'To war' : 'Back'}</button></div>`, 'helpscreen');
    $('#h-ok').onclick = () => (fromGame ? this.closeScreen() : this.showMenu());
  },
  showSettings(fromGame?: boolean) {
    const S = G.settings;
    this.screen(`<h1>Settings</h1><div class="settings">
      <label>Sound effects <input type="range" min="0" max="1" step="0.05" id="st-sfx" value="${S.sfx}"></label>
      <label>Music <input type="range" min="0" max="1" step="0.05" id="st-mus" value="${S.music}"></label>
      <label>Screen shake <input type="checkbox" id="st-shake" ${S.shake ? 'checked' : ''}></label>
      <label>Damage numbers <input type="checkbox" id="st-dmg" ${S.dmgNumbers ? 'checked' : ''}></label>
      <label>Auto-start waves <input type="checkbox" id="st-auto" ${S.autoWave ? 'checked' : ''}></label>
      <label>Effects quality <select id="st-fx"><option value="low">Low</option><option value="med">Medium</option><option value="high">High</option></select></label>
      <div><button class="btn sm red" id="st-reset">Erase all progress</button></div>
    </div><div class="center"><button class="btn" id="st-back">Back</button></div>`, 'setscreen');
    ($('#st-fx') as HTMLSelectElement).value = S.fx;
    $('#st-sfx').oninput = (e: any) => { S.sfx = +e.target.value; };
    $('#st-mus').oninput = (e: any) => { S.music = +e.target.value; applyMusicVolume(); };
    $('#st-shake').onchange = (e: any) => (S.shake = e.target.checked);
    $('#st-dmg').onchange = (e: any) => (S.dmgNumbers = e.target.checked);
    $('#st-auto').onchange = (e: any) => (S.autoWave = e.target.checked);
    $('#st-fx').onchange = (e: any) => (S.fx = e.target.value);
    $('#st-reset').onclick = () => { const b = $('#st-reset'); if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Click again to erase EVERYTHING'; return; } store.del(SAVE_META); store.del(SAVE_RUN); loadMeta(); toMenu(); };
    $('#st-back').onclick = () => { saveMeta(); fromGame ? this.closeScreen() : this.showMenu(); };
  },

  // ---------------- keyboard ----------------
  bindKeys() {
    const keys: Record<string, boolean> = {};
    this.keys = keys;
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      keys[e.key.toLowerCase()] = true;
      if (G.phase === 'menu') return;
      if (G.modal === 'levelup' && ['1', '2', '3'].includes(e.key)) { this.pickCard(+e.key - 1); return; }
      if (e.key === 'Escape') {
        if (G.modal && G.modal !== 'levelup') this.closeModal();
        else if (this.screenOpen() && G.phase !== 'over') this.closeScreen();
        else if (G.build || G.selected) { G.build = null; G.selected = null; this.renderBuild(); }
        else if (!G.modal) this.showPause();
        return;
      }
      if (e.key.toLowerCase() === 'e' && G.modal === 'wellm') { this.closeModal(); return; }
      if (G.modal || G.phase === 'over' || this.screenOpen()) return;
      if (e.key === ' ') { e.preventDefault(); G.paused = !G.paused; this.updateSpeed(); }
      const k = e.key.toLowerCase();
      if (k === 'f') { G.speed = G.speed >= 4 ? 1 : G.speed * 2; G.paused = false; this.updateSpeed(); }
      if (k === 'b') { this.collapsed = !this.collapsed; this.renderBuild(); }
      if (e.key === 'Enter' && G.phase === 'prep') startWave();
      if (k === 'e') this.showWell();
      if (/^[1-8]$/.test(e.key)) { const id = G.run.spells[+e.key - 1]; if (id) this.trySpell(id); }
    });
    window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  },
};

import { DIALOGUE } from '../data/meta';
const DIALOGUE_REF = DIALOGUE;

function towerInvested(t: any) { let c = t.invested || TOWERS[t.type].cost; for (let i = 1; i <= t.tier; i++) c += TOWERS[t.type].tiers[i].cost; return c; }
function evoText(t: any) { const p: string[] = []; if (t.hp) p.push(`HP ×${t.hp}`); if (t.dmg) p.push(`Damage ×${t.dmg}`); if (t.armor) p.push(`+${Math.round(t.armor * 100)}% armor`); if (t.range) p.push(`Range ×${t.range}`); if (t.spd) p.push(`Speed ×${t.spd}`); return p.join(' · '); }
function towerTip(type: string) {
  const d = TOWERS[type];
  return `<b>${d.name}</b><br>${d.desc}<br><span class="dim">${d.dmg ? `Damage ${d.dmg} · ` : ''}Range ${d.range}${d.dmg ? ` · every ${d.cd}s` : ''} · ${d.dtype}</span><br><span class="dim">Evolves: ${d.tiers.slice(1).map((t: any) => t.name).join(' → ')}</span>`;
}
function unitTip(type: string) {
  const d = UNITS[type], t = G.run.unitTier[type] || 0;
  const u: any = { type, def: d, st: {} }; applyUnitStats(u);
  return `<b>${d.tiers[t].name}</b>${d.flying ? ' <span class="good">flying</span>' : ''}<br>${d.desc}<br><span class="dim">HP ${fmt(u.maxHp)} · DMG ${fmt(u.dmg)} · ${d.ranged ? 'Range ' + Math.round(u.range) : 'Melee'} · Armor ${Math.round(u.armor * 100)}% · Capacity ${d.cap}</span><br>Click to recruit.`;
}
export function recruit(type: string) {
  const r = G.run, c = recruitCost(type), d = UNITS[type];
  if (r.souls < c) { sfx('error'); msgFn('Not enough souls.', '#ff8080'); return false; }
  if (capUsed() + d.cap > unitCap()) { sfx('error'); msgFn('Recruit capacity reached — summon from the Soul Well (uncapped) or raise capacity.', '#ff8080'); return false; }
  r.souls -= c;
  spawnUnit(type, KEEP.x1 + 14, KEEP.y + 30);
  codexSee('unit', type);
  sfx('raise', 0.3);
  UI.refreshAffordability(); saveRunSoon();
  return true;
}
function evolveUnit(type: string) {
  const r = G.run, d = UNITS[type], t = r.unitTier[type] || 0, next = d.tiers[t + 1];
  if (!next) return;
  if (t >= 1 && !metaLv('n_evo')) { sfx('error'); msgFn('Requires Rite of Ascension (Phylactery).', '#ff8080'); return; }
  if (r.souls < next.cost) { sfx('error'); return; }
  r.souls -= next.cost; r.unitTier[type] = t + 1;
  G.units.filter((u: any) => u.type === type && !u.summon).forEach((u: any) => { applyUnitStats(u); addRing(u.x, u.y, 2, 16, PAL.necro, 0.5); });
  msgFn(`Your ${d.name}s become ${next.name}!`, PAL.necro); sfx('levelup');
  UI.renderBuild(); saveRunSoon();
}
export function upgradeTower(t: any) {
  const d = t.def, next = d.tiers[t.tier + 1], r = G.run;
  if (!next) return;
  if (r.souls < next.cost) { sfx('error'); msgFn('Not enough souls.', '#ff8080'); return; }
  r.souls -= next.cost; t.tier++;
  const old = t.maxHp; t.maxHp = towerMaxHp(t); t.hp += t.maxHp - old;
  if (t.tier === 2) { G.stats.evolved = true; checkAchievements(); }
  explosion(t.x, t.y - 20, 30, PAL.necro);
  msgFn(`${next.name} awakens.`, PAL.necro); sfx('levelup');
  UI.infoKey = ''; saveRunSoon();
}
export function toMenu() {
  UI.closeModal();
  G.phase = 'menu'; G.run = null; G.selected = null; G.build = null; G.bossBar = null;
  hooks.refreshBuild();
  (window as any).__toMenu?.();
  UI.showMenu();
}
