const fs = require('fs');
const path = require('path');

/**
 * Windows shop convenience: Desktop junctions to real inbox/outbox folders.
 * Idempotent when links already point at the correct targets.
 */
function ensureDesktopFolderLinks(desktopDir, targets) {
  if (process.platform !== 'win32') return;
  if (!desktopDir || !fs.existsSync(desktopDir)) return;

  for (const { name, target } of targets) {
    fs.mkdirSync(target, { recursive: true });
    const linkPath = path.join(desktopDir, name);
    ensureDirectoryJunction(linkPath, path.resolve(target));
  }
}

function ensureDirectoryJunction(linkPath, targetPath) {
  try {
    if (fs.existsSync(linkPath)) {
      if (junctionPointsAt(linkPath, targetPath)) return;
      console.warn(
        `[plasma] Desktop folder "${path.basename(linkPath)}" exists but does not point at ${targetPath}; leaving it unchanged.`,
      );
      return;
    }
    fs.symlink(targetPath, linkPath, 'junction');
    console.log(`[plasma] Created desktop junction: ${linkPath} → ${targetPath}`);
  } catch (err) {
    console.error(`[plasma] Could not create desktop junction ${linkPath}:`, err.message);
  }
}

function junctionPointsAt(linkPath, targetPath) {
  try {
    const stat = fs.lstatSync(linkPath);
    if (!stat.isSymbolicLink() && !stat.isDirectory()) return false;
    const linkTarget = fs.readlinkSync(linkPath);
    const resolved = path.resolve(path.dirname(linkPath), linkTarget);
    return path.resolve(resolved) === path.resolve(targetPath);
  } catch (_) {
    return false;
  }
}

module.exports = { ensureDesktopFolderLinks };
