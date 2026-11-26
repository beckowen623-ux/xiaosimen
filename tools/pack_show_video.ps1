param(
  [Parameter(Mandatory=$true)][string]$InputVideo,
  [string]$OutDir = "",
  [string]$Slug = "",
  [int]$Crf = 28,
  [int]$Fps = 24,
  [int]$MaxWidth = 1280
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $InputVideo)) { throw "找不到源视频: $InputVideo" }
$src = (Resolve-Path -LiteralPath $InputVideo).Path
if (-not $Slug) { $Slug = [System.IO.Path]::GetFileNameWithoutExtension($src) }
if (-not $OutDir) { $OutDir = Join-Path (Split-Path -Parent $src) "packed" }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$outMp4 = Join-Path $OutDir "$Slug.mp4"
$outPoster = Join-Path $OutDir "$Slug-poster.jpg"

Write-Host "=== 正在为《考点演播室》压缩 Remotion 节目视频 ==="
Write-Host "源文件: $src"
Write-Host "输出 MP4: $outMp4 (CRF=$Crf, ${Fps}fps, -tune animation, AAC 64k mono, +faststart)"

# 扁平图形 + 男女主持 + 考点横幅动画：-tune animation + 24fps + 64k 单声道人声，15-20 分钟可压至 ~16-25 MB
& ffmpeg -y -i $src `
  -vf "scale='min($MaxWidth,iw)':-2:flags=lanczos" `
  -r $Fps `
  -c:v libx264 -preset slow -crf $Crf -tune animation -pix_fmt yuv420p `
  -c:a aac -b:a 64k -ac 1 -ar 44100 `
  -movflags +faststart `
  $outMp4
if ($LASTEXITCODE -ne 0) { throw "ffmpeg 压制失败" }

# 自动截取第 3 秒作为高清封面图
& ffmpeg -y -ss 3 -i $outMp4 -frames:v 1 -q:v 3 $outPoster
if ($LASTEXITCODE -ne 0) {
  & ffmpeg -y -ss 0 -i $outMp4 -frames:v 1 -q:v 3 $outPoster
}

$srcMB = [math]::Round((Get-Item -LiteralPath $src).Length / 1MB, 2)
$outMB = [math]::Round((Get-Item -LiteralPath $outMp4).Length / 1MB, 2)
$dur = (& ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 $outMp4).Trim()
Write-Host ""
Write-Host "OK 压制完成！"
Write-Host "  原体积: $srcMB MB -> 压后体积: $outMB MB (时长: $([math]::Round([double]$dur / 60, 1)) 分钟)"
Write-Host "  封面图: $outPoster"
if ($outMB -gt 24) {
  Write-Host "  提示: 体积超过 24 MB，请使用 Cloudflare R2 轨道上架 (node tools/publish_show.mjs --target r2 ...)"
} else {
  Write-Host "  提示: 体积 <= 24 MB，可直接走站内轨道 (--target local) 或 R2 轨道 (--target r2) 上架！"
}
