# PowerShell script to run the RedMatrix development environment with logging.
# Usage: .\scripts\dev.ps1 -LogLevel debug

param (
    [string]$LogLevel = "info"
)

# Set logging level for the Tauri Rust backend
$env:RUST_LOG = $LogLevel
Write-Host "Starting RedMatrix dev server with RUST_LOG=$env:RUST_LOG..." -ForegroundColor Cyan

# Start the Tauri development command
npm run tauri dev
