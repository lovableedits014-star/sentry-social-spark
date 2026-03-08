import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MessageCircle, CheckCircle2, User, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { getWhatsAppLink } from "@/lib/social-url";

const STATUS_COLUMNS = [
  { key: "novo", label: "Novo", color: "bg-muted border-muted-foreground/20" },
  { key: "contato_whatsapp", label: "Contato WhatsApp", color: "bg-blue-500/10 border-blue-500/30" },
  { key: "em_conversa", label: "Em Conversa", color: "bg-amber-500/10 border-amber-500/30" },
  { key: "proposta_enviada", label: "Proposta Enviada", color: "bg-purple-500/10 border-purple-500/30" },
  { key: "fechado", label: "Fechado", color: "bg-emerald-500/10 border-emerald-500/30" },
  { key: "perdido", label: "Perdido", color: "bg-red-500/10 border-red-500/30" },
];

const STATUS_HEADER_COLORS: Record<string, string> = {
  novo: "text-muted-foreground",
  contato_whatsapp: "text-blue-600",
  em_conversa: "text-amber-600",
  proposta_enviada: "text-purple-600",
  fechado: "text-emerald-600",
  perdido: "text-red-600",
};

type LeadCard = {
  id: string;
  nome: string;
  telefone: string | null;
  status_lead: string;
  whatsapp_confirmado: boolean;
};

export default function FunilLeads() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<LeadCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  useEffect(() => {
    resolveClient();
  }, []);

  useEffect(() => {
    if (clientId) fetchLeads();
  }, [clientId]);

  async function resolveClient() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: client } = await supabase.from("clients").select("id").eq("user_id", session.user.id).maybeSingle();
    if (client) { setClientId(client.id); return; }
    const { data: tm } = await supabase.from("team_members").select("client_id").eq("user_id", session.user.id).eq("status", "active").maybeSingle();
    if (tm) setClientId(tm.client_id);
  }

  async function fetchLeads() {
    if (!clientId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("pessoas")
      .select("id, nome, telefone, status_lead, whatsapp_confirmado")
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar leads");
    } else {
      setLeads((data || []).map((d: any) => ({
        ...d,
        status_lead: d.status_lead || "novo",
      })));
    }
    setLoading(false);
  }

  async function moveCard(cardId: string, newStatus: string) {
    // Optimistic update
    setLeads(prev => prev.map(l => l.id === cardId ? { ...l, status_lead: newStatus } : l));

    const { error } = await supabase
      .from("pessoas")
      .update({ status_lead: newStatus } as any)
      .eq("id", cardId);

    if (error) {
      toast.error("Erro ao mover lead");
      fetchLeads(); // revert
    }
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, colKey: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(colKey);
  }

  function handleDragLeave() {
    setDragOverCol(null);
  }

  function handleDrop(e: React.DragEvent, colKey: string) {
    e.preventDefault();
    setDragOverCol(null);
    if (draggedId) {
      const card = leads.find(l => l.id === draggedId);
      if (card && card.status_lead !== colKey) {
        moveCard(draggedId, colKey);
      }
    }
    setDraggedId(null);
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDragOverCol(null);
  }

  const grouped = STATUS_COLUMNS.reduce((acc, col) => {
    acc[col.key] = leads.filter(l => l.status_lead === col.key);
    return acc;
  }, {} as Record<string, LeadCard[]>);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Funil de Leads</h1>
        <p className="text-sm text-muted-foreground">
          {leads.length} {leads.length === 1 ? "lead" : "leads"} — Arraste os cards entre colunas para atualizar o status
        </p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 200px)" }}>
        {STATUS_COLUMNS.map(col => {
          const colLeads = grouped[col.key] || [];
          const isOver = dragOverCol === col.key;

          return (
            <div
              key={col.key}
              className={`flex-shrink-0 w-72 flex flex-col rounded-xl border-2 transition-colors ${
                isOver ? "border-primary/50 bg-primary/5" : "border-border bg-muted/30"
              }`}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.key)}
            >
              {/* Column header */}
              <div className={`px-4 py-3 rounded-t-xl border-b ${col.color}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-semibold ${STATUS_HEADER_COLORS[col.key]}`}>
                    {col.label}
                  </span>
                  <Badge variant="secondary" className="text-xs px-2 py-0.5">
                    {colLeads.length}
                  </Badge>
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {colLeads.length === 0 && (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    Nenhum lead
                  </div>
                )}
                {colLeads.map(lead => {
                  const waLink = getWhatsAppLink(lead.telefone);
                  const isDragging = draggedId === lead.id;

                  return (
                    <Card
                      key={lead.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      onDragEnd={handleDragEnd}
                      className={`p-3 cursor-grab active:cursor-grabbing transition-all hover:shadow-md ${
                        isDragging ? "opacity-40 scale-95" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{lead.nome}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {lead.telefone || "Sem telefone"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {lead.whatsapp_confirmado && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              </TooltipTrigger>
                              <TooltipContent>WhatsApp confirmado</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2">
                        {waLink && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={waLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center justify-center h-6 w-6 rounded text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>Conversar no WhatsApp</TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => navigate(`/pessoas/${lead.id}`)}
                              className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Abrir perfil</TooltipContent>
                        </Tooltip>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
