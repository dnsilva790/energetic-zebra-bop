"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, User, Bot, Check, X, AlertCircle } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { createTasks, handleApiCall } from '@/lib/todoistApi';

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

interface AITutorChatProps {
  taskTitle: string;
  taskDescription: string;
  onClose: () => void;
  className?: string;
}

// Helper function to parse AI response for tasks
const parseAiResponseForTasks = (responseText: string): { content: string; description: string }[] => {
  const tasks: { content: string; description: string }[] = [];
  const lines = responseText.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    const listItemMatch = trimmedLine.match(/^(\s*[-*]|\s*\d+\.)\s*(.*)/);
    if (listItemMatch) {
      let contentAndDescription = listItemMatch[2].trim();
      contentAndDescription = contentAndDescription.replace(/\*\*(.*?)\*\*/g, '$1').trim();

      let title = contentAndDescription;
      let description = '';

      const separatorMatch = contentAndDescription.match(/^(.*?)\s*([:.-])\s*(.*)$/);
      if (separatorMatch && separatorMatch[3]) {
        title = separatorMatch[1].trim();
        description = separatorMatch[3].trim();
      } else {
        title = contentAndDescription;
        description = '';
      }

      if (title) {
        tasks.push({ content: title, description: description || 'Sem descrição.' });
      }
    }
  }
  return tasks;
};

const AITutorChat: React.FC<AITutorChatProps> = ({ taskTitle, taskDescription, onClose, className }) => {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

  // --- Early exit if API key is missing ---
  if (!GEMINI_API_KEY) {
    return (
      <div className={cn("flex flex-col h-full bg-white/80 backdrop-blur-sm", className)}>
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold text-purple-800">Tutor de IA (Gemini)</h2>
          <Button variant="ghost" onClick={onClose} className="p-2">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-red-600">
          <AlertCircle className="h-12 w-12 mb-4" />
          <p className="text-lg font-semibold">Erro de Configuração</p>
          <p className="text-sm mt-2">
            A chave da API do Gemini (<code>VITE_GEMINI_API_KEY</code>) não está configurada.
            Por favor, adicione-a ao seu arquivo <code>.env</code> na raiz do projeto.
          </p>
          <p className="text-xs mt-2">
            Exemplo: <code>VITE_GEMINI_API_KEY=SUA_CHAVE_AQUI</code>
          </p>
        </div>
      </div>
    );
  }
  // --- End early exit ---

  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [parsedMicroSteps, setParsedMicroSteps] = useState<{ content: string; description: string }[]>([]);
  const [initialAiResponseReceived, setInitialAiResponseReceived] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  const initialSystemInstructionText = `# PERFIL E FUNÇÃO
Você é um Tutor de Execução (Executive Coach) não-julgador e ESPECIALISTA em adultos com TDAH e desenvolvimento de software. Seu único objetivo é eliminar o atrito e guiar o usuário na ação imediata.

REGRAS DE INTERAÇÃO (Protocolo de Ação)
CLAREZA E SIMPLIFICAÇÃO: Sempre que uma tarefa for mencionada, você deve transformá-la em uma lista de 3 a 5 micro-passos acionáveis. Nunca mais do que 5. O foco é apenas no próximo passo.

FIRMEZA E INICIAÇÃO: Se o usuário expressar bloqueio, frustração ou falta de motivação, você deve usar um tom firme, mas de apoio. Sua resposta deve exigir que o usuário defina um cronômetro de 5 a 10 minutos para iniciar imediatamente o primeiro micro-passo. Não aceite a inação.

CONSCIÊNCIA TEMPORAL (Hiperfoco): A cada duas interações do usuário, insira um breve lembrete de que o tempo é um recurso limitado no projeto.

REGISTRO (Todoist): Após definir o próximo passo ou meta de ação, formule a descrição desse passo de forma clara e concisa (máximo 1 frase), pronta para ser usada como Título da Tarefa no Todoist. E, formule uma breve frase de motivação ou status (o 'Status da Tarefa') que será usada no campo de Descrição da tarefa no Todoist.`;

  const sendMessageToGemini = useCallback(async (userAndModelMessages: ChatMessage[]) => {
    setIsLoading(true);

    const systemInstructionPart = {
      role: 'user',
      parts: [{ text: initialSystemInstructionText }],
    };

    const formattedContents = userAndModelMessages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    const contentsForApi = [systemInstructionPart, ...formattedContents];

    try {
      const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: contentsForApi,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `Erro na API Gemini: ${response.statusText}`);
      }

      const data = await response.json();
      const aiResponseContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "Não foi possível obter uma resposta do Tutor de IA.";
      
      setMessages(prev => {
        const newMessages = [...prev, { role: 'model', content: aiResponseContent }];
        if (!initialAiResponseReceived && newMessages.filter(m => m.role === 'model').length === 1) {
            const extractedTasks = parseAiResponseForTasks(aiResponseContent);
            setParsedMicroSteps(extractedTasks);
            setInitialAiResponseReceived(true);
        }
        return newMessages;
      });
      showSuccess("Resposta do Tutor de IA recebida!");
    } catch (error: any) {
      console.error("Erro ao se comunicar com Gemini:", error);
      setMessages(prev => [...prev, { role: 'model', content: `Erro ao obter resposta do Tutor de IA: ${error.message}` }]);
      showError(`Erro ao obter resposta do Tutor de IA: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [GEMINI_API_URL, initialAiResponseReceived, initialSystemInstructionText]);

  useEffect(() => {
    const initialUserPrompt = `Minha tarefa atual é: ${taskTitle}. A descrição é: ${taskDescription}. Por favor, me guie em micro-passos e aguarde minha interação.`;
    setMessages([{ role: 'user', content: initialUserPrompt }]);
    sendMessageToGemini([{ role: 'user', content: initialUserPrompt }]);
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

  const handleSendToTodoist = async () => {
    if (parsedMicroSteps.length === 0) {
      showError("Nenhum micro-passo para enviar. Por favor, aguarde a resposta do Tutor de IA.");
      return;
    }

    setIsLoading(true);
    try {
      const createdTasks = await handleApiCall(
        () => createTasks(parsedMicroSteps),
        "Enviando micro-passos para o Todoist...",
        "Micro-passos enviados com sucesso para o Todoist!"
      );

      if (createdTasks) {
        setMessages(prev => [...prev, { role: 'model', content: "✅ Micro-passos enviados para o Todoist!" }]);
        setParsedMicroSteps([]);
      } else {
        setMessages(prev => [...prev, { role: 'model', content: "❌ Falha ao enviar micro-passos para o Todoist." }]);
      }
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'model', content: `❌ Erro ao enviar micro-passos: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-white/80 backdrop-blur-sm", className)}>
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="text-xl font-bold text-purple-800">Tutor de IA (Gemini)</h2>
        <Button variant="ghost" onClick={onClose} className="p-2">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4" viewportRef={scrollAreaRef}>
        <div className="space-y-4">
          {messages.map((msg, index) => (
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

      <div className="p-4 border-t flex flex-col gap-2"> {/* Alterado para flex-col */}
        <Input
          placeholder="Digite sua mensagem..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-grow min-w-0"
          disabled={isLoading}
        />
        <div className="flex gap-2 w-full"> {/* Novo div para os botões, ocupando a largura total */}
          <Button onClick={handleSendMessage} disabled={isLoading || input.trim() === ''} className="flex-1"> {/* flex-1 para dividir o espaço */}
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
          </Button>
          <Button 
            onClick={handleSendToTodoist} 
            disabled={isLoading || parsedMicroSteps.length === 0} 
            className="bg-green-600 hover:bg-green-700 text-white flex-1" // flex-1 para dividir o espaço
          >
            <Check className="h-4 w-4 mr-2" /> Para Todoist
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AITutorChat;