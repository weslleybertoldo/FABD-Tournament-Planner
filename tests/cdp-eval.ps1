param(
  [string]$WsUrl,
  [string]$ExprBase64
)
$ErrorActionPreference = 'Stop'
$expr = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($ExprBase64))

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [System.Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]$WsUrl, $ct).Wait(10000) | Out-Null

function Send-Cmd($id, $method, $params) {
  $msg = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 20
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($msg)
  $seg = New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)
  $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
}

function Recv-Until($id) {
  $buffer = New-Object byte[] 65536
  $sb = New-Object System.Text.StringBuilder
  while ($true) {
    $sb.Clear() | Out-Null
    do {
      $seg = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
      $task = $ws.ReceiveAsync($seg, $ct)
      $task.Wait(20000) | Out-Null
      $res = $task.Result
      $sb.Append([System.Text.Encoding]::UTF8.GetString($buffer, 0, $res.Count)) | Out-Null
    } while (-not $res.EndOfMessage)
    $msg = $sb.ToString()
    $obj = $msg | ConvertFrom-Json
    if ($obj.id -eq $id) { return $obj }
  }
}

Send-Cmd 1 'Runtime.evaluate' @{
  expression  = $expr
  returnByValue = $true
  awaitPromise = $true
  timeout = 15000
}
$resp = Recv-Until 1
$resp | ConvertTo-Json -Depth 20

$ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $ct).Wait(2000) | Out-Null
