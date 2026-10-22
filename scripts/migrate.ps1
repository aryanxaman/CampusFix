$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (-not $env:JAVA_HOME) { throw 'Set JAVA_HOME to a JDK 17 or newer.' }
$classPath = (Join-Path $projectRoot 'target\classes') + ';' + (Join-Path $projectRoot 'target\campusfix\WEB-INF\lib\*')
& (Join-Path $env:JAVA_HOME 'bin\java.exe') -cp $classPath edu.vit.campusfix.MigrationTool (Join-Path $projectRoot 'database\schema.sql')
if ($LASTEXITCODE -ne 0) { throw 'Schema migration failed. Use a migration account with CREATE and ALTER privileges.' }
