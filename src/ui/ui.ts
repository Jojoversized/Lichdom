// DOM user interface: HUD, build drawer, spells, info panel, modals
// (level-up, crusade, events, pause) and full screens (the Phylactery web and keep select, codex...).
import * as Phaser from 'phaser';
import { G } from '../core/state';
import { hooks } from '../core/events';
import { clamp, fmt, makeCanvas, rnd } from '../core/util';
import { PAL, KEEP } from '../config/constants';
import { SHEETS } from '../config/manifest';
import { TOWERS, TOWER_ORDER, FORTS, FORT_ORDER, WALL_TIERS } from '../data/towers';
import { siteById, siteTier, siteHp, buildSite, razeSite, sitesBuilt } from '../systems/ramparts';
import { BUILDINGS } from '../data/buildings';
import { demolishTower, removeTrap, towersPlaced, trapsPlaced } from '../systems/keep';
import { UNITS, UNIT_ORDER, SUMMONS } from '../data/units';
import { SPELLS, SPELL_ORDER, BASE_SPELLS } from '../data/spells';
import { CRUSADE_TIERS } from '../data/events';
import { rogue, pendingEvent, resolveEvent, canChoose, choiceCost } from '../systems/events';
import { EVENT_ART } from '../data/event_art';
import { ENEMIES, BOSSES } from '../data/enemies';
import { META, META_BRANCHES, META_BY_ID, metaCost, ACHIEVEMENTS, CUR_NAME, CUR_COLOR, CHILDREN, WebNode } from '../data/meta';
import { FORTRESSES, KEEPS, WAVES_PER_KEEP } from '../data/world';
import { RARITY, rollCards, applyCard } from '../systems/cards';
import { fervorParts, metaLv, towerStats, squadSize, applyUnitStats, bld, wallSlots, wallTier, towerSlots, towerTier, trapSlots, towerKnown, fortKnown, unitOwned, musterCount, keepUnlocked, waveEssence, essenceMult, waveHpMult } from '../systems/stats';
import { startWave, crusadeOffer, previewWave, castSpell, canCast, spellCd, newCampaign, loadRun, retreat } from '../systems/campaign';
import { haul, buyMeta, buyMetaMax, canBuyMeta, nodeVisible, nodeOpen, codexSee } from '../systems/progression';
import { saveRun, saveRunSoon, saveMeta, saveMetaSoon, hasRunSave, clearRunSave, loadMeta, store, SAVE_META, SAVE_RUN } from '../systems/save';
import { startMusic, applyMusicVolume } from '../audio/audio';
import { anPick, anExport, anCount, anClear, persist } from '../systems/analytics';

const $ = (s: string, el: ParentNode = document) => el.querySelector(s) as HTMLElement;
const h = (tag: string, cls?: string, html?: string) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const icon = (name: string, scale = 1, cls = 'pix ico') => `<img class="${cls}" src="ui/icons/${name}.png" width="${16 * scale}" height="${16 * scale}" alt="">`;
const SOUL = () => icon('soul');
const ESS = () => icon('essence');
/** Stolen Divinity has no sheet icon: a gold lozenge drawn in CSS. */
const DIV = () => '<i class="divico"></i>';
const CUR_ICON: Record<string, () => string> = { souls: SOUL, essence: ESS, divinity: DIV };
/** Compact numbers for the three currencies (1.2k, 3.4M …). */
const big = (v: number) => { v = Math.floor(v); if (v < 10000) return v.toLocaleString('en-US'); const u = ['k', 'M', 'B', 'T', 'Qa', 'Qi']; let i = -1; while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; } return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + u[i]; };
const fmtE = (v: number) => v >= 1000 ? big(v) : v >= 20 ? v.toFixed(0) : (Math.round(v * 10) / 10) + '';
const purse = () => `<span class="purse"><span class="cur souls" title="Souls">${SOUL()} ${big(G.meta.souls)}</span><span class="cur essence" title="Life Essence">${ESS()} ${big(G.meta.essence)}</span><span class="cur divinity" title="Stolen Divinity">${DIV()} ${big(G.meta.divinity)}</span></span>`;
const sfx = (n: string, v = 1) => hooks.sfx(n, v);
const msgFn = (t: string, c?: string) => hooks.msg(t, c);

let game: Phaser.Game;
const iconCache = new Map<string, { url: string; w: number; h: number }>();
/** Crops one frame of a sprite sheet to its opaque bounds and returns an <img> tag. */
/** Escapes text for an HTML attribute. */
const esc = (t: string) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
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
  // sheets are 2x texel art: fit the box, integer-upscale small art, smooth-downscale big art
  const m = Math.max(c.w, c.h), s = m <= box ? Math.max(1, Math.floor(box / m)) : box / m;
  return `<img class="${s >= 1 ? 'pix' : 'pixd'}" src="${c.url}" width="${Math.round(c.w * s)}" height="${Math.round(c.h * s)}">`;
}
const unitIcon = (type: string, box = 34) => { const t = G.run ? G.run.unitTier[type] || 0 : 0; return spriteIcon(UNITS[type].tiers[t].spr, 0, box); };
const towerIcon = (type: string, tier = 0, box = 34) => spriteIcon('tower_' + type, tier * 4, box);
const buildingIcon = (type: string, tier = 0, box = 34) => spriteIcon('building_' + type, tier * 4, box);

export const UI: any = {
  tab: 'fort', collapsed: false, last: 0, lichT: 0, typing: null as any, infoKey: '', cards: null as any[], banishMode: false, gains: null as any,

  init(g: Phaser.Game) {
    game = g;
    const ui = $('#ui');
    ui.innerHTML = `
      <div id="topbar" class="panel hud hud-el">
        <div class="stat" id="s-wave" data-tip="wave"></div>
        <div class="stat lvl" data-tip="level"><span id="s-level"></span><div class="bar"><i id="s-xp"></i></div></div>
        <div class="stat cur souls" id="s-souls" data-tip="souls"></div>
        <div class="stat cur essence" id="s-ess" data-tip="essence"></div>
        <div class="stat keep" data-tip="keep">${icon('keep')}<div class="bar big"><i id="s-keep"></i><b id="s-keeptxt"></b></div></div>
        <div class="stat" id="s-enemies" data-tip="enemies"></div>
        <div class="stat" id="s-units" data-tip="units"></div>
        <div class="stat" id="s-fervor" data-tip="fervor"></div>
      </div>
      <div id="mods" class="hud-el"></div>
      <div id="bossbar" class="hidden hud-el"><div class="bname" id="b-name"></div><div class="bar boss"><i id="b-hp"></i></div><div class="btitle" id="b-title"></div></div>
      <div id="lichbox" class="panel hidden hud-el"><div id="lichface"></div><div id="lichtext"></div></div>
      <div id="objective" class="panel hud-el"></div>
      <div id="rightbar" class="hud-el">
        <div id="infopanel" class="panel hidden"></div>
        <button class="btn big green" id="b-wave"></button>
        <div class="speed"><button class="btn sm" data-speed="0" title="Pause (Space)">❚❚</button><button class="btn sm" data-speed="1" title="Normal speed">▶</button><button class="btn sm" data-speed="2" title="Fast (F)">▶▶</button><button class="btn sm" data-speed="4" title="Very fast (F)">▶▶▶</button></div>
        <button class="btn sm" id="b-menu" title="Menu (Esc)">☰ Menu</button>
      </div>
      <div id="toasts" class="hud-el"></div>
      <div id="spellbar" class="panel hud-el"></div>
      <div id="buildbar" class="panel hud-el">
        <div class="tabs"><button data-tab="fort" title="Ramparts, traps and barricades (slots from the Phylactery web)">Ramparts & Traps</button><button data-tab="towers" title="Towers on top of built ramparts (slots from the Phylactery web)">Towers</button><button data-tab="army" title="The host the web has mustered">Host</button><span class="spacer"></span><button class="close" id="b-collapse" title="Show/hide (B)">▼ Hide</button></div>
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
    $('#b-wave').onclick = () => { if (G.phase === 'prep') this.showCrusade(); };
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
      case 'wave': return `<b>${KEEPS[r.keep].name} — wave ${r.wave} of ${WAVES_PER_KEEP}</b><br>${G.phase === 'prep' ? 'Preparing. Place your defences, then begin the next wave.' : G.wave ? G.wave.theme.name : ''}<br><span class="dim">Wave ${WAVES_PER_KEEP} is the keep's boss.</span>`;
      case 'level': return `<b>Level ${r.level}</b><br>XP ${Math.floor(r.xp)} / ${r.xpNext}<br>Each level grants a choice of 3 dark upgrades for this siege.`;
      case 'souls': return `<b>Souls gathered this siege</b><br>Harvested from every slain mortal. Nothing is bought during a siege: when it ends — won or lost — they are carried to the <b>Phylactery web</b>, where souls buy more undead and the small, repeatable upgrades.<br><span class="dim">In the Phylactery now: ${big(G.meta.souls)}</span>`;
      case 'essence': return `<b>Life Essence gathered this siege</b><br>Earned for every wave repelled (wave ${Math.min(WAVES_PER_KEEP, r.wave + 1)}: +${fmtE(waveEssence(Math.min(WAVES_PER_KEEP, r.wave + 1)) * essenceMult())}), far more for the boss. Spent on the web for unlocks, buildings and stronger passives.<br><span class="dim">In the Phylactery now: ${big(G.meta.essence)} · Stolen Divinity ${G.meta.divinity}</span>`;
      case 'keep': return `<b>The Keep</b><br>${fmt(G.keep.hp)} / ${fmt(G.keep.maxHp)}<br>If it falls the siege ends — and everything you gathered still reaches the Phylactery.`;
      case 'enemies': return `<b>Mortals on the field</b>`;
      case 'units': return `<b>Your undead host</b><br>Raised by the Phylactery web at the start of the siege. Every undead slain during a wave rises again when the wave is repelled.<br>Total host: ${G.units.length}`;
      case 'fervor': { const p = fervorParts(); return `<b>Crusade Fervor ×${(r.fervor || 1).toFixed(2)}</b> <span class="dim">(enemy health; damage by its square root)</span><br>Zeal: +3.5% for each Holy War fought this siege (${p.zealN}).`; }
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
    $('#s-wave').innerHTML = `<span class="lbl">Wave</span> ${r.wave}<em>/${WAVES_PER_KEEP}</em>${G.phase === 'prep' ? '<em> prep</em>' : ''}`;
    $('#s-level').innerHTML = `<span class="lbl">Lv</span> ${r.level}`;
    ($('#s-xp') as HTMLElement).style.width = (r.xp / r.xpNext) * 100 + '%';
    this.setStat('#s-souls', `${SOUL()} ${big(r.souls)}`);
    this.setStat('#s-ess', `${ESS()} ${fmtE(r.essence)}`);
    this.trackGains();
    this.renderMods();
    const kp = $('#s-keep'); kp.style.width = clamp((G.keep.hp / G.keep.maxHp) * 100, 0, 100) + '%'; kp.className = G.keep.hp / G.keep.maxHp < 0.3 ? 'low' : '';
    $('#s-keeptxt').textContent = fmt(Math.max(0, Math.ceil(G.keep.hp)));
    $('#s-enemies').innerHTML = `${icon('skull')} ${G.enemies.length}${G.phase === 'wave' && G.wave ? `<em>/${G.wave.total - G.wave.idx + G.enemies.length}</em>` : ''}`;
    $('#s-units').innerHTML = `${icon('rally')} ${fmt(G.units.length)} <em>undead</em>`;
    $('#s-fervor').innerHTML = (r.fervor || 1) > 1.01 ? `<span class="lbl">Fervor</span> ×${r.fervor.toFixed(2)}` : '';
    const wb = $('#b-wave') as HTMLButtonElement;
    if (G.phase === 'prep') {
      const pv = previewWave(r.wave + 1);
      wb.disabled = false;
      wb.innerHTML = `Begin Wave ${r.wave + 1}<em>/${WAVES_PER_KEEP}</em>${pv.boss ? `<small class="bossw">BOSS: ${pv.boss}</small>` : (r.wave + 1) % 5 === 0 ? '<small>Champion wave</small>' : ''}${G.settings.autoWave ? `<small>auto in ${Math.max(0, Math.ceil(6 - G.autoT))}s</small>` : ''}`;
      wb.classList.add('pulse');
    } else { wb.disabled = true; wb.classList.remove('pulse'); wb.innerHTML = G.phase === 'over' ? 'The siege is over' : `Wave ${r.wave} in progress`; }
    const bb = G.bossBar;
    if (bb && !bb.dead) { $('#bossbar').classList.remove('hidden'); $('#b-name').textContent = bb.name; $('#b-title').textContent = bb.title || ''; $('#b-hp').style.width = (bb.hp / bb.maxHp) * 100 + '%'; }
    else $('#bossbar').classList.add('hidden');
    let obj = '';
    if (G.phase === 'prep') { const pv = previewWave(r.wave + 1); obj = r.wave === 0 ? `The crusade marches from the <b>east</b>. Your host has risen; place the defences the web allows (bottom drawer), then <b>Begin Wave 1</b>.` : `Prepare for wave ${r.wave + 1}.` + (pv.boss ? ` <b class="bad">Boss: ${pv.boss}</b>` : '') + (pv.newLane ? ` <b class="bad">New road: ${pv.newLane.name}!</b>` : ''); }
    else if (G.phase === 'wave') obj = G.wave.boss ? `Destroy <b>${G.wave.boss.name}</b>.` : `Repel the ${G.wave.theme.name}.`;
    if (r.wave < WAVES_PER_KEEP - 1 || G.phase === 'prep' && r.wave < WAVES_PER_KEEP) obj += `<br><span class="dim">${KEEPS[r.keep].name} · boss on wave ${WAVES_PER_KEEP}: ${BOSSES.find(b => b.id === KEEPS[r.keep].boss).name}${G.meta.keepsCleared <= r.keep ? ' — ' + DIV() + ' 1 Stolen Divinity' : ''}</span>`;
    $('#objective').innerHTML = obj;
    this.updateSpells();
    this.refreshAffordability();
    if (G.selected) this.renderInfo(); else $('#infopanel').classList.add('hidden');
    this.updateSpeed();
  },
  /** Updates a top-bar stat's text without wiping its floating gain labels. */
  setStat(sel: string, html: string) {
    const el = $(sel); let v = el.querySelector('.sv') as HTMLElement;
    if (!v) { v = h('span', 'sv', ''); el.prepend(v); }
    if (v.innerHTML !== html) v.innerHTML = html;
  },
  updateSpeed() { document.querySelectorAll('.speed button').forEach((b: HTMLElement) => { const s = +b.dataset.speed; b.classList.toggle('on', s === 0 ? G.paused : !G.paused && G.speed === s); }); },

  renderSpells() {
    const bar = $('#spellbar'); bar.innerHTML = '';
    G.run.spells.forEach((id: string, i: number) => {
      const s = SPELLS[id];
      const b = h('button', 'spell', `${icon(s.icon, 2, 'pix')}<span class="key">${i < 9 ? i + 1 : ''}</span><span class="cd"></span><span class="cdt"></span>`);
      b.dataset.spell = id;
      b.onclick = () => this.trySpell(id);
      b.onmouseenter = () => this.showTip(b, `<b>${s.name}</b> <span class="dim">[${i + 1}]</span><br>${s.desc}<br><span class="dim">Cooldown ${Math.round(spellCd(id))}s${s.target ? ' · click a target area' : ''}</span>`);
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
    $('#b-collapse').textContent = this.collapsed ? '▲ Defences' : '▼ Hide';
    document.querySelectorAll('.tabs button[data-tab]').forEach((b: HTMLElement) => b.classList.toggle('on', b.dataset.tab === this.tab && !this.collapsed));
    const L = $('#buildlist'); L.innerHTML = '';
    const r = G.run, prep = G.phase === 'prep';
    const card = (iconHtml: string, name: string, note: string, tip: string, onclick: (e: MouseEvent) => void, extra = '', on = false) => {
      const b = h('button', 'bitem' + (on ? ' on' : ''), `<div class="bico">${iconHtml}</div><div class="bname">${name}</div><div class="bcost slot">${note}</div>${extra}`);
      b.onclick = onclick as any;
      b.onmouseenter = () => this.showTip(b, tip); b.onmouseleave = () => this.hideTip();
      L.appendChild(b); return b;
    };
    const arm = (b: any) => { if (!prep) { sfx('error'); msgFn('Defences are placed between waves.', '#c8b890'); return; } G.build = b; G.selected = null; sfx('click'); this.renderBuild(); };
    const slots = (used: number, max: number) => `<span class="${used >= max ? 'full' : ''}">${used}/${max}</span>`;
    const webNote = (t: string) => L.appendChild(h('div', 'bnote', t));
    G.showPlots = this.collapsed ? false : this.tab === 'towers' ? 'mounts' : false;
    if (this.tab === 'towers') {
      const used = towersPlaced(), max = towerSlots();
      for (const t of TOWER_ORDER) {
        if (!towerKnown(t)) continue;
        const d = TOWERS[t];
        const b = card(towerIcon(t, towerTier()), d.tiers[towerTier()].name, slots(used, max), towerTip(t), () => arm({ kind: 'tower', type: t }), '', G.build && G.build.kind === 'tower' && G.build.type === t);
        if (used >= max || !prep) b.classList.add('poor');
      }
      const locked = TOWER_ORDER.filter(t => !towerKnown(t)).length;
      webNote(max ? `<b>${used}/${max}</b> tower slots used. Towers stand on top of <b>built ramparts</b>, two sections apart; they are free, are rebuilt after a wave if they fall, and can be moved between waves (select one → Demolish).${locked ? ` ${locked} more tower type${locked > 1 ? 's' : ''} can be unlocked on the Phylactery web.` : ''}`
        : `No tower slots yet. Unlock <b>Ramparts</b>, then <b>Spire Foundations</b>, on the Phylactery web (The Fortress).`);
    } else if (this.tab === 'fort') {
      const wu = sitesBuilt(), wm = wallSlots(), tu = trapsPlaced(), tm = trapSlots();
      const wb = card(icon('wall', 2, 'pix'), WALL_TIERS[wallTier()].name, slots(wu, wm), `<b>Ramparts</b> — ${WALL_TIERS[wallTier()].name}<br>Walls stand on fixed sites around the gatehouse: the inner <b>Curtain</b> (3 segments) and the outer <b>Bulwark</b> (5). The web's Ramparts node grants <b>${wm}</b> segment${wm === 1 ? '' : 's'}: click a site to raise it, free of charge. A built segment carries towers. Close every segment of a wall and the crusade must breach it; leave a gap and they funnel through it.<br><span class="dim">Breaches are mended after every wave. To move a segment, select it and level it (between waves).</span>`,
        () => { if (G.build && G.build.kind === 'site') { G.build = null; sfx('click'); this.renderBuild(); } else arm({ kind: 'site', type: 'site' }); }, '', !!(G.build && G.build.kind === 'site'));
      if (!wm || !prep) wb.classList.add('poor');
      for (const f of FORT_ORDER) {
        const d = FORTS[f], avail = fortKnown(f);
        const b = card(icon(d.icon, 2, 'pix'), d.name, slots(tu, tm), `<b>${d.name}</b><br>${d.desc}${avail ? '<br><span class="dim">Hold the mouse to paint. Right-click to stop. Destroyed traps are laid again after the wave.</span>' : `<br><span class="bad">Unlock on the Phylactery web: ${META_BY_ID[d.meta].name}</span>`}`,
          () => { if (!avail) { sfx('error'); return; } arm({ kind: 'fort', type: f }); }, '', G.build && G.build.type === f);
        if (!avail) b.classList.add('locked'); else if (tu >= tm || !prep) b.classList.add('poor');
      }
      webNote(wm || tm ? `Ramparts <b>${wu}/${wm}</b> · traps <b>${tu}/${tm}</b>. Everything here is free: the Phylactery web decides how much you may place, you decide where. What stands when a wave begins is remembered for your next siege of this keep.`
        : `You have no ramparts or traps yet. They are unlocked on the Phylactery web (The Fortress): <b>Ramparts</b> grants wall segments, <b>Trapworks</b> grants trap slots.`);
    } else if (this.tab === 'army') {
      for (const u of UNIT_ORDER) {
        const n = G.units.filter((x: any) => x.type === u && !x.summon && !x.temp).length;
        if (!n && !r.unlockedUnits.includes(u)) continue;
        const d = UNITS[u], tier = r.unitTier[u] || 0;
        const b = card(unitIcon(u), d.tiers[tier].name, `×${n}`, unitTip(u), () => this.showUnitDetail(u));
        b.oncontextmenu = (ev) => { ev.preventDefault(); this.showUnitDetail(u); };
      }
      webNote('Your host is mustered on the Phylactery web: more bodies with souls, new undead types and evolutions with Life Essence. Nothing is recruited during a siege, but every undead slain in a wave rises again when the wave is repelled. Click a card for details.');
    }
  },
  refreshAffordability() { /* nothing is bought during a siege (v0.12) */ },

  // ---------------- selection info ----------------
  renderSiteInfo(s: any, P: HTMLElement) {
    const site = siteById(s.siteId); if (!site) { G.selected = null; P.classList.add('hidden'); return; }
    const t = siteTier(site), [hp, max] = siteHp(site);
    const key = s.id + ':' + t + ':' + Math.round(hp) + ':' + G.phase + ':' + sitesBuilt();
    if (this.infoKey === key && !P.classList.contains('hidden')) return;
    this.infoKey = key; P.classList.remove('hidden');
    const cur = WALL_TIERS[t], free = wallSlots() - sitesBuilt(), prep = G.phase === 'prep';
    P.innerHTML = `<span class="x" id="i-x">✕</span><div class="ihead">${icon('wall', 3, 'pix')}<div><b>${site.name}</b><div class="dim">${t ? cur.name : 'Empty site'} · ${site.cells.length} sections</div></div></div>
      ${t ? `<div class="istats"><span>Durability</span><b>${fmt(hp)}/${fmt(max)}</b>${cur.thorns ? '<span>Spurs</span><b>wound attackers</b>' : ''}</div><div class="idesc">${cur.desc} Breaches are mended after every wave.</div>` : `<div class="idesc">A surveyed wall site. Raise it to block this stretch; a built segment can carry towers. <span class="dim">Rampart segments: ${sitesBuilt()}/${wallSlots()}.</span></div>`}
      <div class="ibtns">${!t ? `<button class="btn sm ${free > 0 && prep ? '' : 'locked'}" id="i-up">Raise ${WALL_TIERS[wallTier()].name}</button>` : `<button class="btn sm red ${prep ? '' : 'locked'}" id="i-raze">Level it (frees the segment)</button>`}</div>`;
    const ub = $('#i-up'); if (ub) ub.onclick = () => { if (buildSite(site)) { saveRunSoon(); this.renderBuild(); } this.infoKey = ''; };
    const rz = $('#i-raze'); if (rz) rz.onclick = () => { if (razeSite(site)) { saveRunSoon(); this.renderBuild(); } this.infoKey = ''; };
    $('#i-x').onclick = () => { G.selected = null; P.classList.add('hidden'); };
  },
  renderInfo() {
    const s = G.selected, P = $('#infopanel');
    if (!s || s.dead) { P.classList.add('hidden'); G.selected = null; return; }
    if (s.kind === 'site') { this.renderSiteInfo(s, P); return; }
    const key = s.id + ':' + (s.tier || 0) + ':' + Math.round(s.hp) + ':' + (s.mode || '') + ':' + G.phase + ':' + (s.kills || 0) + ':' + (s.silT > 0);
    if (this.infoKey === key && !P.classList.contains('hidden')) return;
    this.infoKey = key;
    P.classList.remove('hidden');
    const prep = G.phase === 'prep';
    if (s.kind === 'tower') {
      const st = towerStats(s), d = s.def;
      P.innerHTML = `<span class="x" id="i-x">✕</span><div class="ihead">${towerIcon(s.type, s.tier, 44)}<div><b>${st.name}</b><div class="dim">${['Tier I', 'Tier II', 'Tier III — Evolved'][s.tier]} · ${s.kills} kills</div></div></div>
        <div class="istats">${d.dmg ? `<span>Damage</span><b>${fmt(st.dmg)}</b>` : ''}<span>Range</span><b>${Math.round(st.range)}</b>${d.dmg ? `<span>Attack every</span><b>${st.cd.toFixed(2)}s</b>` : ''}<span>Durability</span><b>${fmt(s.hp)}/${fmt(s.maxHp)}</b></div>
        <div class="idesc">${d.desc}${s.tier ? `<br><span class="good">${d.evo.slice(1, s.tier + 1).join(' ')}</span>` : ''}${s.silT > 0 ? '<br><span class="bad">SILENCED</span>' : ''}${s.tier < 2 ? `<br><span class="dim">Higher tiers: Tower Apotheosis on the Phylactery web.</span>` : ''}</div>
        <div class="ibtns">
          ${d.dmg && s.type !== 'abomination' ? `<button class="btn sm" id="i-mode">Target: ${s.mode}</button>` : ''}
          <button class="btn sm red ${prep ? '' : 'locked'}" id="i-sell">Demolish (frees the slot)</button>
        </div>`;
      const m = $('#i-mode'); if (m) m.onclick = () => { s.mode = s.mode === 'first' ? 'strongest' : s.mode === 'strongest' ? 'closest' : 'first'; sfx('click'); this.infoKey = ''; };
      $('#i-sell').onclick = () => { if (demolishTower(s)) { saveRunSoon(); P.classList.add('hidden'); this.renderBuild(); } };
    } else if (s.kind === 'building') {
      const d = BUILDINGS[s.type], lv = s.tier + 1;
      P.innerHTML = `<span class="x" id="i-x">✕</span><div class="ihead">${buildingIcon(s.type, s.tier, 44)}<div><b>${d.tiers[s.tier]}</b><div class="dim">${d.name} · level ${lv}/3</div></div></div>
        <div class="idesc">${d.desc}<br><span class="good">Now: ${lv} × (${d.per}).</span><br><span class="dim">${lv < 3 ? 'Raise it higher on the Phylactery web (The Necropolis).' : 'Fully built.'}</span></div>`;
    } else if (s.kind === 'fort') {
      const d = s.def;
      P.innerHTML = `<span class="x" id="i-x">✕</span><div class="ihead">${icon(d.icon, 3, 'pix')}<div><b>${d.name}</b></div></div>
        <div class="idesc">${d.desc}</div>${d.hp ? `<div class="istats"><span>Durability</span><b>${fmt(s.hp)}/${fmt(s.maxHp)}</b></div>` : ''}
        <div class="ibtns"><button class="btn sm red ${prep ? '' : 'locked'}" id="i-sell">Remove (frees the slot)</button></div>`;
      $('#i-sell').onclick = () => { if (removeTrap(s)) { saveRunSoon(); this.renderBuild(); } };
    } else if (s.kind === 'unit') {
      const nm = s.summon ? SUMMONS[s.type].name : UNITS[s.type].tiers[s.tier || 0].name;
      P.innerHTML = `<span class="x" id="i-x">✕</span><div class="ihead">${spriteIcon(s.spr, 0, 44)}<div><b>${nm}</b><div class="dim">${s.temp ? (s.summon ? 'Summoned' : 'Raised') + ` · ${Math.ceil(s.temp)}s left` : s.summon ? 'Summoned · until it falls' : 'Of your host'}</div></div></div>
        <div class="istats"><span>Health</span><b>${fmt(s.hp)}/${fmt(s.maxHp)}</b><span>Damage</span><b>${fmt(s.dmg)}</b><span>Orders</span><b>${s.retreat ? 'mending at keep' : s.plan ? 'engaging' : 'holding its post'}</b></div>${s.summon ? '' : '<button class="btn small" id="i-det">Unit details</button>'}`;
      const db = $('#i-det'); if (db) db.onclick = () => this.showUnitDetail(s.type);
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

  /** Active roguelite modifiers under the top bar: the crusade being fought (or picked last),
   *  soul tithes, curses on the crusade and war buffs, each with its remaining waves. */
  renderMods() {
    const r = G.run, ro = rogue(r), chips: string[] = [];
    const tier = CRUSADE_TIERS[(G.phase === 'wave' && G.wave ? G.wave.tier : ro.lastTier) ?? 1];
    const tcol = ['#8fb4c8', '#d8cfb4', '#ff8a5a'][CRUSADE_TIERS.indexOf(tier)];
    const tierTip = `${tier.desc}<br>Soldiers ×${tier.count}${tier.hp !== 1 ? ` · health ×${tier.hp}` : ''} · souls and Life Essence ×${tier.reward}`;
    chips.push(`<span class="mchip" style="--mc:${tcol}" data-tipx="${esc(tierTip)}">${icon('rally')} ${G.phase === 'wave' ? tier.name : 'Last: ' + tier.name}</span>`);
    const w = (n: number) => `<em>${n} wave${n > 1 ? 's' : ''}</em>`;
    for (const t of ro.tithes) chips.push(`<span class="mchip good" data-tipx="Enslaved villagers: souls trickle in during waves.">${SOUL()} tithe ${w(t.waves)}</span>`);
    for (const c of ro.curses) {
      const parts = [c.count < 1 ? `${Math.round((1 - c.count) * 100)}% smaller` : '', c.hp < 1 ? `${Math.round((1 - c.hp) * 100)}% less health` : ''].filter(Boolean).join(', ');
      chips.push(`<span class="mchip good" data-tipx="A curse on the crusade: ${parts}.">${icon('skull')} Crusade ${parts} ${w(c.waves)}</span>`);
    }
    for (const b of ro.buffs) chips.push(`<span class="mchip good" data-tipx="War drums: all damage of your host and towers.">${icon('frenzy')} +${Math.round(b.dmg * 100)}% damage ${w(b.waves)}</span>`);
    const html = chips.join('');
    const el = $('#mods');
    if (el.dataset.k !== html) {
      el.dataset.k = html; el.innerHTML = html;
      el.querySelectorAll('[data-tipx]').forEach((c: HTMLElement) => { c.onmouseenter = () => this.showTip(c, c.dataset.tipx); c.onmouseleave = () => this.hideTip(); });
    }
  },
  /** Floating "+N" next to the souls / Life Essence counters for every gain (merged over 0.35 s). */
  trackGains() {
    const r = G.run, g = this.gains || (this.gains = { souls: r.souls, ess: r.essence, accS: 0, accM: 0, t: 0 });
    if (r.souls > g.souls) g.accS += r.souls - g.souls;
    if (r.essence > g.ess) g.accM += r.essence - g.ess;
    g.souls = r.souls; g.ess = r.essence;
    const now = performance.now();
    if (now - g.t < 350) return;
    g.t = now;
    const pop = (sel: string, txt: string, cls: string, bigger: boolean) => {
      const host = $(sel); const f = h('span', 'gain ' + cls + (bigger ? ' big' : ''), '+' + txt);
      host.appendChild(f); setTimeout(() => f.remove(), 1300);
    };
    if (g.accS >= 1) { pop('#s-souls', big(Math.round(g.accS)), 'gs', g.accS >= r.souls * 0.1); g.accS = 0; }
    if (g.accM >= 0.05) { pop('#s-ess', fmtE(g.accM), 'gm', true); g.accM = 0; }
  },
  /** End-of-wave summary: spoils, losses, and damage / kills per unit type, tower and spell. */
  showWaveSummary() {
    const S = G.waveSummary; if (!S) return;
    G.waveSummary = null;
    if (!G.settings.waveReport) return;
    const nameOf = (s: any) => s.kind === 'unit' ? (UNITS[s.type] ? UNITS[s.type].tiers[G.run.unitTier[s.type] || 0].name : SUMMONS[s.type] ? SUMMONS[s.type].name : s.type)
      : s.kind === 'tower' ? TOWERS[s.type].name : s.key === 'x:lich' ? 'The Lich' : 'Spells, curses & hazards';
    const iconOf = (s: any) => s.spr && SHEETS[s.spr] ? spriteIcon(s.spr, s.kind === 'tower' ? (s.tier || 0) * 4 : 0, 30) : s.key === 'x:lich' ? spriteIcon('lich', 0, 30) : icon('soul', 2, 'pix');
    const kicon = (k: string, n: number) => `<span class="kico" title="${esc(S.names[k] || k)}">${SHEETS[k] ? spriteIcon(k, 0, 22) : icon('skull')}<i>×${n}</i></span>`;
    const top = S.src.slice(0, 14), maxD = Math.max(1, ...top.map((s: any) => s.dmg));
    const rows = top.map((s: any) => `<tr><td class="ri">${iconOf(s)}</td><td class="rn">${nameOf(s)}</td>
      <td class="rd"><div class="dbar"><i style="width:${(s.dmg / maxD) * 100}%"></i></div>${fmt(Math.round(s.dmg))}</td>
      <td class="rk">${Object.entries(s.kills).sort((a: any, b: any) => b[1] - a[1]).map(([k, n]: any) => kicon(k, n)).join('') || '<span class="dim">—</span>'}</td></tr>`).join('');
    const fallen = Object.entries(S.fallen).sort((a: any, b: any) => b[1].n - a[1].n);
    const fallenN = fallen.reduce((a: number, [, f]: any) => a + f.n, 0);
    const m = this.openModal(`<h2>${icon('skull', 2, 'pix')} Wave ${S.n} Repelled</h2>
      <div class="center dim">${S.tier} · ${S.theme}${S.boss ? ` · <b class="bad">${S.boss}</b> destroyed` : ''}</div>
      <div class="wsum">
        <div><b>${SOUL()} +${big(S.souls + S.bonus)}</b><small>souls this wave<br>(wave bonus ${big(S.bonus)})</small></div>
        <div><b>${ESS()} +${fmtE(S.essence)}</b><small>Life Essence</small></div>
        <div><b>${icon('skull')} ${S.kills}</b><small>crusaders slain</small></div>
        <div><b>${icon('rally')} ${fallenN}</b><small>undead fell${S.revived ? `<br>${S.revived} rise again` : ''}</small></div>
        <div><b>${icon('keep')} ${S.keepLost ? '−' + fmt(S.keepLost) : 'unharmed'}</b><small>keep${S.rebuilt ? `<br>${S.rebuilt} tower${S.rebuilt > 1 ? 's' : ''} rebuilt` : ''}</small></div>
      </div>
      <table class="wtable"><thead><tr><th></th><th>Source</th><th>Damage</th><th>Kills</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="dim center">No damage dealt.</td></tr>'}</tbody></table>
      ${fallen.length ? `<div class="wfallen"><b>Fallen:</b> ${fallen.map(([k, f]: any) => `<span class="kico" title="${esc(UNITS[f.type] ? UNITS[f.type].tiers[0].name : SUMMONS[f.type] ? SUMMONS[f.type].name : f.type)}">${SHEETS[k] ? spriteIcon(k, 0, 22) : ''}<i>×${f.n}</i></span>`).join('')}</div>` : ''}
      <div class="wfoot"><label><input type="checkbox" id="ws-show" ${G.settings.waveReport ? 'checked' : ''}> Show after every wave</label><button class="btn" id="ws-ok">Continue</button></div>`, 'wavesum');
    ($('#ws-show') as HTMLInputElement).onchange = (e: any) => { G.settings.waveReport = e.target.checked; saveMetaSoon(); };
    $('#ws-ok').onclick = () => this.closeModal();
  },

  /** Before every wave: choose which crusade marches (smaller / baseline / larger, each with its own theme). */
  showCrusade() {
    if (!G.run || G.phase !== 'prep' || G.modal) return;
    const r = G.run, off = crusadeOffer(), ro = rogue();
    if (off.n >= WAVES_PER_KEEP) { this.pickCrusade(1); return; } // the boss marches at full strength: nothing to choose
    const colors = ['#8fb4c8', '#d8cfb4', '#ff8a5a'];
    const curse = ro.curses.length ? `<div class="center good">The crusade is weakened: ${ro.curses.map((c: any) => [c.count < 1 ? `${Math.round((1 - c.count) * 100)}% smaller` : '', c.hp < 1 ? `${Math.round((1 - c.hp) * 100)}% less health` : ''].filter(Boolean).join(', ') + ` (${c.waves} wave${c.waves > 1 ? 's' : ''})`).join(' · ')}</div>` : '';
    const m = this.openModal(`<h2>${icon('rally', 2, 'pix')} Wave ${off.n}: Which Crusade Marches?</h2>
      <div class="center dim">Scouts report three hosts gathering in the east. Choose the one you will face — the greater the host, the greater the spoils.</div>${curse}
      <div class="cards">${off.waves.map((W: any, i: number) => {
        const t = CRUSADE_TIERS[i], counts: Record<string, number> = {};
        for (const s of W.spawns) if (s.type) counts[s.type] = (counts[s.type] || 0) + 1;
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
        const rew = `${SOUL()} souls ×${t.reward}<br>${ESS()} +${fmtE(waveEssence(off.n) * essenceMult() * t.reward)} Life Essence`;
        return `<div class="card crusade" data-i="${i}" style="--rc:${colors[i]}"><div class="rar">${i === 1 ? 'Baseline' : i === 0 ? 'Fewer · leaner spoils' : 'More · richer spoils'}</div>
          <div class="cname">${t.name}</div><div class="cdesc">${t.desc}</div>
          <div class="cstat"><b>${W.total}</b> soldiers${t.hp !== 1 ? ` · <b>+${Math.round((t.hp - 1) * 100)}%</b> health` : ''}<br><span class="dim">${W.theme.name}</span>${W.boss ? `<br><b class="bad">Boss: ${W.boss.name}</b>` : ''}</div>
          <div class="cfoes">${top.map(([k, c]) => `<span title="${ENEMIES[k].name}">${spriteIcon(k, 0, 34)}<i>${c}</i></span>`).join('')}</div>
          <div class="crew">${rew}</div><div class="key">${i + 1}</div></div>`;
      }).join('')}</div>`, 'levelup crusadem');
    m.querySelectorAll('.card.crusade').forEach((el: HTMLElement) => el.onclick = () => this.pickCrusade(+el.dataset.i));
  },
  pickCrusade(i: number) {
    if (!G.run || G.phase !== 'prep') return;
    this.closeModal();
    startWave(i); this.renderBuild(); sfx('click');
  },
  /** Every few waves: a story event with three choices; the result is shown before play resumes. */
  showEvent() {
    const ev = pendingEvent(); if (!ev || G.modal) return;
    const cost = (c: any) => { const k = choiceCost(c); return k.souls ? `${big(k.souls)} souls of your haul (you hold ${big(G.run.souls)})` : ''; };
    const m = this.openModal(`${eventArt(ev.id)}<h2>${icon(ev.icon, 2, 'pix')} ${ev.title}</h2><div class="evtext">${ev.text}</div>
      <div class="evchoices">${ev.choices.map((c, i) => { const ok = canChoose(c), k = cost(c);
        return `<button class="evchoice${ok ? '' : ' locked'}" data-i="${i}"${ok ? '' : ' disabled'}><span class="key">${i < 9 ? i + 1 : ''}</span><b>${c.label}</b><small>${k ? `<span class="evcost">Costs ${k}.</span> ` : ''}${c.hint}</small></button>`; }).join('')}</div>`, 'eventm', false);
    m.querySelectorAll('.evchoice').forEach((el: HTMLElement) => el.onclick = () => this.pickEvent(+el.dataset.i));
  },
  pickEvent(i: number) {
    const ev = pendingEvent(); if (!ev || !ev.choices[i] || !canChoose(ev.choices[i])) { sfx('error'); return; }
    const text = resolveEvent(i);
    this.closeModal();
    const m = this.openModal(`${eventArt(ev.id)}<h2>${icon(ev.icon, 2, 'pix')} ${ev.title}</h2><div class="evtext"><b>${ev.choices[i].label}.</b> ${text}</div>
      <div class="center"><button class="btn" id="ev-ok">Continue</button></div>`, 'eventm');
    $('#ev-ok').onclick = () => this.closeModal();
    this.renderBuild(); saveRunSoon();
  },

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

  /** Full unit sheet: role, host totals, specials, evolutions, comparison bars. */
  showUnitDetail(type: string, back?: () => void) {
    const m = this.openModal(unitDetailHtml(type) + `<div class="center"><button class="btn" id="ud-back">${back ? '← Back' : 'Close'}</button></div>`, 'unitdetail');
    $('#ud-back').onclick = () => { if (back) back(); else this.closeModal(); };
    return m;
  },

  showPause() {
    if (G.phase === 'menu') return;
    this.openModal(`<h2>Paused</h2><div class="col">
      <button class="btn" id="p-res">Resume</button><button class="btn" id="p-codex">Codex</button><button class="btn" id="p-set">Settings</button>
      <button class="btn" id="p-help">How to play</button><button class="btn" id="p-menu">Save & leave (resume later)</button>
      <button class="btn red" id="p-abandon">End the siege: carry ${SOUL()} ${big(G.run.souls)} and ${ESS()} ${fmtE(G.run.essence)} to the Phylactery</button></div>`, 'pause');
    $('#p-res').onclick = () => this.closeModal();
    $('#p-codex').onclick = () => { this.closeModal(); this.showCodex(true); };
    $('#p-set').onclick = () => { this.closeModal(); this.showSettings(true); };
    $('#p-help').onclick = () => { this.closeModal(); this.showHelp(true); };
    $('#p-menu').onclick = () => { saveRun(); this.closeModal(); toMenu(); };
    $('#p-abandon').onclick = () => { const b = $('#p-abandon'); if (b.dataset.sure) { this.closeModal(); retreat(); } else { b.dataset.sure = '1'; b.textContent = 'Click again to confirm'; } };
  },

  // ---------------- full screens ----------------
  screen(html: string, cls = '') { const s = $('#screen'); s.className = cls; s.innerHTML = html; this.hideTip(); document.body.classList.add('modal-open'); return s; },
  closeScreen() { $('#screen').className = 'hidden'; $('#screen').innerHTML = ''; if (!G.modal) document.body.classList.remove('modal-open'); },
  screenOpen() { return !$('#screen').classList.contains('hidden'); },

  /** Home: the keeps, the purse and the way into the Phylactery web. */
  showMenu() {
    G.phase = 'menu';
    document.body.classList.add('menu');
    const has = hasRunSave(), cleared = G.meta.keepsCleared || 0;
    const s = this.screen(`<div class="title small"><div class="t1">LICH</div><div class="t2">Eternal Dominion</div></div>
      <div class="center">${purse()}</div>
      <div class="menu col">
        ${has ? '<button class="btn big green" id="m-cont">Continue the Siege</button>' : ''}
        <button class="btn big ${has ? '' : 'green'}" id="m-meta">${ESS()} The Phylactery <small>spend what your sieges gathered</small></button>
      </div>
      <h3 class="center keepsh">Besiege a keep <span class="dim">— ${WAVES_PER_KEEP} waves each; the last is its boss</span></h3>
      <div class="keeps">${KEEPS.map((k, i) => {
        const f = FORTRESSES[k.fort], open = keepUnlocked(i), done = i < cleared, best = G.meta.best[k.id] || 0, boss = BOSSES.find(b => b.id === k.boss);
        return `<button class="keepc ${open ? '' : 'locked'} ${done ? 'done' : ''}" data-k="${i}" style="--fc:${f.accent}"><div class="fsw">${f.ground.map((c: string) => `<i style="background:${c}"></i>`).join('')}<i style="background:${f.accent}"></i></div>
          <b>${i + 1}. ${k.name}</b><div class="kboss">${open ? boss.name : '???'}</div><div class="kdesc">${open ? f.desc : `Conquer ${KEEPS[i - 1].name} first.`}</div>
          <div class="kfoot">${done ? '<span class="good">Conquered</span>' : open ? `<span class="gold">${DIV()} 1 Stolen Divinity</span>` : '<span class="dim">Locked</span>'}${open ? `<span class="dim">best: wave ${best}/${WAVES_PER_KEEP}</span>` : ''}</div></button>`;
      }).join('')}</div>
      <div class="menu row"><button class="btn" id="m-codex">Codex & Achievements</button><button class="btn" id="m-help">How to Play</button><button class="btn" id="m-set">Settings</button></div>
      <div class="mstats">${G.stats.runs} sieges fought · ${cleared}/${KEEPS.length} keeps conquered · ${fmt(G.stats.totalKills)} mortals slain</div>`, 'menuscreen');
    if (has) $('#m-cont').onclick = () => { startMusic(); if (loadRun()) this.enterGame(); };
    s.querySelectorAll('.keepc').forEach((b: HTMLElement) => b.onclick = () => {
      startMusic();
      if (b.classList.contains('locked')) { sfx('error'); return; }
      if (has && !b.dataset.sure) { s.querySelectorAll('.keepc').forEach((o: HTMLElement) => delete o.dataset.sure); b.dataset.sure = '1'; $('.kfoot', b).innerHTML = '<span class="bad">Click again: the siege in progress is abandoned (its haul is lost)</span>'; return; }
      clearRunSave(); newCampaign(+b.dataset.k); this.enterGame();
    });
    $('#m-meta').onclick = () => { startMusic(); this.showMeta(); };
    $('#m-codex').onclick = () => this.showCodex();
    $('#m-set').onclick = () => this.showSettings();
    $('#m-help').onclick = () => this.showHelp();
  },
  enterGame() {
    this.closeScreen(); this.closeModal();
    document.body.classList.remove('menu');
    this.tab = wallSlots() || trapSlots() ? 'fort' : 'army'; this.collapsed = false; this.gains = null;
    this.renderBuild(); this.renderSpells();
    if (!G.stats.seenHelp) { G.stats.seenHelp = true; saveMetaSoon(); this.showHelp(true); }
  },
  /** End of a siege (defeat, retreat or conquest): what was carried to the Phylactery. */
  showDefeat(b: any) {
    this.closeModal();
    const win = b.outcome === 'victory', next = win && b.keep + 1 < KEEPS.length ? b.keep + 1 : -1;
    const head = win ? `${b.name} Is Yours` : b.outcome === 'retreat' ? 'You Withdraw Into the Dark' : 'Your Physical Form Is Destroyed';
    const lore = win ? `The champion of the crusade lies broken before your gate.${b.first ? ' You tear the spark of the divine from the corpse: <b class="gold">Stolen Divinity</b>, the rarest coin of the Phylactery.' : ' Its divinity was already yours; the souls are welcome all the same.'}${next >= 0 ? `<br>Beyond the horizon, ${KEEPS[next].name} awaits — and the crusade that guards it is far stronger.` : '<br>Heaven itself has fallen silent.'}`
      : b.outcome === 'retreat' ? `You abandon ${b.name} after ${b.wave} wave${b.wave === 1 ? '' : 's'}. Everything gathered goes with you.`
      : `The crusade storms ${b.name} on wave ${b.wave} and shatters your vessel. But the souls were already yours — and far away a phylactery begins to glow.`;
    this.screen(`<div class="defeat ${win ? 'win' : ''}"><h1>${head}</h1>
      <p class="lore">${lore}</p>
      <div class="ebox"><div><span>Mortals slain</span><b>${fmt(b.kills)}</b></div><div><span>Waves ${win ? 'repelled' : 'reached'}</span><b>${win ? WAVES_PER_KEEP : b.wave} / ${WAVES_PER_KEEP}</b></div>
        <div class="tot"><span>Souls</span><b class="cur souls">${SOUL()} +${big(b.souls)}</b></div><div class="tot"><span>Life Essence</span><b class="cur essence">${ESS()} +${big(b.essence)}</b></div>${b.divinity ? `<div class="tot"><span>Stolen Divinity</span><b class="cur divinity">${DIV()} +${b.divinity}</b></div>` : ''}</div>
      <div class="center">In the Phylactery: ${purse()}</div>
      <div class="col"><button class="btn big green" id="d-meta">Enter the Phylactery</button>${next >= 0 ? `<button class="btn big" id="d-next">Besiege ${KEEPS[next].name}</button>` : ''}<button class="btn big" id="d-again">Besiege ${b.name} again</button><button class="btn" id="d-menu">All keeps</button></div></div>`, 'defeatscreen');
    $('#d-meta').onclick = () => this.showMeta(b.keep);
    $('#d-again').onclick = () => { newCampaign(b.keep); this.enterGame(); };
    const nx = $('#d-next'); if (nx) nx.onclick = () => { newCampaign(next); this.enterGame(); };
    $('#d-menu').onclick = () => toMenu();
  },
  /** The Phylactery: a web of permanent upgrades. Drag to pan, wheel to zoom, click to buy (shift: as many
   *  as you can afford). A node appears once its parent is owned and opens at the parent's threshold. */
  showMeta(againKeep?: number) {
    if (G.run) { G.run = null; G.selected = null; G.build = null; G.bossBar = null; (window as any).__toMenu?.(); }
    G.phase = 'menu'; document.body.classList.add('menu');
    const view = this.webView || (this.webView = { x: 0, y: 0, z: 1 });
    const s = this.screen(`<div class="webhead"><h1>${ESS()} The Phylactery</h1><div id="web-purse"></div>
        <div class="webbtns">${againKeep != null ? `<button class="btn green" id="mt-go">Besiege ${KEEPS[Math.min(KEEPS.length - 1, againKeep)].name}</button>` : ''}<button class="btn" id="mt-back">Keeps</button></div></div>
      <div class="weblegend"><span class="cur souls">${SOUL()} Souls: more undead, small repeatable steps</span><span class="cur essence">${ESS()} Life Essence: unlocks, buildings, strong passives</span><span class="cur divinity">${DIV()} Stolen Divinity: the rarest rites (one per keep's boss)</span><span class="dim">click: buy · shift-click: buy all you can · drag: pan · wheel: zoom</span></div>
      <div class="web" id="web"><div class="webin" id="webin"><svg id="weblines" xmlns="http://www.w3.org/2000/svg"></svg><div id="webnodes"></div></div></div>`, 'metascreen webscreen');
    const web = $('#web'), inner = $('#webin'), nodesEl = $('#webnodes'), svg = $('#weblines');
    const apply = () => { inner.style.transform = `translate(${web.clientWidth / 2 + view.x}px, ${web.clientHeight / 2 + view.y}px) scale(${view.z})`; };
    const nodeIcon = (m: WebNode) => {
      if (m.unit) return spriteIcon(UNITS[m.unit].tiers[m.id.startsWith('e_') ? Math.min(2, metaLv(m.id) + (metaLv(m.id) < 2 ? 1 : 0)) : 0].spr, 0, 34);
      if (m.tower) return towerIcon(m.tower, 0, 34);
      if (m.building) return buildingIcon(m.building, Math.max(0, Math.min(2, metaLv(m.id) - 1)), 34);
      return icon(m.icon || 'skull', 2, 'pix');
    };
    const tip = (m: WebNode) => {
      const lv = metaLv(m.id), open = nodeOpen(m), cost = metaCost(m, lv), par = m.parent && META_BY_ID[m.parent];
      const kids = (CHILDREN[m.id] || []).filter(k => !nodeVisible(k) || !nodeOpen(k));
      return `<b>${m.name}</b> <span class="dim">${m.max > 1 ? `${lv}/${m.max}` : lv ? 'owned' : ''}</span><br>${lv ? (m.max > 1 ? 'Now: ' : '') + m.desc(lv) + '<br>' : ''}${lv < m.max ? (m.max > 1 || lv ? 'Next: ' : '') + m.desc(lv + 1) + '<br>' : ''}`
        + (lv < m.max ? `<span class="cur ${m.cur}">${CUR_ICON[m.cur]()} ${big(cost)} ${CUR_NAME[m.cur]}</span>${m.max > 1 && m.mult ? ` <span class="dim">(×${m.mult} per level)</span>` : ''}` : '<span class="good">Mastered</span>')
        + (!open && par ? `<br><span class="bad">Requires ${par.name} level ${m.need || 1} (now ${metaLv(par.id)})</span>` : '')
        + (lv > 0 && kids.length ? `<br><span class="dim">Leads to: ${kids.map(k => `${k.name}${(k.need || 1) > 1 ? ` (at level ${k.need})` : ''}`).join(', ')}</span>` : '');
    };
    const render = () => {
      $('#web-purse').innerHTML = purse();
      const vis = META.filter(nodeVisible);
      svg.innerHTML = vis.filter(m => m.parent).map(m => { const p = META_BY_ID[m.parent]; const own = metaLv(m.id) > 0, open = nodeOpen(m); return `<line x1="${p.x}" y1="${p.y}" x2="${m.x}" y2="${m.y}" class="${own ? 'own' : open ? 'open' : 'shut'}" style="--bc:${(META_BRANCHES.find(B => B.id === m.branch) || { color: '#888' }).color}"/>`; }).join('');
      nodesEl.innerHTML = vis.map(m => {
        const lv = metaLv(m.id), maxed = lv >= m.max, open = nodeOpen(m), can = canBuyMeta(m.id);
        const cls = m.id === 'core' ? 'core' : maxed ? 'maxed' : !open ? 'locked' : can ? 'buy' : 'poor';
        return `<button class="wnode ${cls} c-${m.cur} ${lv ? 'own' : ''}" data-id="${m.id}" style="left:${m.x}px;top:${m.y}px;--bc:${(META_BRANCHES.find(B => B.id === m.branch) || { color: '#5dff7a' }).color}"><div class="wi">${nodeIcon(m)}</div>${m.id === 'core' ? '' : `<div class="wl">${m.max > 1 ? `${lv}/${m.max}` : lv ? '✓' : ''}</div><div class="wc cur ${m.cur}">${maxed ? '' : CUR_ICON[m.cur]() + big(metaCost(m, lv))}</div>`}<div class="wn">${m.name}</div></button>`;
      }).join('');
      nodesEl.querySelectorAll('.wnode').forEach((n: HTMLElement) => {
        const m = META_BY_ID[n.dataset.id];
        n.onmouseenter = () => this.showTip(n, tip(m)); n.onmouseleave = () => this.hideTip();
        n.onclick = (ev: MouseEvent) => { if (moved) return; const got = ev.shiftKey ? buyMetaMax(m.id) : buyMeta(m.id) ? 1 : 0; if (got) { render(); const again = nodesEl.querySelector(`[data-id="${m.id}"]`) as HTMLElement; if (again) this.showTip(again, tip(m)); } else sfx('error'); };
      });
    };
    let drag: any = null, moved = false;
    web.onmousedown = (e: MouseEvent) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; moved = false; };
    web.onmousemove = (e: MouseEvent) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) moved = true; if (moved) { view.x = drag.vx + dx; view.y = drag.vy + dy; apply(); this.hideTip(); } };
    web.onmouseup = web.onmouseleave = () => { drag = null; setTimeout(() => { moved = false; }, 0); };
    web.onwheel = (e: WheelEvent) => { e.preventDefault(); const z0 = view.z, z = clamp(z0 * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.12, 1.8); const r = web.getBoundingClientRect(), cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2; view.x = cx - (cx - view.x) * z / z0; view.y = cy - (cy - view.y) * z / z0; view.z = z; apply(); };
    $('#mt-back').onclick = () => this.showMenu();
    const go = $('#mt-go'); if (go) go.onclick = () => { newCampaign(againKeep); this.enterGame(); };
    render(); apply();
  },
  showCodex(fromGame?: boolean, tab = 'enemy') {
    const C = G.stats.codex;
    const tabs = [['enemy', 'Mortals'], ['unit', 'Undead'], ['tower', 'Towers'], ['spell', 'Spells'], ['ach', 'Achievements']];
    let body = '';
    const unseen = '<div style="width:48px;height:48px;background:#1a1a1e"></div>';
    if (tab === 'enemy') {
      body = [...Object.keys(ENEMIES).map(k => [k, ENEMIES[k], false]), ...BOSSES.map(b => [b.id, b, true])].map(([k, d, boss]: any) => {
        const seen = C.enemy[k];
        return `<div class="centry ${seen ? '' : 'unseen'}">${seen ? spriteIcon(k, 0, 48) : unseen}<div><b>${seen ? d.name : '???'}</b>${boss ? ' <span class="gold">BOSS</span>' : ''}<div class="dim">${seen ? (boss ? d.title + ' · boss of ' + (KEEPS.find(k => k.boss === d.id) || KEEPS[0]).name : ({ iron: 'Iron Kingdoms', holy: 'Holy Dominion', arcane: 'Arcane Conclave', free: 'Freeborn Alliance' } as any)[d.fac]) : boss ? 'Boss of ' + (KEEPS.find(k => k.boss === d.id) || KEEPS[0]).name : 'Not yet encountered'}</div>${seen ? `<div>${d.desc || d.line}</div>` : ''}</div></div>`;
      }).join('');
    } else if (tab === 'unit') {
      body = UNIT_ORDER.map(k => { const d = UNITS[k], av = unitOwned(k); return `<div class="centry ${av ? '' : 'unseen'}">${av ? spriteIcon(d.tiers[0].spr, 0, 48) : unseen}<div><b>${av ? d.name : '???'}</b><div class="dim">${av ? d.tiers.map((t: any) => t.name).join(' → ') : 'Unlock on the Phylactery web'}</div>${av ? `<div>${d.desc}</div>` : ''}</div></div>`; }).join('')
        + Object.values(SUMMONS).map((s: any) => `<div class="centry">${spriteIcon(s.spr, 0, 48)}<div><b>${s.name}</b> <span class="gold">SUMMONING SPELL ×${s.count}</span><div>${s.desc}</div></div></div>`).join('');
    } else if (tab === 'tower') {
      body = TOWER_ORDER.map(k => { const d = TOWERS[k], av = towerKnown(k); return `<div class="centry ${av ? '' : 'unseen'}">${av ? towerIcon(k, 0, 40) + towerIcon(k, 2, 48) : unseen}<div><b>${av ? d.name : '???'}</b><div class="dim">${av ? d.tiers.map((t: any) => t.name).join(' → ') : 'Unlock on the Phylactery web'}</div>${av ? `<div>${d.desc}</div>` : ''}</div></div>`; }).join('');
    } else if (tab === 'spell') {
      body = SPELL_ORDER.map(k => { const s = SPELLS[k]; return `<div class="centry">${icon(s.icon, 3, 'pix')}<div><b>${s.name}</b><div>${s.desc}</div><div class="dim">Cooldown ${s.cd}s${BASE_SPELLS.includes(k) ? ' · Known from the start' : metaLv('sp_' + k) ? ' · Learned' : ' · Learn it on the Phylactery web'}</div></div></div>`; }).join('');
    } else body = ACHIEVEMENTS.map(a => `<div class="centry ${G.stats.ach[a.id] ? '' : 'unseen'}">${icon(G.stats.ach[a.id] ? 'level' : 'skull', 2, 'pix')}<div><b>${a.name}</b> <span class="ess">${ESS()} ${a.ess}</span><div>${a.desc}</div></div></div>`).join('');
    const s = this.screen(`<h1>The Codex</h1><div class="ctabs">${tabs.map(([k, n]) => `<button class="btn sm ${k === tab ? 'on' : ''}" data-t="${k}">${n}</button>`).join('')}</div><div class="codex">${body}</div><div class="center"><button class="btn" id="c-back">Back</button></div>`, 'codexscreen');
    s.querySelectorAll('.ctabs button').forEach((b: HTMLElement) => b.onclick = () => this.showCodex(fromGame, b.dataset.t));
    $('#c-back').onclick = () => (fromGame ? this.closeScreen() : this.showMenu());
  },
  showHelp(fromGame?: boolean) {
    this.screen(`<h1>How to Rule Eternally</h1><div class="help">
      <p><b>The loop.</b> Besiege a keep, fall, grow, return. Each keep is <b>${WAVES_PER_KEEP} waves</b>; the last is its boss. Nothing is bought during a siege — your host, buildings, spells and defences all come from the <b>Phylactery web</b> between sieges. Whatever a siege gathers reaches the Phylactery whether you win or lose. Expect to fall many times before the first keep is yours.</p>
      <p><b>Three currencies.</b> ${SOUL()} <b>Souls</b> come from every kill and buy the small, repeatable things: more undead of each type, damage, health, keep and wall strength. ${ESS()} <b>Life Essence</b> comes from waves repelled (much more from bosses) and buys unlocks: new undead, evolutions, towers, spells, Necropolis buildings and strong passives. ${DIV()} <b>Stolen Divinity</b> is taken from a keep's boss the <b>first</b> time it falls — one per keep — and buys the mightiest rites.</p>
      <p><b>The web.</b> A node appears when its parent is owned and opens when the parent reaches a threshold (hover to see it). Prices grow with every level; so will your income — each keep is many times harder than the last and pays many times more.</p>
      <p><b>Defences.</b> The web grants <b>slots</b>: rampart segments, towers (on top of built ramparts) and traps. Between waves you place them where you like, for free; towers and walls are restored after every wave, and your layout is remembered for the next siege of that keep.</p>
      <p><b>The host.</b> Your undead fight on their own: they hold a line before the gate, rush to wherever mortals press hardest, ranged troops stay behind the melee. Every undead slain during a wave rises again when the wave is repelled.</p>
      <p><b>During a siege.</b> Kills give experience; each level offers three upgrades for this siege (the web adds stronger cards to the deck). Before each wave you choose the crusade — Skirmish, Crusade or Holy War: more soldiers, more souls and Life Essence. Story events between waves offer boons, gambles and bargains.</p>
      <p><b>Spells.</b> Keys 1–9; they cost only their cooldown. Some need a target area. New spells and summonings are learned on the web.</p>
      <p><b>Controls.</b> Drag with right/middle mouse or use WASD/arrows to pan. Wheel zooms. Space pauses, F cycles speed, Enter begins the wave, B hides the drawer, Esc closes windows.</p>
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
      <div class="an-row">Run analytics: <span class="num" id="st-an-n">${anCount()}</span> runs recorded
        <button class="btn sm" id="st-an-exp">Export JSON</button><button class="btn sm red" id="st-an-clr">Clear</button></div>
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
    $('#st-an-exp').onclick = () => {
      if (G.run && G.run.an && G.phase !== 'menu') persist(); // include the run in progress
      const blob = new Blob([JSON.stringify(anExport(), null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `lich-analytics-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    };
    $('#st-an-clr').onclick = () => { const b = $('#st-an-clr'); if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Sure?'; return; } anClear(); $('#st-an-n').textContent = '0'; b.textContent = 'Cleared'; };
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
      if (G.modal === 'levelup crusadem' && ['1', '2', '3'].includes(e.key)) { this.pickCrusade(+e.key - 1); return; }
      if (G.modal === 'eventm' && pendingEvent() && ['1', '2', '3'].includes(e.key)) { this.pickEvent(+e.key - 1); return; }
      if (e.key === 'Escape') {
        if (G.modal && G.modal !== 'levelup') this.closeModal();
        else if (this.screenOpen() && G.phase !== 'over') this.closeScreen();
        else if (G.build || G.selected) { G.build = null; G.selected = null; this.renderBuild(); }
        else if (!G.modal) this.showPause();
        return;
      }
      if (G.modal || G.phase === 'over' || this.screenOpen()) return;
      if (e.key === ' ') { e.preventDefault(); G.paused = !G.paused; this.updateSpeed(); }
      const k = e.key.toLowerCase();
      if (k === 'f') { G.speed = G.speed >= 4 ? 1 : G.speed * 2; G.paused = false; this.updateSpeed(); }
      if (k === 'b') { this.collapsed = !this.collapsed; this.renderBuild(); }
      if (e.key === 'Enter' && G.phase === 'prep' && !G.modal) this.showCrusade();
      if (/^[1-9]$/.test(e.key)) { const id = G.run.spells[+e.key - 1]; if (id) this.trySpell(id); }
    });
    window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  },
};

import { DIALOGUE } from '../data/meta';
const DIALOGUE_REF = DIALOGUE;

function evoText(t: any) { const p: string[] = []; if (t.hp) p.push(`HP ×${t.hp}`); if (t.dmg) p.push(`Damage ×${t.dmg}`); if (t.armor) p.push(`+${Math.round(t.armor * 100)}% armor`); if (t.range) p.push(`Range ×${t.range}`); if (t.spd) p.push(`Speed ×${t.spd}`); return p.join(' · '); }
function towerTip(type: string) {
  const d = TOWERS[type], t = towerTier();
  return `<b>${d.tiers[t].name}</b>${t ? ` <span class="dim">(${d.name}, tier ${['I', 'II', 'III'][t]})</span>` : ''}<br>${d.desc}${t ? `<br><span class="good">${d.evo.slice(1, t + 1).join(' ')}</span>` : ''}<br><span class="dim">${d.dmg ? `Base damage ${d.dmg} · ` : ''}Range ${d.range}${d.dmg ? ` · every ${d.cd}s` : ''} · ${d.dtype}</span><br><span class="dim">Free: uses one tower slot. Stands on a built rampart section; rebuilt after the wave if it falls.</span>`;
}
// ---------------- unit information (tooltips, details, comparisons) ----------------
function unitNow(type: string) {
  const d = UNITS[type];
  const u: any = { type, def: d, st: {} }; applyUnitStats(u);
  return u;
}
function unitRole(type: string) {
  const d = UNITS[type], tags: string[] = [];
  if (d.taunt) tags.push('Tank');
  else if (d.raiser) tags.push('Support caster');
  else if (d.ranged) tags.push(d.splash ? 'Ranged · area damage' : 'Ranged');
  else if (d.hunter) tags.push('Hunter');
  else tags.push(d.size >= 3 ? 'Heavy front-line' : 'Front-line');
  if (d.flying) tags.push('Flying');
  return tags.join(' · ');
}
function unitSpecials(type: string) {
  const d = UNITS[type], out: string[] = [];
  if (d.lifesteal) out.push(`Heals ${Math.round(d.lifesteal * 100)}% of damage dealt`);
  if (d.drain) out.push(`Drains life (${Math.round(d.drain * 100)}%)`);
  if (d.splash) out.push(`Hits groups (${d.splash}px blast)`);
  if (d.cleave) out.push(`Cleaves crowds (${d.cleave}px)`);
  if (d.slow) out.push(`Slows by ${Math.round(d.slow * 100)}%`);
  if (d.pierce) out.push(`Ignores ${Math.round(d.pierce * 100)}% of armor`);
  if (d.antiCav) out.push(`${Math.round(d.antiCav * 100)}% damage to cavalry`);
  if (d.raiser) out.push(`Raises a corpse as a skeleton every ${d.raiser}s`);
  if (d.taunt) out.push('Draws enemy attacks onto itself');
  if (d.hunter) out.push('Hunts archers, casters and healers first');
  if (d.aura) out.push(`Necrotic aura (${d.aura}px)`);
  if (d.flying) out.push('Flies over walls');
  if (d.dtype && d.dtype !== 'phys') out.push(`${d.dtype === 'necro' ? 'Necrotic' : d.dtype} damage`);
  return out;
}
let ROSTER_MAX: any = null;
function rosterMax() {
  if (ROSTER_MAX) return ROSTER_MAX;
  const m = { hp: 1, dps: 1, range: 1, spd: 1 };
  for (const k of UNIT_ORDER) { const d = UNITS[k]; m.hp = Math.max(m.hp, d.hp); m.dps = Math.max(m.dps, (d.dmg / d.cd) * (d.splash || d.cleave ? 1.6 : 1)); m.range = Math.max(m.range, d.range); m.spd = Math.max(m.spd, d.spd); }
  return (ROSTER_MAX = m);
}
/** Comparison bars against the whole roster (base stats), so units can be weighed at a glance. */
function statBars(type: string, compact = false) {
  const d = UNITS[type], mx = rosterMax();
  const rows: [string, number, string][] = [
    ['Toughness', d.hp * (1 + (d.armor || 0)) / (mx.hp * 1.2), fmt(d.hp)],
    ['Damage', (d.dmg / d.cd) * (d.splash || d.cleave ? 1.6 : 1) / mx.dps, (d.dmg / d.cd).toFixed(1) + '/s'],
    ['Reach', d.range / mx.range, d.ranged ? String(d.range) : 'melee'],
    ['Speed', d.spd / mx.spd, String(d.spd)],
  ];
  return rows.map(([n, v, t]) => `<div class="sbar"><span>${n}</span><i><b style="width:${Math.round(Math.max(0.04, Math.min(1, v)) * 100)}%"></b></i>${compact ? '' : `<em>${t}</em>`}</div>`).join('');
}
function hostCount(type: string) { return G.run ? G.units.filter((x: any) => x.type === type && !x.summon && !x.temp).length : musterCount(type); }
function unitTip(type: string) {
  const d = UNITS[type], t = G.run.unitTier[type] || 0, u = unitNow(type), n = hostCount(type);
  return `<b>${d.tiers[t].name}</b> <span class="dim">${unitRole(type)}</span><br>${d.desc}
    <div class="tipbars">${statBars(type, true)}</div>
    <span class="dim"><b>${n}</b> in the host · total HP ${fmt(u.maxHp * n)} · total damage ${fmt((u.dmg / u.cd) * n)}/s</span>
    ${unitSpecials(type).length ? `<br><span class="good">${unitSpecials(type).slice(0, 3).join(' · ')}</span>` : ''}
    <br><span class="dim">Click for full details.</span>`;
}
function unitDetailHtml(type: string) {
  const d = UNITS[type], r = G.run, t = r.unitTier[type] || 0, u = unitNow(type), n = hostCount(type);
  const dps = u.dmg / u.cd, sDps = dps * n, sHp = u.maxHp * n;
  const spdWord = u.spd >= 55 ? 'very fast' : u.spd >= 40 ? 'fast' : u.spd >= 28 ? 'average' : 'slow';
  const evo = d.tiers.map((tt: any, i: number) => `<span class="${i === t ? 'good' : i < t ? 'dim' : ''}">${tt.name}${i > 0 ? ` <span class="dim">(${evoText(tt)})</span>` : ''}</span>`).join(' → ');
  return `<div class="udetail"><div class="udart">${spriteIcon(d.tiers[t].spr, 0, 128)}</div><div class="udinfo">
    <h2>${d.tiers[t].name}</h2><div class="urole">${unitRole(type)}</div>
    <p>${d.desc}</p>
    <div class="ustat">${statBars(type)}</div>
    <div class="istats ud-grid">
      <span>In the host</span><b>${n}</b>
      <span>Health (each)</span><b>${fmt(u.maxHp)}</b>
      <span>Damage (each)</span><b>${fmt(u.dmg)} every ${u.cd.toFixed(1)}s</b>
      <span>Armor</span><b>${Math.round(u.armor * 100)}%</b>
      <span>Range</span><b>${d.ranged ? Math.round(u.range) + ' px' : 'melee'}</b>
      <span>Speed</span><b>${Math.round(u.spd)} (${spdWord})</b>
      <span>Host health</span><b>${fmt(sHp)}</b>
      <span>Host damage</span><b>${fmt(sDps)}/s</b>
      <span>Reinforcement squad</span><b>${squadSize(type)} <span class="dim">(cards, events)</span></b>
    </div>
    ${unitSpecials(type).length ? `<h3>Abilities</h3><ul>${unitSpecials(type).map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
    <h3>Evolutions <span class="dim">(Phylactery web)</span></h3><div class="evopath">${evo}</div>
    <div class="dim">Your undead pick their own fights; ${d.ranged ? 'ranged troops stay behind the front line.' : d.hunter ? 'hunters slip past the line toward enemy archers and priests.' : 'melee troops hold the front and rush to wherever the crusade presses hardest.'}</div>
  </div></div>`;
}
/** Scene art banner for a story event (assets/ui/events/<id>.png, listed in data/event_art.ts). */
function eventArt(id: string) { return EVENT_ART.includes(id) ? `<div class="evart"><img src="ui/events/${id}.png" alt=""></div>` : ''; }
export function toMenu() {
  UI.closeModal();
  G.phase = 'menu'; G.run = null; G.selected = null; G.build = null; G.bossBar = null;
  hooks.refreshBuild();
  (window as any).__toMenu?.();
  UI.showMenu();
}
