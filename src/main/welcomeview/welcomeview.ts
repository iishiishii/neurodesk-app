// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { BrowserView } from 'electron';
import { DarkThemeBGColor, getUserHomeDir, LightThemeBGColor } from '../utils';
import * as path from 'path';
import * as fs from 'fs';
import { appData } from '../config/appdata';
import { IRegistry } from '../registry';
import { EventTypeRenderer } from '../eventtypes';

const maxRecentItems = 5;

interface IRecentSessionListItem {
  isRemote: boolean;
  linkLabel: string;
  linkTooltip: string;
  linkDetail?: string;
}

export class WelcomeView {
  constructor(options: WelcomeView.IOptions) {
    // this._registry = options.registry;
    this._isDarkTheme = options.isDarkTheme;
    this._view = new BrowserView({
      webPreferences: {
        preload: path.join(__dirname, './preload.js'),
        devTools: process.env.NODE_ENV === 'development'
      }
    });

    this._view.setBackgroundColor(
      this._isDarkTheme ? DarkThemeBGColor : LightThemeBGColor
    );

    const neurodeskLogo = fs.readFileSync(
      path.join(__dirname, '../../../app-assets/neurodesk.svg')
    );
    const neurodeskIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Pro 6.4.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path d="M184 0c30.9 0 56 25.1 56 56V456c0 30.9-25.1 56-56 56c-28.9 0-52.7-21.9-55.7-50.1c-5.2 1.4-10.7 2.1-16.3 2.1c-35.3 0-64-28.7-64-64c0-7.4 1.3-14.6 3.6-21.2C21.4 367.4 0 338.2 0 304c0-31.9 18.7-59.5 45.8-72.3C37.1 220.8 32 207 32 192c0-30.7 21.6-56.3 50.4-62.6C80.8 123.9 80 118 80 112c0-29.9 20.6-55.1 48.3-62.1C131.3 21.9 155.1 0 184 0zM328 0c28.9 0 52.6 21.9 55.7 49.9c27.8 7 48.3 32.1 48.3 62.1c0 6-.8 11.9-2.4 17.4c28.8 6.2 50.4 31.9 50.4 62.6c0 15-5.1 28.8-13.8 39.7C493.3 244.5 512 272.1 512 304c0 34.2-21.4 63.4-51.6 74.8c2.3 6.6 3.6 13.8 3.6 21.2c0 35.3-28.7 64-64 64c-5.6 0-11.1-.7-16.3-2.1c-3 28.2-26.8 50.1-55.7 50.1c-30.9 0-56-25.1-56-56V56c0-30.9 25.1-56 56-56z"/></svg>`;
    // const labIcon = fs.readFileSync(
    //   path.join(__dirname, '../../../app-assets/icon.svg')
    // );
    // const openIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Pro 6.2.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path d="M88.7 223.8L0 375.8V96C0 60.7 28.7 32 64 32H181.5c17 0 33.3 6.7 45.3 18.7l26.5 26.5c12 12 28.3 18.7 45.3 18.7H416c35.3 0 64 28.7 64 64v32H144c-22.8 0-43.8 12.1-55.3 31.8zm27.6 16.1C122.1 230 132.6 224 144 224H544c11.5 0 22 6.1 27.7 16.1s5.7 22.2-.1 32.1l-112 192C453.9 474 443.4 480 432 480H32c-11.5 0-22-6.1-27.7-16.1s-5.7-22.2 .1-32.1l112-192z"/></svg>`;
    const serverIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Pro 6.2.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path d="M64 32C28.7 32 0 60.7 0 96v64c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64H64zM344 152c-13.3 0-24-10.7-24-24s10.7-24 24-24s24 10.7 24 24s-10.7 24-24 24zm96-24c0 13.3-10.7 24-24 24s-24-10.7-24-24s10.7-24 24-24s24 10.7 24 24zM64 288c-35.3 0-64 28.7-64 64v64c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V352c0-35.3-28.7-64-64-64H64zM344 408c-13.3 0-24-10.7-24-24s10.7-24 24-24s24 10.7 24 24s-10.7 24-24 24zm104-24c0 13.3-10.7 24-24 24s-24-10.7-24-24s10.7-24 24-24s24 10.7 24 24z"/></svg>`;
    // const externalLinkIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Pro 6.2.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path d="M352 0c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9L370.7 96 201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L416 141.3l41.4 41.4c9.2 9.2 22.9 11.9 34.9 6.9s19.8-16.6 19.8-29.6V32c0-17.7-14.3-32-32-32H352zM80 32C35.8 32 0 67.8 0 112V432c0 44.2 35.8 80 80 80H400c44.2 0 80-35.8 80-80V320c0-17.7-14.3-32-32-32s-32 14.3-32 32V432c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16H192c17.7 0 32-14.3 32-32s-14.3-32-32-32H80z"/></svg>`;

    // const showNewsFeed = userSettings.getValue(SettingType.showNewsFeed);
    // if (showNewsFeed) {
    //   // initalize from app cache
    //   WelcomeView._newsList = appData.newsList;
    // }

    this._pageSource = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0">
          <title>Welcome</title>
          <style>
            body {
              background: ${LightThemeBGColor};
              color: #000000;
              margin: 0;
              overflow: hidden;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica,
                Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji',
                'Segoe UI Symbol';
              font-size: 13px;
              -webkit-user-select: none;
              user-select: none;
            }
            body.app-ui-dark {
              background: ${DarkThemeBGColor};
              color: #ffffff;
            }
            .container {
              height: calc(100vh - 100px);
              padding: 80px 120px 20px 120px;
              font-size: 16px;
              display: flex;
              flex-direction: column;
            }
            .row {
              display: flex;
              flex-direction: row;
              font-size: 14px;
              line-height: 18px;
            }
            .col {
              display: flex;
              flex-direction: column;
            }
            .logo svg {
              width: 80px;
              height: 80px;
            }
            .app-title-row {
              align-items: center;
              column-gap: 10px;
              margin-bottom: 80px;
            }
            .app-title {
              font-size: 30px;
            }
            .content-row {
              flex-grow: 1;
            }
            .start-recent-col {
              width: 40%;
              flex-basis: 40%;
              flex-grow: 1;
            }
            .news-list-hidden .start-recent-col {
              width: 60%;
              flex-basis: 60%;
            }
            .start-col {
              margin-bottom: 40px;
              row-gap: 2px;
            }
            .recent-col {
              row-gap: 5px;
              max-height: 200px;
              overflow-y: hidden;
            }
            .recent-col.recents-expanded {
              overflow-y: auto;
            }
            .recent-col .row-title {
              position: sticky;
              top: 0;
              background: ${LightThemeBGColor};
            }
            .app-ui-dark .recent-col .row-title {
              background: ${DarkThemeBGColor};
            }
            .recent-col.recents-collapsed > div:nth-child(n+${
              maxRecentItems + 2
            }).recent-session-row {
              display: none;
            }
            .row-title {
              font-weight: bold;
              margin-bottom: 5px;
              font-size: 16px;
            }
            a, .recent-session-link {
              color: #555555;
              text-decoration: none;
              cursor: pointer;
            }
            a:hover, .recent-session-link:hover {
              color: #777777;
            }
            .app-ui-dark a, .app-ui-dark .recent-session-link {
              color: #cccccc;
            }
            .app-ui-dark a:hover, .app-ui-dark .recent-session-link:hover {
              color: #eeeeee;
            }
            .more-row a {
              color: #202020;
            }
            a.disabled, .recent-session-link.disabled {
              pointer-events: none;
              opacity: 0.5;
            }
            .app-ui-dark .more-row a {
              color: #f0f0f0;
            }
            .neurodesk-logo svg {
              width: 300px;
            }
            .app-ui-dark .neurodesk-logo {
              width: 300px;
              fill: #888888
            }
            .neurodesk-logo .jp-icon2 {
              fill: #888888;
            }
            .recent-session-link {
              white-space: nowrap;
            }
            .recent-session-detail {
              padding-left: 10px;
            }
            .recent-session-detail, .news-list-col .row a {
              text-overflow: ellipsis;
              overflow: hidden;
              white-space: nowrap;
            }
            .recent-session-row {
              align-items: center;
            }
            .recent-session-delete {
              height: 18px;
              margin-left: 10px;
              visibility: hidden;
            }
            .recent-session-row:hover .recent-session-delete {
              visibility: visible;
              transition-delay: 1s;
              cursor: pointer;
            }
            .recent-session-row .delete-button {
              width: 16px;
              height: 16px;
              padding-top: 1px;
              fill: #555555;
            }
            .app-ui-dark .recent-session-row .delete-button {
              fill: #bcbcbc;
            }
            .no-recent-message {
              color: #777777;
            }
            .app-ui-dark .no-recent-message {
              color: #999999;
            }
            .action-row a {
              display: flex;
              flex-direction: row;
              align-items: center;
            }
            .action-row span {
              margin-right: 8px;
              padding-top: 4px;
              width: 26px;
              height: 26px;
            }
            .action-row svg {
              width: 22px;
              height: 22px;
              fill: #555555;
            }
            .app-ui-dark .action-row svg {
              fill: #dddddd;
            }
            .new-notebook-action-row svg {
              width: 25px;
              height: 25px;
              margin-left: -1px;
            }
            .new-session-action-row svg {
              width: 26px;
              height: 26px;
              margin-left: -2px;
            }
            #notification-panel {
              position: sticky;
              bottom: 0;
              display: none;
              height: 50px;
              padding: 0 20px;
              background: inherit;
              border-top: 1px solid #585858;
              align-items: center;
            }
            #notification-panel-message {
              flex-grow: 1;
              display: flex;
              align-items: center;
            }
            #notification-panel-message a {
              margin: 0 4px;
            }
            #notification-panel .close-button {
              width: 20px;
              height: 20px;
              fill: #555555;
              cursor: pointer;
            }
            .app-ui-dark #notification-panel .close-button {
              fill: #bcbcbc;
            }
            .recent-expander-col {
              display: none;
            }
          </style>
          <script>
            document.addEventListener("DOMContentLoaded", () => {
              const platform = "${process.platform}";
              document.body.dataset.appPlatform = platform;
              document.body.classList.add('app-ui-' + platform);
            });
          </script>
        </head>
      
        <body class="${this._isDarkTheme ? 'app-ui-dark' : ''} title="">
          <svg class="symbol" style="display: none;">
          <defs>
            <symbol id="circle-xmark" viewBox="0 0 512 512">
              <!--! Font Awesome Pro 6.2.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path d="M256 512c141.4 0 256-114.6 256-256S397.4 0 256 0S0 114.6 0 256S114.6 512 256 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/>
            </symbol>
            <symbol id="triangle-exclamation" viewBox="0 0 512 512">
              <!--! Font Awesome Pro 6.2.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480H40c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24V296c0 13.3 10.7 24 24 24s24-10.7 24-24V184c0-13.3-10.7-24-24-24zm32 224c0-17.7-14.3-32-32-32s-32 14.3-32 32s14.3 32 32 32s32-14.3 32-32z"/></svg>
            </symbol>
          </defs>
          </svg>
          <div class="container">
            <div class="row app-title-row">
              <div class="app-title">
                <div class="neurodesk-logo">
                    ${neurodeskLogo}
                </div>
              </div>
            </div>

            <div class="row content-row">
              <div class="col start-recent-col">
                <div class="col start-col">
                  <div class="row row-title">
                    Start
                  </div>
                  <div class="row action-row new-notebook-action-row">
                    <a id="new-notebook-link" href="javascript:void(0)" title="Create new Neurodesk instance (requires Docker)" onclick="handleNewSessionClick('notebook');">
                    <span class="action-icon">${neurodeskIcon}</span>
                      Open Local Neurodesk..
                    </a>
                  </div>
                  <div class="row action-row">
                    <a href="javascript:void(0)" title="Connect to a remote Neurodesk server" onclick="handleNewSessionClick('remote');">
                      <span class="action-icon">  
                      ${serverIcon}
                      </span>
                      Connect to remote Neurodesk server..
                    </a>
                  </div>
                </div>
                
                <div id="recent-sessions-col" class="col recent-col">
                  <div id="recent-sessions-title" class="row row-title">
                    Recent sessions
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div id="notification-panel">
            <div id="notification-panel-message">
            </div>
            <div id="notification-panel-close" title="Close" onclick="closeNotificationPanel(event)">
              <svg class="close-button" version="2.0">
                <use href="#circle-xmark" />
              </svg>
            </div>
          </div>

          <script>

          const notificationPanel = document.getElementById('notification-panel');
          const notificationPanelMessage = document.getElementById('notification-panel-message');
          const notificationPanelCloseButton = document.getElementById('notification-panel-close');
          const recentSessionsCol = document.getElementById('recent-sessions-col');
          const recentSessionsTitle = document.getElementById('recent-sessions-title');

          function updateRecentSessionList(recentSessions, resetCollapseState) {
            const maxRecentItems = ${maxRecentItems};
            // clear list
            while (recentSessionsTitle.nextSibling) {
              recentSessionsTitle.nextSibling.remove();
            }

            let recentSessionCount = 0;

            const fragment = new DocumentFragment();

            for (const recentSession of recentSessions) {
              const {isRemote, linkLabel, linkTooltip, linkDetail} = recentSession;
              const recentSessionRow = document.createElement('div');
              recentSessionRow.classList.add("row");
              recentSessionRow.classList.add("recent-session-row");
              recentSessionRow.dataset.sessionIndex = recentSessionCount;
              recentSessionRow.innerHTML = \`
                  <div class="recent-session-link\$\{!isRemote ? ' recent-item-local' : ''\}" onclick='handleRecentSessionClick(event);' title="\$\{linkTooltip\}">\$\{linkLabel\}</div>
                  \$\{linkDetail ? \`<div class="recent-session-detail" title="\$\{linkDetail\}">\$\{linkDetail\}</div>\`: ''}
                  <div class="recent-session-delete" title="Remove" onclick="handleRecentSesssionDeleteClick(event)">
                    <svg class="delete-button" version="2.0">
                      <use href="#circle-xmark" />
                    </svg>
                  </div>\`;

              fragment.append(recentSessionRow);

              recentSessionCount++;
            }

            if (recentSessionCount === 0) {
              const noHistoryMessage = document.createElement('div');
              noHistoryMessage.className = 'no-recent-message';
              noHistoryMessage.innerText = 'No history yet';
              fragment.append(noHistoryMessage);
            }

            recentSessionsCol.append(fragment);

            // also reset if item remove causes count to get back to limit
            resetCollapseState = resetCollapseState || recentSessionCount <= maxRecentItems;

            if (resetCollapseState) {
              const recentExpanderCol = document.getElementById('recent-expander-col');
              if (recentSessionCount > maxRecentItems) {
                recentSessionsCol.classList.add('recents-collapsed');
                recentExpanderCol.style.display = 'block';
              } else {
                recentSessionsCol.classList.remove('recents-collapsed');
                recentSessionsCol.classList.remove('recents-expanded');
                recentExpanderCol.style.display = 'none';
              }
            }
          }

          window.electronAPI.onSetRecentSessionList((recentSessions, resetCollapseState) => {
            updateRecentSessionList(recentSessions, resetCollapseState);
          });

          document.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.stopPropagation();
          });
          
          document.addEventListener('drop', (event) => {
            event.preventDefault();
            event.stopPropagation();
        
            const files = [];
            for (const file of event.dataTransfer.files) {
              files.push(file.path);
            }

            window.electronAPI.openDroppedFiles(files);
          });

          function handleNewSessionClick(type) {
            window.electronAPI.newSession(type);
          }

          function handleRecentSessionClick(event) {
            const row = event.currentTarget.closest('.recent-session-row');
            if (!row) {
              return;
            }
            const sessionIndex = parseInt(row.dataset.sessionIndex);
            window.electronAPI.openRecentSession(sessionIndex);
          }

          function handleRecentSesssionDeleteClick(event) {
            const row = event.currentTarget.closest('.recent-session-row');
            if (!row) {
              return;
            }
            const sessionIndex = parseInt(row.dataset.sessionIndex);
            window.electronAPI.deleteRecentSession(sessionIndex);
          }

          function handleExpandCollapseRecents() {
            const expandCollapseButton = document.getElementById("expand-collapse-recents");
            const classList = recentSessionsCol.classList;
            const isCollapsed = classList.contains("recents-collapsed");
            if (isCollapsed) {
              classList.remove("recents-collapsed");
              classList.add("recents-expanded");
              expandCollapseButton.innerText = "Less...";
            } else {
              classList.remove("recents-expanded");
              classList.add("recents-collapsed");
              expandCollapseButton.innerText = "More...";
            }
          }

          function sendMessageToMain(message, ...args) {
            window.electronAPI.sendMessageToMain(message, ...args);
          }

          function showNotificationPanel(message, closable) {
            notificationPanelMessage.innerHTML = message;
            notificationPanel.style.display = "flex";
            notificationPanelCloseButton.style.display = closable ? 'block' : 'none'; 
          }

          function closeNotificationPanel() {
            notificationPanel.style.display = "none";
          }

          window.electronAPI.onSetNotificationMessage((message, closable) => {
            showNotificationPanel(message, closable);
          });

          window.electronAPI.onInstallBundledPythonEnvStatus((status, detail) => {
            let message = status === 'STARTED' ?
              'Installing Python environment...' :
              status === 'CANCELLED' ?
              'Installation cancelled!' :
              status === 'FAILURE' ?
                'Failed to install!' :
              status === 'SUCCESS' ? 'Installation succeeded. Restarting now...' : '';
            if (detail) {
              message += \`[\$\{detail\}]\`;
            }

            showNotificationPanel(message, status === 'CANCELLED' || status === 'FAILURE');
    
            if (status === 'SUCCESS') {
              setTimeout(() => {
                sendMessageToMain('restart-app');
              }, 2000);
            }
          });
          </script>
        </body>
      </html>
      `;
  }

  get view(): BrowserView {
    return this._view;
  }

  load() {
    this._view.webContents.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(this._pageSource)}`
    );

    this._viewReady = new Promise<void>(resolve => {
      this._view.webContents.on('dom-ready', () => {
        resolve();
      });
    });

    this.updateRecentSessionList(true);

    // this._registry.getDefaultEnvironment().catch(() => {
    //   this.disableLocalServerActions();
    //   this.showNotification(
    //     `
    //     <div>
    //       <svg style="width: 20px; height: 20px; fill: orange; margin-right: 6px;">
    //         <use href="#triangle-exclamation" />
    //       </svg>
    //     </div>
    //     Python environment not found. <a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.InstallBundledPythonEnv}')">Install using the bundled installer</a> or <a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.ShowServerSettings}')">Change the default Python environment</a>
    //     `,
    //     true
    //   );
    // });
  }

  // disableLocalServerActions() {
  //   this._viewReady.then(() => {
  //     this._view.webContents.send(EventTypeRenderer.DisableLocalServerActions);
  //   });
  // }

  showNotification(message: string, closable: boolean) {
    this._viewReady.then(() => {
      this._view.webContents.send(
        EventTypeRenderer.SetNotificationMessage,
        message,
        closable
      );
    });
  }

  updateRecentSessionList(resetCollapseState: boolean) {
    const recentSessionList: IRecentSessionListItem[] = [];
    const home = getUserHomeDir();

    for (const recentSession of appData.recentSessions) {
      let sessionItem = '';
      let sessionDetail = '';
      let tooltip = '';
      // let parent = '';
      if (recentSession.remoteURL) {
        const url = new URL(recentSession.remoteURL);
        sessionItem = url.origin;
        tooltip = `${recentSession.remoteURL}\nSession data ${
          recentSession.persistSessionData ? '' : 'not '
        }persisted`;
        sessionDetail = '';
      } else {
        // local
        // if (recentSession.filesToOpen.length > 0) {
        //   sessionItem = path.basename(recentSession.filesToOpen[0]);
        //   tooltip = recentSession.filesToOpen.join(', ');
        //   parent = recentSession.workingDirectory;
        // } else {
        sessionItem = path.join(home, 'neurodesktop-storage');
        // parent = path.dirname(recentSession.workingDirectory);
        tooltip = path.join(home, 'neurodesktop-storage');
        // }

        // if (parent.startsWith(home)) {
        //   const relative = path.relative(home, parent);
        //   sessionDetail = `~${path.sep}${relative}`;
        // } else {
        //   sessionDetail = parent;
        // }
      }

      recentSessionList.push({
        isRemote: !!recentSession.remoteURL,
        linkLabel: sessionItem,
        linkTooltip: tooltip,
        linkDetail: sessionDetail
      });
    }

    this._viewReady.then(() => {
      this._view.webContents.send(
        EventTypeRenderer.SetRecentSessionList,
        recentSessionList,
        resetCollapseState
      );
    });
  }

  private _isDarkTheme: boolean;
  private _view: BrowserView;
  private _viewReady: Promise<void>;
  // private _registry: IRegistry;
  private _pageSource: string;
}

export namespace WelcomeView {
  export interface IOptions {
    isDarkTheme: boolean;
    registry: IRegistry;
  }
}
