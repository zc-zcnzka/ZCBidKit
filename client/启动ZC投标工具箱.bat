@echo off
chcp 65001 >nul
title ZC投标工具箱 - 开发启动
cd /d "D:\AAAAbiaoshu\OpenBidKit\client"

echo ==================================================
echo    ZC投标工具箱  正在启动...
echo    首次启动约需 10-20 秒，请等待程序窗口自动弹出。
echo    （本黑色窗口请勿关闭，关闭它就会停止程序）
echo ==================================================
echo.

call npm run dev

echo.
echo 程序已停止运行。按任意键关闭本窗口。
pause >nul
