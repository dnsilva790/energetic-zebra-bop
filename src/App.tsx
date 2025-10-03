import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import InitialLoader from "./components/InitialLoader";
import SetupPage from "./pages/SetupPage";
import MainMenuPage from "./pages/MainMenuPage";
import SEIRIPage from "./pages/SEIRIPage";
import SEITONPage from "./pages/SEITONPage";
import SEISOPage from "./pages/SEISOPage";
import SEIKETSUPage from "./pages/SEIKETSUPage"; // Importar a nova página SEIKETSU
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<InitialLoader />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/main-menu" element={<MainMenuPage />} />
          <Route path="/5s/seiri" element={<SEIRIPage />} />
          <Route path="/5s/seiton" element={<SEITONPage />} />
          <Route path="/5s/seiso" element={<SEISOPage />} />
          <Route path="/5s/seiketsu" element={<SEIKETSUPage />} /> {/* Nova rota para SEIKETSU */}
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;