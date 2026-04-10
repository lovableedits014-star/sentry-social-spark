import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Save, Eye, EyeOff, Server, Globe } from "lucide-react";

export default function UazapiConfigPanel() {
  const [bridgeUrl, setBridgeUrl] = useState("");
  const [bridgeApiKey, setBridgeApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const { data } = await supabase
      .from("platform_config" as any)
      .select("key, value")
      .in("key", ["whatsapp_bridge_url", "whatsapp_bridge_api_key"]);

    const configs = (data as any[]) || [];
    configs.forEach((c) => {
      if (c.key === "whatsapp_bridge_url") setBridgeUrl(c.value);
      if (c.key === "whatsapp_bridge_api_key") setBridgeApiKey(c.value);
    });
    setLoading(false);
  };

  const handleSave = async () => {
    if (!bridgeUrl.trim()) {
      toast.error("URL da Ponte API é obrigatória");
      return;
    }
    if (!bridgeApiKey.trim()) {
      toast.error("Chave da API é obrigatória");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      for (const [key, value] of [["whatsapp_bridge_url", bridgeUrl.trim()], ["whatsapp_bridge_api_key", bridgeApiKey.trim()]]) {
        const { error } = await supabase
          .from("platform_config" as any)
          .upsert({ key, value, updated_by: user?.id, updated_at: new Date().toISOString() } as any, { onConflict: "key" });
        if (error) throw error;
      }

      toast.success("Configuração da Ponte WhatsApp salva com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-slate-800/60 border-slate-700">
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/60 border-slate-700">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
            <Server className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <CardTitle className="text-white text-base">Ponte WhatsApp API</CardTitle>
            <CardDescription className="text-slate-400">
              Conecte ao sistema externo de WhatsApp (Bridge API) para envio de mensagens
            </CardDescription>
          </div>
          {bridgeApiKey && bridgeUrl ? (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 ml-auto">Configurado</Badge>
          ) : (
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 ml-auto">Pendente</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-slate-300 text-xs flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" /> URL do Endpoint Bridge
          </Label>
          <Input
            value={bridgeUrl}
            onChange={(e) => setBridgeUrl(e.target.value)}
            placeholder="https://xxx.supabase.co/functions/v1/whatsapp-bridge"
            className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-slate-300 text-xs flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5" /> Chave da API (X-Api-Key)
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? "text" : "password"}
                value={bridgeApiKey}
                onChange={(e) => setBridgeApiKey(e.target.value)}
                placeholder="Sua chave de API gerada no sistema Bridge"
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
          Salvar Configuração
        </Button>

        <p className="text-xs text-slate-500">
          ⚠️ Esta configuração é global — todos os clientes usarão esta ponte para envio de mensagens WhatsApp.
        </p>
      </CardContent>
    </Card>
  );
}
