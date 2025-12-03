# Script to set PORT in .env file
$envFile = ".env"
$portLine = "PORT=4006"

# Check if PORT already exists in .env
if (Test-Path $envFile) {
    $content = Get-Content $envFile
    $hasPort = $content | Where-Object { $_ -match "^PORT=" }
    
    if ($hasPort) {
        # Replace existing PORT line
        $content = $content | ForEach-Object {
            if ($_ -match "^PORT=") {
                $portLine
            } else {
                $_
            }
        }
        $content | Set-Content $envFile
        Write-Host "✅ Updated PORT=4006 in .env"
    } else {
        # Add PORT to end of file
        Add-Content $envFile "`n$portLine"
        Write-Host "✅ Added PORT=4006 to .env"
    }
} else {
    # Create new .env with PORT
    $portLine | Set-Content $envFile
    Write-Host "✅ Created .env with PORT=4006"
}

Write-Host ""
Write-Host "Now run: pnpm tsx src/server.new.ts"
