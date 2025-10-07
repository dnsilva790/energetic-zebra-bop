"use client";

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, Brain } from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { AI_BATCH_RANKING_PROMPT_KEY } from "@/lib/constants";

const DEFAULT_BATCH_RANKING_PROMPT = `Você é um assistente de produtividade. Dada uma lista de tarefas, ranqueie-as da mais importante para a menos importante. Considere a prioridade (4=mais alta, 1=mais baixa), data de vencimento, data limite, se é recorrente, e a descrição.
Formate sua resposta como uma lista numerada, onde cada item é o ID da tarefa seguido pelo seu conteúdo.
Exemplo:
1. [ID_TAREFA_1] Conteúdo da Tarefa 1
2. [ID_TAREFA_2] Conteúdo da Tarefa 2
3. [ID_TAREFA_3] Conteúdo da Tarefa 3
...
`;

const SEITONAISettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [customPrompt, setCustomPrompt] = useState("");

  useEffect(() => {
    const savedPrompt = localStorage.getItem(AI_BATCH_RANKING_PROMPT_KEY);
    setCustomPrompt(savedPrompt || DEFAULT_BATCH_RANKING_PROMPT);
  }, []);

  const handleSavePrompt = () => {
    localStorage.setItem(AI_BATCH_RANKING_PROMPT_KEY, customPrompt.trim());
    showSuccess("Prompt da IA de Ranking do SEITON salvo com sucesso!");
  };

  const handleResetToDefault = () => {
    setCustomPrompt(DEFAULT_BATCH_RANKING_PROMPT);
    localStorage.setItem(AI_BATCH_RANKING_PROMPT_KEY, DEFAULT_BATCH_RANKING_PROMPT);
    showSuccess("Prompt da IA de Ranking do SEITON resetado para o padrão!");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-100 p-4">
      <Card className="w-full max-w-2xl shadow-lg bg-white/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-blue-800 hover:bg-blue-200">
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
            </Button>
            <CardTitle className="text-3xl font-bold text-blue-800 flex-grow">
              Configurações da IA de Ranking do SEITON
            </CardTitle>
            <div className="w-20"></div> {/* Espaçador */}
          </div>
          <CardDescription className="text-lg text-gray-600 mt-2">
            Personalize o prompt do sistema para a IA que faz o ranking inicial das tarefas no SEITON.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="system-prompt" className="text-lg font-semibold">Prompt do Sistema da IA de Ranking</Label>
            <Textarea
              id="system-prompt"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={10}
              className="min-h-[200px]"
              placeholder="Insira o prompt do sistema para a IA de ranking aqui..."
            />
            <p className="text-sm text-gray-500">
              Este prompt define como a IA ranqueia as tarefas em lote.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between gap-4">
          <Button
            onClick={handleResetToDefault}
            variant="outline"
            className="flex-1 border-blue-600 text-blue-600 hover:bg-blue-50"
          >
            Resetar para Padrão
          </Button>
          <Button
            onClick={handleSavePrompt}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
          >
            <Save className="mr-2 h-4 w-4" /> Salvar Prompt
          </Button>
        </CardFooter>
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default SEITONAISettingsPage;