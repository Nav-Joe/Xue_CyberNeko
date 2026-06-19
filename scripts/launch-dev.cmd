@echo off
setlocal EnableExtensions
chcp 65001 >nul
title 雪澜赛博猫娘 - 开发模式

rem 无论从哪里双击，都切到项目根目录
cd /d "%~dp0.."

call "%~dp0win\check-node.cmd"
if errorlevel 1 exit /b 1

if not exist "node_modules\" (
  echo.
  echo [提示] 未检测到 node_modules，正在执行 npm install ...
  echo.
  call npm install
  if errorlevel 1 (
    call "%~dp0win\pause-on-error.cmd" "npm install 失败"
    exit /b 1
  )
)

if not exist "public\live2d\live2dcubismcore.min.js" (
  echo.
  echo [提示] 正在补全 Cubism Core ...
  call node scripts\ensure-cubism-core.js
  if errorlevel 1 (
    call "%~dp0win\pause-on-error.cmd" "Cubism Core 下载失败"
    exit /b 1
  )
)

if not exist "public\models\hiyori_pro\runtime\hiyori_pro_t11.model3.json" (
  if not exist "public\models\Haru\Haru.model3.json" (
    echo.
    echo [提示] 未找到 Live2D 模型，正在下载示例 Haru ...
    echo        若你使用 hiyori 等自定义模型，请放到 public\models\ 后忽略此步骤
    echo.
    call npm run setup:model
    if errorlevel 1 (
      call "%~dp0win\pause-on-error.cmd" "模型下载失败"
      exit /b 1
    )
  )
)

echo.
echo ========================================
echo   雪澜赛博猫娘 - 开发模式
echo   关闭本窗口将结束开发服务
echo ========================================
echo.

call npm run dev
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  call "%~dp0win\pause-on-error.cmd" "开发模式异常退出（代码 %EXIT_CODE%）"
)

exit /b %EXIT_CODE%
