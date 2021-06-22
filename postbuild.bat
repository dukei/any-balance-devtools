mkdir "./abd/google-closure-compiler-java"
mkdir "./abd/chromium"
mkdir "./abd/google-closure-compiler-java"
mkdir "./abd/google-closure-compiler-windows"
mkdir "./abd/profiles"
mkdir "./abd/config"
copy ".\build\app\config\_config_production.js" ".\abd\config\config_default.js" /y
xcopy "./node_modules/puppeteer/.local-chromium" "./abd/chromium" /s /e /y
copy ".\node_modules\google-closure-compiler-java\compiler.jar" ".\abd\google-closure-compiler-java\" /y
copy ".\node_modules\google-closure-compiler-windows\compiler.exe" ".\abd\google-closure-compiler-windows\" /y
del /Q/F ".\abd\abd.exe"
ren ".\abd\any-balance-devtools.exe" "abd.exe"