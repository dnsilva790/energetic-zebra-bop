"use client";

import React from "react";
import { useNavigate } from "react-router-dom";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { Button } from "@/components/ui/button";
import { Settings, Brush, LayoutDashboard, Play, Brain, Clock } from "lucide-react"; 
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import FiveSButton from "@/components/FiveSButton";
import { showSuccess } from "@/utils/toast";

const MainMenuPage = () => {
  const navigate = useNavigate();

  const handleButtonClick = (sName: string) => {
    if (sName === "SEIRI") {
      navigate("/5s/seiri");
    } else if (sName === "SEITON") {
      navigate("/5s/seiton");
    } else if (sName === "SEISO") {
      navigate("/5s/seiso");
    } else if (sName === "SEIKETSU") { 
      navigate("/5s/seiketsu");
    }
    else {
      showSuccess(`Tela em construção - ${sName}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100 p-4">
      <Card className="w-full max-w-3xl shadow-lg bg-white/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-extrabold text-gray-800">
            ADHD Todoist task manager
          </CardTitle>
          <CardDescription className="text-xl text-gray-600 mt-2">
            Escolha por onde começar hoje
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
          <FiveSButton
            icon={Brush}
            title="SEIRI - Fazer Faxina"
            description="Limpar e organizar seu backlog"
            colorClass="bg-green-600 hover:bg-green-700"
            onClick={() => handleButtonClick("SEIRI")}
          />
          <FiveSButton
            icon={LayoutDashboard}
            title="SEITON - Planejar Dia"
            description="Priorizar tarefas com sistema de torneio"
            colorClass="bg-blue-600 hover:bg-blue-700"
            onClick={() => handleButtonClick("SEITON")}
          />
          <FiveSButton
            icon={Play}
            title="SEISO - Executar Tarefas"
            description="Focar e executar tarefas com filtro personalizado"
            colorClass="bg-orange-600 hover:bg-orange-700"
            onClick={() => handleButtonClick("SEISO")}
          />
          <FiveSButton
            icon={Clock} 
            title="SEIKETSU - Revisão Diária"
            description="Decida o que fazer hoje e o que postergar"
            colorClass="bg-indigo-600 hover:bg-indigo-700" 
            onClick={() => handleButtonClick("SEIKETSU")}
          />
        </CardContent>
      </Card>

      <div className="mt-8 flex gap-4">
        <Button
          variant="outline"
          onClick={() => navigate("/setup")}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900 border-gray-300 hover:border-gray-400 bg-white/70 backdrop-blur-sm"
        >
          <Settings size={20} />
          Configurações
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate("/ai-tutor-settings")}
          className="flex items-center gap-2 text-purple-700 hover:text-purple-900 border-purple-300 hover:border-purple-400 bg-white/70 backdrop-blur-sm"
        >
          <Brain size={20} />
          Configurações do Tutor IA
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate("/ai-task-suggestion-settings")}
          className="flex items-center gap-2 text-teal-700 hover:text-teal-900 border-teal-300 hover:border-teal-400 bg-white/70 backdrop-blur-sm"
        >
          <Brain size={20} />
          Configurações de Sugestão de IA
        </Button>
      </div>
      <MadeWithDyad />
    </div>
  );
};

export default MainMenuPage;