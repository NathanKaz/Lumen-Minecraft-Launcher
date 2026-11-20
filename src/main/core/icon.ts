import path from 'node:path'
import fs from 'fs-extra'
import { app, nativeImage } from 'electron'

/**
 * The launcher logo. Reading through fs keeps it working both in dev and when
 * the app is bundled into an asar archive (nativeImage paths may not resolve
 * inside asar, while Node's fs does).
 */
export function appIcon(size?: number): Electron.NativeImage {
  const candidates = [
    path.join(__dirname, '..', '..', 'build', 'icon.png'),
    path.join(app.getAppPath(), 'build', 'icon.png'),
    path.join(process.resourcesPath, 'build', 'icon.png')
  ]
  for (const file of candidates) {
    try {
      const image = nativeImage.createFromBuffer(fs.readFileSync(file))
      if (image.isEmpty()) continue
      return size ? image.resize({ width: size, height: size }) : image
    } catch {
      // A candidate is only a hint; keep looking in the other locations.
    }
  }
  return nativeImage.createEmpty()
}
