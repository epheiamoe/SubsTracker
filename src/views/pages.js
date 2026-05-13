import themeResourcesHtml from './theme-resources.html';
import appHtml from './app.html';
import appJsRaw from './app-client.js.txt';
import subscriptionListJsRaw from './subscription-list.js.txt';
import configJsRaw from './config.js.txt';

function injectTheme(html) {
  return html.replace(/\$\{themeResources\}/g, themeResourcesHtml);
}

const appPage = {
  html: injectTheme(appHtml),
  appJs: appJsRaw,
  subscriptionListJs: subscriptionListJsRaw,
  configJs: configJsRaw
};

export { appPage };
