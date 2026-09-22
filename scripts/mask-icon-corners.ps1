# 원본 아이콘(assets/icon-*.png)은 모서리가 불투명한 검정이라, 아트워크는 그대로 두고 모서리만 투명하게 마스킹한다.
#   powershell -File scripts/mask-icon-corners.ps1  →  node scripts/pack-ico.mjs  →  assets/icon.ico 를 src/web/favicon.ico 로 복사
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot

# 원본 아이콘은 모서리가 투명이 아니라 불투명한 검정으로 저장돼 있다.
# 아트워크(둥근 사각형, 모서리 반지름 ≈ 10.4%)는 그대로 두고, 그보다 조금 큰 반지름(11%)의 둥근 사각형으로 잘라 모서리를 투명하게 만든다.
function Mask-Corners([string]$src, [string]$dst) {
  $bytes = [System.IO.File]::ReadAllBytes($src)
  $ms = New-Object System.IO.MemoryStream(,$bytes)
  $img = [System.Drawing.Image]::FromStream($ms)
  $size = $img.Width
  $out = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  $r = [double]$size * 0.11
  $d = $r * 2
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc(0, 0, $d, $d, 180, 90)
  $p.AddArc($size - $d, 0, $d, $d, 270, 90)
  $p.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
  $p.AddArc(0, $size - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  $g.SetClip($p)
  $g.DrawImage($img, 0, 0, $size, $size)
  $g.Dispose(); $img.Dispose(); $ms.Dispose()
  $out.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
}

foreach ($s in 16, 24, 32, 48, 64, 128, 256, 512) {
  $f = Join-Path $root "assets\icon-$s.png"
  $tmp = "$f.tmp"
  Mask-Corners $f $tmp
  Move-Item $tmp $f -Force
}
Copy-Item (Join-Path $root 'assets\icon-256.png') (Join-Path $root 'src\web\icon.png') -Force
'masked'
