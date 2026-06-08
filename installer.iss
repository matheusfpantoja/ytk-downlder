[Setup]
AppName=YTK DOWNLDER
AppVersion=1.0
AppPublisher=Karl
DefaultDirName={autopf}\YTK DOWNLDER
DefaultGroupName=YTK DOWNLDER
OutputBaseFilename=YTK-DOWNLDER-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "dist\YTK DOWNLDER\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\YTK DOWNLDER"; Filename: "{app}\YTK DOWNLDER.exe"
Name: "{commondesktop}\YTK DOWNLDER"; Filename: "{app}\YTK DOWNLDER.exe"

[Run]
Filename: "{app}\YTK DOWNLDER.exe"; Description: "Abrir YTK DOWNLDER"; Flags: nowait postinstall skipifsilent

[Registry]
Root: HKCU; Subkey: "Software\YTK DOWNLDER"; ValueType: string; ValueName: "DownloadPath"; ValueData: "{code:GetDownloadPath}"

[Code]
var
  DownloadPage: TInputDirWizardPage;

procedure InitializeWizard;
begin
  DownloadPage := CreateInputDirPage(
    wpSelectDir,
    'Pasta de downloads',
    'Onde você quer salvar suas músicas e vídeos?',
    'O YTK DOWNLDER vai salvar todos os arquivos nesta pasta.',
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
