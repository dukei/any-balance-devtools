del provider.zip
adb.exe -e shell md /sdcard/AnyBalance

abd pack --dir "%~dp0." --build %1

adb.exe push provider.zip /sdcard/AnyBalance/provider.zip