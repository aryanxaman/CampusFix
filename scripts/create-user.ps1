param(
 [Parameter(Mandatory=$true)][string]$Name,
 [Parameter(Mandatory=$true)][string]$Email,
 [Parameter(Mandatory=$true)][ValidateSet('STUDENT','FACULTY','ADMIN','STAFF')][string]$Role,
 [string]$Specialization = 'General maintenance'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (-not $env:JAVA_HOME) { throw 'Set JAVA_HOME to your JDK 17 or newer.' }
$javaPath = Join-Path $env:JAVA_HOME 'bin\java.exe'
$classPath = (Join-Path $projectRoot 'target\classes') + ';' + (Join-Path $projectRoot 'target\campusfix\WEB-INF\lib\*')
& $javaPath -cp $classPath edu.vit.campusfix.CreateUser $Name $Email $Role $Specialization
if ($LASTEXITCODE -ne 0) { throw 'Account provisioning failed.' }
