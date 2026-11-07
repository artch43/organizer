// Pixel-art icons, drawn by hand as rows of letters (one letter = one pixel, "." = empty).
// Each letter is a color of the palette below. Keep rows the same width; short drawings are
// centered vertically on their grid.

/** Colors of the list icons (the brand palette plus a few tones so objects read at a glance). */
export const PIXEL_PALETTE: Record<string, string> = {
  k: "#1E2330", // outline
  w: "#FFFFFF",
  g: "#C6FF3D", // lime
  G: "#7FAE1C",
  p: "#FF5FA2", // pink
  P: "#C21A6B",
  b: "#4F7BFF", // blue
  B: "#0B1D51", // deep blue
  s: "#8FA9FF",
  y: "#FFD166", // yellow
  Y: "#E0A100",
  o: "#FF9F43", // orange
  r: "#E5484D", // red
  R: "#A12B2F",
  n: "#B07A4B", // wood
  N: "#7A4E2B",
  a: "#B4BCC8", // gray
  A: "#5F6B7E",
};

export type PixelCategory = "tarefas" | "trabalho" | "estudos" | "casa" | "saude";
export const PIXEL_CATEGORIES: { id: PixelCategory; name: string }[] = [
  { id: "tarefas", name: "Tarefas" },
  { id: "trabalho", name: "Trabalho" },
  { id: "estudos", name: "Estudos" },
  { id: "casa", name: "Casa" },
  { id: "saude", name: "Saúde" },
];

export interface PixelIconDef {
  label: string;
  category: PixelCategory;
  rows: string[];
}

/** The size of a list icon's grid. */
export const PIXEL_GRID = 12;

export const PIXEL_ICONS: Record<string, PixelIconDef> = {
  /* ---------- Tarefas ---------- */
  checklist: {
    label: "Checklist",
    category: "tarefas",
    rows: [
      ".kkkkkkkkkk.",
      ".kwwwwwwwwk.",
      ".kgwkkkkkwk.",
      ".kwwwwwwwwk.",
      ".kgwkkkkkwk.",
      ".kwwwwwwwwk.",
      ".kawaaaaawk.",
      ".kwwwwwwwwk.",
      ".kawaaaawwk.",
      ".kwwwwwwwwk.",
      ".kkkkkkkkkk.",
    ],
  },
  prancheta: {
    label: "Prancheta",
    category: "tarefas",
    rows: [
      "....kkkk....",
      ".kkkkaakkkk.",
      ".knnkkkknnk.",
      ".knwwwwwwnk.",
      ".knwkkkkwnk.",
      ".knwwwwwwnk.",
      ".knwkkkwwnk.",
      ".knwwwwwwnk.",
      ".knwkkkkwnk.",
      ".knwwwwwwnk.",
      ".knnnnnnnnk.",
      ".kkkkkkkkkk.",
    ],
  },
  alvo: {
    label: "Alvo",
    category: "tarefas",
    rows: [
      "...kkkkkk...",
      "..krrrrrrk..",
      ".krrwwwwrrk.",
      "krrwwrrwwrrk",
      "krwwrrrrwwrk",
      "krwrrkkrrwrk",
      "krwrrkkrrwrk",
      "krwwrrrrwwrk",
      "krrwwrrwwrrk",
      ".krrwwwwrrk.",
      "..krrrrrrk..",
      "...kkkkkk...",
    ],
  },
  bandeira: {
    label: "Bandeira",
    category: "tarefas",
    rows: [
      ".k..........",
      ".kkkkkkkkkk.",
      ".kggggggggk.",
      ".kgGggggggk.",
      ".kggggggggk.",
      ".kgggggkkk..",
      ".kkkkkk.....",
      ".k..........",
      ".k..........",
      ".k..........",
      "kkk.........",
    ],
  },
  despertador: {
    label: "Despertador",
    category: "tarefas",
    rows: [
      ".kk......kk.",
      "krrk....krrk",
      "krkkkkkkkkrk",
      ".kkwwwwwwkk.",
      ".kwwwwkwwwk.",
      "kwwwwwkwwwwk",
      "kwwwwwkkkwwk",
      "kwwwwwwwwwwk",
      ".kwwwwwwwwk.",
      ".kkwwwwwwkk.",
      "..kkkkkkkk..",
      ".kk......kk.",
    ],
  },
  ampulheta: {
    label: "Ampulheta",
    category: "tarefas",
    rows: [
      "kkkkkkkkkkkk",
      "knnnnnnnnnnk",
      "kkkkkkkkkkkk",
      ".kwyyyyyywk.",
      "..kwyyyywk..",
      "...kwyywk...",
      "...kwwywk...",
      "..kwwwywwk..",
      ".kwwyyyyywk.",
      "kkkkkkkkkkkk",
      "knnnnnnnnnnk",
      "kkkkkkkkkkkk",
    ],
  },
  entrada: {
    label: "Caixa de entrada",
    category: "tarefas",
    rows: [
      ".....bb.....",
      ".....bb.....",
      "...bbbbbb...",
      "....bbbb....",
      ".....bb.....",
      "............",
      "kkkk....kkkk",
      "kssk....kssk",
      "kssskkkksssk",
      "kssssssssssk",
      "kssssssssssk",
      "kkkkkkkkkkkk",
    ],
  },
  estrela: {
    label: "Estrela",
    category: "tarefas",
    rows: [
      ".....kk.....",
      "....kyyk....",
      "....kyyk....",
      "kkkkkyykkkkk",
      "kyyyyyyyyyyk",
      ".kyyyyyyyyk.",
      "..kyyyyyyk..",
      "..kyyyyyyk..",
      ".kyyykkyyyk.",
      ".kyyk..kyyk.",
      "kyk......kyk",
      "kk........kk",
    ],
  },

  /* ---------- Trabalho ---------- */
  maleta: {
    label: "Maleta",
    category: "trabalho",
    rows: [
      "....kkkk....",
      "...k....k...",
      "kkkkkkkkkkkk",
      "knnnnnnnnnnk",
      "knnnnnnnnnnk",
      "kNNNNyyNNNNk",
      "knnnnyynnnnk",
      "knnnnnnnnnnk",
      "knnnnnnnnnnk",
      "kkkkkkkkkkkk",
    ],
  },
  notebook: {
    label: "Notebook",
    category: "trabalho",
    rows: [
      ".kkkkkkkkkk.",
      ".kbbbbbbbbk.",
      ".kbsbbbbbbk.",
      ".kbbsbbbbbk.",
      ".kbbbbbbbbk.",
      ".kbbbbbbbbk.",
      ".kkkkkkkkkk.",
      "kaaaaaaaaaak",
      "kAAAAkkAAAAk",
      "kkkkkkkkkkkk",
    ],
  },
  grafico: {
    label: "Gráfico",
    category: "trabalho",
    rows: [
      "........kkk.",
      "........kgk.",
      "....kkk.kgk.",
      "....kpk.kgk.",
      "....kpk.kgk.",
      "kkk.kpk.kgk.",
      "kbk.kpk.kgk.",
      "kbk.kpk.kgk.",
      "kbk.kpk.kgk.",
      "kkkkkkkkkkkk",
    ],
  },
  reuniao: {
    label: "Reunião",
    category: "trabalho",
    rows: [
      "kkkkkkkk....",
      "kwwwwwwk....",
      "kwkkkkwk....",
      "kwwwwwwk....",
      "kkwkkkkkkkkk",
      "kk.kpppppppk",
      "k..kpkkkkkpk",
      "...kpppppppk",
      "...kpkkkkppk",
      "...kpppppppk",
      "...kkkkkkpkk",
      ".........kk.",
    ],
  },
  email: {
    label: "E-mail",
    category: "trabalho",
    rows: [
      "kkkkkkkkkkkk",
      "kkwwwwwwwwkk",
      "kwkwwwwwwkwk",
      "kwwkwwwwkwwk",
      "kwwwkkkkwwwk",
      "kwwwwwwwwwwk",
      "kwwwwwwwwwwk",
      "kkkkkkkkkkkk",
    ],
  },
  cafe: {
    label: "Café",
    category: "trabalho",
    rows: [
      "...a..a.....",
      "..a..a......",
      "...a..a.....",
      "kkkkkkkkk...",
      "kNNNNNNNkkk.",
      "kwwwwwwwk.k.",
      "kwwpwwwwk.k.",
      "kwwwwwwwkkk.",
      "kwwwwwwwk...",
      ".kwwwwwk....",
      "..kkkkk.....",
    ],
  },
  cracha: {
    label: "Crachá",
    category: "trabalho",
    rows: [
      "....kkkk....",
      "....kbbk....",
      "..kkkkkkkk..",
      "..kwwwwwwk..",
      "..kwkkkkwk..",
      "..kwkyykwk..",
      "..kwkyykwk..",
      "..kwkkkkwk..",
      "..kwwwwwwk..",
      "..kwaaaawk..",
      "..kwwwwwwk..",
      "..kkkkkkkk..",
    ],
  },
  arquivo: {
    label: "Pasta de arquivo",
    category: "trabalho",
    rows: [
      "kkkkk.......",
      "kbbbbk......",
      "kbbbbkkkkkkk",
      "kbwwwwwwwwbk",
      "kkkkkkkkkkkk",
      "kssssssssssk",
      "kssssssssssk",
      "kssssssssssk",
      "kssssssssssk",
      "kkkkkkkkkkkk",
    ],
  },

  /* ---------- Estudos ---------- */
  livro: {
    label: "Livro aberto",
    category: "estudos",
    rows: [
      "kkkkk..kkkkk",
      "kwwwwkkwwwwk",
      "kwkkwkkwkkwk",
      "kwwwwkkwwwwk",
      "kwkkwkkwkkwk",
      "kwwwwkkwwwwk",
      "kwkkwkkwkkwk",
      "kwwwwkkwwwwk",
      "kkkkkppkkkkk",
      ".....pp.....",
    ],
  },
  lapis: {
    label: "Lápis",
    category: "estudos",
    rows: [
      ".........kk.",
      "........kppk",
      ".......kaapk",
      "......kyyak.",
      ".....kyyyk..",
      "....kyyyk...",
      "...kyyyk....",
      "..kYyyk.....",
      ".knYyk......",
      "knnk........",
      "kkk.........",
    ],
  },
  capelo: {
    label: "Formatura",
    category: "estudos",
    rows: [
      ".....kk.....",
      "...kkBBkk...",
      ".kkBBBBBBkk.",
      "kBBBBBBBBBBk",
      ".kkBBBBBBkky",
      "...kkBBkk.ky",
      "..kBkkkkBk.y",
      "..kBBBBBBk.y",
      "...kkkkkk.yy",
    ],
  },
  mochila: {
    label: "Mochila",
    category: "estudos",
    rows: [
      "....kkkk....",
      "...k....k...",
      ".kkkkkkkkkk.",
      ".kppppppppk.",
      ".kppppppppk.",
      ".kpkkkkkkpk.",
      ".kpkPPPPkpk.",
      ".kpkPyPPkpk.",
      ".kpkkkkkkpk.",
      ".kppppppppk.",
      ".kkkkkkkkkk.",
      "..kk....kk..",
    ],
  },
  calculadora: {
    label: "Calculadora",
    category: "estudos",
    rows: [
      ".kkkkkkkkkk.",
      ".kAAAAAAAAk.",
      ".kAggggggAk.",
      ".kAggggggAk.",
      ".kAAAAAAAAk.",
      ".kAwAwAwApk.",
      ".kAAAAAAAAk.",
      ".kAwAwAwApk.",
      ".kAAAAAAAAk.",
      ".kAwAwAwAgk.",
      ".kAAAAAAAAk.",
      ".kkkkkkkkkk.",
    ],
  },
  globo: {
    label: "Globo",
    category: "estudos",
    rows: [
      "...kkkkkk...",
      "..kbbggbbk..",
      ".kbgggbbbbk.",
      "kbbggggbbbbk",
      "kbbbgggbbggk",
      "kbbbbggbgggk",
      "kbbbbbbbgggk",
      "kbggbbbbbggk",
      ".kgggbbbbbk.",
      "..kggbbbbk..",
      "...kkkkkk...",
      "....kkkk....",
    ],
  },
  regua: {
    label: "Régua",
    category: "estudos",
    rows: ["kkkkkkkkkkkk", "kykykykykyyk", "kyyyyyyyyyyk", "kYYYYYYYYYYk", "kkkkkkkkkkkk"],
  },
  caderno: {
    label: "Caderno",
    category: "estudos",
    rows: [
      ".kkkkkkkkkk.",
      "kkggggggggk.",
      ".kgwwwwwwgk.",
      "kkgwkkkkwgk.",
      ".kgwwwwwwgk.",
      "kkggggggggk.",
      ".kggggggggk.",
      "kkggggggggk.",
      ".kggggggggk.",
      "kkggggggggk.",
      ".kGGGGGGGGk.",
      ".kkkkkkkkkk.",
    ],
  },

  /* ---------- Casa ---------- */
  casa: {
    label: "Casa",
    category: "casa",
    rows: [
      ".....kk.....",
      "....krrk....",
      "...krrrrk...",
      "..krrrrrrk..",
      ".krrrrrrrrk.",
      "kkkkkkkkkkkk",
      ".kwwwwwwwwk.",
      ".kwbbwwkkwk.",
      ".kwbbwwknwk.",
      ".kwwwwwknwk.",
      ".kwwwwwknwk.",
      ".kkkkkkkkkk.",
    ],
  },
  mercado: {
    label: "Mercado",
    category: "casa",
    rows: [
      "k...........",
      "kk..........",
      ".kkkkkkkkkkk",
      ".kgwgwgwgwk.",
      ".kwgwgwgwgk.",
      "..kgwgwgwk..",
      "..kkkkkkkk..",
      "..k.........",
      "..kkkkkkkk..",
      "...kk..kk...",
      "...kk..kk...",
    ],
  },
  panela: {
    label: "Cozinha",
    category: "casa",
    rows: [
      "...a...a....",
      "....a...a...",
      ".....kk.....",
      "..kkkkkkkk..",
      "kkkrrrrrrkkk",
      "k.krrrrrrk.k",
      "kkkrrrrrrkkk",
      "..krrrrrrk..",
      "..kRRRRRRk..",
      "...kkkkkk...",
    ],
  },
  vassoura: {
    label: "Limpeza",
    category: "casa",
    rows: [
      "..........kk",
      ".........knk",
      "........knk.",
      ".......knk..",
      "......knk...",
      ".....knk....",
      "...kkkkk....",
      "..kyyyyk....",
      ".kyyyyyk....",
      "kyYyYyk.....",
      "kyYyYk......",
      "kkkkk.......",
    ],
  },
  planta: {
    label: "Planta",
    category: "casa",
    rows: [
      "..kk....kk..",
      ".kggk..kggk.",
      ".kgGgkkgGgk.",
      "..kggGGggk..",
      "...kkGGkk...",
      ".....GG.....",
      ".kkkkkkkkkk.",
      ".kooooooook.",
      "..kooooook..",
      "..kooooook..",
      "...kooook...",
      "...kkkkkk...",
    ],
  },
  chave: {
    label: "Chave",
    category: "casa",
    rows: [".kkkk.......", "kyyyyk......", "kykkykkkkkkk", "kykkyyyyyyyk", "kyyyykkkykyk", ".kkkk..kkkkk"],
  },
  sofa: {
    label: "Sofá",
    category: "casa",
    rows: [
      ".kkkkkkkkkk.",
      ".kbbbbbbbbk.",
      ".kbbbbbbbbk.",
      "kkkkkkkkkkkk",
      "kbksssssskbk",
      "kbksssssskbk",
      "kbkkkkkkkkbk",
      "kbbbbbbbbbbk",
      "kkkkkkkkkkkk",
      ".k........k.",
    ],
  },
  lampada: {
    label: "Ideia",
    category: "casa",
    rows: [
      "....kkkk....",
      "...kyyyyk...",
      "..kyywyyyk..",
      "..kywyyyyk..",
      "..kyyyyyyk..",
      "..kyyyyyyk..",
      "...kyyyyk...",
      "....kyyk....",
      "....kkkk....",
      "....kaak....",
      "....kkkk....",
      ".....kk.....",
    ],
  },

  /* ---------- Saúde ---------- */
  coracao: {
    label: "Coração",
    category: "saude",
    rows: [
      "..kk....kk..",
      ".kppk..kppk.",
      "kpwppkkppppk",
      "kppppppppppk",
      "kppppppppppk",
      ".kppppppppk.",
      "..kppppppk..",
      "...kppppk...",
      "....kppk....",
      ".....kk.....",
    ],
  },
  maca: {
    label: "Alimentação",
    category: "saude",
    rows: [
      "......k.kkk.",
      "......kkggk.",
      "..kkk.kkkk..",
      ".krrrkkrrrk.",
      "krwrrrrrrrrk",
      "krwrrrrrrrrk",
      "krrrrrrrrrrk",
      "krrrrrrrrrRk",
      ".krrrrrrrRk.",
      ".krrrrrrRRk.",
      "..krRkkRRk..",
      "...kk..kk...",
    ],
  },
  haltere: {
    label: "Academia",
    category: "saude",
    rows: [".kk......kk.", "kbbk....kbbk", "kbbkkkkkkbbk", "kbbaaaaaabbk", "kbbkkkkkkbbk", "kbbk....kbbk", ".kk......kk."],
  },
  remedio: {
    label: "Remédio",
    category: "saude",
    rows: ["..kkkkkkkk..", ".kppppkwwwk.", "kpwppkwwwwwk", "kppppkwwwwwk", ".kppPkwwwak.", "..kkkkkkkk.."],
  },
  agua: {
    label: "Água",
    category: "saude",
    rows: [
      ".kkkkkkkkkk.",
      ".kwwwwwwwwk.",
      ".kwwwwwwwwk.",
      ".kbbbbbbbbk.",
      ".kbsbbbbbbk.",
      "..kbsbbbbk..",
      "..kbbbbbbk..",
      "..kbbbbbbk..",
      "...kbbbbk...",
      "...kkkkkk...",
    ],
  },
  tenis: {
    label: "Corrida",
    category: "saude",
    rows: ["..kkkk......", ".kppppk.....", ".kpwwpkk....", ".kppppppkk..", ".kpppppppppk", "kwwwwwwwwwwk", "kkkkkkkkkkkk"],
  },
  sono: {
    label: "Sono",
    category: "saude",
    rows: [
      ".......BBBB.",
      ".........B..",
      "........B...",
      "..kkkk.BBBB.",
      ".kyyk.......",
      "kyyk........",
      "kyyk........",
      "kyyyk.....k.",
      ".kyyykkkkyk.",
      "..kyyyyyyk..",
      "...kkkkkk...",
    ],
  },
  pulso: {
    label: "Saúde",
    category: "saude",
    rows: [
      "kkkkkkkkkkkk",
      "kBBBBBBBBBBk",
      "kBBBBgBBBBBk",
      "kBBBgBgBBBBk",
      "kgggBBBgBggk",
      "kBBBBBBBgBBk",
      "kBBBBBBBBBBk",
      "kkkkkkkkkkkk",
    ],
  },
};

/** A drawing's rows, centered vertically on a grid `size` tall. */
export function centered(rows: string[], size = PIXEL_GRID) {
  const top = Math.floor((size - rows.length) / 2);
  const blank = ".".repeat(rows[0]?.length ?? size);
  return [...Array(top).fill(blank), ...rows, ...Array(Math.max(0, size - rows.length - top)).fill(blank)];
}

/** Rows of letters → runs `[x, y, width, color]`, merging neighbors of the same color on a row. */
export function toRuns(rows: string[], palette: Record<string, string>): [number, number, number, string][] {
  const out: [number, number, number, string][] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || !palette[ch]) {
        x++;
        continue;
      }
      let w = 1;
      while (row[x + w] === ch) w++;
      out.push([x, y, w, palette[ch]]);
      x += w;
    }
  });
  return out;
}

/* ---------- The "create" buttons in Listas: a folder and a list, each with a "+" ---------- */
const NEW_FOLDER = [
  "................",
  "kkkkkk..........",
  "kffffk..........",
  "kfffffkkkkkkkk..",
  "kFFFFFFFFFFFFk..",
  "kffffffffffffk..",
  "kffffffffffffk..",
  "kffffffffffffk..",
  "kffffffffffffk..",
  "kffffffffkkkkkkk",
  "kffffffffkxxwxxk",
  "kffffffffkxxwxxk",
  "kkkkkkkkkkwwwwwk",
  ".........kxxwxxk",
  ".........kxxwxxk",
  ".........kkkkkkk",
];
const NEW_LIST = [
  "..kkkkkkkkkk....",
  "..kwwwwwwwwk....",
  "..kwfwkkkkwk....",
  "..kwwwwwwwwk....",
  "..kwfwkkkkwk....",
  "..kwwwwwwwwk....",
  "..kwawkkkwwk....",
  "..kwwwwwwwwk....",
  "..kwawkkkkwk....",
  "..kwwwwwwkkkkkkk",
  "..kwwwwwwkxxwxxk",
  "..kwwwwwwkxxwxxk",
  "..kkkkkkkkwwwwwk",
  ".........kxxwxxk",
  ".........kxxwxxk",
  ".........kkkkkkk",
];
/** Colors per theme, like the logo: lime on graphite in dark mode, pink and deep blue in light mode. */
const UI_PALETTES = {
  escuro: { k: "#0A0A0A", f: "#C6FF3D", F: "#7FAE1C", w: "#FFFFFF", x: "#FF5FA2", a: "#9AA3B2" },
  claro: { k: "#0B1D51", f: "#FF5FA2", F: "#C21A6B", w: "#FFFFFF", x: "#0B1D51", a: "#8F97A8" },
};
export const UI_ICONS = { newFolder: NEW_FOLDER, newList: NEW_LIST } as const;
export type UiIconName = keyof typeof UI_ICONS;
export const uiIconRuns = (name: UiIconName, theme: keyof typeof UI_PALETTES) => toRuns(UI_ICONS[name], UI_PALETTES[theme]);
