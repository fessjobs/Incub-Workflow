// Baut den Klick-Prototyp zu EINER HTML-Datei ohne Server und ohne Datenbank.
// Zum Ansehen am Telefon, zum Weiterschicken oder zum Öffnen aus einem Chat.
//
//   node scripts/preview-standalone.mjs [ausgabe.html]
//
// Nutzt esbuild, das über vitest/vite ohnehin im Projekt liegt. Nichts hiervon
// läuft in der App; die Datei enthält nur Beispieldaten.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ausgabe = resolve(process.argv[2] ?? `${wurzel}/dist-preview/testversion.html`);

// Innerhalb von src/preview wird "../nav" bzw. "./nav" durch die Hash-Navigation ersetzt
const hashNavigation = {
  name: "hash-navigation",
  setup(b) {
    b.onResolve({ filter: /(^|\/)nav$/ }, (args) => {
      if (!args.importer.includes("/src/preview/")) return undefined;
      return { path: resolve(wurzel, "src/preview/nav.standalone.tsx") };
    });
  },
};

// "@/…" zeigt auf src/ (wie in tsconfig), damit gemeinsame reine Logik auch hier gebündelt wird
const srcAlias = {
  name: "src-alias",
  setup(b) {
    b.onResolve({ filter: /^@\// }, async (args) => {
      const r = await b.resolve("./" + args.path.slice(2), { resolveDir: resolve(wurzel, "src"), kind: args.kind });
      return r.errors.length ? { errors: r.errors } : { path: r.path };
    });
  },
};

const ergebnis = await build({
  entryPoints: [resolve(wurzel, "src/preview/standalone.tsx")],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  platform: "browser",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [hashNavigation, srcAlias],
  legalComments: "none",
  logLevel: "warning",
});

const js = ergebnis.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = readFileSync(resolve(wurzel, "src/preview/ui/preview.css"), "utf8");

const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Testversion – incub:workflow</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800&family=Bitter:wght@700&family=Caveat&family=Geist+Mono:wght@400;500&family=Work+Sans:wght@400;500;600;700&display=swap">
<style>html,body{margin:0;background:#f3f5f9}${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`;

mkdirSync(dirname(ausgabe), { recursive: true });
writeFileSync(ausgabe, html);
console.log(`${ausgabe}  (${(html.length / 1024).toFixed(0)} KB)`);
