mkdir "./dist/google-closure-compiler-java"
mkdir "./dist/chromium"
mkdir "./dist/google-closure-compiler-java"
mkdir "./dist/google-closure-compiler-windows"
mkdir "./dist/profiles"
mkdir "./dist/config"
copy ".\build\app\config\_config_production.js" ".\dist\config\config_production.js" /y
xcopy "./node_modules/puppeteer/.local-chromium" "./dist/chromium" /s /e /y
copy ".\node_modules\google-closure-compiler-java\compiler.jar" ".\dist\google-closure-compiler-java\" /y
copy ".\node_modules\google-closure-compiler-windows\compiler.exe" ".\dist\google-closure-compiler-windows\" /y
