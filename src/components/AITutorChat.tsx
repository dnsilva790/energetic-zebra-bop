"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, User, Bot, Check, X, AlertCircle } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { createTasks, handleApiCall, updateTaskDescription } from '@/lib/todoistApi';
import { Badge } from '@/components/ui/badge'; // Importar o componente Badge

// Importações de Firebase necessárias
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

interface AITutorChatProps {
  taskTitle: string;
  taskDescription: string;
  taskId: string;
  onClose: () => void;
  className?: string;
  isTaskCompleted: boolean; // Nova propriedade adicionada
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

const AITutorChat: React.FC<AITutorChatProps> = ({ taskTitle, taskDescription, taskId, onClose, className, isTaskCompleted }) => {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

  // --- Firebase State ---
  const [db, setDb] = useState<any>(null);
  const [auth, setAuth] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [firebaseLoading, setFirebaseLoading] = useState(true);

  // --- Firebase Initialization ---
  useEffect(() => {
    const setupFirebase = async () => {
      if (typeof window === 'undefined' || typeof (__firebase_config) === 'undefined' || typeof (__app_id) === 'undefined') {
        console.warn("Firebase config variables not found. Skipping Firebase initialization in AITutorChat.");
        setFirebaseLoading(false);
        return;
      }

      try {
        const firebaseConfig = JSON.parse(__firebase_config as string);
        const app = initializeApp(firebaseConfig);
        const firestoreDb = getFirestore(app);
        const firebaseAuth = getAuth(app);
        
        setDb(firestoreDb);
        setAuth(firebaseAuth);

        if (typeof (__initial_auth_token) !== 'undefined') {
          await signInWithCustomToken(firebaseAuth, __initial_auth_token as string);
        } else {
          await signInAnonymously(firebaseAuth);
        }
        
        const currentUserId = firebaseAuth.currentUser?.uid || crypto.randomUUID();
        setUserId(currentUserId);
        setFirebaseLoading(false);

      } catch (error) {
        console.error("Erro ao inicializar e autenticar o Firebase em AITutorChat:", error);
        setFirebaseLoading(false);
      }
    };

    setupFirebase();
  }, []);

  // --- Load System Prompt from Firestore ---
  useEffect(() => {
    if (!db || !userId || firebaseLoading) return;

    const loadPrompt = async () => {
      try {
        const appId = typeof (__app_id) !== 'undefined' ? (__app_id as string) : 'default-app-id';
        const promptDocRef = doc(db, 
          `artifacts/${appId}/users/${userId}/ai_tutor_config`, 
          'prompt_document'
        );
        
        const docSnap = await getDoc(promptDocRef);
        
        if (docSnap.exists() && docSnap.data().systemPrompt) {
          setSystemPrompt(docSnap.data().systemPrompt);
        } else {
          // Fallback to default if not found, and save it for future use
          const DEFAULT_PROMPT = `Você é o Tutor IA 'SEISO' e sua função é ajudar o usuário a quebrar tarefas complexas em micro-passos acionáveis. Responda de forma concisa e direta, usando linguagem de coaching, sempre mantendo o foco no próximo passo e na execução imediata. Cada resposta deve ser uma lista numerada de 3 a 5 micro-passos.`;
          await setDoc(promptDocRef, { systemPrompt: DEFAULT_PROMPT });
          setSystemPrompt(DEFAULT_PROMPT);
        }
      } catch (error) {
        console.error("Erro ao carregar prompt do Firestore em AITutorChat:", error);
        // Fallback to a default prompt if Firestore fails
        setSystemPrompt(`Você é o Tutor IA 'SEISO' e sua função é ajudar o usuário a quebrar tarefas complexas em micro-passos acionáveis. Responda de forma concisa e direta, usando linguagem de coaching, sempre mantendo o foco no próximo passo e na execução imediata. Cada resposta deve ser uma lista numerada de 3 a 5 micro-passos.`);
      }
    };

    loadPrompt();
  }, [db, userId, firebaseLoading]);

  // --- Early exit if API key or Firebase is missing/loading ---
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

  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const localStorageKey = useMemo(() => {
    const key = `chat-history-${taskId}`;
    return key;
  }, [taskId]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [parsedMicroSteps, setParsedMicroSteps] = useState<{ content: string; description: string }[]>([]);
  const [initialAiResponseReceived, setInitialAiResponseReceived] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(false); // Ref para controlar a montagem inicial

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  const sendMessageToGemini = useCallback(async (userAndModelMessages: ChatMessage[], currentSystemPrompt: string) => {
    setIsLoading(true);

    const systemInstructionPart = {
      role: 'user',
      parts: [{ text: currentSystemPrompt }],
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
      
      const extractedTasks = parseAiResponseForTasks(aiResponseContent);
      setParsedMicroSteps(extractedTasks); 

      setMessages(prev => {
        const newMessages = [...prev, { role: 'model', content: aiResponseContent }];
        
        if (!initialAiResponseReceived) {
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
  }, [GEMINI_API_URL, initialAiResponseReceived]);

  // Efeito para carregar o histórico e enviar a mensagem inicial
  useEffect(() => {
    // Resetar estados relacionados à tarefa quando taskId muda
    setInitialAiResponseReceived(false);
    setParsedMicroSteps([]);
    setMessages([]); // Limpar mensagens ao mudar de tarefa

    if (firebaseLoading || !systemPrompt) {
      // Wait for Firebase to load and systemPrompt to be available
      return;
    }

    let loadedMessages: ChatMessage[] = [];
    if (typeof window !== 'undefined') {
      const savedHistory = localStorage.getItem(localStorageKey);
      if (savedHistory) {
        try {
          const parsedHistory = JSON.parse(savedHistory);
          if (Array.isArray(parsedHistory) && parsedHistory.length > 0) {
            loadedMessages = parsedHistory;
            setInitialAiResponseReceived(true);
          }
        } catch (e) {
          console.error("Falha ao analisar o histórico do chat do localStorage", e);
          localStorage.removeItem(localStorageKey);
        }
      }
    }

    if (loadedMessages.length > 0) {
      setMessages(loadedMessages);
    } else {
      const initialUserPrompt = `Minha tarefa atual é: ${taskTitle}. A descrição é: ${taskDescription}. Por favor, me guie em micro-passos e aguarde minha interação.`;
      const newInitialMessages = [{ role: 'user', content: initialUserPrompt }];
      setMessages(newInitialMessages);
      sendMessageToGemini(newInitialMessages, systemPrompt); // Envia a mensagem inicial para o Gemini
    }
  }, [taskId, taskTitle, taskDescription, localStorageKey, sendMessageToGemini, firebaseLoading, systemPrompt]);

  // Efeito para marcar que o componente foi montado
  useEffect(() => {
    isMounted.current = true;
  }, []);

  // Efeito para salvar mensagens no localStorage, ignorando a primeira montagem e a mensagem inicial
  useEffect(() => {
    if (!isMounted.current) {
      return; // Ignora a primeira execução (montagem inicial)
    }

    if (messages.length <= 1) {
      return; 
    }

    if (messages.length > 0) {
      const historyToStore = JSON.stringify(messages);
      localStorage.setItem(localStorageKey, historyToStore);
    } else {
      localStorage.removeItem(localStorageKey); // Remove a chave se o chat estiver vazio
    }
  }, [messages, localStorageKey]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (input.trim() === '' || isLoading || !systemPrompt) return;

    const newUserMessage: ChatMessage = { role: 'user', content: input.trim() };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setInput('');
    
    await sendMessageToGemini(updatedMessages, systemPrompt);
  };

  const handleSendToTodoist = async () => {
    if (parsedMicroSteps.length === 0) {
      showError("Nenhum micro-passo para enviar. Por favor, aguarde a resposta do Tutor de IA.");
      return;
    }

    const todoistToken = localStorage.getItem('todoist_token');
    if (!todoistToken) {
      console.error("Erro: Token do Todoist não encontrado no localStorage. Por favor, configure-o na página de Configurações.");
      showError("Token do Todoist não encontrado. Por favor, configure-o na página de Configurações.");
      setMessages(prev => [...prev, { role: 'model', content: "❌ Erro: Token do Todoist não configurado. Não foi possível enviar tarefas." }]);
      return;
    }

    setIsLoading(true);
    try {
      // Formatar os micro-passos em uma única string para anexar
      const formattedMicroSteps = parsedMicroSteps
        .map((step, index) => `${index + 1}. ${step.content}${step.description ? ` - ${step.description}` : ''}`)
        .join('\n');

      const updatedTask = await handleApiCall(
        () => updateTaskDescription(taskId, formattedMicroSteps), // Usa a nova função de atualização
        "Anexando micro-passos à descrição da tarefa...",
        "Micro-passos anexados com sucesso à descrição da tarefa!"
      );

      if (updatedTask) {
        setMessages(prev => [...prev, { role: 'model', content: "✅ Micro-passos anexados à descrição da tarefa!" }]);
        setParsedMicroSteps([]);
      } else {
        setMessages(prev => [...prev, { role: 'model', content: "❌ Falha ao anexar micro-passos à descrição da tarefa." }]);
      }
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'model', content: `❌ Erro ao anexar micro-passos: ${error.message}` }]);
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

  const overallLoading = isLoading || firebaseLoading || systemPrompt === null;

  return (
    <div className={cn("flex flex-col h-full bg-white/80 backdrop-blur-sm", className)}>
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex flex-col items-start">
          <h2 className="text-xl font-bold text-purple-800">Tutor de IA (Gemini)</h2>
          <Badge className={cn(
            "mt-1 text-xs font-semibold",
            isTaskCompleted ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
          )}>
            {isTaskCompleted ? "CONCLUÍDA" : "ATIVA"}
          </Badge>
        </div>
        <Button variant="ghost" onClick={onClose} className="p-2">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {overallLoading && (
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-purple-600">
          <Loader2 className="h-12 w-12 mb-4 animate-spin" />
          <p className="text-lg font-semibold">Carregando Tutor de IA...</p>
          <p className="text-sm mt-2">
            {firebaseLoading ? "Inicializando Firebase..." : "Carregando instrução de sistema..."}
          </p>
        </div>
      )}

      {!overallLoading && (
        <>
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

          <div className="p-4 border-t flex flex-col gap-2">
            <Input
              placeholder="Digite sua mensagem..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-grow min-w-0"
              disabled={isLoading}
            />
            <div className="flex gap-2 w-full">
              <Button onClick={handleSendMessage} disabled={isLoading || input.trim() === ''} className="flex-1">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
              </Button>
              <Button 
                onClick={handleSendToTodoist} 
                disabled={isLoading || parsedMicroSteps.length === 0} 
                className="bg-green-600 hover:bg-green-700 text-white flex-1"
              >
                <Check className="h-4 w-4 mr-2" /> Para Todoist
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AITutorChat;