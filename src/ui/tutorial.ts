// First-run onboarding: a welcome card over the menu and a guided first siege / first visit to the Phylactery.
// One primitive: a spotlight (everything but the target is dimmed and blocked) with a speech bubble attached.
// Progress lives in G.stats.tut (saved with the meta save): welcome, hud, orb, spell, champ, gift, web, done.
import { G } from '../core/state';

type Target = string | (() => DOMRect | null) | null;
interface Spot {
  target?: Target;        // CSS selector, a function returning a screen rect, or nothing (a centred bubble)
  text: string;           // bubble body (html)
  title?: string;
  btn?: string;           // a button in the bubble that moves on
  click?: boolean;        // the player must click the target itself (the click goes through), then we move on
  pass?: boolean;         // clicks on the target go through but do not move on (use with btn)
  pad?: number;
  onNext?: () => void;
}

let root: HTMLElement, cur: Spot | null = null, raf = 0;
const el = (cls: string) => { const d = document.createElement('div'); d.className = cls; return d; };

function rectOf(t: Target): DOMRect | null {
  if (!t) return null;
  if (typeof t === 'function') return t();
  const e = document.querySelector(t) as HTMLElement;
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return r.width && r.height ? r : null;
}

function layout() {
  raf = 0;
  if (!cur) return;
  const W = window.innerWidth, H = window.innerHeight, pad = cur.pad ?? 6;
  const r0 = rectOf(cur.target || null);
  const b = root.children as any as HTMLElement[];
  const [top, left, right, bottom, hole, ring, bub] = [b[0], b[1], b[2], b[3], b[4], b[5], b[6]];
  if (r0) {
    const x0 = Math.max(0, r0.left - pad), y0 = Math.max(0, r0.top - pad), x1 = Math.min(W, r0.right + pad), y1 = Math.min(H, r0.bottom + pad);
    top.style.cssText = `left:0;top:0;width:${W}px;height:${y0}px`;
    bottom.style.cssText = `left:0;top:${y1}px;width:${W}px;height:${Math.max(0, H - y1)}px`;
    left.style.cssText = `left:0;top:${y0}px;width:${x0}px;height:${y1 - y0}px`;
    right.style.cssText = `left:${x1}px;top:${y0}px;width:${Math.max(0, W - x1)}px;height:${y1 - y0}px`;
    const box = `left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px`;
    hole.style.cssText = box + (cur.click || cur.pass ? ';display:none' : '');
    ring.style.cssText = box;
    // the bubble goes where there is room: below, above, then beside the target
    const bw = bub.offsetWidth, bh = bub.offsetHeight, g = 14;
    let bx = (x0 + x1) / 2 - bw / 2, by = y1 + g;
    if (by + bh > H - 8) by = y0 - g - bh;
    if (by < 8) { by = Math.min(Math.max(8, (y0 + y1) / 2 - bh / 2), H - bh - 8); bx = x1 + g + bw < W ? x1 + g : x0 - g - bw; }
    bub.style.left = Math.min(Math.max(8, bx), W - bw - 8) + 'px'; bub.style.top = Math.min(Math.max(8, by), H - bh - 8) + 'px';
  } else {
    top.style.cssText = `left:0;top:0;width:${W}px;height:${H}px`;
    for (const d of [left, right, bottom, hole, ring]) d.style.cssText = 'display:none';
    bub.style.left = (W - bub.offsetWidth) / 2 + 'px'; bub.style.top = (H - bub.offsetHeight) / 2 + 'px';
  }
  raf = requestAnimationFrame(layout);
}

export const Tut = {
  active: false,
  /** Automated test browsers skip the onboarding (it would block their clicks) unless the page is opened with ?tut. */
  on() { return !((navigator as any).webdriver && !location.search.includes('tut')); },
  /** The saved progress. A save from before the tutorial existed counts as finished. */
  st(): any {
    const s = G.stats;
    if (!s.tut) s.tut = !this.on() || s.seenHelp || s.runs > 0 ? { welcome: true, hud: true, orb: true, spell: true, champ: true, gift: true, web: true, done: true } : {};
    return s.tut;
  },
  /** True while the guided part is still running for this player. */
  guiding() { return this.on() && !this.st().done; },
  init() {
    root = el('hidden'); root.id = 'tut';
    for (const c of ['tb', 'tb', 'tb', 'tb', 'tb clear', 'tring', 'tbub panel']) root.appendChild(el(c));
    document.getElementById('ui').appendChild(root);
    // a click that reaches the highlighted control moves the tutorial on (after the control's own handler ran)
    document.addEventListener('click', (e) => {
      if (!cur || !cur.click || typeof cur.target !== 'string') return;
      const t = document.querySelector(cur.target);
      // close this step now (the control's own handler may open the next one), report it once that handler has run
      if (t && t.contains(e.target as Node)) { const s = cur; this.hide(); setTimeout(() => { if (s.onNext) s.onNext(); }, 0); }
    }, true);
    window.addEventListener('resize', () => { if (cur && !raf) layout(); });
  },
  spot(s: Spot) {
    cur = s; this.active = true;
    root.className = '';
    const bub = root.children[6] as HTMLElement;
    bub.innerHTML = `${s.title ? `<h3>${s.title}</h3>` : ''}<div class="tt">${s.text}</div>${s.btn ? `<div class="tn"><button class="btn green sm" id="tut-next">${s.btn}</button></div>` : s.click ? '<div class="th">click the highlighted control</div>' : ''}`;
    const n = bub.querySelector('#tut-next') as HTMLElement; if (n) n.onclick = () => this.next();
    if (raf) cancelAnimationFrame(raf);
    layout();
  },
  next() { const s = cur; if (!s) return; this.hide(); if (s.onNext) s.onNext(); },
  hide() { cur = null; this.active = false; if (raf) cancelAnimationFrame(raf); raf = 0; if (root) root.className = 'hidden'; },
  /** A chain of spots, one after the other. */
  run(steps: Spot[], done?: () => void) {
    const go = (i: number) => { if (i >= steps.length) { if (done) done(); return; } const s = steps[i], after = s.onNext; this.spot({ ...s, onNext: () => { if (after) after(); go(i + 1); } }); };
    go(0);
  },
  /** The first thing a new player sees: a card over the darkened main menu. */
  welcome(done: () => void) {
    this.active = true; cur = null;
    root.className = 'welcome';
    const b = root.children as any as HTMLElement[];
    b[0].style.cssText = 'left:0;top:0;width:100%;height:100%';
    for (let i = 1; i < 6; i++) b[i].style.cssText = 'display:none';
    const bub = b[6];
    bub.innerHTML = `<h1>Welcome to Lich - Eternal Dominion!</h1>
      <p>Thank you for checking out my first game project. In this game, you will control an immortal Lich, defending raised &amp; enslaved kingdoms using various incremental and rogue-lite upgrades against waves of incoming crusaders. These holy warriors bound together into one super-army from every surviving civilization across the world just to end your terror... and the worst part? The Orb of Revealing Battles (the O.R.B) has revealed their ultimate plan: they've been constructing data centers with your land.</p>
      <div class="tn"><button class="btn big green" id="tut-next">I'll end this.</button></div>`;
    bub.style.left = bub.style.top = '';
    (bub.querySelector('#tut-next') as HTMLElement).onclick = () => { this.hide(); done(); };
  },
};
