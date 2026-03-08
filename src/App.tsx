import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Comments from "./pages/Comments";
import Supporters from "./pages/Supporters";
import Engagement from "./pages/Engagement";
import Integrations from "./pages/Integrations";
import Settings from "./pages/Settings";
import DashboardLayout from "./components/DashboardLayout";
import NotFound from "./pages/NotFound";
import SupporterRegister from "./pages/SupporterRegister";
import SupporterPortal from "./pages/SupporterPortal";
import PwaStart from "./pages/PwaStart";
import Signup from "./pages/Signup";
import ResetPassword from "./pages/ResetPassword";
import SuperAdmin from "./pages/SuperAdmin";
import Checkins from "./pages/Checkins";
import Territorial from "./pages/Territorial";
import Pessoas from "./pages/Pessoas";
import PessoaPerfil from "./pages/PessoaPerfil";
import RegistroPessoa from "./pages/RegistroPessoa";
import Recrutamento from "./pages/Recrutamento";
import FunilLeads from "./pages/FunilLeads";
import RadarTemas from "./pages/RadarTemas";
import DetectorCrise from "./pages/DetectorCrise";
import MapaInfluenciadores from "./pages/MapaInfluenciadores";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/signup/:token" element={<Signup />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/super-admin" element={<SuperAdmin />} />
          <Route path="/cadastro/:clientId" element={<SupporterRegister />} />
          <Route path="/registro/:clientId" element={<RegistroPessoa />} />
          <Route path="/portal/:clientId" element={<SupporterPortal />} />
          <Route path="/pwa-start" element={<PwaStart />} />
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/comments" element={<Comments />} />
            <Route path="/supporters" element={<Supporters />} />
            <Route path="/engagement" element={<Engagement />} />
            <Route path="/checkins" element={<Checkins />} />
            <Route path="/territorial" element={<Territorial />} />
            <Route path="/pessoas" element={<Pessoas />} />
            <Route path="/pessoas/:id" element={<PessoaPerfil />} />
            <Route path="/recrutamento" element={<Recrutamento />} />
            <Route path="/funil" element={<FunilLeads />} />
            <Route path="/radar" element={<RadarTemas />} />
            <Route path="/crise" element={<DetectorCrise />} />
            <Route path="/influenciadores" element={<MapaInfluenciadores />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

