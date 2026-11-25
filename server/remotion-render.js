import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

// Prefer an installed Chrome/Edge: Remotion's downloaded headless shell is unsigned and is killed by macOS on Apple Silicon.
function findBrowser() {
  const cands = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
  ];
  return cands.find((p) => p && fs.existsSync(p)) || null;
}

let bundled;
export async function renderCaptioned({ props, width, height, fps, durationInFrames, out, onProgress }) {
  const browserExecutable = findBrowser();
  bundled ??= await bundle({ entryPoint: path.resolve('remotion/index.jsx') });
  const base = await selectComposition({ serveUrl: bundled, id: 'Captioned', inputProps: props, browserExecutable });
  const composition = { ...base, width, height, fps, durationInFrames };
  await renderMedia({
    composition, serveUrl: bundled, codec: 'h264', outputLocation: out, inputProps: props, browserExecutable,
    onProgress: ({ progress }) => onProgress?.(progress),
  });
}
