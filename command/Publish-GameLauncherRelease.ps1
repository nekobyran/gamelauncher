#Requires -Version 7.0

<#
.SYNOPSIS
Publishes one verified GameLauncher release and its AstrBot plugin bundle.

.DESCRIPTION
Creates or reuses a draft release in nekobyran/gamelauncher, uploads every asset
one at a time without overwriting, verifies asset names and sizes, then publishes
the release. Existing formal releases are rejected so a new tag is required.

-Verify checks local inputs and the plugin archive only. It never calls gh/git or
performs a GitHub write.

.EXAMPLE
./Publish-GameLauncherRelease.ps1 -Verify `
  -Tag v1.2.0 `
  -SourceRevision 0123456789abcdef0123456789abcdef01234567 `
  -NotesFile D:\release\notes.md `
  -PluginBundle D:\release\AstrBot-GameLauncher-Search-0.4.0-linux-x86_64.tar.gz `
  -Installers @(
    'D:\release\GameLauncher-1.2.0-windows-x64-portable.tar.zst',
    'D:\release\gamelauncher-android-stable.apk'
  )

.EXAMPLE
./Publish-GameLauncherRelease.ps1 `
  -Tag v1.2.0 `
  -SourceRevision 0123456789abcdef0123456789abcdef01234567 `
  -NotesFile D:\release\notes.md `
  -PluginBundle D:\release\AstrBot-GameLauncher-Search-0.4.0-linux-x86_64.tar.gz `
  -Installers @(
    'D:\release\GameLauncher-1.2.0-windows-x64-portable.tar.zst',
    'D:\release\gamelauncher-android-stable.apk'
  )
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Tag,
    [Parameter(Mandatory)][string]$SourceRevision,
    [Parameter(Mandatory)][string]$NotesFile,
    [Parameter(Mandatory)][string]$PluginBundle,
    [Parameter(Mandatory)][string[]]$Installers,
    [switch]$Verify
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$Repository = 'nekobyran/gamelauncher'
$SourceRepository = 'nekobyran/gamelaucher-compat-fixes'
$RepositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$RequiredPluginMembers = @(
    'astrbot_plugin_gamelauncher/main.py',
    'astrbot_plugin_gamelauncher/metadata.yaml',
    'astrbot_plugin_gamelauncher/_conf_schema.json',
    'astrbot_plugin_gamelauncher/README.md',
    'astrbot_plugin_gamelauncher/bin/README.md',
    'astrbot_plugin_gamelauncher/bin/gamelauncher-resource-search',
    'astrbot_plugin_gamelauncher/SOURCE_REVISION'
)

function Resolve-InputFile {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Label
    )

    $item = Get-Item -LiteralPath $Path -ErrorAction Stop
    if ($item.PSIsContainer) {
        throw "$Label must be a file: $($item.FullName)"
    }
    if ($item.Length -le 0) {
        throw "$Label must not be empty: $($item.FullName)"
    }
    return $item
}

function Get-ExpectedAssets {
    param(
        [Parameter(Mandatory)][IO.FileInfo]$Plugin,
        [Parameter(Mandatory)][IO.FileInfo[]]$Installers
    )

    $assets = @($Plugin) + @($Installers)
    $names = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($asset in $assets) {
        if (-not $names.Add($asset.Name)) {
            throw "Duplicate release asset name: $($asset.Name)"
        }
    }
    return $assets
}

function Assert-PluginBundle {
    param(
        [Parameter(Mandatory)][IO.FileInfo]$Bundle,
        [Parameter(Mandatory)][string]$Revision
    )

    $tar = (Get-Command tar -ErrorAction Stop).Source
    Push-Location -LiteralPath $Bundle.DirectoryName
    try {
        $members = @(& $tar -tzf $Bundle.Name 2>&1)
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to list plugin bundle: $($members -join [Environment]::NewLine)"
        }
        $memberSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
        foreach ($member in $members) {
            [void]$memberSet.Add(([string]$member).Trim())
        }
        foreach ($required in $RequiredPluginMembers) {
            if (-not $memberSet.Contains($required)) {
                throw "Plugin bundle is missing $required"
            }
        }

        $revisionOutput = @(
            & $tar -xOf $Bundle.Name 'astrbot_plugin_gamelauncher/SOURCE_REVISION' 2>&1
        )
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to read plugin SOURCE_REVISION: $($revisionOutput -join [Environment]::NewLine)"
        }
        $bundleRevision = ($revisionOutput -join "`n").Trim()
    } finally {
        Pop-Location
    }

    if ($bundleRevision -ne $Revision) {
        throw "Plugin SOURCE_REVISION '$bundleRevision' does not match '$Revision'."
    }
}

function Invoke-Gh {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $global:LASTEXITCODE = 0
    $output = @(& gh @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
    $text = ($output | ForEach-Object { "$_" }) -join [Environment]::NewLine
    if ($exitCode -ne 0) {
        throw "gh failed ($exitCode): gh $($Arguments -join ' ')`n$text"
    }
    return $text
}

function Get-Json {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $text = Invoke-Gh -Arguments $Arguments
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $null
    }
    return ($text | ConvertFrom-Json)
}

function Assert-OfficialCheckout {
    $top = @(& git -C $RepositoryRoot rev-parse --show-toplevel 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "Not a Git checkout: $RepositoryRoot"
    }
    $topPath = [IO.Path]::GetFullPath((($top -join "`n").Trim()))
    if ($topPath -ne [IO.Path]::GetFullPath($RepositoryRoot)) {
        throw "Script must run from the nekobyran/gamelauncher checkout: $RepositoryRoot"
    }

    $branch = (@(& git -C $RepositoryRoot branch --show-current 2>&1) -join '').Trim()
    if ($LASTEXITCODE -ne 0 -or $branch -ne 'main') {
        throw 'The official GameLauncher checkout must be on main.'
    }

    $origin = (@(& git -C $RepositoryRoot remote get-url origin 2>&1) -join '').Trim()
    if ($LASTEXITCODE -ne 0) {
        throw 'The official GameLauncher checkout has no origin remote.'
    }
    $origin = $origin.TrimEnd('/')
    if ($origin.EndsWith('.git')) {
        $origin = $origin.Substring(0, $origin.Length - 4)
    }
    $origin = $origin -replace '^git@github\.com:', 'https://github.com/'
    $origin = $origin -replace '^ssh://git@github\.com/', 'https://github.com/'
    if ($origin -ne 'https://github.com/nekobyran/gamelauncher') {
        throw 'Origin remote does not target https://github.com/nekobyran/gamelauncher.'
    }
}

function Get-ReleaseDetails {
    $attempt = 0
    while ($true) {
        try {
            $release = Get-Json -Arguments @(
                'release', 'view', $Tag, '--repo', $Repository,
                '--json', 'tagName,isDraft,isPrerelease,targetCommitish,name,url,assets'
            )
            if ($release.tagName -ne $Tag) {
                throw "GitHub returned unexpected release tag '$($release.tagName)'."
            }
            return $release
        } catch {
            if ($attempt -ge 2) {
                throw
            }
            $attempt++
            Start-Sleep -Seconds 1
        }
    }
}

function Assert-ReleaseAssets {
    param(
        [Parameter(Mandatory)]$Release,
        [Parameter(Mandatory)][IO.FileInfo[]]$Assets
    )

    $expectedNames = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($asset in $Assets) {
        [void]$expectedNames.Add($asset.Name)
    }
    foreach ($remote in @($Release.assets)) {
        if (-not $expectedNames.Contains([string]$remote.name)) {
            throw "Release contains unexpected asset: $($remote.name)"
        }
    }

    foreach ($asset in $Assets) {
        $remote = @($Release.assets) |
            Where-Object { $_.name -ceq $asset.Name } |
            Select-Object -First 1
        if (-not $remote) {
            throw "Release asset is missing: $($asset.Name)"
        }
        if ($remote.state -ne 'uploaded' -or [int64]$remote.size -ne [int64]$asset.Length) {
            throw "Release asset is incomplete or has the wrong size: $($asset.Name)"
        }
    }
}

if ($Tag -notmatch '^v\d+\.\d+\.\d+$') {
    throw 'Tag must be a formal semantic version such as v1.2.0.'
}
if ($SourceRevision -notmatch '^[0-9a-fA-F]{40}$') {
    throw 'SourceRevision must be a full 40-character Git revision.'
}

$notes = Resolve-InputFile -Path $NotesFile -Label 'NotesFile'
$plugin = Resolve-InputFile -Path $PluginBundle -Label 'PluginBundle'
$installerFiles = @(
    foreach ($path in $Installers) {
        Resolve-InputFile -Path $path -Label 'Installer'
    }
)
if ($installerFiles.Count -eq 0) {
    throw 'At least one Installer is required.'
}
$assets = @(Get-ExpectedAssets -Plugin $plugin -Installers $installerFiles)
Assert-PluginBundle -Bundle $plugin -Revision $SourceRevision

if ($Verify) {
    Write-Host "Verify OK: $Tag"
    Write-Host "Repository: $Repository (target main)"
    Write-Host "Source revision: $SourceRevision"
    foreach ($asset in $assets) {
        Write-Host "Asset: $($asset.Name) ($($asset.Length) bytes)"
    }
    return
}

Assert-OfficialCheckout
[void](Invoke-Gh -Arguments @('auth', 'status', '--hostname', 'github.com'))

$sourceSha = (Invoke-Gh -Arguments @(
    'api', "repos/$SourceRepository/commits/$SourceRevision", '--jq', '.sha'
)).Trim()
if ($sourceSha -ne $SourceRevision) {
    throw "SourceRevision was not found in $SourceRepository."
}

$releases = @(
    Get-Json -Arguments @(
        'release', 'list', '--repo', $Repository, '--limit', '1000',
        '--json', 'tagName,isDraft,isPrerelease'
    )
)
$existing = $releases |
    Where-Object { $_.tagName -ceq $Tag } |
    Select-Object -First 1
if ($existing) {
    if (-not $existing.isDraft -or $existing.isPrerelease) {
        throw "Release $Tag already exists and is not a reusable draft."
    }
    Write-Host "Reusing draft release: $Tag"
} else {
    $tagRefs = @(
        Get-Json -Arguments @(
            'api', "repos/$Repository/git/matching-refs/tags/$Tag"
        )
    )
    if (@($tagRefs | Where-Object { $_.ref -ceq "refs/tags/$Tag" }).Count -ne 0) {
        throw "Tag $Tag already exists without a reusable draft release."
    }

    $title = "GameLauncher $($Tag.Substring(1))"
    [void](Invoke-Gh -Arguments @(
        'release', 'create', $Tag, '--repo', $Repository, '--draft',
        '--title', $title, '--notes-file', $notes.FullName, '--target', 'main'
    ))
}

$release = Get-ReleaseDetails
if ($release.targetCommitish -ne 'main') {
    throw "Release $Tag does not target main."
}

foreach ($asset in $assets) {
    $remote = @($release.assets) |
        Where-Object { $_.name -ceq $asset.Name } |
        Select-Object -First 1
    if ($remote) {
        if ($remote.state -ne 'uploaded' -or [int64]$remote.size -ne [int64]$asset.Length) {
            throw "Draft asset already exists with different content: $($asset.Name)"
        }
        Write-Host "Asset already complete: $($asset.Name)"
        continue
    }

    Write-Host "Uploading: $($asset.Name)"
    [void](Invoke-Gh -Arguments @(
        'release', 'upload', $Tag, $asset.FullName, '--repo', $Repository
    ))
}

$release = Get-ReleaseDetails
Assert-ReleaseAssets -Release $release -Assets $assets
if (-not $release.isDraft) {
    throw "Release $Tag became formal before asset verification completed."
}

[void](Invoke-Gh -Arguments @(
    'release', 'edit', $Tag, '--repo', $Repository,
    '--draft=false', '--latest', '--prerelease=false'
))
$release = Get-ReleaseDetails
if ($release.isDraft -or $release.isPrerelease) {
    throw "Release $Tag was not published as a formal release."
}
Assert-ReleaseAssets -Release $release -Assets $assets
Write-Host "Published: $($release.url)"
