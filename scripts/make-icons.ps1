# 하이스케치 로고(src/web/logo.svg 와 같은 도형)를 PNG 아이콘으로 그린다 — assets/icon-*.png · src/web/icon.png · apple-touch-icon.png
#   powershell -File scripts/make-icons.ps1  →  node scripts/pack-ico.mjs  →  assets/icon.ico 를 src/web/favicon.ico 로 복사
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot

function New-RoundRect([double]$x, [double]$y, [double]$w, [double]$h, [double]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Draw-Logo([int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  $k = $size / 64.0

  # 바탕: 둥근 사각형 + 주황 그라데이션 (logo.svg 와 같은 좌표계 64x64)
  $bg = New-RoundRect 0 0 $size $size (15 * $k)
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF(0, 0)), (New-Object System.Drawing.PointF($size, $size)),
    [System.Drawing.ColorTranslator]::FromHtml('#FFA54F'), [System.Drawing.ColorTranslator]::FromHtml('#EF700D'))
  $g.FillPath($grad, $bg)

  # H 의 두 기둥
  $white = [System.Drawing.Brushes]::White
  foreach ($x in 13.5, 39.5) {
    $stem = New-RoundRect ($x * $k) (12.5 * $k) (11 * $k) (39 * $k) (5.5 * $k)
    $g.FillPath($white, $stem)
  }

  # 가로획: 붓으로 쓱 그은 획 (2차 베지어 → 3차로 변환)
  $p0 = @(17.5, 37); $q = @(32, 31.5); $p2 = @(46.5, 29.5)
  $c1 = @(($p0[0] + 2.0 / 3 * ($q[0] - $p0[0])), ($p0[1] + 2.0 / 3 * ($q[1] - $p0[1])))
  $c2 = @(($p2[0] + 2.0 / 3 * ($q[0] - $p2[0])), ($p2[1] + 2.0 / 3 * ($q[1] - $p2[1])))
  $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#0F3B7C'), (9 * $k))
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
  $g.DrawBezier($pen,
    (New-Object System.Drawing.PointF(($p0[0] * $k), ($p0[1] * $k))),
    (New-Object System.Drawing.PointF(($c1[0] * $k), ($c1[1] * $k))),
    (New-Object System.Drawing.PointF(($c2[0] * $k), ($c2[1] * $k))),
    (New-Object System.Drawing.PointF(($p2[0] * $k), ($p2[1] * $k))))

  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

foreach ($s in 16, 24, 32, 48, 64, 128, 256, 512) {
  Draw-Logo $s (Join-Path $root "assets\icon-$s.png")
}
Draw-Logo 1024 (Join-Path $root 'assets\icon-source.png')
Draw-Logo 256 (Join-Path $root 'src\web\icon.png')
Draw-Logo 180 (Join-Path $root 'src\web\apple-touch-icon.png')
'done'
