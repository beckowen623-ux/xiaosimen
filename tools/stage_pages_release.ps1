# Windows entry point for the Pages build.
param([ValidateSet('.deploy-pages', '.deploy-preview')][string]$OutputFolder = '.deploy-pages')

& node (Join-Path $PSScriptRoot 'stage_pages_release.mjs') $OutputFolder
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
