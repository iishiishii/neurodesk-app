// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as path from 'path';
import * as fs from 'fs';
import { getOldUserConfigPath, getUserDataDir, getUserHomeDir } from '../utils';

export const DEFAULT_WIN_WIDTH = 1024;
export const DEFAULT_WIN_HEIGHT = 768;

export enum ThemeType {
  System = 'system',
  Light = 'light',
  Dark = 'dark'
}

export enum FrontEndMode {
  WebApp = 'web-app',
  ClientApp = 'client-app'
}

export enum StartupMode {
  WelcomePage = 'welcome-page',
  NewLocalSession = 'new-local-session',
  LastSessions = 'restore-sessions'
}

export enum LogLevel {
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Verbose = 'verbose',
  Debug = 'debug'
}

export enum CtrlWBehavior {
  Close = 'close',
  Warn = 'warn',
  DoNotClose = 'do-not-close'
}

export type KeyValueMap = { [key: string]: string };

export enum SettingType {
  checkForUpdatesAutomatically = 'checkForUpdatesAutomatically',
  installUpdatesAutomatically = 'installUpdatesAutomatically',

  theme = 'theme',
  syncJupyterLabTheme = 'syncJupyterLabTheme',
  showNewsFeed = 'showNewsFeed',
  frontEndMode = 'frontEndMode',

  defaultWorkingDirectory = 'defaultWorkingDirectory',
  pythonPath = 'pythonPath',
  serverArgs = 'serverArgs',
  overrideDefaultServerArgs = 'overrideDefaultServerArgs',
  serverEnvVars = 'serverEnvVars',

  startupMode = 'startupMode',

  ctrlWBehavior = 'ctrlWBehavior',

  logLevel = 'logLevel'
}

export const serverLaunchArgsFixed = [
  '-h neurodesktop-dev vnmd/neurodesktop:{tag}',
  // // use our token rather than any pre-configured password
  'start.sh jupyter lab --ServerApp.password=""',
  '--no-browser',
  '--expose-app-in-browser',
  `--ServerApp.token="{token}"`,
  `--ServerApp.port=8888`,
  '--LabApp.quit_button=False'
];

// export const serverLaunchArgsDefault = [
//   // do not use any config file
//   '--JupyterApp.config_file_name=""',
//   // enable hidden files (let user decide whether to display them)
//   '--ContentsManager.allow_hidden=True'
// ];

export class Setting<T> {
  constructor(defaultValue: T, options?: Setting.IOptions) {
    this._defaultValue = defaultValue;
    this._options = options;
  }

  set value(val: T) {
    this._value = val;
    this._valueSet = true;
  }

  get value(): T {
    return this._valueSet ? this._value : this._defaultValue;
  }

  get valueSet(): boolean {
    return this._valueSet;
  }

  get differentThanDefault(): boolean {
    return this.value !== this._defaultValue;
  }

  get wsOverridable(): boolean {
    return this?._options?.wsOverridable;
  }

  private _defaultValue: T;
  private _value: T;
  private _valueSet = false;
  private _options: Setting.IOptions;
}

export namespace Setting {
  export interface IOptions {
    wsOverridable?: boolean;
  }
}

export class UserSettings {
  constructor(readSettings: boolean = true) {
    this._settings = {
      checkForUpdatesAutomatically: new Setting<boolean>(true),
      installUpdatesAutomatically: new Setting<boolean>(true),
      showNewsFeed: new Setting<boolean>(true),

      /* making themes workspace overridable is not feasible.
      When app has multiple windows, different window titlebars shouldn't have different themes.
      Also, JupyterLab theme is stored as user settings in {USER_DATA}/jupyterlab-desktop/lab/.
      An individual working-dir cannot have a different theme with common lab settings.
      */
      theme: new Setting<ThemeType>(ThemeType.System),
      syncJupyterLabTheme: new Setting<boolean>(true),
      frontEndMode: new Setting<FrontEndMode>(FrontEndMode.WebApp),

      defaultWorkingDirectory: new Setting<string>(''),
      pythonPath: new Setting<string>('', { wsOverridable: true }),
      serverArgs: new Setting<string>('', { wsOverridable: true }),
      overrideDefaultServerArgs: new Setting<boolean>(false, {
        wsOverridable: true
      }),
      serverEnvVars: new Setting<KeyValueMap>({}, { wsOverridable: true }),

      startupMode: new Setting<StartupMode>(StartupMode.WelcomePage),

      ctrlWBehavior: new Setting<CtrlWBehavior>(CtrlWBehavior.Close),

      logLevel: new Setting<string>(LogLevel.Warn)
    };

    if (readSettings) {
      this.read();
    }
  }

  getValue(setting: SettingType) {
    return this._settings[setting].value;
  }

  setValue(setting: SettingType, value: any) {
    this._settings[setting].value = value;
  }

  read() {
    const userSettingsPath = this._getUserSettingsPath();
    if (!fs.existsSync(userSettingsPath)) {
      // TODO: remove after 07/2023
      this._migrateFromOldSettings();
      return;
    }
    const data = fs.readFileSync(userSettingsPath);
    const jsonData = JSON.parse(data.toString());

    for (let key in SettingType) {
      if (key in jsonData) {
        const setting = this._settings[key];
        setting.value = jsonData[key];
      }
    }
  }

  private _migrateFromOldSettings() {
    const oldSettings = getOldSettings();

    if (SettingType.checkForUpdatesAutomatically in oldSettings) {
      this._settings[SettingType.checkForUpdatesAutomatically].value =
        oldSettings[SettingType.checkForUpdatesAutomatically];
    }
    if (SettingType.installUpdatesAutomatically in oldSettings) {
      this._settings[SettingType.installUpdatesAutomatically].value =
        oldSettings[SettingType.installUpdatesAutomatically];
    }
    if (SettingType.pythonPath in oldSettings) {
      this._settings[SettingType.pythonPath].value =
        oldSettings[SettingType.pythonPath];
    }
  }

  save() {
    const userSettingsPath = this._getUserSettingsPath();
    const userSettings: { [key: string]: any } = {};

    for (let key in SettingType) {
      const setting = this._settings[key];
      if (setting.differentThanDefault) {
        userSettings[key] = setting.value;
      }
    }

    fs.writeFileSync(userSettingsPath, JSON.stringify(userSettings, null, 2));
  }

  get resolvedWorkingDirectory(): string {
    return resolveWorkingDirectory(
      this._settings[SettingType.defaultWorkingDirectory].value
    );
  }

  private _getUserSettingsPath(): string {
    const userDataDir = getUserDataDir();
    return path.join(userDataDir, 'settings.json');
  }

  protected _settings: { [key: string]: Setting<any> };
}

export class WorkspaceSettings extends UserSettings {
  constructor(workingDirectory: string) {
    super(false);

    this._workingDirectory = resolveWorkingDirectory(workingDirectory);
    this.read();
  }

  getValue(setting: SettingType) {
    if (setting in this._wsSettings) {
      return this._wsSettings[setting].value;
    } else {
      return this._settings[setting].value;
    }
  }

  setValue(setting: SettingType, value: any) {
    if (!(setting in this._wsSettings)) {
      this._wsSettings[setting] = Object.assign({}, this._settings[setting]);
    }

    this._wsSettings[setting].value = value;
  }

  read() {
    super.read();

    const wsSettingsPath = this._getWorkspaceSettingsPath();
    if (!fs.existsSync(wsSettingsPath)) {
      return;
    }
    const data = fs.readFileSync(wsSettingsPath);
    const jsonData = JSON.parse(data.toString());

    for (let key in SettingType) {
      if (key in jsonData) {
        const userSetting = this._settings[key];
        if (userSetting.wsOverridable) {
          this._wsSettings[key] = Object.assign({}, userSetting);
          this._wsSettings[key].value = jsonData[key];
        }
      }
    }
  }

  save() {
    const wsSettingsPath = this._getWorkspaceSettingsPath();
    const wsSettings: { [key: string]: any } = {};

    for (let key in SettingType) {
      const setting = this._wsSettings[key];
      if (
        setting &&
        this._settings[key].wsOverridable &&
        this._isDifferentThanUserSetting(key as SettingType)
      ) {
        wsSettings[key] = setting.value;
      }
    }

    const exists = fs.existsSync(wsSettingsPath);
    if (Object.keys(wsSettings).length > 0 || exists) {
      if (!exists) {
        const dirPath = path.dirname(wsSettingsPath);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
      }
      fs.writeFileSync(wsSettingsPath, JSON.stringify(wsSettings, null, 2));
    }
  }

  private _isDifferentThanUserSetting(setting: SettingType): boolean {
    if (
      setting in this._settings &&
      setting in this._wsSettings &&
      this._settings[setting].value !== this._wsSettings[setting].value
    ) {
      return true;
    }

    return false;
  }

  private _getWorkspaceSettingsPath(): string {
    return path.join(
      this._workingDirectory,
      '.jupyter',
      'desktop-settings.json'
    );
  }

  private _workingDirectory: string;
  private _wsSettings: { [key: string]: Setting<any> } = {};
}

export function resolveWorkingDirectory(
  workingDirectory: string,
  resetIfInvalid: boolean = true
): string {
  const home = getUserHomeDir();
  let resolved = workingDirectory || '';
  if (!resolved) {
    resolved = home;
    resetIfInvalid = false;
  }

  if (resetIfInvalid) {
    try {
      const stat = fs.lstatSync(resolved);

      if (!stat.isDirectory()) {
        resolved = home;
      }
    } catch (error) {
      resolved = home;
    }
  }

  return resolved;
}

let _oldSettings: any;

export function getOldSettings() {
  if (_oldSettings) {
    return _oldSettings;
  }

  try {
    const oldConfigPath = getOldUserConfigPath();
    const configData = JSON.parse(fs.readFileSync(oldConfigPath).toString());
    _oldSettings = configData['jupyterlab-desktop']['JupyterLabDesktop'];
  } catch (error) {
    _oldSettings = {};
  }

  return _oldSettings;
}

export const userSettings = new UserSettings();
