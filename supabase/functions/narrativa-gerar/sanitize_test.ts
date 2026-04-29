import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normBairro, sanitizeRoteiro } from "./index.ts";

// Helpers ----------------------------------------------------------------

function setOf(arr: string[]): Set<string> {
  return new Set(arr.map((s) => normBairro(s)));
}

const BAIRROS = setOf([
  "Centro",
  "Coronel Antonino",
  "Vila Nasser",
  "Jardim Tijuca",
]);

const POLITICOS = setOf([
  "Camila Bazachi Jara Marzochi",
  "Luiz Henrique Mandetta",
  "Rose Modesto",
  "Adriane Lopes",
]);

// normBairro -------------------------------------------------------------

Deno.test("normBairro remove acentos, baixa caixa e colapsa espaços", () => {
  assertEquals(normBairro("  Coronel  ANTÔNINO "), "coronel antonino");
  assertEquals(normBairro("São José"), "sao jose");
  assertEquals(normBairro(""), "");
  // tolera não-string
  assertEquals(normBairro(null as unknown as string), "");
  assertEquals(normBairro(undefined as unknown as string), "");
});

// sanitizeRoteiro: filtragem ---------------------------------------------

Deno.test("sanitizeRoteiro descarta paradas cujo bairro é nome de político", () => {
  const roteiro = [
    { ordem: 1, bairro: "Centro", local: "Praça" },
    { ordem: 2, bairro: "CAMILA BAZACHI JARA MARZOCHI", local: "Centro Comunitário" },
    { ordem: 3, bairro: "Vila Nasser", local: "Escola" },
    { ordem: 4, bairro: "Rose Modesto", local: "UBS" },
  ];

  const { paradas, descartadas, total } = sanitizeRoteiro(roteiro, BAIRROS, POLITICOS);

  assertEquals(total, 4);
  assertEquals(descartadas, 2);
  assertEquals(paradas.length, 2);
  assertEquals(paradas.map((p) => p.bairro), ["Centro", "Vila Nasser"]);
});

Deno.test("sanitizeRoteiro descarta paradas com bairro fora da lista", () => {
  const roteiro = [
    { ordem: 1, bairro: "Bairro Inexistente XYZ", local: "?" },
    { ordem: 2, bairro: "Centro", local: "Praça Central" },
  ];
  const { paradas, descartadas } = sanitizeRoteiro(roteiro, BAIRROS, POLITICOS);
  assertEquals(descartadas, 1);
  assertEquals(paradas.length, 1);
  assertEquals(paradas[0].bairro, "Centro");
});

Deno.test("sanitizeRoteiro descarta paradas sem bairro", () => {
  const roteiro = [
    { ordem: 1, bairro: "", local: "?" },
    { ordem: 2, local: "?" },
    { ordem: 3, bairro: "   ", local: "?" },
    { ordem: 4, bairro: "Centro", local: "ok" },
  ];
  const { paradas, descartadas } = sanitizeRoteiro(roteiro, BAIRROS, POLITICOS);
  assertEquals(descartadas, 3);
  assertEquals(paradas.length, 1);
});

Deno.test("sanitizeRoteiro aceita variações de caixa/acento do bairro", () => {
  const roteiro = [
    { ordem: 1, bairro: "coronel antônino", local: "ok" },
    { ordem: 2, bairro: "JARDIM TIJUCA", local: "ok" },
  ];
  const { paradas, descartadas } = sanitizeRoteiro(roteiro, BAIRROS, POLITICOS);
  assertEquals(descartadas, 0);
  assertEquals(paradas.length, 2);
});

// sanitizeRoteiro: renumeração ------------------------------------------

Deno.test("sanitizeRoteiro renumera ordem sequencial 1..N após filtragem", () => {
  const roteiro = [
    { ordem: 10, bairro: "Centro" },
    { ordem: 11, bairro: "Rose Modesto" }, // descartada
    { ordem: 12, bairro: "Vila Nasser" },
    { ordem: 13, bairro: "Inválido" }, // descartada
    { ordem: 14, bairro: "Jardim Tijuca" },
  ];
  const { paradas } = sanitizeRoteiro(roteiro, BAIRROS, POLITICOS);
  assertEquals(paradas.map((p) => p.ordem), [1, 2, 3]);
  assertEquals(paradas.map((p) => p.bairro), ["Centro", "Vila Nasser", "Jardim Tijuca"]);
});

Deno.test("sanitizeRoteiro preserva os demais campos das paradas", () => {
  const roteiro = [
    {
      ordem: 99,
      bairro: "Centro",
      local: "Praça",
      area_dor: "Saúde",
      objetivo: "Escutar moradores",
      emocao: "Esperança",
      fala_chave: "Vamos juntos",
      imagem_sugerida: "Candidato com moradores",
      duracao_min: 60,
    },
  ];
  const { paradas } = sanitizeRoteiro(roteiro, BAIRROS, POLITICOS);
  assertEquals(paradas.length, 1);
  const p = paradas[0];
  assertEquals(p.ordem, 1);
  assertEquals(p.local, "Praça");
  assertEquals(p.area_dor, "Saúde");
  assertEquals(p.duracao_min, 60);
  assertEquals(p.fala_chave, "Vamos juntos");
});

// Edge cases ------------------------------------------------------------

Deno.test("sanitizeRoteiro retorna vazio quando entrada não é array", () => {
  const r = sanitizeRoteiro(null as unknown as any[], BAIRROS, POLITICOS);
  assertEquals(r.total, 0);
  assertEquals(r.descartadas, 0);
  assertEquals(r.paradas.length, 0);
});

Deno.test("sanitizeRoteiro descarta tudo quando IA só devolve nomes de políticos", () => {
  const roteiro = [
    { ordem: 1, bairro: "Camila Bazachi Jara Marzochi" },
    { ordem: 2, bairro: "Luiz Henrique Mandetta" },
    { ordem: 3, bairro: "Adriane Lopes" },
  ];
  const { paradas, descartadas, total } = sanitizeRoteiro(roteiro, BAIRROS, POLITICOS);
  assertEquals(total, 3);
  assertEquals(descartadas, 3);
  assertEquals(paradas.length, 0);
});

Deno.test("sanitizeRoteiro: político NÃO entra mesmo se também aparecer como bairro válido vazio", () => {
  // Garante que o filtro de políticos roda ANTES do match de bairros válidos
  const bairros = setOf(["Centro"]);
  const politicos = setOf(["Rose Modesto"]);
  const roteiro = [
    { ordem: 1, bairro: "Rose Modesto" },
    { ordem: 2, bairro: "Centro" },
  ];
  const { paradas } = sanitizeRoteiro(roteiro, bairros, politicos);
  assertEquals(paradas.length, 1);
  assertEquals(paradas[0].bairro, "Centro");
  assert(paradas.every((p) => normBairro(p.bairro) !== normBairro("Rose Modesto")));
});