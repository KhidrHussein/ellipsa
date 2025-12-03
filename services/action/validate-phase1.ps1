# Phase 1 Validation Script
# Run this to automatically check if Phase 1 is complete

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Phase 1 Validation - Action Service" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$checksPass = 0
$checksFail = 0

# Check 1: Dependencies installed
Write-Host "[1/6] Checking dependencies..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host "  ✓ node_modules exists" -ForegroundColor Green
    $checksPass++
}
else {
    Write-Host "  ✗ node_modules missing - run: pnpm install" -ForegroundColor Red
    $checksFail++
}

# Check 2: New files exist
Write-Host "[2/6] Checking new action files..." -ForegroundColor Yellow
$requiredFiles = @(
    "src/schemas/action.schema.ts",
    "src/core/ActionExecutor.ts",
    "src/core/SafetyValidator.ts",
    "src/core/ActionRegistry.ts",
    "src/providers/BrowserProvider.ts",
    "src/server.new.ts"
)

$allFilesExist = $true
foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    }
    else {
        Write-Host "  ✗ $file missing" -ForegroundColor Red
        $allFilesExist = $false
    }
}

if ($allFilesExist) {
    $checksPass++
}
else {
    $checksFail++
}

# Check 3: Environment file
Write-Host "[3/6] Checking environment configuration..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-Host "  ✓ .env file exists" -ForegroundColor Green
    $checksPass++
}
else {
    Write-Host "  ! No .env file (will use defaults)" -ForegroundColor Yellow
    $checksPass++
}

# Check 4: TypeScript compilation  
Write-Host "[4/6] Checking TypeScript compilation..." -ForegroundColor Yellow
Write-Host "  Running: pnpm run typecheck" -ForegroundColor Gray

try {
    $null = & pnpm run typecheck 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ TypeScript compiles successfully" -ForegroundColor Green
        $checksPass++
    }
    else {
        Write-Host "  ✗ TypeScript compilation errors" -ForegroundColor Red
        Write-Host "    Run 'pnpm run typecheck' to see details" -ForegroundColor Yellow
        $checksFail++
    }
}
catch {
    Write-Host "  ✗ TypeScript compilation failed" -ForegroundColor Red
    $checksFail++
}

# Check 5: Playwright installed
Write-Host "[5/6] Checking Playwright installation..." -ForegroundColor Yellow
if (Test-Path "node_modules/playwright") {
    Write-Host "  ✓ Playwright package installed" -ForegroundColor Green
    $checksPass++
}
else {
    Write-Host "  ✗ Playwright not installed" -ForegroundColor Red
    Write-Host "    Run: pnpm install" -ForegroundColor Yellow
    $checksFail++
}

# Check 6: Test script can run
Write-Host "[6/6] Testing action infrastructure..." -ForegroundColor Yellow
Write-Host "  Running: pnpm tsx src/test-actions.ts" -ForegroundColor Gray
Write-Host ""

try {
    $testOutput = & pnpm tsx src/test-actions.ts 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Test script completed successfully" -ForegroundColor Green
        $checksPass++
    }
    else {
        Write-Host "  ✗ Test script failed" -ForegroundColor Red
        Write-Host "    Output:" -ForegroundColor Gray
        Write-Host $testOutput -ForegroundColor Gray
        $checksFail++
    }
}
catch {
    Write-Host "  ✗ Test script failed to run" -ForegroundColor Red
    Write-Host "    Error: $_" -ForegroundColor Red
    $checksFail++
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Validation Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($checksFail -eq 0) {
    Write-Host "Checks Passed: $checksPass / 6" -ForegroundColor Green
    Write-Host "Checks Failed: $checksFail / 6" -ForegroundColor Green
}
else {
    Write-Host "Checks Passed: $checksPass / 6" -ForegroundColor Yellow
    Write-Host "Checks Failed: $checksFail / 6" -ForegroundColor Red
}

Write-Host ""

if ($checksFail -eq 0) {
    Write-Host "✅ PHASE 1 READY!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Start new server: `$env:PORT=4005; pnpm tsx src/server.new.ts" -ForegroundColor White
    Write-Host "  2. Test API: curl http://localhost:4005/health" -ForegroundColor White
    Write-Host "  3. Review PHASE1_CHECKLIST.md for full validation" -ForegroundColor White
    Write-Host ""
    Write-Host "🚀 Ready to move to Phase 2!" -ForegroundColor Green
}
else {
    Write-Host "⚠️  Some checks failed" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please fix the failed checks above, then run this script again." -ForegroundColor Yellow
    Write-Host "See PHASE1_CHECKLIST.md for detailed troubleshooting." -ForegroundColor Yellow
}

Write-Host "========================================" -ForegroundColor Cyan
