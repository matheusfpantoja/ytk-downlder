# YTK DOWNLDER — PRD

## Versão: v1.0
## Data: 2026-08-10

## Objetivo do produto
App desktop Windows para download de música/vídeo do YouTube, SoundCloud, Mixcloud e 1000+ sites (via yt-dlp), com interface própria em PyWebView (HTML/CSS/JS vanilla). Nome "YTK DOWNLDER" (erro ortográfico intencional).

## Stack
Ver `CLAUDE.md` na raiz para detalhes completos de stack, estrutura de arquivos e convenções de código. Este PRD registra apenas decisões de produto e racional técnico — não duplica o que já está documentado lá.

## Decisões técnicas registradas nesta versão

- **Tema visual**: migrado de "Grayscale Clean" (cinza) para tema claro + acento azul. Sidebar `#f3f3f3` com texto `#616161`; botões primários e seleção de pills (Tipo/Qualidade/Formato/Recorte/Extras/Fonte) em azul (`#0781fc`, hover `#0670df`), com estado selecionado suavizado (`rgba(7,129,252,0.10)` bg / `rgba(7,129,252,0.35)` borda).
- **Logo/ícone**: símbolo (seta estilizada) extraído da arte fornecida pelo usuário, isolado do texto "YTK Downloader" (ícones pequenos com texto ficam ilegíveis). Usado como `.ico` multi-resolução (16–256px) para o executável/instalador e como imagem na sidebar.
- **Busca (aba Buscar)**: resultados do YouTube mostram dois botões explícitos (🎵 Áudio / 🎬 Vídeo), pois a plataforma permite baixar ambos — evita depender do que estava marcado previamente na aba Download. SoundCloud/Mixcloud mantêm botão único (⬇ Baixar), sempre como música, já que não oferecem vídeo.
- **Fila de downloads**: redesenhada para o padrão claro+azul (era cinza sólido). Barra de progresso usa a cor de acento. Botão "Cancelar" adicionado durante download ativo (chama `cancel_download()` da API Python), substituindo o ✕ que antes ficava só desabilitado sem alternativa.
- **Aviso de playlist**: removida a mensagem "Link não reconhecido como playlist", que aparecia (incorretamente) em praticamente qualquer link de vídeo comum colado, não só em casos ambíguos.
- **Dailymotion**: extrator exige impersonation de navegador (fingerprint TLS/HTTP2) para passar da proteção anti-bot do site. Dependência `curl_cffi` adicionada ao `requirements.txt`.
- **FFmpeg**: a pasta `bin/` (com `ffmpeg.exe`/`ffprobe.exe`) NÃO é versionada no Git (`.gitignore`) — precisa ser baixada manualmente (gyan.dev essentials build) em cada máquina de desenvolvimento nova. Isso é ortogonal ao empacotamento final: o instalador (PyInstaller + Inno Setup) ainda vai embutir o FFmpeg dentro do `.exe` distribuído ao usuário final quando o bundling (Option B, adiado) for retomado — o usuário final nunca precisa instalar FFmpeg à parte.
- **Histórico do Git reescrito** (2026-08-10, via `git filter-repo`): removidos ~200MB de binários do FFmpeg que tinham sido commitados por engano durante um merge. Qualquer clone feito antes dessa data está obsoleto.

## Decisões adiadas
- FFmpeg bundling (Option B: `--add-data` no PyInstaller `.spec` + `recursesubdirs` no `installer.iss`, teste em VM limpa) — adiado para sessão futura.

## Bugs conhecidos em aberto
- Download via aba Buscar não inicia quando a fonte é YouTube. Uma correção foi tentada em `search_youtube` (reconstrução da URL a partir do ID, já que a extração `extract_flat` do yt-dlp pode retornar só o ID em vez da URL completa), mas não foi confirmado se resolveu — diagnóstico interrompido por troca de máquina (desktop → notebook) antes de coletar os dados necessários.
