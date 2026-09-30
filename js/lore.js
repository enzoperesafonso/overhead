// Southern African star lore: names and stories from indigenous sky traditions.
//
// Compiled from published ethnoastronomy, chiefly:
//   ASSA, "African Ethnoastronomy": https://assa.saao.ac.za/astronomy-in-south-africa/ethnoastronomy/
//   Royal Museums Greenwich, "South African star myths": https://www.rmg.co.uk/stories/space-astronomy/south-african-star-myths
// Names, spellings and meanings vary between communities and over time; this is a small,
// respectful sample rather than a definitive catalogue. Corrections are welcome.
//
// Entry fields
//   t        tradition: 'san' | 'khoikhoi' | 'nguni' | 'sotho' (Sotho, Tswana and Venda)
//   target   what it labels; the first entry per target wins when "all" is selected
//   name     the local name;  meaning  its translation (may be empty);  who  the people
//   groups   lists of catalogue star names joined with dotted lines (one name = ringed star)
//   dso      a Messier object instead of stars;  milky  place the label along the Milky Way

export const LORE_TRADITIONS = [
  ['all', 'All traditions'],
  ['san', 'San (/Xam, !Kung and others)'],
  ['khoikhoi', 'Khoikhoi (Nama)'],
  ['nguni', 'Xhosa, Zulu and Swazi'],
  ['sotho', 'Sotho, Tswana and Venda'],
];

const CRUX = [['Gacrux', 'Acrux'], ['Mimosa', 'Imai']];
const BELT = [['Alnitak', 'Alnilam', 'Mintaka']];
const POINTERS = [['Hadar', 'Rigil Kentaurus']];

export const LORE = [
  // ---- San
  { t: 'san', target: 'milkyway', milky: true, name: "Stars' Road", meaning: 'the Backbone of Night', who: 'San' },
  { t: 'san', target: 'pointers', name: 'The Male Lions', meaning: '', who: '/Xam', groups: POINTERS },
  { t: 'san', target: 'crux', name: 'The Female Lions', meaning: '', who: '/Xam', groups: [['Gacrux', 'Acrux', 'Mimosa']] },
  { t: 'san', target: 'canopus', name: 'The Ant Egg Star', meaning: '', who: '/Xam', groups: [['Canopus']] },
  { t: 'san', target: 'sirius', name: 'The Grandmother of Canopus', meaning: '', who: '/Xam', groups: [['Sirius']] },
  { t: 'san', target: 'aldebaran', name: 'The Male Hartebeest', meaning: '', who: '/Xam', groups: [['Aldebaran']] },
  { t: 'san', target: 'procyon', name: 'The Male Eland', meaning: '', who: '/Xam', groups: [['Procyon']] },
  { t: 'san', target: 'gemini', name: 'The Female Elands', meaning: '', who: '/Xam', groups: [['Castor', 'Pollux']] },
  { t: 'san', target: 'belt', name: 'The Three Zebras', meaning: '', who: 'Nyae Nyae !Kung', groups: BELT },
  { t: 'san', target: 'antares', name: 'The Fire-Finishing Star', meaning: '', who: '!Xu', groups: [['Antares']] },
  { t: 'san', target: 'arcturus', name: "The Fire-Finishers' Child", meaning: '', who: 'Bushmen', groups: [['Arcturus']] },
  { t: 'san', target: 'vega', name: 'The Male Steenbok', meaning: '', who: '/Gwi', groups: [['Vega']] },
  { t: 'san', target: 'altair', name: 'The Female Steenbok', meaning: '', who: '/Gwi', groups: [['Altair']] },
  { t: 'san', target: 'spica', name: 'The Pig Star', meaning: '', who: '//Gana', groups: [['Spica']] },
  { t: 'san', target: 'capella', name: 'Green Leaf Horn', meaning: '', who: 'Nyae Nyae !Kung', groups: [['Capella']] },

  // ---- Khoikhoi
  { t: 'khoikhoi', target: 'pleiades', name: 'Khunuseti', meaning: 'stars of spring', who: 'Namaqua Khoikhoi', dso: 'M45' },
  { t: 'khoikhoi', target: 'pointers', name: 'Mura', meaning: 'the eyes', who: 'Khoikhoi', groups: POINTERS },
  { t: 'khoikhoi', target: 'belt', name: 'The Three Zebras', meaning: '', who: 'Namaqua Khoikhoi', groups: BELT },
  { t: 'khoikhoi', target: 'aldebaran', name: 'The Hunter', meaning: 'who shot at the zebras', who: 'Namaqua Khoikhoi', groups: [['Aldebaran']] },
  { t: 'khoikhoi', target: 'sword', name: 'The Arrow', meaning: 'that missed', who: 'Namaqua Khoikhoi', dso: 'M42' },

  // ---- Xhosa, Zulu, Swazi
  { t: 'nguni', target: 'pleiades', name: 'isiLimela', meaning: 'the digging stars', who: 'Xhosa, Zulu', dso: 'M45' },
  { t: 'nguni', target: 'sirius', name: 'iQhawe', meaning: 'the champion', who: 'Xhosa', groups: [['Sirius']] },
  { t: 'nguni', target: 'canopus', name: 'inKhwenkwezi', meaning: 'the brilliant star', who: 'Zulu', groups: [['Canopus']] },
  { t: 'nguni', target: 'sword', name: 'oNdwenjana', meaning: '', who: 'Zulu', dso: 'M42' },
  { t: 'nguni', target: 'capella', name: 'iNtshola', meaning: 'the cattle thief', who: 'Zulu', groups: [['Capella']] },
  { t: 'nguni', target: 'spica', name: 'iNqonqoli', meaning: 'the wildebeest star', who: 'Zulu', groups: [['Spica']] },
  { t: 'nguni', target: 'arcturus', name: 'Lweti', meaning: '', who: 'Swazi', groups: [['Arcturus']] },

  // ---- Sotho, Tswana, Venda
  { t: 'sotho', target: 'crux', name: 'Dithutlwa', meaning: 'the giraffes', who: 'Sotho, Tswana, Venda', groups: [...CRUX, ...POINTERS] },
  { t: 'sotho', target: 'achernar', name: 'Senakane', meaning: 'the little horn', who: 'Sotho, Tswana', groups: [['Achernar']] },
  { t: 'sotho', target: 'canopus', name: 'Naka', meaning: 'the horn star', who: 'Sotho, Tswana, Venda', groups: [['Canopus']] },
  { t: 'sotho', target: 'sirius', name: 'Kgogamashego', meaning: 'drawer up of the night', who: 'Sotho', groups: [['Sirius']] },
  { t: 'sotho', target: 'belt', name: 'Makolobe', meaning: 'the three pigs', who: 'Sotho', groups: BELT },
  { t: 'sotho', target: 'sword', name: 'Dintshwa', meaning: 'the dogs', who: 'Sotho', dso: 'M42' },
  { t: 'sotho', target: 'pleiades', name: 'Selemela', meaning: 'the digging stars', who: 'Sotho, Tswana', dso: 'M45' },
  { t: 'sotho', target: 'fomalhaut', name: 'Ntshuna', meaning: 'the kiss-me star', who: 'Tswana', groups: [['Fomalhaut']] },
  { t: 'sotho', target: 'milkyway', milky: true, name: 'Molalatladi', meaning: 'where lightning rests', who: 'Sotho, Tswana' },
];

/** Entries for a tradition (or all, one label per target), with star vectors resolved. */
export function loreFor(tradition, data) {
  if (!data._loreIndex) {
    const idx = new Map();
    for (const n of data.names) idx.set(n.name, n.vec);
    for (const o of data.dsos) idx.set(o.name, o.vec);
    data._loreIndex = idx;
  }
  const seen = new Set();
  const out = [];
  for (const e of LORE) {
    if (tradition !== 'all' && e.t !== tradition) continue;
    if (seen.has(e.target)) continue;
    const groups = e.dso ? [[data._loreIndex.get(e.dso)]] : (e.groups || []).map((g) => g.map((n) => data._loreIndex.get(n)));
    if (!e.milky && groups.flat().some((v) => !v)) continue; // a star missing from the catalogue
    seen.add(e.target);
    out.push({ ...e, groups });
  }
  return out;
}
