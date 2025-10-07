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

const AI_SUGGESTION_SYSTEM_PROMPT_KEY = 'ai_suggestion_system_prompt';
const DEFAULT_SUGGESTION_PROMPT = `Você é um assistente de produtividade. Dada a seguinte tarefa, sugira 3 a 5 opções de reagendamento (data e hora, se aplicável) que sejam razoáveis, considerando a prioridade e o vencimento atual. Formate cada sugestão como uma linha separada, começando com um asterisco, por exemplo: "* Amanhã às 10:00", "* Próxima segunda-feira". Evite sugerir datas passadas.`;

const AISuggestionSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [customPrompt, setCustomPrompt] = useState("");

  useEffect(() => {
    const savedPrompt = localStorage.getItem(AI_SUGGESTION_SYSTEM_PROMPT_KEY);
    setCustomPrompt(savedPrompt || DEFAULT_SUGGESTION_PROMPT);
  }, []);

  const handleSavePrompt = () => {
    localStorage.setItem(AI_SUGGESTION_SYSTEM_PROMPT_KEY, customPrompt.trim());
    showSuccess("Prompt da IA de Sugestão salvo com sucesso!");
  };

  const handleResetToDefault = () => {
    setCustomPrompt(DEFAULT_SUGGESTION_PROMPT);
    localStorage.setItem(AI_SUGGESTION_SYSTEM_PROMPT_KEY, DEFAULT_SUGGESTION_PROMPT);
    showSuccess("Prompt da IA de Sugestão resetado para o padrão!");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-100 to-blue-100 p-4">
      <Card className="w-full max-w-2xl shadow-lg bg-white/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-indigo-800 hover:bg-indigo-200">
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
            </Button>
            <CardTitle className="text-3xl font-bold text-indigo-800 flex-grow">
              Configurações da IA de Sugestão
            </CardTitle>
            <div className="w-20"></div> {/* Espaçador */}
          </div>
          <CardDescription className="text-lg text-gray-600 mt-2">
            Personalize o prompt do sistema para a IA que sugere horários de reagendamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="system-prompt" className="text-lg font-semibold">Prompt do Sistema da IA de Sugestão</Label>
            <Textarea
              id="system-prompt"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={10}
              className="min-h-[200px]"
              placeholder="Insira o prompt do sistema para a IA de sugestão aqui..."
            />
            <p className="text-sm text-gray-500">
              Este prompt define o comportamento e o estilo de resposta da IA de sugestão.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between gap-4">
          <Button
            onClick={handleResetToDefault}
            variant="outline"
            className="flex-1 border-indigo-600 text-indigo-600 hover:bg-indigo-50"
          >
            Resetar para Padrão
          </Button>
          <Button
            onClick={handleSavePrompt}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
          >
            <Save className="mr-2 h-4 w-4" /> Salvar Prompt
          </Button>
        </CardFooter>
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default AISuggestionSettingsPage;