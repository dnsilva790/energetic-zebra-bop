"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "ai";
  content: string;
}

const AITutorChat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputContent, setInputContent] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (inputContent.trim()) {
      const newUserMessage: Message = { role: "user", content: inputContent.trim() };
      setMessages((prevMessages) => [...prevMessages, newUserMessage]);
      setInputContent("");

      // Simulate AI response
      setTimeout(() => {
        const aiResponse: Message = { role: "ai", content: `Olá! Você disse: "${newUserMessage.content}". Como posso ajudar?` };
        setMessages((prevMessages) => [...prevMessages, aiResponse]);
      }, 1000);
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
        />
        <Button onClick={handleSendMessage} disabled={!inputContent.trim()}>
          <Send className="h-4 w-4 mr-2" /> Enviar
        </Button>
      </CardFooter>
    </Card>
  );
};

export default AITutorChat;