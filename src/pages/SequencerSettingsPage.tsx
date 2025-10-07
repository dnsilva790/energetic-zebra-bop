"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, Clock, XCircle } from "lucide-react"; // Adicionado XCircle para o botão de remover
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { SequencerSettings } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SEQUENCER_SETTINGS_KEY = 'sequencer_settings';

const DEFAULT_SEQUENCER_SETTINGS: SequencerSettings = {
  dailyContexts: {
    sunday: { professional: [], personal: [{ start: '09:00', end: '22:00' }] },
    monday: { professional: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }], personal: [{ start: '18:00', end: '22:00' }] },
    tuesday: { professional: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }], personal: [{ start: '18:00', end: '22:00' }] },
    wednesday: { professional: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }], personal: [{ start: '18:00', end: '22:00' }] },
    thursday: { professional: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }], personal: [{ start: '18:00', end: '22:00' }] },
    friday: { professional: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }], personal: [{ start: '18:00', end: '22:00' }] },
    saturday: { professional: [], personal: [{ start: '09:00', end: '22:00' }] },
  },
};

const daysOfWeek = [
  { value: 'sunday', label: 'Domingo' },
  { value: 'monday', label: 'Segunda-feira' },
  { value: 'tuesday', label: 'Terça-feira' },
  { value: 'wednesday', label: 'Quarta-feira' },
  { value: 'thursday', label: 'Quinta-feira' },
  { value: 'friday', label: 'Sexta-feira' },
  { value: 'saturday', label: 'Sábado' },
];

const SequencerSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SequencerSettings>(DEFAULT_SEQUENCER_SETTINGS);
  const [selectedDay, setSelectedDay] = useState(daysOfWeek[0].value);

  useEffect(() => {
    const savedSettings = localStorage.getItem(SEQUENCER_SETTINGS_KEY);
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (e) {
        console.error("Error parsing sequencer settings from localStorage:", e);
        setSettings(DEFAULT_SEQUENCER_SETTINGS);
      }
    }
  }, []);

  const handleSaveSettings = useCallback(() => {
    localStorage.setItem(SEQUENCER_SETTINGS_KEY, JSON.stringify(settings));
    showSuccess("Configurações do Sequenciador salvas com sucesso!");
  }, [settings]);

  const handleResetToDefault = useCallback(() => {
    setSettings(DEFAULT_SEQUENCER_SETTINGS);
    localStorage.setItem(SEQUENCER_SETTINGS_KEY, JSON.stringify(DEFAULT_SEQUENCER_SETTINGS));
    showSuccess("Configurações do Sequenciador resetadas para o padrão!");
  }, []);

  // Nova função para lidar com a mudança do dia selecionado
  const handleDayChange = useCallback((value: string) => {
    setSelectedDay(value);
  }, []);

  const handleTimeBlockChange = useCallback((day: string, context: 'professional' | 'personal', index: number, field: 'start' | 'end', value: string) => {
    setSettings(prevSettings => {
      const newSettings = { ...prevSettings };
      const newBlocks = [...newSettings.dailyContexts[day][context]];
      newBlocks[index] = { ...newBlocks[index], [field]: value };
      newSettings.dailyContexts[day][context] = newBlocks;
      return newSettings;
    });
  }, []);

  const handleAddTimeBlock = useCallback((day: string, context: 'professional' | 'personal') => {
    setSettings(prevSettings => {
      const newSettings = { ...prevSettings };
      newSettings.dailyContexts[day][context] = [...newSettings.dailyContexts[day][context], { start: '09:00', end: '17:00' }];
      return newSettings;
    });
  }, []);

  const handleRemoveTimeBlock = useCallback((day: string, context: 'professional' | 'personal', index: number) => {
    setSettings(prevSettings => {
      const newSettings = { ...prevSettings };
      newSettings.dailyContexts[day][context] = newSettings.dailyContexts[day][context].filter((_, i) => i !== index);
      return newSettings;
    });
  }, []);

  const renderTimeBlocks = (day: string, context: 'professional' | 'personal') => {
    const blocks = settings.dailyContexts[day]?.[context] || [];
    return (
      <div className="space-y-3">
        <h4 className="text-md font-semibold capitalize">{context === 'professional' ? 'Profissional' : 'Pessoal'}</h4>
        {blocks.length === 0 && <p className="text-sm text-gray-500">Nenhum bloco de tempo definido.</p>}
        {blocks.map((block, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              type="time"
              value={block.start}
              onChange={(e) => handleTimeBlockChange(day, context, index, 'start', e.target.value)}
              className="w-24"
            />
            <span>-</span>
            <Input
              type="time"
              value={block.end}
              onChange={(e) => handleTimeBlockChange(day, context, index, 'end', e.target.value)}
              className="w-24"
            />
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleRemoveTimeBlock(day, context, index)}
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleAddTimeBlock(day, context)}
          className="mt-2"
        >
          <Clock className="mr-2 h-4 w-4" /> Adicionar Bloco
        </Button>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-teal-100 to-cyan-100 p-4">
      <Card className="w-full max-w-3xl shadow-lg bg-white/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-teal-800 hover:bg-teal-200">
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
            </Button>
            <CardTitle className="text-3xl font-bold text-teal-800 flex-grow">
              Configurações do Sequenciador
            </CardTitle>
            <div className="w-20"></div> {/* Espaçador */}
          </div>
          <CardDescription className="text-lg text-gray-600 mt-2">
            Defina seus blocos de tempo pessoal e profissional para cada dia da semana.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="day-select" className="text-lg font-semibold">Dia da Semana</Label>
            <Select value={selectedDay} onValueChange={handleDayChange}> {/* CORRIGIDO AQUI */}
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione um dia" />
              </SelectTrigger>
              <SelectContent>
                {daysOfWeek.map(day => (
                  <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderTimeBlocks(selectedDay, 'professional')}
            {renderTimeBlocks(selectedDay, 'personal')}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between gap-4">
          <Button
            onClick={handleResetToDefault}
            variant="outline"
            className="flex-1 border-teal-600 text-teal-600 hover:bg-teal-50"
          >
            Resetar para Padrão
          </Button>
          <Button
            onClick={handleSaveSettings}
            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-semibold"
          >
            <Save className="mr-2 h-4 w-4" /> Salvar Configurações
          </Button>
        </CardFooter>
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default SequencerSettingsPage;