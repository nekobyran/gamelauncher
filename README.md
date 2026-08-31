# GameLauncher Public Release

Public release metadata and the production static release site for GameLauncher.

- Production domain: `gamelauncher.nkbr.cc`
- Cloudflare Pages project: `nkbr-gamelauncher`
- Hosting model: Cloudflare Pages preview plus a static-assets Worker on the production domain; no server-side application logic
- Downloads: public GitHub Releases with published SHA-256 digests

## Local validation

```powershell
node tools/validate-site.mjs
./command/Publish-StaticReleaseSite.ps1 -Action Build
node tools/serve.mjs ..\..\release\gamelauncher_web\release 4173
```

## Deployment

```powershell
./command/Publish-StaticReleaseSite.ps1 -Action WhoAmI
./command/Publish-StaticReleaseSite.ps1 -Action Deploy
```

`Deploy` publishes both the Pages preview and the production-domain Worker so
`gamelauncher.nkbr.cc` cannot remain pinned to an older asset set.

The legacy Pages-domain binding action is intentionally separate. The process or CI
environment must already provide `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`, then run:

```powershell
./command/Publish-StaticReleaseSite.ps1 -Action BindDomain
```

Never commit `.env`, API tokens, account credentials, downloaded release binaries, `node_modules`, or generated build output. Release binaries and diagnostic recordings remain GitHub Release assets rather than Git objects. `RELEASE_NOTES.md` defines the verified scope and known limitations.
