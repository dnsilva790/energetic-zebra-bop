"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner"; // Importar toast para feedback ao usuário

interface Message {
  role: "user" | "ai";
  content: string;
}

const AITutorChat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputContent, setInputContent] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false); // Novo estado para controlar o envio
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessageToTessAI = useCallback(async (currentConversation: Message[]) => {
    setIsSending(true);
    const tessAiKey = import.meta.env.VITE_TESS_AI_KEY; // Acessando a variável de ambiente

    if (!tessAiKey) {
      toast.error("TESS_AI_KEY não configurada. Por favor, adicione-a ao seu arquivo .env (ex: VITE_TESS_AI_KEY=sua_chave).");
      setIsSending(false);
      return;
    }

    const loadingToastId = toast.loading("Aguardando resposta do Tutor de IA...");

    try {
      const response = await fetch("https://tess.pareto.io/api/agents/32502/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${tessAiKey}`,
        },
        body: JSON.stringify({
          messages: currentConversation, // Envia o histórico COMPLETO
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Erro na API Tess.ai: ${response.statusText}`);
      }

      const data = await response.json();
      // Assumindo que a resposta da IA está em data.text ou data.message
      const aiResponseContent = data.text || data.message || "Não foi possível obter uma resposta do Tutor de IA.";

      setMessages((prevMessages) => [...prevMessages, { role: "ai", content: aiResponseContent }]);
      toast.dismiss(loadingToastId);
      toast.success("Resposta do Tutor de IA recebida!");
    } catch (error: any) {
      console.error("Erro ao se comunicar com Tess.ai:", error);
      toast.dismiss(loadingToastId);
      toast.error(`Erro ao se comunicar com o Tutor de IA: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  }, []);

  const handleSendMessage = () => {
    if (inputContent.trim() && !isSending) {
      const newUserMessage: Message = { role: "user", content: inputContent.trim() };
      
      // Adiciona a mensagem do usuário imediatamente
      setMessages((prevMessages) => {
        const updatedMessages = [...prevMessages, newUserMessage];
        // Chama a função de envio da API com o histórico atualizado
        sendMessageToTessAI(updatedMessages);
        return updatedMessages;
      });
      setInputContent("");
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Card className="w-full max-w-2xl h-[70vh] flex flex-col shadow-lg">
      <CardHeader className="border-b p-4">
        <CardTitle className="text-2xl font-bold text-gray-800">Tutor de IA</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Comece a conversar com seu tutor de IA!
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[70%] p-3 rounded-lg shadow-sm",
                  message.role === "user"
                    ? "bg-blue-500 text-white rounded-br-none"
                    : "bg-gray-200 text-gray-800 rounded-bl-none"
                )}
              >
                {message.content}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </CardContent>
      <CardFooter className="flex p-4 border-t">
        <Input
          type="text"
          placeholder="Digite sua mensagem..."
          value={inputContent}
          onChange={(e) => setInputContent(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-grow mr-2"
          disabled={isSending}
        />
        <Button onClick={handleSendMessage} disabled={!inputContent.trim() || isSending}>
          <Send className="h-4 w-4 mr-2" /> {isSending ? "Enviando..." : "Enviar"}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default AITutorChat;