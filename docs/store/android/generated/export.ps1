Add-Type -AssemblyName System.Drawing
$assetRoot = $PSScriptRoot
$assets = Get-Content -LiteralPath (Join-Path $assetRoot 'prompts.json') -Raw | ConvertFrom-Json
$manifest = @()
foreach ($asset in $assets) {
  $sourceImage = [System.Drawing.Bitmap]::FromFile($asset.source)
  $format = if ($asset.alpha) { [System.Drawing.Imaging.PixelFormat]::Format32bppArgb } else { [System.Drawing.Imaging.PixelFormat]::Format24bppRgb }
  $export = [System.Drawing.Bitmap]::new([int]$asset.w, [int]$asset.h, $format)
  $graphics = [System.Drawing.Graphics]::FromImage($export)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  if (-not $asset.alpha) { $graphics.Clear([System.Drawing.Color]::FromArgb(250,249,247)) }
  $graphics.DrawImage($sourceImage, 0, 0, [int]$asset.w, [int]$asset.h)
  $graphics.Dispose()
  $outputPath = Join-Path $assetRoot ($asset.name + '.png')
  if (Test-Path -LiteralPath $outputPath) { throw "Output already exists: $outputPath" }
  $export.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $entry = [ordered]@{ file = $asset.name + '.png'; width = $export.Width; height = $export.Height; transparent = [bool]$asset.alpha }
  if ($asset.name -match '^(phone|tablet)-') {
    $middleX = [int]($export.Width / 2)
    $scanColumn = [int]($export.Width * 0.3)
    $middleY = [int]($export.Height * 0.7)
    $left = 0; $right = 0; $top = 0
    for ($x = 0; $x -lt $middleX; $x++) {
      $pixel = $export.GetPixel($x, $middleY)
      if ($pixel.R -lt 100 -and $pixel.G -lt 100 -and $pixel.B -lt 100) { $left = $x }
    }
    for ($x = $export.Width - 1; $x -gt $middleX; $x--) {
      $pixel = $export.GetPixel($x, $middleY)
      if ($pixel.R -lt 100 -and $pixel.G -lt 100 -and $pixel.B -lt 100) { $right = $x }
    }
    $sawBezel = $false
    for ($y = [int]($export.Height * 0.29); $y -lt $middleY; $y++) {
      $pixel = $export.GetPixel($scanColumn, $y)
      if ($pixel.R -lt 100 -and $pixel.G -lt 100 -and $pixel.B -lt 100) { $sawBezel = $true }
      if ($sawBezel -and $pixel.R -gt 180 -and $pixel.G -gt 180 -and $pixel.B -gt 180) { $top = $y; break }
    }
    $entry.screen = [ordered]@{ x = $left + 1; y = $top; width = $right - $left - 1; visibleHeight = $export.Height - $top; cornerRadius = [int](($right - $left) * 0.09); bottomCropped = $true; coordinates = 'Measured approximate inner screen bounds; check mask against bezel before compositing.' }
  }
  if ($asset.alpha -and $export.GetPixel(0,0).A -ne 0) { throw "Missing transparency: $outputPath" }
  $manifest += $entry
  $export.Dispose()
  $sourceImage.Dispose()
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $assetRoot 'manifest.json') -Encoding utf8
Write-Output "Exported and checked $($manifest.Count) assets."
