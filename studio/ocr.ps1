# Windows built-in OCR (Windows.Media.Ocr, Arabic ar-SA) — supporting evidence only.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File studio/ocr.ps1 img1.png [img2.png ...]
# Prints one JSON object: { "<path>": "<recognised text>", ... }
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('ar-SA'))
$out = @{}
foreach ($p in $args) {
  $full = (Resolve-Path $p).Path
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($full)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $out[$p] = ($result.Lines | ForEach-Object { $_.Text }) -join "`n"
  $stream.Dispose()
}
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$out | ConvertTo-Json -Compress
