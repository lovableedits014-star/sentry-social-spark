import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, ChevronLeft, ChevronRight, ArrowUpDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import NovaPessoaDialog from "@/components/pessoas/NovaPessoaDialog";

const TIPO_LABELS: Record<string, string> = {
  eleitor: "Eleitor",
  apoiador: "Apoiador",
  lideranca: "Liderança",
  jornalista: "Jornalista",
  influenciador: "Influenciador",
  voluntario: "Voluntário",
  adversario: "Adversário",
  cidadao: "Cidadão",
};

const NIVEL_LABELS: Record<string, string> = {
  desconhecido: "Desconhecido",
  simpatizante: "Simpatizante",
  apoiador: "Apoiador",
  militante: "Militante",
  opositor: "Opositor",
};

const NIVEL_COLORS: Record<string, string> = {
  desconhecido: "bg-muted text-muted-foreground",
  simpatizante: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  apoiador: "bg-green-500/10 text-green-600 border-green-500/20",
  militante: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  opositor: "bg-red-500/10 text-red-600 border-red-500/20",
};

const ORIGEM_LABELS: Record<string, string> = {
  rede_social: "Rede Social",
  formulario: "Formulário",
  evento: "Evento",
  importacao: "Importação",
  manual: "Manual",
};

const PAGE_SIZE = 20;

type SortField = "created_at" | "nome";

export default function Pessoas() {
  const navigate = useNavigate();
  const [pessoas, setPessoas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCidade, setFilterCidade] = useState("all");
  const [filterBairro, setFilterBairro] = useState("all");
  const [filterTipo, setFilterTipo] = useState("all");
  const [filterNivel, setFilterNivel] = useState("all");
  const [filterOrigem, setFilterOrigem] = useState("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  // Distinct values for filters
  const [cidades, setCidades] = useState<string[]>([]);
  const [bairros, setBairros] = useState<string[]>([]);

  useEffect(() => {
    resolveClient();
  }, []);

  useEffect(() => {
    if (clientId) {
      fetchPessoas();
      fetchFilterOptions();
    }
  }, [clientId, search, filterCidade, filterBairro, filterTipo, filterNivel, filterOrigem, sortField, sortAsc, page]);

  async function resolveClient() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (client) {
      setClientId(client.id);
      return;
    }

    const { data: tm } = await supabase
      .from("team_members")
      .select("client_id")
      .eq("user_id", session.user.id)
      .eq("status", "active")
      .maybeSingle();

    if (tm) setClientId(tm.client_id);
  }

  async function fetchFilterOptions() {
    if (!clientId) return;
    const { data } = await supabase
      .from("pessoas")
      .select("cidade, bairro")
      .eq("client_id", clientId);

    if (data) {
      const cidSet = new Set<string>();
      const baiSet = new Set<string>();
      data.forEach((p: any) => {
        if (p.cidade) cidSet.add(p.cidade);
        if (p.bairro) baiSet.add(p.bairro);
      });
      setCidades(Array.from(cidSet).sort());
      setBairros(Array.from(baiSet).sort());
    }
  }

  async function fetchPessoas() {
    if (!clientId) return;
    setLoading(true);

    let query = supabase
      .from("pessoas")
      .select("*", { count: "exact" })
      .eq("client_id", clientId);

    if (search.trim()) {
      query = query.ilike("nome", `%${search.trim()}%`);
    }
    if (filterCidade !== "all") query = query.eq("cidade", filterCidade);
    if (filterBairro !== "all") query = query.eq("bairro", filterBairro);
    if (filterTipo !== "all") query = query.eq("tipo_pessoa", filterTipo as any);
    if (filterNivel !== "all") query = query.eq("nivel_apoio", filterNivel as any);
    if (filterOrigem !== "all") query = query.eq("origem_contato", filterOrigem as any);

    query = query.order(sortField, { ascending: sortAsc });
    query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    const { data, count, error } = await query;

    if (error) {
      toast.error("Erro ao carregar pessoas");
      console.error(error);
    } else {
      setPessoas(data || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === "nome");
    }
    setPage(0);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pessoas</h1>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "pessoa cadastrada" : "pessoas cadastradas"}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Pessoa
        </Button>
      </div>

      {/* Search + Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="relative sm:col-span-2 lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>

        <Select value={filterCidade} onValueChange={(v) => { setFilterCidade(v); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Cidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas cidades</SelectItem>
            {cidades.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterTipo} onValueChange={(v) => { setFilterTipo(v); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos tipos</SelectItem>
            {Object.entries(TIPO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterNivel} onValueChange={(v) => { setFilterNivel(v); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Nível" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos níveis</SelectItem>
            {Object.entries(NIVEL_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterOrigem} onValueChange={(v) => { setFilterOrigem(v); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas origens</SelectItem>
            {Object.entries(ORIGEM_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("nome")}>
                  <div className="flex items-center gap-1">Nome <ArrowUpDown className="w-3 h-3" /></div>
                </TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Bairro</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Nível de Apoio</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("created_at")}>
                  <div className="flex items-center gap-1">Criação <ArrowUpDown className="w-3 h-3" /></div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : pessoas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    Nenhuma pessoa encontrada
                  </TableCell>
                </TableRow>
              ) : (
                pessoas.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/pessoas/${p.id}`)}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell>{p.telefone || "—"}</TableCell>
                    <TableCell>{p.cidade || "—"}</TableCell>
                    <TableCell>{p.bairro || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {TIPO_LABELS[p.tipo_pessoa] || p.tipo_pessoa}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${NIVEL_COLORS[p.nivel_apoio] || ""}`}>
                        {NIVEL_LABELS[p.nivel_apoio] || p.nivel_apoio}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ORIGEM_LABELS[p.origem_contato] || p.origem_contato}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(p.created_at), "dd/MM/yyyy")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page + 1} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Dialog */}
      {clientId && (
        <NovaPessoaDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          clientId={clientId}
          onSuccess={() => { fetchPessoas(); fetchFilterOptions(); }}
        />
      )}
    </div>
  );
}
