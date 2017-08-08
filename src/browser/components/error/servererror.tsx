// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as React from 'react';

let shell: Electron.Shell = (window as any).require('electron').remote.shell;

export
namespace ServerError {
    export
    interface Props {
        launchFromPath: () => void;
    }
}

export
function ServerError(props: ServerError.Props) {
    return (
        <div className='jpe-ServerError-body'>
            <div className='jpe-ServerError-content'>
                <div className='jpe-ServerError-icon'></div>
                <h1 className='jpe-ServerError-header'>Jupyter Server Not Found</h1>
                <p className='jpe-ServerError-subhead'>We were unable to launch a Jupyter server, which is a prerequisite for JupyterLab Native. If you already have a Jupyter server installed, specify the path location below. Otherwise, try installing or updating Jupyter.</p>
                <div className='jpe-ServerError-btn-container'>
                    <button className='jpe-ServerError-btn' onClick={props.launchFromPath}>CHOOSE PATH</button>
                    <button className='jpe-ServerError-btn' onClick={() => {
                        shell.openExternal('https://www.jupyter.org/install.html');
                        }}>INSTALL JUPYTER</button>
                </div>
            </div>
        </div>
    );
}
