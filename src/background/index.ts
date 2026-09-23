// MV3 service worker. It is ephemeral — never keep state in module variables;
// persist anything important to chrome.storage.local.

// Clicking the toolbar icon opens the side panel.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});
