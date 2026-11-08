import { join, resolve } from 'path'

/** 两个根不同才是安装包。开发时它们是同一条路径。 */
export function isPackagedLayout(installRoot: string, dataRoot: string): boolean {
  return resolve(installRoot) !== resolve(dataRoot)
}

export function runtimeInstallEnv(installRoot: string, dataRoot: string): Record<string, string> {
  const env: Record<string, string> = {
    XUE_DATA_ROOT: dataRoot,
    XUE_INSTALL_ROOT: installRoot,
    XUE_VENV_PYTHON: join(dataRoot, '.venv', 'Scripts', 'python.exe')
  }
  if (isPackagedLayout(installRoot, dataRoot)) {
    env.XUE_PACKAGED = '1'
  }
  return env
}

export function live2dInstallPlan(input: {
  installRoot: string
  dataRoot: string
  execPath: string
}): { command: string; args: string[]; env: Record<string, string> } {
  const env = runtimeInstallEnv(input.installRoot, input.dataRoot)
  if (!isPackagedLayout(input.installRoot, input.dataRoot)) {
    return {
      command: 'cmd.exe',
      args: ['/d', '/c', 'chcp 65001>nul & npm run setup:model'],
      env
    }
  }
  return {
    command: input.execPath,
    args: [join(input.installRoot, 'scripts', 'download-sample-model.js')],
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' }
  }
}
