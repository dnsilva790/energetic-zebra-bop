"use client";

import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import AITutorChat from "@/components/AITutorChat";

const AITutorChatPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100 p-4">
      <div className="w-full max-w-2xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-gray-800 hover:bg-gray-200">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-4xl font-extrabold text-gray-800 text-center flex-grow">
            Tutor de IA
          </h1>
          <div className="w-20"></div> {/* Placeholder for alignment */}
        </div>
      </div>
      <AITutorChat />
      <MadeWithDyad />
    </div>
  );
};

export default AITutorChatPage;