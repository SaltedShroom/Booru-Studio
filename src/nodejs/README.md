# Local Node Wrapper for Booru Studio

This folder contains project-local Node wrappers that use Electron's bundled runtime.

- `node.cmd` - Windows wrapper that launches Electron from `node_modules\electron\dist\electron.exe`.
- `node` - Linux/macOS wrapper that launches Electron from `node_modules/electron/dist/electron`.

These wrappers let `Start Browser.bat` run JavaScript using the Electron runtime instead of requiring a system Node.js install.

If you are packaging the app, the runtime will be packaged with Electron and these wrappers will continue forwarding to the local bundled binary.
