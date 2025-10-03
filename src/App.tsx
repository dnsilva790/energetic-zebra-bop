import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import InitialLoader from "./components/InitialLoader";
import SetupPage from "./pages/SetupPage";
import MainMenuPage from "./pages/MainMenuPage";
import SEIRIPage from "./pages/SEIRIPage"; // Importar a nova página
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
          <Route path="/5s/seiri" element={<SEIRIPage />} /> {/* Nova rota para SEIRI */}
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;