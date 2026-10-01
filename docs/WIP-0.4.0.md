# Devam eden iş: 0.4.0 — güncelleme, yükseltmeli kurulum, karanlık tema

Durum tarihi: 1 Ekim 2026. Dal: `wip/0.4.0-updater` (henüz `main`'e alınmadı).
`main` ve yayımlanmış son sürüm: [v0.3.1](https://github.com/jordenss00-coder/Pdf/releases/tag/v0.3.1).
Bu belge iş `main`'e alınıp 0.4.0 yayımlanınca STATUS/CHANGELOG'a taşınıp silinmeli.

## İstenenler

1. Uygulama yeni sürümü denetlesin; yeni sürüm gelince indirip kursun.
2. Kurulum dosyası eski sürümü fark edip önce kaldırsın, sonra yenisini kursun.
3. Karanlık tema ve görsel iyileştirmeler.

## Yapılanlar (kod tamam, yerel testler geçti)

### Güncelleme denetimi ve indirme — `app/updates.py`

- GitHub sürümleri `api.github.com/repos/jordenss00-coder/Pdf/releases` adresinden okunur.
  Ön sürümler dahil edilir, taslaklar atlanır.
- `vX.Y.Z` etiketli, `PDF-Atolye-Setup.exe` ve `SHA256SUMS.txt` varlıkları olan en yeni sürüm seçilir.
- Varlık adresleri yalnızca bu deponun `releases/download/` yolundan kabul edilir.
  `PDF_UPDATE_FEED` ile yalnızca loopback (127.0.0.1/localhost) test kaynağı kullanılabilir.
- Sonuç `config.json` içinde `update_check` olarak saklanır.
- Açılışta otomatik denetim en çok 6 saatte bir yapılır. Ayarlardan kapatılabilir (`update_auto`).
- İndirme arka planda yapılır ve ilerlemesi izlenir. SHA-256 özeti ve boyut doğrulanır.
  Ardından dosya `%LOCALAPPDATA%\PDFAtolye\updates\PDF-Atolye-Setup-X.Y.Z.exe` olur ve `pending.json` yazılır.
  Eşleşmeyen dosya silinir.
- `pending_installer()` kurulumdan hemen önce özeti yeniden doğrular. Kayıttaki dosya adı sabit kalıpla eşleşmeli
  (yol kaçışı yok) ve sürüm kurulu sürümden yeni olmalı.
- Sunucu açılışında yarım ya da eskimiş indirmeler temizlenir.
- API: `GET /api/update[?auto=true]`, `POST /api/update/check`, `/download`, `/auto`.
  Yalnızca Windows masaüstünde açıktır; diğer durumlarda 404 döner. `/api/runtime` yanıtına `updates` alanı eklendi.

### Kurulumu başlatma — `desktop.py`

- Pencere süreci `PDFAtolyeDesktopApp` adlı mutex'i tutar. Kurulum, uygulama kapanana kadar bunu bekler.
- `DesktopApi.install_update()` pywebview `js_api` üzerinden sayfaya açılır.
  - Doğrulanmış kurulumu süreç ağacının dışında başlatır: `/SILENT /SUPPRESSMSGBOXES /NORESTART /UPDATE=1`.
  - Pencereyi `confirm_close=False` yaparak kapatır. Aksi halde `destroy()` "kapatılsın mı?" sorusunu gösteriyor.
  - Kurulum sunucu sürecinden başlatılmaz, çünkü kapanışta `taskkill /T` sunucunun süreç ağacını öldürüyor.
- `--update-smoke-test RAPOR.json`: kaynak → indirme → SHA-256 → kurulumu `/VERYSILENT /LOG=…` ile başlatma.
  CI uçtan uca testi için eklendi.
- `--ui-smoke-test` artık `window.pywebview.api.install_update` köprüsünün varlığını da doğruluyor.

### Kurulum — `deploy/windows-installer.iss`

- Sürüm artık `scripts/build-windows.ps1` tarafından `app/version.py` dosyasından okunup `/DAppVersion=` ile veriliyor.
- Dosyaya UTF-8 BOM eklendi; Türkçe metinler için gerekli.
- `InitializeSetup`, uygulamanın açık olup olmadığına iki yoldan bakar: mutex ve WMI ile `PDF-Atolye.exe` süreci.
  Süreç kontrolü 0.3.x içindir, çünkü o sürümlerde mutex yok.
  - Sessiz kurulumda 90 saniye bekler.
  - Normal kurulumda "kapat ve Tamam'a bas" uyarısı gösterir.
- `PrepareToInstall`, önceki kurulumu `HKCU\…\Uninstall\{A77D5BC2-…}_is1` kaydından bulur.
  Kaldırıcıyı `/VERYSILENT` ile çalıştırır ve kayıt silinene kadar bekler.
  Günlüğe `Previous version removed: X` satırını yazar.
- Hazır sayfasında "kurulu sürüm kaldırılacak" bilgisi gösterilir.
- `/UPDATE=1` ile çalıştırılırsa kurulum sonunda uygulamayı yeniden açar.
- Kullanıcı verisi (`%LOCALAPPDATA%\PDFAtolye`) kurulum klasöründe (`…\Programs\PDFAtolye`) olmadığı için korunur.

### Arayüz

- `static/js/theme.js`:
  - Varsayılan tema sistem ayarıdır. Düğme o an görünen temanın tersine geçer; seçim sistemle aynıysa sabitleme kalkar.
  - Seçim `localStorage` içinde `pdf-theme` anahtarıyla saklanır.
  - `index.html` içindeki satır içi betik, yanlış temanın bir anlığına görünmesini engeller.
- `static/js/updates.js`:
  - Üst şeritte "yayınlandı → indiriliyor (%) → doğrulanıyor → kurulmaya hazır / hata" durumları gösterilir.
  - "Neler yeni?" penceresi sürüm notlarını düz metin olarak gösterir.
  - Kurulum onayı istenir. Ayarlar düğmesinde rozet çıkar. Güncellemeden sonraki ilk açılışta bildirim gösterilir.
- Ayarlar penceresi bölümlere ayrıldı: Görünüm, Güncellemeler, Bu bilgisayarda bulunanlar, Yapay zekâ.
- Koyu mod düzeltmeleri:
  - Editörde sayfanın arkası artık `--canvas` değişkenini kullanıyor; önceden açık gri sabit bir renkti.
  - "Başka PDF aracı seç" menüsü diğer form alanlarıyla aynı stilde (`.input`).
  - Hata/tamam renkleri koyu temada okunur.
- Görsel iyileştirmeler:
  - Araç kartlarında yükselme ve gölge.
  - Düğmelere geçiş ve basma efekti.
  - Hap biçimli kategori filtreleri.
  - İnce, temaya uyan kaydırma çubukları.
  - Pencere ve bildirimlerde giriş animasyonu.
  - Seçim rengi ve `accent-color`.
- Sürüm 0.4.0 yapıldı (`app/version.py`).

## Doğrulananlar (bu bilgisayarda)

- 37 Python testi: yeni `tests/test_updates.py`, masaüstü ve API testleri dahil.
- 13 JavaScript modülünün sözdizimi.
- `scripts/check-editor.cjs`: Edge düzenleyici regresyonu geçti.
- `scripts/check-update-ui.cjs` sahte kaynağa karşı geçti. Sınananlar:
  - bildirim şeridi ve sürüm notları;
  - tema sabitleme, yenilemede korunma ve sisteme dönüş;
  - 87 MB indirmenin ilerlemesi, SHA-256 sonrası "kurulmaya hazır" durumu;
  - ayarlardaki otomatik denetimin kaydedilmesi.
- Açık ve koyu temada ana sayfa, araç, editör ve ayarlar ekran görüntüleri gözle kontrol edildi.

## Doğrulanmayanlar / riskler

- **Inno Setup betiği hiç derlenmedi.** Bu bilgisayarda Inno Setup, PyInstaller ve pywebview yok.
  `[Code]` bölümündeki derleme hataları ancak GitHub'daki "Build Windows Desktop" işinde görülecek.
- Gerçek WebView2 penceresinde "Şimdi kur" ve pencerenin onaysız kapanması elle denenmedi.
- Inno günlük satırları (`Installation process succeeded`, `Log closed`) aşağıdaki CI taslağında varsayıldı.
  İlk çalıştırmada doğrulanmalı.
- Tema seçimi `localStorage` içinde ve köken bağlantı noktasına bağlı. Port `desktop-port.txt` ile sabit kalıyor;
  port değişirse tema sistem ayarına döner.

## Kalan işler (sırayla)

1. `.github/workflows/windows-desktop.yml` dosyasına aşağıdaki iki adımı ekle.
   "Test installer and installed executable" adımından sonra, pencere testinden önce gelmeli.
   Hata durumunda `${{ runner.temp }}/*.log` dosyaları da yüklenmeli. `timeout-minutes` 45 yapıldı.
2. Dalı `main`'e al ve gönder. Windows derlemesini izle; Inno `[Code]` hatalarını düzelt.
3. Belgeler:
   - CHANGELOG'a 0.4.0 bölümü;
   - STATUS, ROADMAP ve TEST_REPORT güncellemesi;
   - WINDOWS.md'ye güncelleme ve tema kullanımı;
   - `docs/RELEASE-0.4.0.md`;
   - bu dosyanın kaldırılması.
4. Kullanıcıya sorduktan sonra v0.4.0 ön sürümünü yayımla. Kaynak, CI çıktısındaki
   `PDF-Atolye-Setup.exe`, ZIP ve `SHA256SUMS.txt` dosyalarıdır.
   0.3.x kullanıcıları 0.4.0'ı elle kurar; yeni kurulum eskisini kaldırır. Uygulama içi güncelleme 0.4.0'dan sonra çalışır.
5. İsteğe bağlı: eklenen metin PDF'ten kopyalanınca U+00A0 boşluk sorunu (TEST_REPORT'ta not edildi).

### CI adımı taslağı: eski sürümün üzerine kurulum

```yaml
      - name: Upgrade over the previous release
        shell: pwsh
        run: |
          $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{A77D5BC2-54A5-4B23-A321-2817D533FEC0}_is1'
          $old = Join-Path $env:RUNNER_TEMP 'previous-setup.exe'
          Invoke-WebRequest 'https://github.com/jordenss00-coder/Pdf/releases/download/v0.3.1/PDF-Atolye-Setup.exe' -OutFile $old
          $p = Start-Process $old -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -PassThru -Wait
          if ($p.ExitCode -ne 0 -or (Get-ItemProperty $key).DisplayVersion -ne '0.3.1') { throw 'Previous version install failed' }
          $data = Join-Path $env:LOCALAPPDATA 'PDFAtolye'
          New-Item -ItemType Directory -Force $data | Out-Null
          Set-Content (Join-Path $data 'keep-me.txt') 'user data'
          $log = Join-Path $env:RUNNER_TEMP 'upgrade-setup.log'
          $p = Start-Process release/PDF-Atolye-Setup.exe -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',"/LOG=$log") -PassThru -Wait
          if ($p.ExitCode -ne 0) { Get-Content $log; throw 'Upgrade failed' }
          if (-not (Select-String -Path $log -Pattern 'Previous version removed: 0.3.1' -Quiet)) { Get-Content $log; throw 'Previous version was not removed first' }
          $version = (Select-String -Path app/version.py -Pattern '"(.+)"').Matches[0].Groups[1].Value
          if ((Get-ItemProperty $key).DisplayVersion -ne $version) { throw 'New version not registered' }
          if (-not (Test-Path (Join-Path $data 'keep-me.txt'))) { throw 'User data was removed' }
          Copy-Item $log release/
```

### CI adımı taslağı: uygulama içinden güncelleme (yerel sahte kaynak)

```yaml
      - name: Update the installed app from a release feed
        shell: pwsh
        run: |
          $feed = Join-Path $env:RUNNER_TEMP 'feed'
          New-Item -ItemType Directory -Force "$feed/v99.0.0" | Out-Null
          Copy-Item release/PDF-Atolye-Setup.exe, release/SHA256SUMS.txt "$feed/v99.0.0/"
          $size = (Get-Item release/PDF-Atolye-Setup.exe).Length
          $base = 'http://127.0.0.1:8899'
          @(@{ tag_name='v99.0.0'; name='CI update'; draft=$false; prerelease=$true; body='CI'; assets=@(
              @{ name='PDF-Atolye-Setup.exe'; size=$size; browser_download_url="$base/v99.0.0/PDF-Atolye-Setup.exe" },
              @{ name='SHA256SUMS.txt'; size=200; browser_download_url="$base/v99.0.0/SHA256SUMS.txt" }) }) |
            ConvertTo-Json -Depth 5 -AsArray | Set-Content "$feed/releases.json"
          $server = Start-Process python -ArgumentList @('-m','http.server','8899','--bind','127.0.0.1','--directory',$feed) -PassThru -WindowStyle Hidden
          $install = Join-Path $env:LOCALAPPDATA 'Programs\PDFAtolye'
          try {
            $env:PDF_UPDATE_FEED = "$base/releases.json"
            $report = Join-Path $env:RUNNER_TEMP 'update-smoke.json'
            $p = Start-Process "$install/PDF-Atolye.exe" -ArgumentList @('--update-smoke-test', $report) -PassThru -WindowStyle Hidden
            if (-not $p.WaitForExit(300000)) { Stop-Process -Id $p.Id -Force; throw 'Update test timed out' }
            Get-Content $report
            if ($p.ExitCode -ne 0 -or (Get-Content $report | ConvertFrom-Json).status -ne 'passed') { throw 'Update download failed' }
            $log = (Get-Content $report | ConvertFrom-Json).setup_log
            $deadline = (Get-Date).AddMinutes(5)
            while (-not ((Test-Path $log) -and (Select-String -Path $log -Pattern 'Log closed' -Quiet))) {
              if ((Get-Date) -gt $deadline) { Get-Content $log -ErrorAction SilentlyContinue; throw 'Updater-started setup did not finish' }
              Start-Sleep 2
            }
            if (-not (Select-String -Path $log -Pattern 'Installation process succeeded' -Quiet)) { Get-Content $log; throw 'Update install failed' }
            if (-not (Select-String -Path $log -Pattern 'Previous version removed' -Quiet)) { Get-Content $log; throw 'Update did not remove the previous version' }
            Copy-Item $report, $log release/
          } finally { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
          $u = Start-Process "$install/unins000.exe" -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -PassThru -Wait
          if ($u.ExitCode -ne 0) { throw 'Uninstall failed' }
```

## Yeni bilgisayarda devam etme

```powershell
git clone https://github.com/jordenss00-coder/Pdf.git
cd Pdf
git checkout wip/0.4.0-updater
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python -m unittest discover -s tests
node scripts/check-js.mjs
```

- Windows paketi için ayrıca `requirements-desktop.txt` ve Inno Setup 6 gerekir: `scripts/build-windows.ps1`.
  Paketlemenin yerelde yapılması şart değil; GitHub Actions derliyor.
- `gh` CLI ile `gh auth login`. Windows derlemesi dalda elle tetiklenebilir:
  `gh workflow run "Build Windows Desktop" --ref wip/0.4.0-updater`.
- Edge testleri için Playwright: `npm i -D playwright` ya da var olan kurulumu `PLAYWRIGHT_MODULE` ile göster.
  Testler bilgisayardaki Edge'i kullanır.
  - Düzenleyici: `python run.py --port 8876 --no-browser`, ardından
    `node scripts/check-editor.cjs yapay-iki-sayfa.pdf`. İki sayfalı PDF'yi PyMuPDF ile üret.
  - Güncelleme arayüzü:
    1. `python scripts/fake-update-feed.py --setup <herhangi bir dosya>` ile sahte kaynağı başlat.
    2. Masaüstü modunda test sunucusunu başlat:
       `PDF_MODE=local PDF_DESKTOP_TOKEN=uitest-desktop-token-0123456789 PDF_UPDATE_DIR=<geçici>/updates PDF_CONFIG_FILE=<geçici>/config.json PDF_DATA_DIR=<geçici>/data PDF_UPDATE_FEED=http://127.0.0.1:8899/releases.json`
       ortamıyla `python -c "import uvicorn; uvicorn.run('app.main:app', host='127.0.0.1', port=8877)"`.
    3. `node scripts/check-update-ui.cjs` çalıştır. Her denemede boş bir geçici klasör kullan.
- Önceki işin geçmişi: Codex oturum kayıtları ilk bilgisayarda `~/.codex/sessions/2026/10/01` altında.
  Kullanıcı isteklerinin özeti STATUS ve bu belgede.
