# PowerShell Console Tetris
# 실행: powershell -ExecutionPolicy Bypass -File .\tetris.ps1

$Width = 10
$Height = 20
$Board = New-Object 'int[,]' $Height, $Width
$Score = 0
$Lines = 0
$Level = 1
$GameOver = $false
$Paused = $false
$Random = [System.Random]::new()

$Pieces = @(
    @{ Color = 11; Cells = @(@(0,1), @(1,1), @(2,1), @(3,1)) }, # I
    @{ Color = 9;  Cells = @(@(0,0), @(0,1), @(1,1), @(2,1)) }, # J
    @{ Color = 6;  Cells = @(@(2,0), @(0,1), @(1,1), @(2,1)) }, # L
    @{ Color = 14; Cells = @(@(0,0), @(1,0), @(0,1), @(1,1)) }, # O
    @{ Color = 10; Cells = @(@(1,0), @(2,0), @(0,1), @(1,1)) }, # S
    @{ Color = 13; Cells = @(@(1,0), @(0,1), @(1,1), @(2,1)) }, # T
    @{ Color = 12; Cells = @(@(0,0), @(1,0), @(1,1), @(2,1)) }  # Z
)

function New-Piece {
    $template = $Pieces[$Random.Next($Pieces.Count)]
    return @{
        X = 3
        Y = 0
        Color = $template.Color
        Cells = @($template.Cells | ForEach-Object { ,@($_[0], $_[1]) })
    }
}

function Test-Collision($Piece, [int]$OffsetX = 0, [int]$OffsetY = 0, $Cells = $null) {
    if ($null -eq $Cells) { $Cells = $Piece.Cells }

    foreach ($cell in $Cells) {
        $x = $Piece.X + $cell[0] + $OffsetX
        $y = $Piece.Y + $cell[1] + $OffsetY

        if ($x -lt 0 -or $x -ge $Width -or $y -ge $Height) { return $true }
        if ($y -ge 0 -and $Board[$y, $x] -ne 0) { return $true }
    }
    return $false
}

function Get-RotatedCells($Cells) {
    return @($Cells | ForEach-Object { ,@(1 - $_[1], $_[0]) })
}

function Lock-Piece($Piece) {
    foreach ($cell in $Piece.Cells) {
        $x = $Piece.X + $cell[0]
        $y = $Piece.Y + $cell[1]
        if ($y -ge 0) { $Board[$y, $x] = $Piece.Color }
    }
}

function Clear-Lines {
    $cleared = 0

    for ($y = $Height - 1; $y -ge 0; $y--) {
        $full = $true
        for ($x = 0; $x -lt $Width; $x++) {
            if ($Board[$y, $x] -eq 0) { $full = $false; break }
        }

        if ($full) {
            for ($moveY = $y; $moveY -gt 0; $moveY--) {
                for ($x = 0; $x -lt $Width; $x++) {
                    $Board[$moveY, $x] = $Board[$moveY - 1, $x]
                }
            }
            for ($x = 0; $x -lt $Width; $x++) { $Board[0, $x] = 0 }
            $cleared++
            $y++
        }
    }

    if ($cleared -gt 0) {
        $script:Lines += $cleared
        $points = @(0, 100, 300, 500, 800)
        $script:Score += $points[$cleared] * $script:Level
        $script:Level = [Math]::Floor($script:Lines / 10) + 1
    }
}

function Draw-Game($Piece) {
    [Console]::SetCursorPosition(0, 0)
    Write-Host ('+' + ('--' * $Width) + '+') -ForegroundColor DarkGray

    for ($y = 0; $y -lt $Height; $y++) {
        Write-Host '|' -NoNewline -ForegroundColor DarkGray
        for ($x = 0; $x -lt $Width; $x++) {
            $color = $Board[$y, $x]
            foreach ($cell in $Piece.Cells) {
                if ($Piece.X + $cell[0] -eq $x -and $Piece.Y + $cell[1] -eq $y) {
                    $color = $Piece.Color
                    break
                }
            }

            if ($color -eq 0) {
                Write-Host '  ' -NoNewline
            } else {
                Write-Host '  ' -NoNewline -BackgroundColor ([ConsoleColor]$color)
            }
        }
        Write-Host '|' -ForegroundColor DarkGray
    }

    Write-Host ('+' + ('--' * $Width) + '+') -ForegroundColor DarkGray
    Write-Host (' 점수: {0,-8} 레벨: {1}' -f $Score, $Level) -ForegroundColor Cyan
    Write-Host (' 지운 줄: {0,-5}' -f $Lines) -ForegroundColor Cyan
    Write-Host ' ← → 이동  ↑ 회전  ↓ 내리기' -ForegroundColor Gray
    Write-Host ' Space 즉시 낙하  P 일시정지  Q 종료' -ForegroundColor Gray
    if ($Paused) { Write-Host '          [ 일시정지 ]          ' -ForegroundColor Yellow }
    else { Write-Host '                               ' }
}

$originalCursor = [Console]::CursorVisible
$originalColor = [Console]::BackgroundColor

try {
    [Console]::CursorVisible = $false
    [Console]::Clear()
    $Current = New-Piece
    $lastDrop = [DateTime]::UtcNow

    while (-not $GameOver) {
        Draw-Game $Current

        if ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true).Key

            if ($key -eq [ConsoleKey]::Q) { break }
            if ($key -eq [ConsoleKey]::P) {
                $Paused = -not $Paused
                $lastDrop = [DateTime]::UtcNow
                continue
            }
            if ($Paused) { continue }

            switch ($key) {
                'LeftArrow'  { if (-not (Test-Collision $Current -OffsetX -1)) { $Current.X-- } }
                'RightArrow' { if (-not (Test-Collision $Current -OffsetX 1))  { $Current.X++ } }
                'DownArrow'  {
                    if (-not (Test-Collision $Current -OffsetY 1)) {
                        $Current.Y++
                        $Score++
                    }
                }
                'UpArrow' {
                    $rotated = Get-RotatedCells $Current.Cells
                    if (-not (Test-Collision $Current -Cells $rotated)) { $Current.Cells = $rotated }
                    elseif (-not (Test-Collision $Current -OffsetX -1 -Cells $rotated)) {
                        $Current.X--
                        $Current.Cells = $rotated
                    }
                    elseif (-not (Test-Collision $Current -OffsetX 1 -Cells $rotated)) {
                        $Current.X++
                        $Current.Cells = $rotated
                    }
                }
                'Spacebar' {
                    $distance = 0
                    while (-not (Test-Collision $Current -OffsetY 1)) {
                        $Current.Y++
                        $distance++
                    }
                    $Score += $distance * 2
                    $lastDrop = [DateTime]::MinValue
                }
            }
        }

        if (-not $Paused) {
            $dropMilliseconds = [Math]::Max(90, 800 - (($Level - 1) * 65))
            if (([DateTime]::UtcNow - $lastDrop).TotalMilliseconds -ge $dropMilliseconds) {
                if (-not (Test-Collision $Current -OffsetY 1)) {
                    $Current.Y++
                } else {
                    Lock-Piece $Current
                    Clear-Lines
                    $Current = New-Piece
                    if (Test-Collision $Current) { $GameOver = $true }
                }
                $lastDrop = [DateTime]::UtcNow
            }
        }

        Start-Sleep -Milliseconds 25
    }

    [Console]::SetCursorPosition(0, 27)
    if ($GameOver) {
        Write-Host (' 게임 오버! 최종 점수: {0}          ' -f $Score) -ForegroundColor Red
    } else {
        Write-Host (' 게임을 종료했습니다. 점수: {0}       ' -f $Score) -ForegroundColor Yellow
    }
}
finally {
    [Console]::BackgroundColor = $originalColor
    [Console]::CursorVisible = $originalCursor
    Write-Host ''
}
