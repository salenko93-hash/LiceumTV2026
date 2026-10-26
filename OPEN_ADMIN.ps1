param([string]$PiHost = "192.168.2.193")
Start-Process "http://${PiHost}:8080/admin"
