// NEON VOID's hand-in program (Node 22, standard library only).
//
// The game itself lives in game/ as plain static files a desktop browser loads
// offline; this program is how the entry is handed to make.fun's grader. It
// copies game/ and screenshots/ from beside this file into the output
// directory and writes dossier.json there with buildDossier from the vendored
// make.fun library, passing the scorer's own caps so the program refuses
// exactly what the scorer would refuse. The grader runs it twice and compares
// the two outputs byte for byte, so nothing here may depend on the time, the
// environment beyond MAKEFUN_OUTPUT_DIR, or chance: a straight copy and a
// deterministic dossier are all it writes.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps are the gate's own (the kit's reference gate values): at most 4
// screenshots of at most 256 KiB each; game/ holds at most 993 files and
// directories, 48 MiB of files and paths of at most 1000 bytes; the dossier
// text is capped at 163840 bytes, the one cap that shapes the bytes written.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);
