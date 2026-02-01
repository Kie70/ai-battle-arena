@echo off
chcp 65001 > nul
set /p API_KEY="请输入您的 MOONSHOT_API_KEY: "
echo MOONSHOT_API_KEY=%API_KEY% > .env.local
echo 密钥已保存到 .env.local
echo 正在启动程序...
npm run dev
pause
