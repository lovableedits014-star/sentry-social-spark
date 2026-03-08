import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, User, MapPin, CheckCircle2, XCircle, PhoneOff, Clock, ArrowRight, LogIn } from "lucide-react";
import { toast } from "sonner";

interface Indicado {
  id: string;
  nome: string;
  telefone: string;
  cidade: string | null;
  bairro: string | null;
  endereco: string | null;
  ligacao_status: string | null;
  vota_candidato: string | null;
  candidato_alternativo: string | null;
  operador_nome: string | null;
  ligacao_em: string | null;
  contratado_id: string;
}

export default function Telemarketing() {
  const { clientId } = useParams<{ clientId: string }>();
  const [operadorNome, setOperadorNome] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [indicados, setIndicados] = useState<Indicado[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [clientName, setClientName] = useState("");

  // Form state for current call
  const [ligacaoStatus, setLigacaoStatus] = useState("");
  const [votaCandidato, setVotaCandidato] = useState("");
  const [candidatoAlt, setCandidatoAlt] = useState("");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (clientId) {
      supabase
        .from("clients")
        .select("name")
        .eq("id", clientId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setClientName(data.name);
        });
    }
  }, [clientId]);

  const handleLogin = async () => {
    if (!operadorNome.trim()) {
      toast.error("Informe seu nome para continuar");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("contratado_indicados")
      .select("id, nome, telefone, cidade, bairro, endereco, ligacao_status, vota_candidato, candidato_alternativo, operador_nome, ligacao_em, contratado_id")
      .eq("client_id", clientId!)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar contatos");
      setLoading(false);
      return;
    }

    setIndicados((data as Indicado[]) || []);
    // Find first pending contact
    const firstPending = (data || []).findIndex(
      (i: any) => !i.ligacao_status || i.ligacao_status === "pendente"
    );
    setCurrentIndex(firstPending >= 0 ? firstPending : 0);
    setLoggedIn(true);
    setLoading(false);
  };

  const current = indicados[currentIndex] as Indicado | undefined;

  const totalPendentes = indicados.filter(
    (i) => !i.ligacao_status || i.ligacao_status === "pendente"
  ).length;
  const totalLigados = indicados.filter(
    (i) => i.ligacao_status && i.ligacao_status !== "pendente"
  ).length;

  const resetForm = () => {
    setLigacaoStatus("");
    setVotaCandidato("");
    setCandidatoAlt("");
    setCidade("");
    setBairro("");
  };

  useEffect(() => {
    if (current) {
      setCidade(current.cidade || "");
      setBairro(current.bairro || "");
      setLigacaoStatus("");
      setVotaCandidato("");
      setCandidatoAlt("");
    }
  }, [currentIndex]);

  const handleSave = async () => {
    if (!ligacaoStatus) {
      toast.error("Selecione o resultado da ligação");
      return;
    }
    if (!current) return;

    setSaving(true);
    const updateData: Record<string, any> = {
      ligacao_status: ligacaoStatus,
      operador_nome: operadorNome.trim(),
      ligacao_em: new Date().toISOString(),
      cidade: cidade.trim() || null,
      bairro: bairro.trim() || null,
    };

    if (ligacaoStatus === "atendeu") {
      updateData.vota_candidato = votaCandidato || null;
      updateData.candidato_alternativo = candidatoAlt.trim() || null;
      if (votaCandidato === "sim") {
        updateData.status = "confirmado";
      } else if (votaCandidato === "nao") {
        updateData.status = "rejeitado";
      }
    }

    const { error } = await supabase
      .from("contratado_indicados")
      .update(updateData)
      .eq("id", current.id);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      setSaving(false);
      return;
    }

    // Update local state
    setIndicados((prev) =>
      prev.map((i) =>
        i.id === current.id ? { ...i, ...updateData } : i
      )
    );

    toast.success("Ligação registrada!");
    setSaving(false);

    // Move to next pending
    const nextPending = indicados.findIndex(
      (i, idx) => idx > currentIndex && (!i.ligacao_status || i.ligacao_status === "pendente")
    );
    if (nextPending >= 0) {
      setCurrentIndex(nextPending);
    } else {
      // Check from beginning
      const fromStart = indicados.findIndex(
        (i, idx) => idx !== currentIndex && (!i.ligacao_status || i.ligacao_status === "pendente")
      );
      if (fromStart >= 0) {
        setCurrentIndex(fromStart);
      } else {
        toast.success("🎉 Todos os contatos foram ligados!");
      }
    }
    resetForm();
  };

  const skipToNext = () => {
    const next = indicados.findIndex(
      (i, idx) => idx > currentIndex && (!i.ligacao_status || i.ligacao_status === "pendente")
    );
    if (next >= 0) {
      setCurrentIndex(next);
      resetForm();
    } else {
      toast.info("Não há mais contatos pendentes");
    }
  };

  // Login screen
  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <Phone className="w-7 h-7 text-primary" />
            </div>
            <CardTitle className="text-xl">Central de Telemarketing</CardTitle>
            {clientName && (
              <p className="text-sm text-muted-foreground">{clientName}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Seu nome (operador)</label>
              <Input
                placeholder="Digite seu nome..."
                value={operadorNome}
                onChange={(e) => setOperadorNome(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            <Button onClick={handleLogin} className="w-full" disabled={loading}>
              <LogIn className="w-4 h-4 mr-2" />
              {loading ? "Carregando..." : "Entrar"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main telemarketing view
  return (
    <div className="min-h-screen bg-muted/30 p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Phone className="w-5 h-5 text-primary" />
            Telemarketing
          </h1>
          <p className="text-xs text-muted-foreground">
            Operador: <span className="font-medium text-foreground">{operadorNome}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="text-xs">
            <Clock className="w-3 h-3 mr-1" />
            {totalPendentes} pendentes
          </Badge>
          <Badge variant="default" className="text-xs">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {totalLigados} ligados
          </Badge>
        </div>
      </div>

      {/* Current contact */}
      {current ? (
        <>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  {current.nome}
                </CardTitle>
                <Badge
                  variant={
                    current.ligacao_status === "atendeu"
                      ? "default"
                      : current.ligacao_status === "nao_atendeu"
                      ? "secondary"
                      : current.ligacao_status === "recusou"
                      ? "destructive"
                      : "outline"
                  }
                >
                  {current.ligacao_status === "pendente" || !current.ligacao_status
                    ? "Pendente"
                    : current.ligacao_status === "atendeu"
                    ? "Atendeu"
                    : current.ligacao_status === "nao_atendeu"
                    ? "Não atendeu"
                    : current.ligacao_status === "recusou"
                    ? "Recusou"
                    : current.ligacao_status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Phone */}
              <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                <Phone className="w-5 h-5 text-primary" />
                <a
                  href={`tel:${current.telefone}`}
                  className="text-lg font-bold text-primary hover:underline"
                >
                  {current.telefone}
                </a>
              </div>

              {/* Current location info */}
              {(current.cidade || current.bairro) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" />
                  {current.bairro && <span>{current.bairro}</span>}
                  {current.bairro && current.cidade && <span>•</span>}
                  {current.cidade && <span>{current.cidade}</span>}
                </div>
              )}

              {/* Call result form */}
              <div className="border-t pt-4 space-y-3">
                <p className="font-medium text-sm">Resultado da ligação</p>

                {/* Status buttons */}
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant={ligacaoStatus === "atendeu" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLigacaoStatus("atendeu")}
                    className="text-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Atendeu
                  </Button>
                  <Button
                    variant={ligacaoStatus === "nao_atendeu" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLigacaoStatus("nao_atendeu")}
                    className="text-xs"
                  >
                    <PhoneOff className="w-3.5 h-3.5 mr-1" />
                    Não atendeu
                  </Button>
                  <Button
                    variant={ligacaoStatus === "recusou" ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => setLigacaoStatus("recusou")}
                    className="text-xs"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    Recusou
                  </Button>
                </div>

                {/* Location fields */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Cidade</label>
                    <Input
                      placeholder="Cidade"
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Bairro</label>
                    <Input
                      placeholder="Bairro"
                      value={bairro}
                      onChange={(e) => setBairro(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                {/* Vote fields - only when answered */}
                {ligacaoStatus === "atendeu" && (
                  <div className="space-y-3 bg-muted/50 p-3 rounded-lg">
                    <div>
                      <label className="text-xs font-medium mb-1.5 block">Vota no candidato?</label>
                      <Select value={votaCandidato} onValueChange={setVotaCandidato}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sim">✅ Sim, vota</SelectItem>
                          <SelectItem value="nao">❌ Não vota</SelectItem>
                          <SelectItem value="indeciso">🤔 Indeciso</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {(votaCandidato === "nao" || votaCandidato === "indeciso") && (
                      <div>
                        <label className="text-xs font-medium mb-1.5 block">
                          Candidato que apoia (opcional)
                        </label>
                        <Input
                          placeholder="Nome do candidato..."
                          value={candidatoAlt}
                          onChange={(e) => setCandidatoAlt(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSave} disabled={saving || !ligacaoStatus} className="flex-1">
                    {saving ? "Salvando..." : "Salvar e Próximo"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={skipToNext}>
                    Pular
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Progress */}
          <div className="text-center text-xs text-muted-foreground">
            Contato {currentIndex + 1} de {indicados.length}
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Phone className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum contato disponível</p>
            <p className="text-xs mt-1">Não há indicados cadastrados para este cliente</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
