# Generates DEVELOPMENT-ONLY demonstration images (original drawings, no third-party assets).
# Every image carries a "DEMO" tag so it cannot be mistaken for real product photography.
# Outputs:
#   storage/uploads/demo-products/<SKU>.png   (800x800, one per synthetic SKU)
#   public/demo/categories/<slug>.png         (600x400, one per category)
#   storage/uploads/demo-banners/banner-N.png (1600x560, homepage banner backdrops)
Add-Type -AssemblyName System.Drawing
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function New-Canvas($w, $h, $bg) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml($bg))
  return @($bmp, $g)
}
function Brush($hex) { return New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($hex)) }
function Pen($hex, $w) { return New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml($hex)), $w }
function Tag($g, $w) {
  $f = New-Object System.Drawing.Font 'Segoe UI', 11, ([System.Drawing.FontStyle]::Bold)
  $g.FillRectangle((Brush '#f08a00'), 12, 12, 84, 26)
  $g.DrawString('DEMO', $f, (Brush '#1c1202'), 22, 15)
}

function Draw-Battery($g) {
  $g.FillRectangle((Brush '#d9dde3'), 300, 170, 200, 40)
  $g.FillRectangle((Brush '#2b3340'), 220, 210, 360, 380)
  $g.FillRectangle((Brush '#3d4756'), 240, 230, 320, 340)
  $g.FillRectangle((Brush '#f5f7fa'), 300, 300, 200, 90)
  $f = New-Object System.Drawing.Font 'Segoe UI', 30, ([System.Drawing.FontStyle]::Bold)
  $g.DrawString('+  -', $f, (Brush '#1a2330'), 340, 318)
}
function Draw-Screen($g) {
  $g.FillRectangle((Brush '#1a1f29'), 250, 110, 300, 580)
  $g.FillRectangle((Brush '#5aa7e6'), 270, 140, 260, 520)
  $g.FillEllipse((Brush '#1a1f29'), 370, 118, 60, 12)
  $g.FillRectangle((Brush '#dfe6ee'), 290, 300, 220, 80)
}
function Draw-Tool($g) {
  $g.DrawLine((Pen '#4b5563' 34), 240, 560, 560, 240)
  $g.FillEllipse((Brush '#4b5563'), 520, 190, 90, 90)
  $g.FillEllipse((Brush '#f5f7fa'), 544, 214, 40, 40)
  $g.FillRectangle((Brush '#f08a00'), 210, 530, 80, 80)
  $g.FillRectangle((Brush '#0f4c81'), 300, 180, 40, 300)
}
function Draw-Paper($g) {
  foreach ($i in 0..3) {
    $y = 330 - ($i * 22)
    $g.FillRectangle((Brush '#ffffff'), 200 + ($i * 8), $y, 400, 300)
    $g.DrawRectangle((Pen '#c3cad5' 2), 200 + ($i * 8), $y, 400, 300)
  }
  foreach ($k in 0..6) { $g.DrawLine((Pen '#c3cad5' 3), 240, 380 + ($k * 28), 560, 380 + ($k * 28)) }
}
function Draw-Shirt($g, $fill) {
  $pts = @([System.Drawing.PointF]::new(330,170), [System.Drawing.PointF]::new(270,200), [System.Drawing.PointF]::new(160,290), [System.Drawing.PointF]::new(220,360), [System.Drawing.PointF]::new(260,330), [System.Drawing.PointF]::new(260,640), [System.Drawing.PointF]::new(540,640), [System.Drawing.PointF]::new(540,330), [System.Drawing.PointF]::new(580,360), [System.Drawing.PointF]::new(640,290), [System.Drawing.PointF]::new(530,200), [System.Drawing.PointF]::new(470,170), [System.Drawing.PointF]::new(400,215))
  $g.FillPolygon((Brush $fill), $pts)
  $g.DrawPolygon((Pen '#8a94a3' 2), $pts)
}
function Draw-Box($g) {
  $g.FillRectangle((Brush '#c9a46b'), 230, 250, 340, 300)
  $g.FillRectangle((Brush '#b08d55'), 230, 250, 340, 60)
  $g.DrawRectangle((Pen '#8a6a3a' 3), 230, 250, 340, 300)
}

function Draw-Category($g, $slug) {
  switch ($slug) {
    'dev-batteries' { $g.FillRectangle((Brush '#2b3340'), 200, 120, 200, 150); $g.FillRectangle((Brush '#d9dde3'), 240, 90, 120, 30) }
    'dev-hand-tools' { $g.DrawLine((Pen '#dfe6ee' 26), 200, 260, 400, 110); $g.FillEllipse((Brush '#dfe6ee'), 370, 80, 60, 60) }
    'dev-office' { $g.FillRectangle((Brush '#ffffff'), 220, 100, 180, 220); $g.DrawRectangle((Pen '#c3cad5' 2), 220, 100, 180, 220) }
    'dev-screens' { $g.FillRectangle((Brush '#1a1f29'), 230, 80, 140, 240); $g.FillRectangle((Brush '#5aa7e6'), 244, 100, 112, 200) }
    'dev-tshirts' { Draw-Shirt $g '#ffffff' }
    default { $g.FillRectangle((Brush '#ffffff'), 220, 120, 160, 160) }
  }
}

# ---- 1. Product images (one per synthetic SKU, read from the list file) ----
$skuList = Get-Content (Join-Path $root 'scripts/demo/sku-list.txt')
foreach ($line in $skuList) {
  $parts = $line -split '\|'
  $sku = $parts[0]; $cat = $parts[1]; $name = $parts[2]
  $pair = New-Canvas 800 800 '#f8fafc'
  $bmp = $pair[0]; $g = $pair[1]
  switch ($cat) {
    'Batteries' { Draw-Battery $g }
    'Screens' { Draw-Screen $g }
    'Hand tools' { Draw-Tool $g }
    'Office supplies' { Draw-Paper $g }
    'T-shirts' { Draw-Shirt $g ($(if ($name -match 'Black') { '#2b3340' } else { '#ffffff' })) }
    default { Draw-Box $g }
  }
  Tag $g 800
  $out = Join-Path $root "storage/uploads/demo-products/$sku.png"
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

# ---- 2. Category images ----
$slugs = @('dev-apparel','dev-batteries','dev-hand-tools','dev-hardware','dev-mobile-spare-parts','dev-office','dev-screens','dev-tshirts')
foreach ($slug in $slugs) {
  $pair = New-Canvas 600 400 '#e7f0f9'
  $bmp = $pair[0]; $g = $pair[1]
  Draw-Category $g $slug
  Tag $g 600
  $bmp.Save((Join-Path $root "public/demo/categories/$slug.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

# ---- 3. Banner backdrops ----
$bannerColors = @('#0f4c81','#1c5a3a','#5b3a7a')
for ($i = 0; $i -lt 3; $i++) {
  $pair = New-Canvas 1600 560 $bannerColors[$i]
  $bmp = $pair[0]; $g = $pair[1]
  $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(16,255,255,255))), 1100, -120, 700, 700)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(20,255,255,255))), 1250, 260, 420, 420)
  Tag $g 1600
  $bmp.Save((Join-Path $root "storage/uploads/demo-banners/banner-$($i+1).png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
Write-Output "generated"
