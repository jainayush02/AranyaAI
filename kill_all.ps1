
$ports = 5000, 5173, 8005

foreach ($port in $ports) {
    echo "Checking port $port..."
    $processId = (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess
    if ($processId) {
        echo "Killing process $processId on port $port"
        Stop-Process -Id $processId -Force
    } else {
        echo "Port $port is already free."
    }
}
echo ""
echo "All Aranya ports have been cleared."
