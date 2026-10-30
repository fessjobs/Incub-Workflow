#!/usr/bin/env node
/**
 * Formt den Vite-Build in eine Seite um, die als Artifact veröffentlicht
 * werden kann.
 *
 * Hintergrund: Beim Veröffentlichen wird die Hauptseite in ein fertiges
 * HTML-Gerüst eingesetzt (doctype, charset, viewport). Ein kompletter
 * <html>-Baum würde darin verschachtelt landen. Deshalb wird aus
 * dist/index.html alles herausgelöst, was das Gerüst schon mitbringt – übrig
 * bleiben Titel, Stylesheet, Wurzelelement und Skript.
 *
 *   npm run build:artifact
 *
 * Ergebnis liegt in artifact/: page.html plus assets/.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = join(root, 'artifact');

const html = readFileSync(join(dist, 'index.html'), 'utf8');

const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? 'Spiele-Tracker';
const script = html.match(/<script[^>]*src="\.?\/?([^"]+)"[^>]*><\/script>/)?.[1];
const style = html.match(/<link[^>]*rel="stylesheet"[^>]*href="\.?\/?([^"]+)"[^>]*>/)?.[1];

if (!script) {
  console.error('Kein Modul-Skript in dist/index.html gefunden – wurde gebaut?');
  process.exit(1);
}

const page = `<title>${title}</title>
${style ? `<link rel="stylesheet" href="${style}">` : ''}
<div id="root"></div>
<script type="module" src="${script}"></script>
`;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'page.html'), page);
cpSync(join(dist, 'assets'), join(out, 'assets'), { recursive: true });

const assets = readdirSync(join(out, 'assets'));
console.log(`artifact/page.html geschrieben`);
console.log(`  Stylesheet: ${style ?? '(keins)'}`);
console.log(`  Skript:     ${script}`);
console.log(`  Dateien:    ${assets.join(', ')}`);
