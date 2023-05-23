import { ChildProcess, execFile } from 'child_process';
import { IRegistry, SERVER_TOKEN_PREFIX } from './registry';
import { dialog } from 'electron';
import { ArrayExt } from '@lumino/algorithm';
import log from 'electron-log';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { IDisposable, IEnvironmentType, IPythonEnvironment } from './tokens';
import {
  Config,
  getEnvironmentPath,
  getFreePort,
  getSchemasDir,
  getUserDataDir,
  waitForDuration
} from './utils';
import {
  FrontEndMode,
  KeyValueMap,
  // serverLaunchArgsDefault,
  serverLaunchArgsFixed,
  SettingType,
  userSettings,
  WorkspaceSettings
} from './config/settings';
import { randomBytes } from 'crypto';

const SERVER_LAUNCH_TIMEOUT = 900000; // milliseconds
const SERVER_RESTART_LIMIT = 6; // max server restarts

function createTempFile(
  fileName = 'temp',
  data = '',
  encoding: BufferEncoding = 'utf8'
) {
  const tempDirPath = path.join(os.tmpdir(), 'neurodesk_app');
  const tmpDir = fs.mkdtempSync(tempDirPath);
  const tmpFilePath = path.join(tmpDir, fileName);

  fs.writeFileSync(tmpFilePath, data, { encoding });

  return tmpFilePath;
}

function createLaunchScript(
  serverInfo: JupyterServer.IInfo,
  baseCondaPath: string,
  schemasDir: string,
  port: number,
  token: string
): string {
  const isWin = process.platform === 'win32';

  // note: traitlets<5.0 require fully specified arguments to
  // be followed by equals sign without a space; this can be
  // removed once jupyter_server requires traitlets>5.0
  const launchArgs = [
    'docker run -d --shm-size=1gb -it --privileged --user=root --name neurodesktop -p 8888:8888'
  ];
  launchArgs.push(
    `${
      isWin
        ? '-v C:/neurodesktop-storage:/neurodesktop-storage'
        : '-e NB_UID="$(id -u)" -e NB_GID="$(id -g)" -v ~/neurodesktop-storage:/neurodesktop-storage'
    }`
  );

  const config = Config.loadConfig(path.join(__dirname, '..'));
  const tag = config.ConfigToml.jupyter_neurodesk_version;

  for (const arg of serverLaunchArgsFixed) {
    launchArgs.push(
      arg.replace('{tag}', tag).replace('{tag}', tag).replace('{token}', token)
    );
    console.debug(`!!! launchArgs ${launchArgs}`);
  }

  // if (!serverInfo.overrideDefaultServerArgs) {
  //   for (const arg of serverLaunchArgsDefault) {
  //     launchArgs.push(arg);
  //   }
  // }

  if (
    userSettings.getValue(SettingType.frontEndMode) === FrontEndMode.ClientApp
  ) {
    launchArgs.push(`--LabServerApp.schemas_dir="${schemasDir}"`);
  }

  let launchCmd = launchArgs.join(' ');

  if (serverInfo.serverArgs) {
    launchCmd += ` ${serverInfo.serverArgs}`;
  }

  let script: string;

  if (isWin) {
    script = `
        setlocal enabledelayedexpansion
        SET ERRORCODE=0
        SET IMAGE_EXISTS=
        FOR /F "usebackq delims=" %%i IN (\`docker image inspect vnmd/neurodesktop:${tag} --format="exists" 2^>nul\`) DO SET IMAGE_EXISTS=%%i
        if "%IMAGE_EXISTS%"=="exists" (
            echo "Image exists"
            FOR /F "usebackq delims=" %%i IN (\`docker container inspect -f "{{.State.Status}}" neurodesktop\`) DO SET CONTAINER_STATUS=%%i
            if not "!CONTAINER_STATUS!"=="running" (
              echo "Container does not exist"
              docker stop neurodesktop && docker rm neurodesktop 
              ${launchCmd}
            )
        ) else (
            echo "Image does not exist"
            docker stop neurodesktop && docker rm neurodesktop 
            docker pull vnmd/neurodesktop:${tag}
            ${launchCmd}
        )
      `;
  } else {
    script = `
        if [[ "$(docker image inspect vnmd/neurodesktop:${tag} --format='exists' 2> /dev/null)" == "exists" ]]; then 
          if [[ "$( docker container inspect -f '{{.State.Status}}' neurodesktop )" != "running" ]]; then 
              docker stop neurodesktop && docker rm neurodesktop 
              ${launchCmd}
          fi
        else
          docker stop neurodesktop && docker rm neurodesktop 
          docker pull vnmd/neurodesktop:${tag}
          ${launchCmd}
        fi
        `;
  }

  const ext = isWin ? 'bat' : 'sh';
  const scriptPath = createTempFile(`launch.${ext}`, script);

  console.debug(`Server launch script:\n${script}`);

  if (!isWin) {
    fs.chmodSync(scriptPath, 0o755);
  }

  return scriptPath;
}

async function checkIfUrlExists(url: URL): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = requestFn(url, function (r) {
      resolve(r.statusCode >= 200 && r.statusCode < 400);
      console.debug(`Checking if ${url} exists... ${r.statusCode}`);
    });
    req.on('error', function (err) {
      resolve(false);
    });
    req.end();
  });
}

export async function waitUntilServerIsUp(url: URL): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    async function checkUrl() {
      const exists = await checkIfUrlExists(url);
      if (exists) {
        return resolve(true);
      } else {
        setTimeout(async () => {
          await checkUrl();
        }, 500);
      }
    }

    checkUrl();
  });
}

export class JupyterServer {
  constructor(options: JupyterServer.IOptions, registry: IRegistry) {
    this._options = options;
    const option: IPythonEnvironment = {
      name: 'python',
      path: 'C:\\',
      type: IEnvironmentType.Path,
      versions: {},
      defaultKernel: 'python3'
    };
    this._info.environment = option;
    const workingDir =
      this._options.workingDirectory || userSettings.resolvedWorkingDirectory;
    this._info.workingDirectory = workingDir;
    this._registry = registry;

    const wsSettings = new WorkspaceSettings(workingDir);
    this._info.serverArgs = wsSettings.getValue(SettingType.serverArgs);
    this._info.overrideDefaultServerArgs = wsSettings.getValue(
      SettingType.overrideDefaultServerArgs
    );
    this._info.serverEnvVars = wsSettings.getValue(SettingType.serverEnvVars);
  }

  get info(): JupyterServer.IInfo {
    return this._info;
  }

  /**
   * Start a local Jupyter server. This method can be
   * called multiple times without initiating multiple starts.
   *
   * @return a promise that is resolved when the server has started.
   */
  public start(token?: string): Promise<JupyterServer.IInfo> {
    if (this._startServer) {
      return this._startServer;
    }
    let started = false;
    console.debug('Starting Jupyter server....');
    this._startServer = new Promise<JupyterServer.IInfo>(
      // eslint-disable-next-line no-async-promise-executor
      async (resolve, reject) => {
        const isWin = process.platform === 'win32';
        console.debug('isWin: ' + isWin);
        // const pythonPath = this._info.environment.path;
        // if (!fs.existsSync(pythonPath)) {
        //   reject(`Error: Environment not found at: ${pythonPath}`);
        //   return;
        // }
        this._info.port = this._options.port || (await getFreePort());
        this._info.token =
          token || this._options.token || this._generateToken();

        this._info.url = new URL(
          `http://127.0.0.1:8888/lab?token=${this._info.token}`
        );

        let baseCondaPath: string = '';

        if (this._info.environment.type === IEnvironmentType.CondaRoot) {
          baseCondaPath = getEnvironmentPath(this._info.environment);
        } else if (this._info.environment.type === IEnvironmentType.CondaEnv) {
          baseCondaPath = await this._registry.condaRootPath;
        }

        //   if (!baseCondaPath) {
        //     const choice = dialog.showMessageBoxSync({
        //       message: 'Select conda base environment',
        //       detail:
        //         'Base conda environment not found. Please select a root conda environment to activate the custom environment.',
        //       type: 'error',
        //       buttons: ['OK', 'Cancel'],
        //       defaultId: 0,
        //       cancelId: 1
        //     });
        //     if (choice == 1) {
        //       reject('Failed to activate conda environment');
        //       return;
        //     }

        //     const filePaths = dialog.showOpenDialogSync({
        //       properties: [
        //         'openDirectory',
        //         'showHiddenFiles',
        //         'noResolveAliases'
        //       ],
        //       buttonLabel: 'Use Conda Root'
        //     });

        //     if (filePaths && filePaths.length > 0) {
        //       baseCondaPath = filePaths[0];
        //       if (
        //         !this._registry.validateCondaBaseEnvironmentAtPath(
        //           baseCondaPath
        //         )
        //       ) {
        //         reject('Invalid base conda environment');
        //         return;
        //       }
        //       this._registry.setCondaRootPath(baseCondaPath);
        //     } else {
        //       reject('Failed to activate conda environment');
        //       return;
        //     }
        //   }
        // }
        console.log('token', this._info.token);
        const launchScriptPath = createLaunchScript(
          this._info,
          baseCondaPath,
          getSchemasDir(),
          this._info.port,
          this._info.token
        );

        const jlabWorkspacesDir = path.join(
          this._info.workingDirectory,
          '.jupyter',
          'desktop-workspaces'
        );

        const serverEnvVars = { ...this._info.serverEnvVars };

        // allow modifying PATH without replacing by using {PATH} variable
        if (process.env.PATH && 'PATH' in serverEnvVars) {
          serverEnvVars.PATH = serverEnvVars.PATH.replace(
            '{PATH}',
            process.env.PATH
          );
        }

        const execOptions = {
          cwd: this._info.workingDirectory,
          shell: isWin ? 'cmd.exe' : '/bin/bash',
          env: {
            ...process.env,
            JUPYTER_CONFIG_DIR:
              process.env.JLAB_DESKTOP_CONFIG_DIR || getUserDataDir(),
            JUPYTERLAB_WORKSPACES_DIR:
              process.env.JLAB_DESKTOP_WORKSPACES_DIR || jlabWorkspacesDir,
            ...serverEnvVars
          },
          timeout: 500000000
        };

        // console.debug(
        //   `Server launch parameters:\n  [script]: ${launchScriptPath}\n  [options]: ${JSON.stringify(
        //     execOptions
        //   )}`
        // );

        this._nbServer = execFile(launchScriptPath, execOptions);

        Promise.race([
          waitUntilServerIsUp(this._info.url),
          waitForDuration(SERVER_LAUNCH_TIMEOUT)
        ]).then((up: boolean) => {
          if (up) {
            started = true;
            fs.unlinkSync(launchScriptPath);
            resolve(this._info);
          } else {
            console.debug("Server didn't start in time");
            this._serverStartFailed();
            reject(new Error('Failed to launch Jupyter Server'));
          }
        });

        this._nbServer.stdout.on('data', (data: string) => {
          console.debug(`stdout: ${data}`);
        });

        this._nbServer.stderr.on('data', (data: string) => {
          console.debug(`stderr: ${data}`);
        });

        this._nbServer.on('exit', (code, signal) => {
          const _code: number | null = code;
          console.log(
            'child process exited with ' + `code ${code} and signal ${signal}`
          );
          if (_code === 0) {
            /* On Windows, JupyterLab server sometimes crashes randomly during websocket
              connection. As a result of this, users experience kernel connections failures.
              This crash only happens when server is launched from electron app. Since we
              haven't been able to detect the exact cause of these crashes we are restarting the
              server at the same port. After the restart, users are able to launch new kernels
              for the notebook.
              */
            this._cleanupListeners();

            if (!this._stopping && this._restartCount < SERVER_RESTART_LIMIT) {
              started = false;
              this._startServer = null;
              this.start(this._info.token);
              this._restartCount++;
            }
          } else {
            this._serverStartFailed();
            reject(
              new Error(
                'Neurodesk process terminated before the initialization completed'
              )
            );
          }
        });

        this._nbServer.on('error', (err: Error) => {
          if (started) {
            dialog.showMessageBox({
              message: `Neurodesk process errored: ${err.message}`,
              type: 'error'
            });
          } else {
            this._serverStartFailed();
            reject(err);
          }
        });
      }
    );

    return this._startServer;
  }

  /**
   * Stop the currently executing Jupyter server.
   *
   * @return a promise that is resolved when the server has stopped.
   */
  public stop(): Promise<void> {
    // If stop has already been initiated, just return the promise
    if (this._stopServer) {
      return this._stopServer;
    }

    this._stopping = true;

    this._stopServer = new Promise<void>((resolve, reject) => {
      if (this._nbServer !== undefined) {
        if (process.platform === 'win32') {
          execFile(
            'taskkill',
            ['/PID', String(this._nbServer.pid), '/T', '/F'],
            () => {
              this._stopping = false;
              resolve();
            }
          );
        } else {
          this._nbServer.kill();
          this._shutdownServer()
            .then(() => {
              this._stopping = false;
              resolve();
            })
            .catch(reject);
        }
      } else {
        this._stopping = false;
        resolve();
      }
    });
    return this._stopServer;
  }

  get started(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const checkStartServerPromise = () => {
        if (this._startServer) {
          this._startServer
            .then(() => {
              resolve(true);
            })
            .catch(reject);
        } else {
          setTimeout(() => {
            checkStartServerPromise();
          }, 100);
        }
      };

      checkStartServerPromise();
    });
  }

  private _serverStartFailed(): void {
    this._cleanupListeners();
    // Server didn't start, resolve stop promise
    this._stopServer = Promise.resolve();
  }

  private _cleanupListeners(): void {
    this._nbServer.removeAllListeners();
    this._nbServer.stderr.removeAllListeners();
  }

  private _callShutdownAPI(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const req = httpRequest(
        `${this._info.url.origin}/api/shutdown?_xsrf=${this._info.token}`,
        {
          method: 'POST',
          headers: {
            Authorization: `token ${this._info.token}`
          }
        },
        r => {
          if (r.statusCode == 200) {
            resolve();
          } else {
            reject(`Server failed to shutdown. Response code: ${r.statusCode}`);
          }
        }
      );
      req.on('error', err => {
        reject(err);
      });
      req.end();
    });
  }

  private _shutdownServer(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._callShutdownAPI()
        .then(() => {
          resolve();
        })
        .catch(error => {
          // if no connection, it is possible that server was not up yet
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          if (error.code === 'ECONNREFUSED') {
            console.log(
              'Server not up yet, waiting for it to start...',
              error.code
            );
            Promise.race([
              waitUntilServerIsUp(this._info.url),
              waitForDuration(SERVER_LAUNCH_TIMEOUT)
            ]).then((up: boolean) => {
              if (up) {
                this._callShutdownAPI()
                  .then(() => {
                    resolve();
                  })
                  .catch(reject);
              } else {
                reject();
              }
            });
          } else {
            reject(error);
          }
        });
    });
  }

  private _generateToken() {
    return SERVER_TOKEN_PREFIX + randomBytes(19).toString('hex');
  }

  /**
   * The child process object for the Jupyter server
   */
  private _nbServer: ChildProcess;
  private _stopServer: Promise<void> = null;
  private _startServer: Promise<JupyterServer.IInfo> = null;
  private _options: JupyterServer.IOptions;
  private _info: JupyterServer.IInfo = {
    type: 'local',
    url: null,
    port: null,
    token: null,
    workingDirectory: null,
    environment: null,
    serverArgs: '',
    overrideDefaultServerArgs: false,
    serverEnvVars: {},
    version: null
  };
  private _registry: IRegistry;
  private _stopping: boolean = false;
  private _restartCount: number = 0;
}

export namespace JupyterServer {
  export interface IOptions {
    port?: number;
    token?: string;
    workingDirectory?: string;
    environment?: IPythonEnvironment;
  }

  export interface IInfo {
    type: 'local' | 'remote';
    url: URL;
    port: number;
    token: string;
    environment?: IPythonEnvironment;
    workingDirectory: string;
    serverArgs?: string;
    overrideDefaultServerArgs?: boolean;
    serverEnvVars?: KeyValueMap;
    version?: string;
    pageConfig?: any;
  }
}

export interface IServerFactory {
  /**
   * Create and start a 'free' server is none exists.
   *
   * @param opts the Jupyter server options.
   *
   * @return the factory item.
   */
  createFreeServersIfNeeded: (
    opts?: JupyterServer.IOptions,
    freeCount?: number
  ) => Promise<void>;

  /**
   * Create and start a 'free' server. The server created will be returned
   * in the next call to 'createServer'.
   *
   * This method is a way to pre-launch Jupyter servers to improve load
   * times.
   *
   * @param opts the Jupyter server options.
   *
   * @return the factory item.
   */
  createFreeServer: (
    opts?: JupyterServer.IOptions
  ) => Promise<JupyterServerFactory.IFactoryItem>;

  /**
   * Create a Jupyter server.
   *
   * If a free server is available, it is preferred over
   * server creation.
   *
   * @param opts the Jupyter server options.
   * @param forceNewServer force the creation of a new server over a free server.
   *
   * @return the factory item.
   */
  createServer: (
    opts?: JupyterServer.IOptions
  ) => Promise<JupyterServerFactory.IFactoryItem>;

  /**
   * Kill all currently running servers.
   *
   * @return a promise that is fulfilled when all servers are killed.
   */
  killAllServers: () => Promise<void[]>;
}

export namespace IServerFactory {
  export interface IServerStarted {
    readonly factoryId: number;
    type: 'local' | 'remote';
    url: string;
    token: string;
    error?: Error;
    pageConfig?: any;
  }

  export interface IServerStop {
    factoryId: number;
  }
}

export class JupyterServerFactory implements IServerFactory, IDisposable {
  constructor(registry: IRegistry) {
    this._registry = registry;
  }

  async createFreeServersIfNeeded(
    opts?: JupyterServer.IOptions,
    freeCount: number = 1
  ): Promise<void> {
    const unusedServerCount = await this._geUnusedServerCount();
    for (let i = unusedServerCount; i < freeCount; ++i) {
      this.createFreeServer(opts);
    }
  }

  /**
   * Create and start a 'free' server. The server created will be returned
   * in the next call to 'createServer'.
   *
   * This method is a way to pre-launch Jupyter servers to improve load
   * times.
   *
   * @param opts the Jupyter server options.
   *
   * @return the factory item.
   */
  async createFreeServer(
    opts?: JupyterServer.IOptions
  ): Promise<JupyterServerFactory.IFactoryItem> {
    let item: JupyterServerFactory.IFactoryItem;
    let env: IPythonEnvironment = {
      name: 'python',
      path: 'C:\\',
      type: IEnvironmentType.Path,
      versions: {},
      defaultKernel: 'python3'
    };

    // if (!opts?.environment) {
    //   env = await this._registry.getDefaultEnvironment();
    // } else {
    // env = opts?.environment;
    // }
    console.debug('~ createFreeServer', opts);
    opts = { ...opts, ...{ environment: env } };
    item = this._createServer(opts);
    item.server.start().catch(error => {
      console.error('Failed to start server ~~', error);
      this._removeFailedServer(item.factoryId);
    });
    return item;
  }

  /**
   * Create a Jupyter server.
   *
   * If a free server is available, it is preferred over
   * server creation.
   *
   * @param opts the Jupyter server options.
   */
  async createServer(
    opts?: JupyterServer.IOptions
  ): Promise<JupyterServerFactory.IFactoryItem> {
    let item: JupyterServerFactory.IFactoryItem;
    let env: IPythonEnvironment = {
      name: 'python',
      path: 'C:\\',
      type: IEnvironmentType.Path,
      versions: {},
      defaultKernel: 'python3'
    };

    // if (!opts?.environment) {
    //   env = await this._registry.getDefaultEnvironment();
    // } else {
    // env = opts?.environment;
    // }
    console.log('~ createServer', opts?.environment);
    opts = { ...opts, ...{ environment: env } };

    item = (await this._findUnusedServer(opts)) || this._createServer(opts);
    item.used = true;

    item.server.start().catch(error => {
      console.error('~ Failed to start server', error);
      this._removeFailedServer(item.factoryId);
    });

    console.debug('~ createServer ~ ', item);
    return item;
  }

  /**
   * Stop a Jupyter server.
   *
   * @param factoryId the factory item id.
   */
  stopServer(factoryId: number): Promise<void> {
    let idx = this._getServerIdx(factoryId);
    if (idx < 0) {
      return Promise.reject(new Error('Invalid server id: ' + factoryId));
    }

    let server = this._servers[idx];
    if (server.closing) {
      return server.closing;
    }
    let promise = new Promise<void>((res, rej) => {
      server.server
        .stop()
        .then(() => {
          ArrayExt.removeAt(this._servers, idx);
          res();
        })
        .catch(e => {
          log.error(e);
          ArrayExt.removeAt(this._servers, idx);
          rej();
        });
    });
    server.closing = promise;
    return promise;
  }

  /**
   * Kill all currently running servers.
   *
   * @return a promise that is fulfilled when all servers are killed.
   */
  killAllServers(): Promise<void[]> {
    // Get stop promises from all servers
    let stopPromises = this._servers.map(server => {
      return server.server.stop();
    });
    // Empty the server array.
    this._servers = [];
    return Promise.all(stopPromises);
  }

  dispose(): Promise<void> {
    if (this._disposePromise) {
      return this._disposePromise;
    }

    this._disposePromise = new Promise<void>((resolve, reject) => {
      this.killAllServers()
        .then(() => {
          resolve();
        })
        .catch(reject);
    });

    return this._disposePromise;
  }

  private _createServer(
    opts: JupyterServer.IOptions
  ): JupyterServerFactory.IFactoryItem {
    let item: JupyterServerFactory.IFactoryItem = {
      factoryId: this._nextId++,
      server: new JupyterServer(opts, this._registry),
      closing: null,
      used: false
    };

    this._servers.push(item);
    return item;
  }

  private async _findUnusedServer(
    opts?: JupyterServer.IOptions
  ): Promise<JupyterServerFactory.IFactoryItem | null> {
    const workingDir =
      opts?.workingDirectory || userSettings.resolvedWorkingDirectory;
    const env = opts?.environment;

    let result = ArrayExt.findFirstValue(
      this._servers,
      (server: JupyterServerFactory.IFactoryItem, idx: number) => {
        return (
          !server.used &&
          server.server.info.workingDirectory === workingDir &&
          server.server.info.environment.path === env?.path
        );
      }
    );

    return result;
  }

  private async _geUnusedServerCount(
    opts?: JupyterServer.IOptions
  ): Promise<number> {
    let count = 0;

    const workingDir =
      opts?.workingDirectory || userSettings.resolvedWorkingDirectory;

    const env = opts?.environment;

    this._servers.forEach(server => {
      if (
        !server.used &&
        server.server.info.workingDirectory === workingDir &&
        server.server.info.environment.path === env?.path
      ) {
        count++;
      }
    });

    return count;
  }

  private _removeFailedServer(factoryId: number): void {
    let idx = this._getServerIdx(factoryId);
    if (idx < 0) {
      return;
    }
    ArrayExt.removeAt(this._servers, idx);
  }

  private _getServerIdx(factoryId: number): number {
    return ArrayExt.findFirstIndex(
      this._servers,
      (s: JupyterServerFactory.IFactoryItem, idx: number) => {
        if (s.factoryId === factoryId) {
          return true;
        }
        return false;
      }
    );
  }

  private _servers: JupyterServerFactory.IFactoryItem[] = [];
  private _nextId: number = 1;
  private _registry: IRegistry;
  private _disposePromise: Promise<void>;
}

export namespace JupyterServerFactory {
  /**
   * The object created by the JupyterServerFactory.
   */
  export interface IFactoryItem {
    /**
     * The factory ID. Used to keep track of the server.
     */
    readonly factoryId: number;

    /**
     * Whether the server is currently used.
     */
    used: boolean;

    /**
     * A promise that is created when the server is closing
     * and resolved on close.
     */
    closing: Promise<void>;

    /**
     * The actual Jupyter server object.
     */
    server: JupyterServer;
  }
}
