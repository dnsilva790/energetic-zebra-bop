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
import SEIKETSURecordPage from "./pages/SEIKETSURecordPage"; 
import AITutorSettingsPage from "./pages/AITutorSettingsPage";
import AISuggestionSettingsPage from "./pages/AISuggestionSettingsPage";
import SequencerSettingsPage from "./pages/SequencerSettingsPage";
import SequencerPage from "./pages/SequencerPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        {/* O provedor AITutorConfigProvider foi removido */}
          <Routes>
            <Route path="/" element={<InitialLoader />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/main-menu" element={<MainMenuPage />} />
            <Route path="/5s/seiri" element={<SEIRIPage />} />
            <Route path="/5s/seiton" element={<SEITONPage />} />
            <Route path="/5s/seiso" element={<SEISOPage />} />
            <Route path="/5s/seiketsu" element={<SEIKETSURecordPage />} /> 
            <Route path="/ai-tutor-settings" element={<AITutorSettingsPage />} />
            <Route path="/ai-suggestion-settings" element={<AISuggestionSettingsPage />} />
            <Route path="/sequencer-settings" element={<SequencerSettingsPage />} />
            <Route path="/sequencer" element={<SequencerPage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;