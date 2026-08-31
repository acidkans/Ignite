// Renderuje HTML protokołu (ta sama funkcja, z której powstaje PDF) do pliku,
// żeby dało się obejrzeć układ bez uruchamiania całej aplikacji.
// Uruchomienie: node test/generuj-protokol-html.mjs
// esbuild stoi w node_modules frontendu — skrypt leży w /test, więc wskazujemy go wprost.
const { build } = await import(new URL('../apps/frontend/node_modules/esbuild/lib/main.js', import.meta.url).href);
import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const res = await build({
  stdin: {
    contents: `
      import { buildProtokolHtml } from './apps/frontend/src/utils/protokolOdbioruExport';
      globalThis.__build = buildProtokolHtml;
    `,
    resolveDir: root,
    loader: 'js',
  },
  bundle: true, write: false, format: 'esm', platform: 'node',
  define: { 'import.meta.env.VITE_API_URL': '"http://localhost:3001"' },
});

const mod = 'data:text/javascript;base64,' + Buffer.from(res.outputFiles[0].text).toString('base64');
await import(mod);

const dataUrl = (p) => `data:image/png;base64,${readFileSync(join(root, 'apps/frontend/public', p)).toString('base64')}`;
const dane = JSON.parse(readFileSync(join(here, 'protokol-dane.json'), 'utf8'));
dane.logoDataUrl = dataUrl('airtel-logo-services.png');
dane.podpisDataUrl = dataUrl('podpis-airtel.png');

writeFileSync(join(here, 'protokol-testowy.html'), globalThis.__build(dane));
console.log('[test] zapisano test/protokol-testowy.html');
