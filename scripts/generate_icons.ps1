Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot "..\miniapp\public\app-icon.jpg"
if (-not (Test-Path $srcPath)) {
    Write-Error "Source image not found: $srcPath"
    exit 1
}

$srcImage = [System.Drawing.Image]::FromFile($srcPath)
Write-Host "Source image size: $($srcImage.Width)x$($srcImage.Height)"

$destDir = Join-Path $PSScriptRoot "..\miniapp\public"

function Resize-Image {
    param(
        [System.Drawing.Image]$Image,
        [int]$Width,
        [int]$Height,
        [string]$OutPath,
        [bool]$Maskable = $false
    )
    $destBitmap = New-Object System.Drawing.Bitmap $Width, $Height
    $graphics = [System.Drawing.Graphics]::FromImage($destBitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    # Fill background with clean white matching the icon
    $graphics.Clear([System.Drawing.Color]::White)

    if ($Maskable) {
        # Safe zone: center image within 80% of canvas
        $padX = [int]($Width * 0.1)
        $padY = [int]($Height * 0.1)
        $drawW = $Width - (2 * $padX)
        $drawH = $Height - (2 * $padY)
        $graphics.DrawImage($Image, $padX, $padY, $drawW, $drawH)
    } else {
        $graphics.DrawImage($Image, 0, 0, $Width, $Height)
    }

    $graphics.Dispose()
    $destBitmap.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destBitmap.Dispose()
    Write-Host "Generated: $OutPath ($Width x $Height)"
}

# Generate icons
Resize-Image -Image $srcImage -Width 512 -Height 512 -OutPath (Join-Path $destDir "icon-512.png")
Resize-Image -Image $srcImage -Width 192 -Height 192 -OutPath (Join-Path $destDir "icon-192.png")
Resize-Image -Image $srcImage -Width 512 -Height 512 -OutPath (Join-Path $destDir "icon-maskable-512.png") -Maskable $true
Resize-Image -Image $srcImage -Width 192 -Height 192 -OutPath (Join-Path $destDir "icon-maskable-192.png") -Maskable $true
Resize-Image -Image $srcImage -Width 180 -Height 180 -OutPath (Join-Path $destDir "apple-touch-icon.png")
Resize-Image -Image $srcImage -Width 32 -Height 32 -OutPath (Join-Path $destDir "favicon-32x32.png")
Resize-Image -Image $srcImage -Width 16 -Height 16 -OutPath (Join-Path $destDir "favicon-16x16.png")

# Also copy 32x32 to favicon.ico
Copy-Item (Join-Path $destDir "favicon-32x32.png") (Join-Path $destDir "favicon.ico") -Force

$srcImage.Dispose()
Write-Host "All icons generated successfully!"
