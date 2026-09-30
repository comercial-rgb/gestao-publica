# Mantém a apresentação no ar na porta 3010 por um período (padrão 12 h).
#
# - Impede o Windows de suspender enquanto roda (sem mudar a configuração de energia).
# - A cada 20 s confere o banco (contêiner) e a tela de entrada; se cair, sobe de novo.
# - Registra cada ocorrência em apresentacao-no-ar.log, na pasta indicada.
#
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\demonstracao\manter-apresentacao-no-ar.ps1 [horas] [pasta-do-log]
# Para parar: encerrar este processo (o PID fica no log) e o "next start -p 3010".

param([double]$Horas = 12, [string]$PastaDoLog = $env:TEMP)

$ErrorActionPreference = "Continue"
trap { Registrar ("erro: " + $_.Exception.Message); continue }
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$log = Join-Path $PastaDoLog "apresentacao-no-ar.log"
$saidaServidor = Join-Path $PastaDoLog "apresentacao-servidor.log"
function Registrar([string]$m) { Add-Content -Path $log -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $m) -Encoding utf8 }

Add-Type -Namespace Energia -Name Estado -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
# ES_CONTINUOUS | ES_SYSTEM_REQUIRED: a máquina não suspende enquanto este processo viver.
[void][Energia.Estado]::SetThreadExecutionState([uint32]"0x80000001")

function Responde() {
  try { return (Invoke-WebRequest "http://localhost:3010/login" -UseBasicParsing -TimeoutSec 15).StatusCode -eq 200 } catch { return $false }
}
function SubirServidor() {
  Registrar "subindo o servidor da 3010"
  $cmd = "cd /d `"$repo`" && set PERCURSO_BANCO=gestao_publica_apresentacao&& set PERCURSO_COMO_RUNTIME=1&& set PERCURSO_PORTA=3010&& set AMBIENTE_DE_EXECUCAO=demonstracao&& set NODE_ENV=production&& npx tsx scripts/servir-percursos.ts >> `"$saidaServidor`" 2>&1"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmd -WindowStyle Hidden | Out-Null
  for ($i = 0; $i -lt 60; $i++) { Start-Sleep 3; if (Responde) { Registrar "servidor respondendo"; return } }
  Registrar "o servidor não respondeu em 3 min"
}

try { Start-Transcript -Path (Join-Path $PastaDoLog "apresentacao-transcricao.log") -Append | Out-Null } catch {}
Registrar "supervisor iniciado (PID $PID) por $Horas h"
$fim = (Get-Date).AddHours($Horas)
while ((Get-Date) -lt $fim) {
  $banco = (docker inspect pg-gestao-publica-win --format "{{.State.Status}}" 2>$null)
  if ($banco -ne "running") { Registrar "banco parado ($banco); iniciando o contêiner"; docker start pg-gestao-publica-win | Out-Null; Start-Sleep 5 }
  if (-not (Responde)) {
    Start-Sleep 5
    if (-not (Responde)) {
      Registrar "a 3010 não respondeu duas vezes"
      Get-NetTCPConnection -LocalPort 3010 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
      SubirServidor
    }
  }
  Start-Sleep 20
}
Registrar "período encerrado; o servidor continua no ar, sem supervisão"
