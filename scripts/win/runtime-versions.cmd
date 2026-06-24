@echo off
rem 首次安装自动拉取的 Node / Python 版本（与维护者开发环境对齐，经 winget 校验可用）
set "XUE_NODE_PACKAGE_ID=OpenJS.NodeJS.LTS"
set "XUE_NODE_VERSION=24.16.0"
set "XUE_NODE_MIN_MAJOR=20"

set "XUE_PYTHON_PACKAGE_ID=Python.Python.3.10"
set "XUE_PYTHON_VERSION=3.10.10"
set "XUE_PYTHON_MIN_MAJOR=3"
set "XUE_PYTHON_MIN_MINOR=10"

set "XUE_NODE_MSI_URL=https://nodejs.org/dist/v24.16.0/node-v24.16.0-x64.msi"
set "XUE_PYTHON_EXE_URL=https://www.python.org/ftp/python/3.10.10/python-3.10.10-amd64.exe"

exit /b 0
