#define AppVersion "0.3.0"
[Setup]
AppId={{A77D5BC2-54A5-4B23-A321-2817D533FEC0}
AppName=PDF Atölye
AppVersion={#AppVersion}
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

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
  // WebView2 is supplied by Microsoft, not silently downloaded by this installer.
  // Runtime availability is checked when the application starts.
end;
