Get-ChildItem -Path ".\src\screens" -Recurse -Include *.tsx | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $content = $content -replace 'from "../services/FirebaseService"', 'from "../services/SupabaseService"'
    $content = $content -replace 'from "../../services/FirebaseService"', 'from "../../services/SupabaseService"'
    $content = $content -replace 'FirebaseService\.', 'SupabaseService.'
    $content = $content -replace 'import FirebaseService', 'import SupabaseService'
    Set-Content $_.FullName $content -NoNewline
    Write-Host "Updated: $($_.Name)"
}
Write-Host "All screen files updated!"
