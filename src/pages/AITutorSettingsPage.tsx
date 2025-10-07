"use client";

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save } from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Importar Select

const AI_TUTOR_SYSTEM_PROMPT_KEY = 'ai_tutor_system_prompt';
const AI_TUTOR_SHEET_WIDTH_KEY = 'ai_tutor_sheet_width'; // Nova chave para a largura
const DEFAULT_SYSTEM_PROMPT = `Você é o Tutor IA 'SEISO' e sua função é ajudar o usuário a quebrar tarefas complexas em micro-passos acionáveis. Responda de forma concisa e direta, usando linguagem de coaching, sempre mantendo o foco no próximo passo e na execução imediata. Cada resposta deve ser uma lista numerada de 3 a 5 micro-passos.`;
const DEFAULT_SHEET_WIDTH = 'md'; // Largura padrão

const AITutorSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [customPrompt, setCustomPrompt] = useState("");
  const [sheetWidth, setSheetWidth] = useState(DEFAULT_SHEET_WIDTH); // Novo estado para a largura

  useEffect(() => {
    const savedPrompt = localStorage.getItem(AI_TUTOR_SYSTEM_PROMPT_KEY);
    setCustomPrompt(savedPrompt || DEFAULT_SYSTEM_PROMPT);

    const savedWidth = localStorage.getItem(AI_TUTOR_SHEET_WIDTH_KEY);
    setSheetWidth(savedWidth || DEFAULT_SHEET_WIDTH);
  }, []);

  const handleSavePrompt = () => {
    localStorage.setItem(AI_TUTOR_SYSTEM_PROMPT_KEY, customPrompt.trim());
    showSuccess("Prompt do Tutor de IA salvo com sucesso!");
  };

  const handleResetToDefault = () => {
    setCustomPrompt(DEFAULT_SYSTEM_PROMPT);
    localStorage.setItem(AI_TUTOR_SYSTEM_PROMPT_KEY, DEFAULT_SYSTEM_PROMPT);
    showSuccess("Prompt do Tutor de IA resetado para o padrão!");
  };

  const handleSaveWidth = (value: string) => {
    setSheetWidth(value);
    localStorage.setItem(AI_TUTOR_SHEET_WIDTH_KEY, value);
    showSuccess("Largura do painel do Tutor de IA salva com sucesso!");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-100 to-indigo-100 p-4">
      <Card className="w-full max-w-2xl shadow-lg bg-white/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-purple-800 hover:bg-purple-200">
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
            </Button>
            <CardTitle className="text-3xl font-bold text-purple-800 flex-grow">
              Configurações do Tutor de IA
            </CardTitle>
            <div className="w-20"></div> {/* Espaçador */}
          </div>
          <CardDescription className="text-lg text-gray-600 mt-2">
            Personalize o prompt do sistema e o tamanho do painel para o Tutor de IA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="system-prompt" className="text-lg font-semibold">Prompt do Sistema do Tutor de IA</Label>
            <Textarea
              id="system-prompt"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={10}
              className="min-h-[200px]"
              placeholder="Insira o prompt do sistema para o Tutor de IA aqui..."
            />
            <p className="text-sm text-gray-500">
              Este prompt define o comportamento e o estilo de resposta do Tutor de IA.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sheet-width" className="text-lg font-semibold">Largura do Painel do Tutor de IA</Label>
            <Select value={sheetWidth} onValueChange={handleSaveWidth}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione a largura" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">Pequeno (max-w-sm)</SelectItem>
                <SelectItem value="md">Médio (max-w-md)</SelectItem>
                <SelectItem value="lg">Grande (max-w-lg)</SelectItem>
                <SelectItem value="xl">Extra Grande (max-w-xl)</SelectItem>
                <SelectItem value="2xl">Muito Grande (max-w-2xl)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-500">
              Define a largura máxima do painel lateral do chat do Tutor de IA.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between gap-4">
          <Button
            onClick={handleResetToDefault}
            variant="outline"
            className="flex-1 border-purple-600 text-purple-600 hover:bg-purple-50"
          >
            Resetar Prompt Padrão
          </Button>
          <Button
            onClick={handleSavePrompt}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold"
          >
            <Save className="mr-2 h-4 w-4" /> Salvar Prompt
          </Button>
        </CardFooter>
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default AITutorSettingsPage;