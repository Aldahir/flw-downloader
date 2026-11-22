// Turn raw tool errors into plain-language messages with a suggestion.
const RULES = [
  [/Private video|This video is private/i, 'Este vídeo é privado.', 'Só o dono pode vê-lo. Se tens acesso, tens de iniciar sessão no site (suporte a cookies ainda por implementar).'],
  [/Sign in to confirm|confirm you.re not a bot|login required|requires? (a )?login/i, 'O site pede início de sessão ou verificação.', 'Tenta mais tarde ou noutro link. Suporte a cookies do browser está previsto.'],
  [/not available in your country|geo.?restrict|blocked it in your country/i, 'Este vídeo não está disponível na tua região.', 'Foi bloqueado geograficamente pelo site.'],
  [/Video unavailable|has been removed|no longer available|does not exist/i, 'Este vídeo já não está disponível.', 'Foi removido ou nunca existiu. Confirma o link.'],
  [/Unsupported URL/i, 'Este link não é suportado.', 'Confirma que é a página do vídeo e não a página inicial do site.'],
  [/HTTP Error 403|Forbidden/i, 'O site recusou o acesso (403).', 'Tenta de novo daqui a pouco; o yt-dlp pode precisar de atualização (brew upgrade yt-dlp).'],
  [/HTTP Error 429|Too Many Requests/i, 'O site limitou os pedidos (429).', 'Espera alguns minutos antes de tentar outra vez.'],
  [/HTTP Error 404/i, 'Página não encontrada (404).', 'Confirma o link.'],
  [/Unable to download|getaddrinfo|Temporary failure in name resolution|Network is unreachable|timed out/i, 'Falha de rede.', 'Verifica a ligação à internet e tenta outra vez.'],
  [/live event will begin|is live|Premieres in/i, 'Este vídeo é uma emissão em direto ou estreia futura.', 'Tenta depois de terminar.'],
  [/No space left/i, 'Sem espaço em disco.', 'Liberta espaço ou apaga downloads antigos na lista.'],
  [/Unknown encoder|Encoder .* not found|Unrecognized option 'c:v'/i, 'O teu FFmpeg não tem o codificador necessário.', 'Instala um FFmpeg completo (brew install ffmpeg / winget install Gyan.FFmpeg).'],
  [/No such filter: 'subtitles'|Filter not found|Error parsing filterchain/i, 'O teu FFmpeg não suporta gravar legendas no vídeo (falta libass).', 'Usa as legendas estilizadas (Remotion) ou instala um FFmpeg completo.'],
  [/Invalid data found when processing input|moov atom not found/i, 'O ficheiro está corrompido ou incompleto.', 'Tenta obter o ficheiro de novo ou usa outro.'],
  [/AbortError|aborted/i, 'Cancelado.', ''],
];

export function friendly(err) {
  const raw = String(err?.message || err || '');
  for (const [re, message, hint] of RULES) if (re.test(raw)) return { message, hint, raw };
  return { message: 'Ocorreu um erro inesperado.', hint: 'Vê os detalhes técnicos abaixo.', raw };
}
