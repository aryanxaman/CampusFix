param([switch]$SkipTests)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location -LiteralPath $projectRoot
try {
    if (-not $env:MAVEN_OPTS) { $env:MAVEN_OPTS = '-Xms32m -Xmx192m -XX:+UseSerialGC' }
    if (-not $env:JAVA_HOME) {
        $bundledJdk = Get-ChildItem -Path "$env:USERPROFILE\.vscode\extensions\redhat.java-*\jre\*" -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\javac.exe') } | Select-Object -Last 1
        if ($bundledJdk) { $env:JAVA_HOME = $bundledJdk.FullName }
    }
    if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath "$env:JAVA_HOME\bin\javac.exe")) { throw 'Set JAVA_HOME to a JDK 17 or newer (a JRE is not sufficient).' }
    $mavenCommand = Get-Command mvn.cmd -ErrorAction SilentlyContinue
    if ($mavenCommand) { $mavenPath = $mavenCommand.Source } else {
        $mavenPath = Join-Path $projectRoot '.runtime\apache-maven-3.9.9\bin\mvn.cmd'
        if (-not (Test-Path -LiteralPath $mavenPath)) {
            New-Item -ItemType Directory -Path '.runtime' -Force | Out-Null
            $baseUri = 'https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.zip'
            Invoke-WebRequest -Uri $baseUri -OutFile '.runtime\maven.zip'
            $expected = (Invoke-WebRequest -Uri "$baseUri.sha512" -UseBasicParsing).Content.Trim().Split(' ')[0]
            $actual = (Get-FileHash -LiteralPath '.runtime\maven.zip' -Algorithm SHA512).Hash
            if ($expected -ne $actual) { throw 'Maven archive checksum does not match.' }
            Expand-Archive -LiteralPath '.runtime\maven.zip' -DestinationPath '.runtime' -Force
        }
    }
    $buildArguments = @('-B','-ntp','-Dmaven.repo.local=.runtime/repository','package')
    if ($SkipTests) { $buildArguments += '-DskipTests' }
    & $mavenPath @buildArguments
    if ($LASTEXITCODE -ne 0) { throw 'CampusFix build failed. See the Maven output above.' }
    Write-Host 'Built target\campusfix.war. Deploy this WAR to Apache Tomcat 10.1.'
} finally { Pop-Location }
