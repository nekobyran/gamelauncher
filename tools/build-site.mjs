import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, process.argv[2] || 'dist');
const staging = `${output}.staging-${process.pid}`;
const files = [
  'index.html', 'styles.css', 'app.js', 'site.config.json',
  '404.html', '_headers', '.nojekyll',
];

if (output === root || root.startsWith(`${output}${sep}`)) {
  throw new Error('Build output must not contain the source root.');
}

const template = JSON.parse(await readFile(resolve(root, 'release.json'), 'utf8'));
const config = JSON.parse(await readFile(resolve(root, 'site.config.json'), 'utf8'));
const releaseRoot = `https://github.com/${config.githubRepo}/releases`;

function parseDigest(asset) {
  const digest = String(asset?.digest || '');
  const match = digest.match(/^sha256:([a-f0-9]{64})$/iu);
  return match ? match[1].toUpperCase() : '—';
}

function selectAsset(assets, platform) {
  const patterns = platform === 'windows'
    ? [
        /(?:windows|win)[-_ .]*(?:x64|x86_64).*?portable.*?\.tar\.zst$/iu,
        /(?:windows|win).*?(?:x64|x86_64).*?\.tar\.zst$/iu,
        /(?:windows|win)[-_ .]*(?:x64|x86_64).*?(?:setup|installer).*?\.exe$/iu,
        /(?:setup|installer).*?(?:windows|win).*?(?:x64|x86_64).*?\.exe$/iu,
        /(?:windows|win).*?(?:x64|x86_64).*?\.exe$/iu,
      ]
    : [
        /(?:android|arm64|arm64-v8a).*?\.apk$/iu,
        /\.apk$/iu,
      ];
  for (const pattern of patterns) {
    const match = assets.find((asset) => pattern.test(String(asset?.name || '')));
    if (match) return match;
  }
  return null;
}

function authenticatedLatestRelease() {
  const response = spawnSync(
    'gh',
    ['api', `repos/${config.githubRepo}/releases?per_page=20`],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20_000,
      maxBuffer: 8 * 1024 * 1024,
      env: process.env,
    },
  );
  if (response.status !== 0 || !response.stdout?.trim()) return null;
  try {
    const releases = JSON.parse(response.stdout);
    return Array.isArray(releases)
      ? releases.find((release) => release && release.draft !== true) || null
      : null;
  } catch {
    return null;
  }
}

function buildManifest() {
  const manifest = structuredClone(template);
  manifest.release.discovery = 'source-pinned-fallback';

  const latest = authenticatedLatestRelease();
  if (!latest) return manifest;
  const assets = Array.isArray(latest.assets) ? latest.assets : [];
  const tag = String(latest.tag_name || '').trim();
  const releaseUrl = String(latest.html_url || releaseRoot);
  if (!releaseUrl.startsWith(`${releaseRoot}/`)) return manifest;

  manifest.release.displayName = `${manifest.release.productName} ${tag.replace(/^v/iu, '') || 'latest'}`;
  manifest.release.version = tag.replace(/^v/iu, '') || 'latest';
  manifest.release.sequence = 'AUTO';
  manifest.release.channel = latest.prerelease ? 'Public Prerelease' : 'Public Release';
  manifest.release.visibility = 'public';
  manifest.release.accessNotice = '公开发布；下载后请先核对 SHA-256。';
  manifest.release.publishedAt = String(latest.published_at || latest.created_at || '').slice(0, 10) || null;
  manifest.release.releasePageUrl = releaseUrl;
  manifest.release.discovery = 'authenticated-gh-api';

  manifest.platforms = manifest.platforms.map((platform) => {
    const asset = selectAsset(assets, platform.id);
    if (!asset) return platform;
    const downloadUrl = String(asset.browser_download_url || '');
    if (!downloadUrl.startsWith(`${releaseRoot}/download/`)) return platform;
    return {
      ...platform,
      fileName: String(asset.name),
      sha256: parseDigest(asset),
      downloadUrl,
      statusLabel: 'AUTHORIZED RELEASE',
      actionLabel: `获取 ${platform.shortLabel} 版本`,
    };
  });
  return manifest;
}

const generatedRelease = buildManifest();

await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });

try {
  for (const file of files) {
    await access(resolve(root, file), constants.R_OK);
    await cp(resolve(root, file), resolve(staging, file), { force: true });
  }
  await cp(resolve(root, 'assets'), resolve(staging, 'assets'), { recursive: true, force: true });
  await writeFile(resolve(staging, 'release.json'), `${JSON.stringify(generatedRelease, null, 2)}\n`, 'utf8');
  await mkdir(dirname(output), { recursive: true });
  await rm(output, { recursive: true, force: true });
  await cp(staging, output, { recursive: true, force: true });
  console.log(JSON.stringify({
    ok: true,
    output,
    files: files.length + 4,
    releaseDiscovery: generatedRelease.release.discovery,
    releasePageUrl: generatedRelease.release.releasePageUrl,
    directAssets: generatedRelease.platforms.filter((item) => item.downloadUrl).length,
  }, null, 2));
} finally {
  await rm(staging, { recursive: true, force: true });
}
