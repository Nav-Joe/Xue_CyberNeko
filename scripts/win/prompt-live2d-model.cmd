@echo off

setlocal EnableExtensions EnableDelayedExpansion

chcp 65001 >nul



cd /d "%~dp0..\.."



call "%~dp0check-live2d-model.cmd"

if not errorlevel 1 exit /b 0



:menu

echo.

echo ┌─────────────────────────────────────────┐

echo │  需要下载默认 Live2D 模型（桃濑日和）      │

echo │                                         │

echo │  该模型由 Live2D Inc. 免费提供，使用需   │

echo │  遵守《无偿提供素材使用授权协议》：        │

echo │  • 不得修改角色设计                       │

echo │  • 商用需为一般用户/小规模企业（年销售^<1000万日元）│

echo │  • 需在作品中标注版权来源                  │

echo │                                         │

echo │  [1] 我同意条款，从 Live2D 官方下载       │

echo │  [2] 我已自备模型，跳过                   │

echo │  [3] 查看官方许可详情（打开浏览器）        │

echo └─────────────────────────────────────────┘

echo.



choice /C 123 /N /M "请选择 [1] 同意下载  [2] 跳过  [3] 查看许可: "

if errorlevel 3 goto :open_license

if errorlevel 2 goto :skip

if errorlevel 1 goto :download



:download

echo.

echo [Live2D] 正在下载桃濑日和 PRO 版（hiyori_pro）官方示例模型…

call npm run setup:model

if errorlevel 1 (

  echo [错误] 模型下载失败，请检查网络后重试，或手动放入 public\models\

  exit /b 1

)

call "%~dp0check-live2d-model.cmd"

if errorlevel 1 (

  echo [错误] 下载完成但未检测到模型文件，请查看上方日志。

  exit /b 1

)

echo [完成] Live2D 模型已就绪。

exit /b 0



:skip

echo.

echo [提示] 已跳过自动下载。请将 .model3.json 及配套资源放入 public\models\ 任意子目录。

call "%~dp0check-live2d-model.cmd"

if errorlevel 1 (

  echo [警告] 当前仍未检测到 Live2D 模型，桌宠可能无法正常显示。

  echo          放置模型后请重新运行「启动.bat」。

) else (

  echo [通过] 已检测到自备 Live2D 模型。

)

exit /b 0



:open_license

start "" "https://www.live2d.com/eula/live2d-free-material-license-agreement_cn.html"

goto :menu

