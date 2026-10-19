# Promote the exact, already-pushed staging commit without rewriting branches.
# Run from a clean stagging checkout after staging tests and migration review.
$ErrorActionPreference = 'Stop'

function Invoke-Git {
    param([string[]]$GitArgs)
    $result = & git @GitArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Git failed: git $($GitArgs -join ' ') (exit $LASTEXITCODE)"
    }
    return $result
}

try {
    $repoRoot = (Invoke-Git @('rev-parse', '--show-toplevel')) | Select-Object -First 1
    $scriptRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
    if ((Resolve-Path -LiteralPath $repoRoot).Path -ne $scriptRoot) {
        throw 'Run this script from within its own repository.'
    }
    Set-Location -LiteralPath $repoRoot

    $branch = (Invoke-Git @('branch', '--show-current')) | Select-Object -First 1
    if ($branch -ne 'stagging') {
        throw "Switch to the stagging branch first. Current branch: $branch"
    }
    $changes = @(Invoke-Git @('status', '--porcelain', '--untracked-files=normal'))
    if ($changes.Count -gt 0) {
        Write-Host 'Uncommitted or untracked changes:' -ForegroundColor Yellow
        $changes | ForEach-Object { Write-Host $_ }
        throw 'Commit or safely save all changes before promoting. No files were changed.'
    }

    $fetchUrls = @(Invoke-Git @('remote', 'get-url', '--all', 'origin'))
    $pushUrls = @(Invoke-Git @('remote', 'get-url', '--push', '--all', 'origin'))
    if ($fetchUrls.Count -ne 1 -or $pushUrls.Count -ne 1 -or $fetchUrls[0] -cne $pushUrls[0]) {
        throw 'Origin must have one matching fetch and push URL so the checked repository is the one receiving the deployment.'
    }

    Write-Host 'Fetching current main and stagging from origin...' -ForegroundColor Cyan
    Invoke-Git @('fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main', '+refs/heads/stagging:refs/remotes/origin/stagging') | Out-Null
    $localStaging = (Invoke-Git @('rev-parse', 'HEAD')) | Select-Object -First 1
    $remoteStaging = (Invoke-Git @('rev-parse', 'refs/remotes/origin/stagging')) | Select-Object -First 1
    $remoteMain = (Invoke-Git @('rev-parse', 'refs/remotes/origin/main')) | Select-Object -First 1
    if ($localStaging -ne $remoteStaging) {
        throw 'Local stagging and origin/stagging differ. Reconcile and push stagging first; nothing was promoted.'
    }
    if ($remoteMain -eq $remoteStaging) {
        Write-Host 'Production main already contains this staging commit. Nothing to promote.' -ForegroundColor Green
        return
    }
    & git merge-base --is-ancestor $remoteMain $remoteStaging
    if ($LASTEXITCODE -ne 0) {
        throw 'Production main is not an ancestor of stagging. Resolve the branch divergence safely before promoting; no force push was attempted.'
    }

    Invoke-Git @('diff', '--check', $remoteMain, $remoteStaging) | Out-Null
    Write-Host "`nProduction main: $remoteMain"
    Write-Host "Staging commit:   $remoteStaging"
    Write-Host "`nCommits to promote:" -ForegroundColor Cyan
    Invoke-Git @('log', '--oneline', '--no-decorate', "$remoteMain..$remoteStaging") | ForEach-Object { Write-Host $_ }
    Write-Host "`nChanged files:" -ForegroundColor Cyan
    Invoke-Git @('diff', '--stat', $remoteMain, $remoteStaging) | ForEach-Object { Write-Host $_ }
    Write-Host "`nThis pushes ALL commits above to production main and may trigger a production deployment."
    Write-Host 'Confirm staging deployment and tests passed, and review any required production migrations and configuration first.' -ForegroundColor Yellow
    $confirmation = Read-Host 'Type PROMOTE to continue (anything else cancels)'
    if ($confirmation -cne 'PROMOTE') {
        Write-Host 'Cancelled. Production was not changed.'
        return
    }

    # An ordinary push rejects non-fast-forward updates; never force or reset.
    Invoke-Git @('push', 'origin', "${remoteStaging}:refs/heads/main") | Out-Null
    $remoteHeads = @(Invoke-Git @('ls-remote', '--heads', 'origin', 'refs/heads/main'))
    $publishedMain = if ($remoteHeads.Count -eq 1) { ($remoteHeads[0] -split '\s+')[0] } else { '' }
    if ($publishedMain -ne $remoteStaging) {
        throw 'The push succeeded, but main no longer points to the promoted commit. Check the remote and deployment before proceeding.'
    }
    Write-Host "Production main now points to $remoteStaging." -ForegroundColor Green
    Write-Host 'Check Netlify for deployment completion; a successful Git push alone does not confirm a successful deployment.'
}
catch {
    Write-Error $_
    exit 1
}
