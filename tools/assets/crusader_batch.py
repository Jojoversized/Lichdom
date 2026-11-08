#!/usr/bin/env python3
"""One-off batch for the v0.10 crusader AI art (Dreamina, 2026-11-08).

For every asset: copy the Dreamina original + Remove-BG cutout into
art_source/dreamina/<dir>/, write meta.json, strip the painted ground shadow
(strip_shadow.py) and import the sheet (import_ai_sprite.py) as a runtime
override of the procedural sprite. Kept in the repo as the record of how the
enemy sheets were made; rerun with --only <key> to redo one asset.
"""
import argparse, json, os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DL = os.environ.get('LICH_DL', '/mnt/user-data/uploads/Downloads')

PRE_UNIT = ("Make a character sprite for my game in this image's exact art style: high resolution shaded pixel art, "
            "gritty, dark and desaturated, muted colors, same lighting and same top-down three-quarter camera angle and "
            "same character scale as the reference. It is an enemy of the undead lich's army: a soldier of the holy human "
            "crusade, a direct foil to the undead. Worn, battle-scarred ivory and tarnished gold, weathered steel, "
            "off-white cloth stained with mud and soot, deep crimson trim, and soft warm holy-light glows (pale candle "
            "gold) where the undead have necrotic green; still muted and gritty enough to sit on the same dark battlefield. ")
PRE_BOSS = PRE_UNIT.replace('a soldier of the holy', 'a champion of the holy')
PRE_ARCANE = PRE_BOSS.replace('soft warm holy-light glows (pale candle gold)', 'soft arcane violet and pale gold glows')
SUF = ("It is the ONLY character, standing alone in an open, empty patch of the dark battlefield ground with nothing "
       "touching or overlapping it, fully visible with clear space around it. Not a cartoon, not bright, no saturated colors.")
SUF_GROUP = ("They are the ONLY figures, standing together in an open, empty patch of the dark battlefield ground with "
             "nothing touching or overlapping it, fully visible with clear space around it. Not a cartoon, not bright, "
             "no saturated colors.")

# key: (dir, cutout #, original id, sprite override, category, H, flying, keep_dist, prefix, description, suffix)
ASSETS = {
  'b_champion': ('boss_divine_champion_v1', 18, '1574', 'b_champion', 'bosses', 46, False, 60, PRE_BOSS,
    "The character is the Divine Champion, the final boss: a colossal armored demigod warrior in battle-worn white and gold "
    "plate with a sun-crested great helm, burning pale gold eyes behind the visor, two wings of pale golden light flaring "
    "from the back, wielding a huge holy greatsword wreathed in soft golden flame and a tall tower shield bearing a sun "
    "emblem. Full body, in a powerful striding stance, facing right. ", SUF),
  'b_kings': ('boss_united_kings_v1', 22, '6259', 'b_kings', 'bosses', 42, False, 120, PRE_BOSS,
    "The subject is the United Kings, a boss: three crowned armored kings marching shoulder to shoulder as one tight group, "
    "the central king a giant in gold-trimmed plate with a great crown, a heavy royal mantle and a warhammer, flanked by two "
    "smaller crowned kings, one carrying a royal banner and one a lance, each in different heraldic tabards. Full bodies, "
    "marching, facing right. ", SUF_GROUP),
  'b_inquisitor': ('boss_grand_inquisitor_v1', 21, '6999', 'b_inquisitor', 'bosses', 40, False, 40, PRE_BOSS,
    "The character is the Grand Inquisitor, a boss: a towering, imposing elderly zealot with a stern scarred face, heavy "
    "crimson and ivory robes over gilded plate, a tall hooded mitre, a long iron staff topped with a burning golden "
    "sunburst brazier, chains with wax holy seals and scrolls hanging from the belt. Full body, standing tall and raising "
    "the staff, facing right. ", SUF),
  'b_archmage': ('boss_archmage_v1', 23, '8773', 'b_archmage', 'bosses', 40, False, 140, PRE_ARCANE,
    "The character is the Archmage of the Last Covenant, a boss: an ancient long-bearded archmage of the human mage "
    "conclave in layered midnight-blue and violet robes embroidered with silver and gold runes, a tall pointed hood, three "
    "heavy runic tomes floating around him, a gnarled staff crowned with a glowing violet arcane crystal. Full body, "
    "standing and casting, facing right. ", SUF),
  'b_dragonslayer': ('boss_dragonslayer_v1', 19, '4032', 'b_dragonslayer', 'bosses', 42, False, 40, PRE_BOSS,
    "The character is the Dragon-Slayer, a boss: a hulking, grizzled veteran hero of the free companies in mismatched heavy "
    "plate and leather, a cloak of dull red dragon scales, a horned helm shaped like a dragon's head, wielding an enormous "
    "notched two-handed greatsword. Full body, in a wide battle stance with the greatsword ready, facing right. ", SUF),
  'b_saint': ('boss_saint_v1', 20, '2310', 'b_saint', 'bosses', 40, True, 60, PRE_BOSS,
    "The character is the Saint of Eternal Dawn, a boss: a serene female saint hovering above the ground with six large "
    "feathered ivory and pale gold wings, long flowing ivory and gold vestments, a thin golden halo of soft light behind "
    "her head, holding a small glowing sun orb in her raised hand. Full body, hovering in the air above her own faint "
    "shadow, facing right. ", SUF),
  'paladin': ('crusader_paladin_v1', 16, '5487', 'paladin', 'enemies', 26, False, 40, PRE_UNIT,
    "The character is a Paladin: a holy knight in heavy battle-worn ivory and gold plate with a crimson tabard bearing a "
    "gold sun, a great helm whose narrow visor glows faint gold, a heavy flanged mace and a kite shield with a sun emblem. "
    "Full body, advancing with the shield raised, facing right. ", SUF),
  'inquisitor': ('crusader_inquisitor_v1', 17, '3255', 'inquisitor', 'enemies', 25, False, 40, PRE_UNIT,
    "The character is an Inquisitor: a lean hooded witch-hunter in a wide-brimmed black hat with a crimson band, a long "
    "ivory coat over a leather cuirass, wax holy seals on the shoulders, a chained holy book at the belt, conjuring a small "
    "flame of pale golden holy fire in one raised hand. Full body, casting, facing right. ", SUF),
  'angel': ('crusader_angel_v1', 15, '9901', 'angel', 'enemies', 26, True, 40, PRE_UNIT,
    "The character is an Angel of the Host: a winged warrior angel with large ivory and pale gold feathered wings, a plain "
    "gold helm hiding the face, ivory robes over light gold mail, holding a spear of pale golden light. Full body, hovering "
    "above the ground over its own faint shadow, facing right. ", SUF),
  'griffon': ('crusader_griffon_v1', 14, '9931', 'griffon', 'enemies', 30, True, 40, PRE_UNIT,
    "The character is a Griffon Knight: an armored knight in ivory and gold plate riding a large brown and white griffon "
    "with spread feathered wings, holding a long lance with a crimson pennant. Full body of rider and griffon, flying low "
    "above the ground over their faint shadow, facing right. ", SUF),
  'construct': ('crusader_construct_v1', 13, '1524', 'construct', 'enemies', 34, False, 40, PRE_UNIT,
    "The character is an Arcane Construct of the human mage conclave: a massive bulky war-golem of dark runed iron and "
    "tarnished bronze plates, faint violet arcane runes glowing on its chest and joints, huge heavy fists, a small head with "
    "a single glowing violet eye. Full body, lumbering forward, facing right. ", SUF),
  'knight': ('crusader_knight_v1', 12, '5944', 'knight', 'enemies', 25, False, 40, PRE_UNIT,
    "The character is a Knight of the Realm: a heavily armored knight in full steel plate with gold trim, a crimson and "
    "ivory surcoat with a heraldic lion, a closed helm with a small crimson plume, a longsword and a heater shield. Full "
    "body, advancing, facing right. ", SUF),
  'cavalry': ('crusader_cavalry_v1', 11, '7110', 'cavalry', 'enemies', 32, False, 40, PRE_UNIT,
    "The character is Heavy Cavalry: an armored lancer in steel plate on a large barded warhorse wearing ivory and crimson "
    "caparisons, the lance lowered. Full body of rider and horse, charging, facing right. ", SUF),
}


# shadow regrowth per asset (strip_shadow --grow; 0 = unbounded, needed where dark armour touches the shadow)
GROW = {'b_dragonslayer': 0, 'b_kings': 0}


def find_original(oid):
    for f in os.listdir(DL):
        if f.startswith('dreamina-2026-11-08-%s-' % oid):
            return os.path.join(DL, f)
    raise FileNotFoundError(oid)


def run(cmd):
    print('$', ' '.join(cmd))
    subprocess.run(cmd, check=True, cwd=ROOT)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', nargs='*')
    ap.add_argument('--no-copy', action='store_true', help='reuse files already in art_source')
    a = ap.parse_args()
    for key, (d, cut, oid, ovr, cat, H, fly, kd, pre, desc, suf) in ASSETS.items():
        if a.only and key not in a.only:
            continue
        out = os.path.join(ROOT, 'art_source', 'dreamina', d)
        os.makedirs(out, exist_ok=True)
        if not a.no_copy:
            shutil.copy(os.path.join(DL, 'Untitled media_Cutout (%d).png' % cut), os.path.join(out, 'cutout.png'))
            shutil.copy(find_original(oid), os.path.join(out, 'original.jpeg'))
        ai_key = 'ai_' + d[:-3]
        meta = {
            'asset': ai_key,
            'used_as': '%s/%s override' % (cat, ovr),
            'tool': 'Dreamina (dreamina.capcut.com) - AI Image',
            'model': 'Seedream 4.6',
            'settings': {'ratio': '1:1', 'resolution': '2K', 'images_per_run': 4},
            'reference': 'original Lichdom style reference image (Undead lich army pixel art session)',
            'postprocess': ('Dreamina canvas Remove BG (2 credits) -> tools/assets/strip_shadow.py --keep-dist %d --grow %d -> '
                            'tools/assets/import_ai_sprite.py --H %d --res 4 --category %s --override %s%s'
                            % (kd, GROW.get(key, 10), H, cat, ovr, ' --flying' if fly else '')),
            'credits_spent': {'generation_4_images': 8, 'remove_bg': 2},
            'date': '2026-11-08',
            'prompt': pre + desc + suf,
        }
        with open(os.path.join(out, 'meta.json'), 'w') as f:
            json.dump(meta, f, indent=1)
        ns = os.path.join(out, 'cutout_noshadow.png')
        grow = GROW.get(key, 10)
        run([sys.executable, 'tools/assets/strip_shadow.py', os.path.join(out, 'cutout.png'), ns, '--keep-dist', str(kd),
             '--grow', str(grow)])
        cmd = [sys.executable, 'tools/assets/import_ai_sprite.py', ns, ai_key, '--H', str(H), '--category', cat,
               '--override', ovr, '--name', desc.split(':')[0].replace('The character is ', '').replace('The subject is ', ''),
               '--preview', '/tmp/prev_%s.png' % key]
        if fly:
            cmd.append('--flying')
        run(cmd)


if __name__ == '__main__':
    main()
