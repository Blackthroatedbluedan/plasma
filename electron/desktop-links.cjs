const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/** Desktop link display names (exact strings Daniel locked for shop installers). */
const PLASMA_INBOX_NAME = 'Plasma Inbox';
const PLASMA_OUTBOX_NAME = 'Plasma Outbox';

/**
 * Windows shop requirement: Desktop links to real inbox/outbox folders.
 * Junctions preferred; .lnk shortcuts if junction creation fails (e.g. policy).
 * Idempotent when an existing link already points at the correct target.
 */
function ensureDesktopFolderLinks(desktopDir, targets) {
  if (process.platform !== 'win32') return;
  if (!desktopDir || !fs.existsSync(desktopDir)) return;

  for (const { name, target } of targets) {
    fs.mkdirSync(target, { recursive: true });
    const linkPath = path.join(desktopDir, name);
    ensureDesktopDataLink(linkPath, path.resolve(target));
  }
}

function ensureDesktopDataLink(linkPath, targetPath) {
  if (linkAlreadyPointsAt(linkPath, targetPath)) return;

  const lnkPath = `${linkPath}.lnk`;
  if (shortcutPointsAt(lnkPath, targetPath)) return;

  if (fs.existsSync(linkPath) || fs.existsSync(lnkPath)) {
    console.warn(
      `[plasma] Desktop link "${path.basename(linkPath)}" exists but does not point at ${targetPath}; leaving it unchanged.`,
    );
    return;
  }

  if (tryCreateJunction(linkPath, targetPath)) return;
  if (tryCreateShortcut(lnkPath, targetPath)) return;

  console.error(
    `[plasma] Failed to create Desktop link "${path.basename(linkPath)}" → ${targetPath} (junction and shortcut both failed).`,
  );
}

function linkAlreadyPointsAt(linkPath, targetPath) {
  if (!fs.existsSync(linkPath)) return false;
  return junctionPointsAt(linkPath, targetPath);
}

function tryCreateJunction(linkPath, targetPath) {
  try {
    fs.symlink(targetPath, linkPath, 'junction');
    console.log(`[plasma] Created desktop junction: ${linkPath} → ${targetPath}`);
    return true;
  } catch (err) {
    console.warn(`[plasma] Junction failed for ${linkPath}: ${err.message}`);
    return false;
  }
}

function tryCreateShortcut(lnkPath, targetPath) {
  try {
    const escapedLnk = lnkPath.replace(/'/g, "''");
    const escapedTarget = targetPath.replace(/'/g, "''");
    const ps = `
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut('${escapedLnk}')
$s.TargetPath = '${escapedTarget}'
$s.Save()
`;
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { stdio: 'pipe', windowsHide: true },
    );
    console.log(`[plasma] Created desktop shortcut: ${lnkPath} → ${targetPath}`);
    return true;
  } catch (err) {
    console.warn(`[plasma] Shortcut failed for ${lnkPath}: ${err.message}`);
    return false;
  }
}

function junctionPointsAt(linkPath, targetPath) {
  try {
    const stat = fs.lstatSync(linkPath);
    if (!stat.isSymbolicLink()) return false;
    const linkTarget = fs.readlinkSync(linkPath);
    const resolved = path.resolve(path.dirname(linkPath), linkTarget);
    return pathsEqual(resolved, targetPath);
  } catch (_) {
    return false;
  }
}

function shortcutPointsAt(lnkPath, targetPath) {
  if (process.platform !== 'win32' || !fs.existsSync(lnkPath)) return false;
  try {
    const escapedLnk = lnkPath.replace(/'/g, "''");
    const ps = `(New-Object -ComObject WScript.Shell).CreateShortcut('${escapedLnk}').TargetPath`;
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    ).trim();
    return pathsEqual(path.resolve(out), targetPath);
  } catch (_) {
    return false;
  }
}

function pathsEqual(a, b) {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

module.exports = {
  ensureDesktopFolderLinks,
  junctionPointsAt,
  shortcutPointsAt,
  pathsEqual,
  PLASMA_INBOX_NAME,
  PLASMA_OUTBOX_NAME,
};
