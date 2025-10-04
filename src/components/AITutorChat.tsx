"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Send, Loader2, User, Bot } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { showSuccess, showError } from '@/utils/toast';
import { cn } from '@/lib/utils';

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

const AITutorChat: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { taskTitle, taskDescription } = location.state as { taskTitle: string; taskDescription: string };

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  const sendMessageToGemini = useCallback(async (currentMessages: ChatMessage[]) => {
    if (!GEMINI_API_KEY) {
      showError("VITE_GEMINI_API_KEY não configurada. Por favor, adicione-a ao seu arquivo .env.");
      setMessages(prev => [...prev, { role: 'model', content: "Erro: Chave API do Gemini não configurada." }]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const formattedContents = currentMessages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    try {
      const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: formattedContents,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `Erro na API Gemini: ${response.statusText}`);
      }

      const data = await response.json();
      const aiResponseContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "Não foi possível obter uma resposta do Tutor de IA.";
      
      setMessages(prev => [...prev, { role: 'model', content: aiResponseContent }]);
      showSuccess("Resposta do Tutor de IA recebida!");
    } catch (error: any) {
      console.error("Erro ao se comunicar com Gemini:", error);
      setMessages(prev => [...prev, { role: 'model', content: `Erro ao obter resposta do Tutor de IA: ${error.message}` }]);
      showError(`Erro ao obter resposta do Tutor de IA: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [GEMINI_API_KEY, GEMINI_API_URL]);

  useEffect(() => {
    const initialSystemInstruction = "Você é um tutor especialista em produtividade e TDAH. Seu único objetivo é pegar a tarefa que o usuário fornecer e transformá-la em 3 a 5 micro-passos simples e imediatos. Sua resposta deve ser apenas a lista de micro-passos, sem introdução ou conclusão. O input do usuário é o título e a descrição da tarefa.";
    const initialUserPrompt = `Minha tarefa atual é: ${taskTitle}. A descrição é: ${taskDescription}. Por favor, me guie em micro-passos e aguarde minha interação.`;

    const initialMessages: ChatMessage[] = [
      { role: 'user', content: initialSystemInstruction },
      { role: 'user', content: initialUserPrompt },
    ];
    setMessages(initialMessages);
    sendMessageToGemini(initialMessages);
  }, [taskTitle, taskDescription, sendMessageToGemini]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (input.trim() === '' || isLoading) return;

    const newUserMessage: ChatMessage = { role: 'user', content: input.trim() };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setInput('');
    
    await sendMessageToGemini(updatedMessages);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100 p-4">
      <Card className="w-full max-w-2xl shadow-lg bg-white/80 backdrop-blur-sm flex flex-col h-[80vh]">
        <CardHeader className="text-center border-b p-4 flex flex-row items-center justify-between">
          <Button variant="ghost" onClick={() => navigate(-1)} className="text-purple-800 hover:bg-purple-200">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <CardTitle className="text-3xl font-extrabold text-purple-800 flex-grow">
            Tutor de IA (Gemini)
          </CardTitle>
          <div className="w-20"></div> {/* Placeholder for alignment */}
        </CardHeader>
        <CardContent className="flex-grow p-4 overflow-hidden">
          <ScrollArea className="h-full pr-4" viewportRef={scrollAreaRef}>
            <div className="space-y-4">
              {messages.filter(msg => msg.role !== 'system').map((msg, index) => ( // Filter out system instruction from display
                <div key={index} className={cn(
                  "flex items-start gap-3",
                  msg.role === 'user' ? "justify-end" : "justify-start"
                )}>
                  {msg.role === 'model' && <Bot className="h-6 w-6 text-purple-600 flex-shrink-0" />}
                  <div className={cn(
                    "p-3 rounded-lg max-w-[70%]",
                    msg.role === 'user'
                      ? "bg-blue-500 text-white rounded-br-none"
                      : "bg-gray-200 text-gray-800 rounded-bl-none"
                  )}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  {msg.role === 'user' && <User className="h-6 w-6 text-blue-600 flex-shrink-0" />}
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start items-center gap-3">
                  <Bot className="h-6 w-6 text-purple-600 animate-pulse" />
                  <div className="bg-gray-200 text-gray-800 p-3 rounded-lg rounded-bl-none">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
        <div className="p-4 border-t flex items-center gap-2">
          <Input
            placeholder="Digite sua mensagem..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-grow"
            disabled={isLoading}
          />
          <Button onClick={handleSendMessage} disabled={isLoading || input.trim() === ''}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default AITutorChat;