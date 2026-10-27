# Создание иконки приложения средствами System.Drawing; результат сохраняется в assets/icon.png.
# Reproducible app icon, drawn from vector geometry; no external images.
Add-Type -AssemblyName System.Drawing
$taskBitmap = New-Object System.Drawing.Bitmap 1024,1024
$taskGraphics = [System.Drawing.Graphics]::FromImage($taskBitmap)
$taskGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$taskGraphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#2959CA'))
$taskPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White),42
$taskPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$taskPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$taskGraphics.DrawLines($taskPen, [System.Drawing.Point[]]@((New-Object System.Drawing.Point 250,280),(New-Object System.Drawing.Point 470,280),(New-Object System.Drawing.Point 512,330),(New-Object System.Drawing.Point 554,280),(New-Object System.Drawing.Point 774,280),(New-Object System.Drawing.Point 774,730),(New-Object System.Drawing.Point 554,730),(New-Object System.Drawing.Point 512,775),(New-Object System.Drawing.Point 470,730),(New-Object System.Drawing.Point 250,730),(New-Object System.Drawing.Point 250,280)))
$taskGraphics.DrawLine($taskPen,512,330,512,775)
$taskPen.Color = [System.Drawing.ColorTranslator]::FromHtml('#A6E6D0')
$taskGraphics.DrawLines($taskPen, [System.Drawing.Point[]]@((New-Object System.Drawing.Point 325,490),(New-Object System.Drawing.Point 370,535),(New-Object System.Drawing.Point 435,440)))
$taskOutput = Join-Path $PSScriptRoot '../apps/mobile/assets/icon.png'
$taskBitmap.Save([System.IO.Path]::GetFullPath($taskOutput), [System.Drawing.Imaging.ImageFormat]::Png)
$taskPen.Dispose()
$taskGraphics.Dispose()
$taskBitmap.Dispose()
