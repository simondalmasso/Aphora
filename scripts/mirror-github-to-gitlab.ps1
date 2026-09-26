param(
  [string]$RuntimeRepo = 'C:\GPT-SANDBOX\aphora-mirror-runtime',
  [string]$LogPath = 'C:\GPT-SANDBOX\aphora-mirror.log'
)
$ErrorActionPreference = 'Stop'
$github = 'https://github.com/simondalmasso/Aphora.git'
$gitlab = 'https://gitlab.com/simondalmasso/aphora.git'

function Write-Log([string]$Message) {
  ('{0:o} {1}' -f (Get-Date), $Message) | Add-Content -Encoding utf8 $LogPath
}

try {
  if (!(Test-Path (Join-Path $RuntimeRepo '.git'))) {
    if (Test-Path $RuntimeRepo) {
      Remove-Item -Recurse -Force $RuntimeRepo
    }
    git clone --no-checkout $github $RuntimeRepo | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'GitHub clone failed' }
  }

  git -C $RuntimeRepo remote set-url origin $github
  $remotes = @(git -C $RuntimeRepo remote)
  if ($remotes -notcontains 'gitlab') {
    git -C $RuntimeRepo remote add gitlab $gitlab
  } else {
    git -C $RuntimeRepo remote set-url gitlab $gitlab
  }

  git -C $RuntimeRepo fetch origin '+refs/heads/*:refs/remotes/origin/*' '+refs/tags/*:refs/tags/*' --prune --prune-tags
  if ($LASTEXITCODE -ne 0) { throw 'GitHub fetch failed' }

  $originBranches = @(git -C $RuntimeRepo for-each-ref --format='%(refname:strip=3)' refs/remotes/origin | Where-Object { $_ -and $_ -ne 'HEAD' })
  foreach ($branch in $originBranches) {
    git -C $RuntimeRepo push gitlab "refs/remotes/origin/$branch:refs/heads/$branch"
    if ($LASTEXITCODE -ne 0) { throw "GitLab branch mirror failed: $branch" }
  }

  $gitlabHeads = @(git -C $RuntimeRepo ls-remote --heads gitlab | ForEach-Object { ($_ -split '\s+')[1] -replace '^refs/heads/','' })
  foreach ($branch in $gitlabHeads) {
    if ($originBranches -notcontains $branch) {
      git -C $RuntimeRepo push gitlab --delete $branch
      if ($LASTEXITCODE -ne 0) { throw "GitLab prune failed: $branch" }
    }
  }

  $tags = @(git -C $RuntimeRepo tag -l)
  foreach ($tag in $tags) {
    git -C $RuntimeRepo push gitlab "refs/tags/$tag:refs/tags/$tag"
    if ($LASTEXITCODE -ne 0) { throw "GitLab tag mirror failed: $tag" }
  }

  $githubMain = (git -C $RuntimeRepo rev-parse refs/remotes/origin/main).Trim()
  $gitlabMain = (git -C $RuntimeRepo ls-remote gitlab refs/heads/main | ForEach-Object { ($_ -split '\s+')[0] }).Trim()
  if ($githubMain -ne $gitlabMain) {
    throw "main mismatch github=$githubMain gitlab=$gitlabMain"
  }

  Write-Log "PASS main=$githubMain branches=$($originBranches.Count) tags=$($tags.Count)"
  exit 0
} catch {
  Write-Log ("FAIL " + $_.Exception.Message)
  exit 1
}
