import yt_dlp
import os

# Pasta onde as músicas serão salvas
pasta_musicas = "musicas"
os.makedirs(pasta_musicas, exist_ok=True)

# Configurações do download
opcoes = {
    'format': 'bestaudio/best',
    'outtmpl': f'{pasta_musicas}/%(title)s.%(ext)s',
    'postprocessors': [{
        'key': 'FFmpegExtractAudio',
        'preferredcodec': 'mp3',
        'preferredquality': '192',
    }],
}

# Pedir o link ao usuário
print("=== Baixador de Músicas do YouTube ===")
print()

link = input("Cole o link do YouTube: ")

if not link.strip():
    print("Nenhum link digitado. Saindo...")
else:
    try:
        with yt_dlp.YoutubeDL(opcoes) as ydl:
            print("Baixando... aguarde.")
            ydl.download([link])
            print()
            print("Pronto! Arquivo salvo na pasta 'musicas'")
    except Exception as e:
        print(f"Erro: {e}")