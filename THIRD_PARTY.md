# Third-party dependencies

Build/test dependencies are pinned in `package-lock.json`:

- esbuild — MIT: https://github.com/evanw/esbuild
- Playwright — Apache-2.0: https://github.com/microsoft/playwright

The existing application loads Firebase SDK, Bootstrap, Font Awesome and SheetJS from their original CDN URLs. No additional production CDN is introduced.

Files in `tests/vendor` are test copies of the existing frontend dependencies:

- Bootstrap 5.3.0 — MIT: https://github.com/twbs/bootstrap/blob/v5.3.0/LICENSE
- SheetJS Community Edition 0.20.3 — Apache-2.0: https://git.sheetjs.com/sheetjs/sheetjs/src/branch/master/LICENSE

Original copyright/license headers are retained in the vendor files.
