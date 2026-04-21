Get-Process | Where-Object {$_.Path -like '*FABD*' -or $_.Path -like '*electron*'} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Remove-Item -Path "C:\Users\Usuário\Desktop\FABD-Tournament-Planner\dist" -Recurse -Force -ErrorAction SilentlyContinue
