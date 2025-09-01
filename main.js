/*  main.js — Electron main process  */
const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');

let mainWindow;
const dataDir       = path.join(__dirname, 'data');
const inventoryFile = path.join(dataDir, 'naqshi-store-data.json');
const settingsFile  = path.join(dataDir, 'settings.json');

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, show: false, icon: path.join(__dirname, 'build/icon.png'),
    webPreferences: { contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
  });

  mainWindow.loadFile('src/index.html');
  mainWindow.once('ready-to-show', () => { mainWindow.maximize(); mainWindow.show(); });

  const menu = Menu.buildFromTemplate([
    { label:'File', submenu:[
        { label:'New Item',        accelerator:'CmdOrCtrl+N', click(){ mainWindow.webContents.send('new-item'); } },
        { type:'separator' },
        { label:'Export Data',     accelerator:'CmdOrCtrl+E', click(){ mainWindow.webContents.send('export-data'); } },
        { label:'Import Data', click: async () => {
            const r = await dialog.showOpenDialog(mainWindow,{properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});
            if (!r.canceled) mainWindow.webContents.send('import-data', r.filePaths[0]);
        }},
        { type:'separator' },
        { role:'quit' }
    ]},
    { role:'viewMenu' }
  ]);
  Menu.setApplicationMenu(menu);
}

/* ---------- IPC handlers ---------- */
ipcMain.handle('save-data', async (_, {inventory, settings}) => {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir,{recursive:true});
    fs.writeFileSync(inventoryFile, JSON.stringify(inventory, null, 2));
    fs.writeFileSync(settingsFile,  JSON.stringify(settings,  null, 2));
    return { success:true };
  } catch (e) { return { success:false, error:e.message }; }
});

ipcMain.handle('load-data', async () => {
  let inventory=[], settings={ lastItemId:0, storeName:'Naqshi Gold & Pearls' };
  try {
    if (fs.existsSync(inventoryFile)) inventory = JSON.parse(fs.readFileSync(inventoryFile,'utf8'));
    if (fs.existsSync(settingsFile))  settings  = {...settings, ...JSON.parse(fs.readFileSync(settingsFile,'utf8'))};
  } catch { /* ignore corrupt files */ }
  return { inventory, settings };
});

ipcMain.handle('save-qr-image', async (_, img, filename) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow,{
    defaultPath: filename, filters:[{name:'PNG',extensions:['png']},{name:'PDF',extensions:['pdf']}]
  });
  if (canceled) return { success:false };

  fs.writeFileSync(filePath, img.replace(/^data:image\/png;base64,/,''), 'base64');
  return { success:true };
});

/* ---------- app lifecycle ---------- */
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform!=='darwin') app.quit(); });
app.on('activate',           () => { if (BrowserWindow.getAllWindows().length===0) createWindow(); });