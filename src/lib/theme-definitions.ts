// ─── Shared Theme & Text Analysis Definitions ───
// Used by RadarTemas and DetectorCrise

export const THEME_DEFINITIONS: Record<string, { label: string; keywords: string[] }> = {
  seguranca: {
    label: "Segurança Pública",
    keywords: ["segurança", "seguranca", "polícia", "policia", "crime", "violência", "violencia", "assalto", "roubo", "bandido", "ladrão", "ladrao", "tiro", "assassinato", "homicídio", "homicidio", "arma", "droga", "tráfico", "trafico", "preso", "cadeia", "presídio", "presidio"],
  },
  saude: {
    label: "Saúde",
    keywords: ["saúde", "saude", "hospital", "médico", "medico", "posto", "atendimento", "upa", "sus", "remédio", "remedio", "vacina", "doença", "doenca", "enfermeiro", "consulta", "cirurgia", "internação", "internacao"],
  },
  educacao: {
    label: "Educação",
    keywords: ["educação", "educacao", "escola", "professor", "aluno", "ensino", "faculdade", "universidade", "creche", "merenda", "aula", "estudante", "enem", "vestibular"],
  },
  transporte: {
    label: "Transporte",
    keywords: ["ônibus", "onibus", "transporte", "trânsito", "transito", "mobilidade", "metrô", "metro", "passagem", "tarifa", "engarrafamento", "ciclovia", "pedestre"],
  },
  emprego: {
    label: "Emprego e Economia",
    keywords: ["emprego", "trabalho", "desemprego", "salário", "salario", "carteira", "clt", "demissão", "demissao", "contratação", "contratacao", "renda", "economia", "inflação", "inflacao", "preço", "preco", "caro"],
  },
  moradia: {
    label: "Moradia",
    keywords: ["moradia", "casa", "aluguel", "imóvel", "imovel", "habitação", "habitacao", "minha casa", "sem teto", "favela", "comunidade"],
  },
  meio_ambiente: {
    label: "Meio Ambiente",
    keywords: ["meio ambiente", "desmatamento", "poluição", "poluicao", "lixo", "reciclagem", "água", "agua", "saneamento", "esgoto", "enchente", "alagamento", "queimada"],
  },
  corrupcao: {
    label: "Corrupção e Política",
    keywords: ["corrupção", "corrupcao", "corrupto", "roubar", "desvio", "propina", "licitação", "licitacao", "nepotismo", "improbidade", "cpi", "investigação", "investigacao"],
  },
};

export const STOPWORDS = new Set([
  "de","para","com","que","por","uma","um","como","mais","mas","não","nao",
  "muito","bem","isso","esse","essa","tem","ter","ser","está","esta","são",
  "sao","foi","vai","ele","ela","nos","das","dos","nas","nos","seu","sua",
  "meu","minha","aqui","ali","sim","já","ainda","também","tambem","todo",
  "toda","quando","sobre","sem","até","ate","depois","antes","entre","cada",
  "onde","porque","pois","então","entao","era","fazer","pode","tudo","ou",
  "nem","lá","quem","isso","qual","voce","você","gente","dia","vez","coisa",
  "the","and","you","que","los","las","del","por","con","para","este","esta",
]);

export function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\wà-ú\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export function matchesTheme(text: string, words: string[], keywords: string[]): boolean {
  return keywords.some((kw) =>
    kw.includes(" ") ? text.toLowerCase().includes(kw) : words.includes(kw)
  );
}
