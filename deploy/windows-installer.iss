; Built by scripts/build-windows.ps1, which passes the version from app/version.py.
#ifndef AppVersion
  #error AppVersion is missing: build with scripts/build-windows.ps1
#endif
[Setup]
AppId={{A77D5BC2-54A5-4B23-A321-2817D533FEC0}
AppName=PDF Atölye
AppVersion={#AppVersion}
VersionInfoVersion={#AppVersion}
AppPublisher=jordenss00-coder
AppPublisherURL=https://github.com/jordenss00-coder/Pdf
AppSupportURL=https://github.com/jordenss00-coder/Pdf/issues
DefaultDirName={localappdata}\Programs\PDFAtolye
DefaultGroupName=PDF Atölye
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\release
OutputBaseFilename=PDF-Atolye-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\PDF-Atolye.exe
CloseApplications=yes
SetupLogging=yes

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Masaüstü kısayolu oluştur"; Flags: checkedonce

[Files]
Source: "..\dist\PDF-Atolye\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\PDF Atölye"; Filename: "{app}\PDF-Atolye.exe"
Name: "{autodesktop}\PDF Atölye"; Filename: "{app}\PDF-Atolye.exe"; Tasks: desktopicon
Name: "{group}\PDF Atölye kaldır"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\PDF-Atolye.exe"; Description: "PDF Atölye'yi aç"; Flags: nowait postinstall skipifsilent
; In-app updates pass /UPDATE=1: reopen the app after a silent install.
Filename: "{app}\PDF-Atolye.exe"; Flags: nowait; Check: IsUpdateRun

[Code]
const
  AppMutexName = 'PDFAtolyeDesktopApp';
  AppExeName = 'PDF-Atolye.exe';
  UninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{A77D5BC2-54A5-4B23-A321-2817D533FEC0}_is1';

var
  PreviousVersion: String;
  PreviousUninstaller: String;

function IsUpdateRun(): Boolean;
begin
  Result := ExpandConstant('{param:UPDATE|0}') = '1';
end;

// 0.3.x builds do not create the mutex, so also look for the process by name.
function AppProcessRunning(): Boolean;
var
  Locator, Service, Found: Variant;
begin
  Result := False;
  try
    Locator := CreateOleObject('WbemScripting.SWbemLocator');
    Service := Locator.ConnectServer('', 'root\CIMV2', '', '');
    Found := Service.ExecQuery('SELECT ProcessId FROM Win32_Process WHERE Name = ''' + AppExeName + '''');
    Result := Found.Count > 0;
  except
    Log('Process check failed: ' + GetExceptionMessage);
  end;
end;

function AppRunning(): Boolean;
begin
  Result := CheckForMutexes(AppMutexName) or AppProcessRunning();
end;

function WaitForAppExit(Seconds: Integer): Boolean;
var
  I: Integer;
begin
  for I := 1 to Seconds * 2 do
  begin
    if not AppRunning() then
    begin
      Result := True;
      exit;
    end;
    Sleep(500);
  end;
  Result := not AppRunning();
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if AppRunning() then
  begin
    Log('PDF Atolye is running; waiting for it to close.');
    if WizardSilent() then
    begin
      // An in-app update starts setup just before the app exits.
      if not WaitForAppExit(90) then
      begin
        Log('PDF Atolye did not close; setup cancelled.');
        Result := False;
      end;
    end
    else
      while AppRunning() do
        if MsgBox('PDF Atölye şu an açık. Güncellemek için uygulamayı kapat, sonra Tamam''a bas.',
                  mbError, MB_OKCANCEL) <> IDOK then
        begin
          Result := False;
          exit;
        end;
  end;
  if Result and RegQueryStringValue(HKCU, UninstallKey, 'UninstallString', PreviousUninstaller) then
  begin
    RegQueryStringValue(HKCU, UninstallKey, 'DisplayVersion', PreviousVersion);
    Log('Previous version found: ' + PreviousVersion);
  end;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo,
  MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := '';
  if PreviousUninstaller <> '' then
    Result := 'Kurulu sürüm:' + NewLine + Space + 'PDF Atölye ' + PreviousVersion +
      ' kaldırılacak, yerine {#AppVersion} kurulacak. Ayarların ve dosyaların korunur.' + NewLine + NewLine;
  if MemoDirInfo <> '' then
    Result := Result + MemoDirInfo + NewLine + NewLine;
  if MemoGroupInfo <> '' then
    Result := Result + MemoGroupInfo + NewLine + NewLine;
  if MemoTasksInfo <> '' then
    Result := Result + MemoTasksInfo;
end;

// Remove the previous version first; user data in %LOCALAPPDATA%\PDFAtolye is not part of it.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Uninstaller: String;
  ResultCode, I: Integer;
begin
  Result := '';
  if PreviousUninstaller = '' then
    exit;
  Uninstaller := RemoveQuotes(PreviousUninstaller);
  if not FileExists(Uninstaller) then
  begin
    Log('Previous uninstaller is missing: ' + Uninstaller);
    exit;
  end;
  Log('Removing previous version ' + PreviousVersion);
  if not Exec(Uninstaller, '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_HIDE,
              ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
  begin
    Result := 'Önceki PDF Atölye sürümü (' + PreviousVersion + ') kaldırılamadı. Kod: ' +
      IntToStr(ResultCode) + '. Uygulamayı Ayarlar > Uygulamalar bölümünden kaldırıp kurulumu yeniden başlat.';
    exit;
  end;
  for I := 1 to 120 do
  begin
    if not RegKeyExists(HKCU, UninstallKey) then
      break;
    Sleep(250);
  end;
  Log('Previous version removed: ' + PreviousVersion);
end;
