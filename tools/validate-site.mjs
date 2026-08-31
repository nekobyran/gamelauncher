import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'index.html', 'styles.css', 'app.js', 'release.json', 'site.config.json',
  '404.html', '_headers', '_redirects', '.nojekyll',
  'assets/brand-mark.svg', 'assets/favicon.svg', 'assets/og-cover.svg',
  '.github/workflows/deploy-release-site.yml', 'command/Publish-StaticReleaseSite.ps1',
  'worker.js', 'wrangler.worker.jsonc'
];
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };

for (const file of required) {
  try {
    await access(resolve(root, file), constants.R_OK);
  } catch {
    errors.push(`missing required file: ${file}`);
  }
}

const config = JSON.parse(await readFile(resolve(root, 'site.config.json'), 'utf8'));
const release = JSON.parse(await readFile(resolve(root, 'release.json'), 'utf8'));
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const js = await readFile(resolve(root, 'app.js'), 'utf8');
const css = await readFile(resolve(root, 'styles.css'), 'utf8');
const workflow = await readFile(resolve(root, '.github/workflows/deploy-release-site.yml'), 'utf8');
const publishScript = await readFile(resolve(root, 'command/Publish-StaticReleaseSite.ps1'), 'utf8');
const buildScript = await readFile(resolve(root, 'tools/build-site.mjs'), 'utf8');

check(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(config.projectSlug), 'projectSlug must be a valid DNS label');
check(config.customDomain === `${config.projectSlug}.nkbr.cc`, 'customDomain must equal <projectSlug>.nkbr.cc');
check(config.pagesProject === `nkbr-${config.projectSlug}`, 'pagesProject must equal nkbr-<projectSlug>');
check(config.githubRepo === 'nekobyran/gamelauncher', 'unexpected githubRepo');
check(config.productionBranch === 'main', 'productionBranch must be main');
check(release.schemaVersion === 1, 'release schemaVersion must be 1');
check(Array.isArray(release.platforms) && release.platforms.length === 2, 'release must expose exactly Windows and Android builds');
check(new Set(release.platforms.map((item) => item.id)).size === release.platforms.length, 'platform ids must be unique');
check(release.platforms.some((item) => item.id === 'windows'), 'Windows build missing');
check(release.platforms.some((item) => item.id === 'android'), 'Android build missing');

for (const platform of release.platforms) {
  check(/^[A-F0-9]{64}$/.test(platform.sha256), `${platform.id}: source release SHA-256 is invalid`);
  check(
    typeof platform.downloadUrl === 'string'
      && platform.downloadUrl.startsWith('https://github.com/nekobyran/gamelauncher/releases/download/'),
    `${platform.id}: source release asset URL is invalid`,
  );
  check(
    platform.downloadUrl?.endsWith(`/${platform.fileName}`),
    `${platform.id}: source release file name and URL differ`,
  );
  check(Array.isArray(platform.installSteps) && platform.installSteps.length >= 3, `${platform.id}: installSteps incomplete`);
}
check(release.release.releasePageUrl.startsWith('https://github.com/nekobyran/gamelauncher/releases/tag/'), 'source release page must target a published tag');
check(release.release.discovery === 'source-pinned-public-release', 'source release fallback contract is missing');

for (const id of ['starfield', 'motionToggle', 'release', 'scope', 'platformChecksum']) {
  check(html.includes(`id="${id}"`), `required DOM id missing: ${id}`);
}
check(html.includes('aria-live="polite"'), 'live release status missing');
check(!/<script[^>]+src=["']https?:/i.test(html), 'remote scripts are forbidden');
check(!/<link[^>]+href=["']https?:/i.test(html), 'remote styles and fonts are forbidden');
for (const forbidden of ['PRIVATE PREVIEW', 'PUBLIC PREVIEW', 'Public Preview', '公开预览版', 'READY FOR INVITED TESTERS', 'verifiedList', 'pendingList', 'smoke', '受邀测试者']) {
  check(!html.includes(forbidden) && !js.includes(forbidden), `internal preview/testing marker remains: ${forbidden}`);
}
check(html.includes('LICENSE NOT DECLARED'), 'license boundary is missing');
check(html.includes('https://github.com/nekobyran/gamelauncher'), 'public repository link is missing');
check(html.includes('<meta name="theme-color" content="#edf4df">') && html.includes('<meta name="color-scheme" content="light">'), 'paper-white browser chrome metadata is missing');
check(html.includes('GameLauncher · Release Portal') && !html.includes('Public Preview'), 'formal release portal title is missing');
check(js.includes('visibilitychange'), 'animation must pause when the page is hidden');
check(js.includes('prefers-reduced-motion'), 'reduced-motion JavaScript handling missing');
check(js.includes('saveData') && js.includes('navigator.connection'), 'save-data motion fallback missing');
check(js.includes('revealAll') && js.includes('revealObserver.disconnect'), 'reveal timeout fallback missing');
check(js.includes('lowPower ? 1'), 'low-power DPR limit missing');
check(css.includes('@media (prefers-reduced-motion:reduce)'), 'reduced-motion CSS missing');
check(css.includes('#f7faef') && css.includes('#173329') && css.includes('#a6d867'), 'paper-white botanical-green palette missing');
check(html.includes('class="nkbr-support"') && html.includes('./assets/sponsor.jpg'), 'unified sponsor section missing');
check(workflow.includes('CLOUDFLARE_API_TOKEN') && workflow.includes('CLOUDFLARE_ACCOUNT_ID'), 'Cloudflare workflow secret bindings missing');
check(publishScript.includes('$expectedDomain'), 'domain format validation missing in publish script');
check(publishScript.includes('tools\\build-site.mjs'), 'publish script must use the generated release manifest build');
check(publishScript.includes('wrangler@latest'), 'Wrangler deployment entry missing');
check(publishScript.includes("Join-Path $RepoRoot 'wrangler.worker.jsonc'"), 'custom-domain Worker deployment entry missing');
check(buildScript.includes("['api', `repos/${config.githubRepo}/releases?per_page=20`]") && buildScript.includes('browser_download_url'), 'authenticated GitHub release discovery missing');
check(buildScript.includes('draft !== true') && buildScript.includes('source-pinned-fallback'), 'release discovery fail-closed policy missing');
check(buildScript.includes("latest.prerelease ? 'Public Prerelease' : 'Public Release'") && !buildScript.includes("'Public Preview'"), 'formal prerelease channel normalization missing');

const sensitivePrefix = /(ghp_|github_pat_|sk-[A-Za-z0-9]{20,})/;
for (const [name, text] of [['index.html', html], ['app.js', js], ['workflow', workflow], ['publish script', publishScript]]) {
  check(!sensitivePrefix.test(text), `${name}: possible embedded credential`);
}

try {
  new Function(js);
} catch (error) {
  errors.push(`app.js syntax error: ${error.message}`);
}

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  projectSlug: config.projectSlug,
  customDomain: config.customDomain,
  pagesProject: config.pagesProject,
  filesChecked: required.length,
  platforms: release.platforms.map((item) => item.id)
}, null, 2));
