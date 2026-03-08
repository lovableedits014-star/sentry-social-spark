import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onSuccess: () => void;
}

const TIPO_OPTIONS = [
  { value: "cidadao", label: "Cidadão" },
  { value: "eleitor", label: "Eleitor" },
  { value: "apoiador", label: "Apoiador" },
  { value: "lideranca", label: "Liderança" },
  { value: "jornalista", label: "Jornalista" },
  { value: "influenciador", label: "Influenciador" },
  { value: "voluntario", label: "Voluntário" },
  { value: "adversario", label: "Adversário" },
];

const NIVEL_OPTIONS = [
  { value: "desconhecido", label: "Desconhecido" },
  { value: "simpatizante", label: "Simpatizante" },
  { value: "apoiador", label: "Apoiador" },
  { value: "militante", label: "Militante" },
  { value: "opositor", label: "Opositor" },
];

const ORIGEM_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "rede_social", label: "Rede Social" },
  { value: "formulario", label: "Formulário" },
  { value: "evento", label: "Evento" },
  { value: "importacao", label: "Importação" },
];

export default function NovaPessoaDialog({ open, onOpenChange, clientId, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [endereco, setEndereco] = useState("");
  const [dataNascimento, setDataNascimento] = useState<Date | undefined>();
  const [tipoPessoa, setTipoPessoa] = useState("cidadao");
  const [nivelApoio, setNivelApoio] = useState("desconhecido");
  const [origemContato, setOrigemContato] = useState("manual");
  const [tagsStr, setTagsStr] = useState("");
  const [notasInternas, setNotasInternas] = useState("");

  function resetForm() {
    setNome(""); setEmail(""); setTelefone("");
    setCidade(""); setBairro(""); setEndereco("");
    setDataNascimento(undefined);
    setTipoPessoa("cidadao"); setNivelApoio("desconhecido"); setOrigemContato("manual");
    setTagsStr(""); setNotasInternas("");
  }

  async function handleSave() {
    if (!nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    setSaving(true);
    const tags = tagsStr.split(",").map(t => t.trim()).filter(Boolean);

    const { error } = await supabase.from("pessoas").insert({
      client_id: clientId,
      nome: nome.trim(),
      email: email.trim() || null,
      telefone: telefone.trim() || null,
      cidade: cidade.trim() || null,
      bairro: bairro.trim() || null,
      endereco: endereco.trim() || null,
      data_nascimento: dataNascimento ? format(dataNascimento, "yyyy-MM-dd") : null,
      tipo_pessoa: tipoPessoa,
      nivel_apoio: nivelApoio,
      origem_contato: origemContato,
      tags: tags.length > 0 ? tags : [],
      notas_internas: notasInternas.trim() || null,
    } as any);

    setSaving(false);

    if (error) {
      toast.error("Erro ao salvar pessoa");
      console.error(error);
    } else {
      toast.success("Pessoa cadastrada com sucesso!");
      resetForm();
      onOpenChange(false);
      onSuccess();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Pessoa</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" maxLength={200} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" maxLength={255} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 00000-0000" maxLength={20} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cidade</Label>
              <Input value={cidade} onChange={e => setCidade(e.target.value)} maxLength={100} />
            </div>
            <div>
              <Label>Bairro</Label>
              <Input value={bairro} onChange={e => setBairro(e.target.value)} maxLength={100} />
            </div>
          </div>

          <div>
            <Label>Endereço</Label>
            <Input value={endereco} onChange={e => setEndereco(e.target.value)} maxLength={300} />
          </div>

          <div>
            <Label>Data de Nascimento</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dataNascimento && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dataNascimento ? format(dataNascimento, "dd/MM/yyyy") : "Selecionar data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dataNascimento}
                  onSelect={setDataNascimento}
                  disabled={(date) => date > new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={tipoPessoa} onValueChange={setTipoPessoa}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nível de Apoio</Label>
              <Select value={nivelApoio} onValueChange={setNivelApoio}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NIVEL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Origem</Label>
              <Select value={origemContato} onValueChange={setOrigemContato}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORIGEM_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Tags (separadas por vírgula)</Label>
            <Input value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="Ex: zona norte, prioridade, voluntário" maxLength={500} />
          </div>

          <div>
            <Label>Notas Internas</Label>
            <Textarea value={notasInternas} onChange={e => setNotasInternas(e.target.value)} rows={3} maxLength={2000} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
