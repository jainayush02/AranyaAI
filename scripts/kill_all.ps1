$ports = 5000, 5173, 8005

foreach ($port in $ports) {
    Write-Host ("Checking port {0}..." -f ${port}) -ForegroundColor Cyan
    # Get all processes using the port, filter out PID 0 (System Idle)
    $connections = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 0 }
    if ($connections) {
        $foundPids = $connections.OwningProcess | Select-Object -Unique
        foreach ($targetPid in $foundPids) {
            try {
                $proc = Get-Process -Id ${targetPid} -ErrorAction SilentlyContinue
                if ($proc) {
                    $procName = $proc.ProcessName
                    Write-Host ("Killing process {0} (PID: {1}) on port {2}" -f ${procName}, ${targetPid}, ${port}) -ForegroundColor Yellow
                    Stop-Process -Id ${targetPid} -Force -ErrorAction Stop
                }
            } catch {
                Write-Host ("Failed to kill PID {0}" -f ${targetPid}) -ForegroundColor Red
            }
        }
    } else {
        Write-Host ("Port {0} is already free." -f ${port}) -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "All Aranya ports have been cleared." -ForegroundColor Green
