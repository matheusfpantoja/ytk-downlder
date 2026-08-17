[Setup]
AppId={{8E3C1A74-0B2F-4D91-9A55-A7C1D0E5F201}
AppName=YTK DOWNLDER
AppVersion=2.0
AppPublisher=Karl
DefaultDirName={autopf}\YTK DOWNLDER
DefaultGroupName=YTK DOWNLDER
OutputBaseFilename=YTK-DOWNLDER-Setup-v2.0
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\YTK DOWNLDER.exe
UninstallDisplayName=YTK DOWNLDER
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
Source: "dist\YTK DOWNLDER\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "icon.ico"; DestDir: "{app}"; Flags: ignoreversion
; Instalador do WebView2 — sem ele, a janela do app abre em branco em
; máquinas que não têm o runtime (Windows 10 antigo, LTSC, imagens limpas).
Source: "redist\MicrosoftEdgeWebView2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: not WebView2Instalado

[Icons]
Name: "{group}\YTK DOWNLDER"; Filename: "{app}\YTK DOWNLDER.exe"; IconFilename: "{app}\icon.ico"
Name: "{autodesktop}\YTK DOWNLDER"; Filename: "{app}\YTK DOWNLDER.exe"; IconFilename: "{app}\icon.ico"

[Run]
Filename: "{tmp}\MicrosoftEdgeWebView2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Instalando componente necessário do Windows (WebView2)..."; Check: not WebView2Instalado
Filename: "{app}\YTK DOWNLDER.exe"; Description: "Abrir YTK DOWNLDER"; Flags: nowait postinstall skipifsilent

[Registry]
Root: HKCU; Subkey: "Software\YTK DOWNLDER"; ValueType: string; ValueName: "DownloadPath"; ValueData: "{code:GetDownloadPath}"; Flags: uninsdeletekey

[Code]
var
  DownloadPage: TInputDirWizardPage;

function WebView2Instalado(): Boolean;
var
  V: String;
begin
  Result := False;
  if RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', V) then
    Result := (V <> '') and (V <> '0.0.0.0');
  if not Result then
    if RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', V) then
      Result := (V <> '') and (V <> '0.0.0.0');
  if not Result then
    if RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', V) then
      Result := (V <> '') and (V <> '0.0.0.0');
end;

procedure InitializeWizard;
begin
  DownloadPage := CreateInputDirPage(
    wpSelectDir,
    'Pasta de downloads',
    'Onde você quer salvar suas músicas e vídeos?',
    'O YTK DOWNLDER vai salvar todos os arquivos nesta pasta. Você pode mudar isso depois, dentro do programa.',
    False,
    ''
  );
  DownloadPage.Add('');
  DownloadPage.Values[0] := ExpandConstant('{userdocs}\Músicas-YT');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = DownloadPage.ID then begin
    if DownloadPage.Values[0] = '' then begin
      MsgBox('Por favor, escolha uma pasta para os downloads.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function GetDownloadPath(Param: String): String;
begin
  Result := DownloadPage.Values[0];
end;