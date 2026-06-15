const { ipcMain } = require('electron');

function registerWinStrategyIpc({ winStrategyStore }) {
  ipcMain.handle('win-strategy:load-state', () => winStrategyStore.loadWinStrategy());
  ipcMain.handle('win-strategy:clear', () => winStrategyStore.clearWinStrategy());
}

module.exports = {
  registerWinStrategyIpc,
};
