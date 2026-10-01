# Build on Windows with Python 3.12: python -m PyInstaller desktop.spec --noconfirm
from PyInstaller.utils.hooks import collect_all, collect_submodules, copy_metadata

web_data, web_bins, web_hidden = collect_all('webview')
datas = [('static', 'static'), ('tessdata', 'tessdata')] + web_data
for package in ('anthropic', 'pikepdf', 'pyhanko', 'pdf2docx'):
    datas += copy_metadata(package)

a = Analysis(['desktop.py'], pathex=['.'],
    binaries=web_bins, datas=datas,
    hiddenimports=web_hidden + collect_submodules('app') + [
        'uvicorn.logging', 'uvicorn.loops.auto', 'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl', 'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan.on', 'webview.platforms.edgechromium', 'webview.platforms.winforms',
        'win32timezone', 'win32com.client', 'pythoncom', 'httpx'],
    excludes=['PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'pytest', 'tkinter'],
    noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='PDF-Atolye',
          console=False, debug=False, strip=False, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='PDF-Atolye')
