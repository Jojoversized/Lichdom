// Decoupling hooks: the simulation calls these; UI/audio modules install
// the real implementations at boot. Keeps systems free of DOM/Phaser imports.
export const hooks = {
  msg: (_text: string, _color?: string) => { },
  say: (_category: string) => { },
  sfx: (_name: string, _vol?: number) => { },
  achievement: (_a: any) => { },
  defeat: (_breakdown: any) => { },
  refreshBuild: () => { },
};
export const msg = (t: string, c?: string) => hooks.msg(t, c);
export const lichSay = (c: string) => hooks.say(c);
export const sfx = (n: string, v = 1) => hooks.sfx(n, v);
