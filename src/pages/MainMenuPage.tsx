"use client";

import React from "react";
import { MadeWithDyad } from "@/components/made-with-dyad";

const MainMenuPage = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <h1 className="text-4xl font-bold text-gray-800 mb-4">
        Bem-vindo ao Menu Principal!
      </h1>
      <p className="text-lg text-gray-600">
        Sua configuração foi salva com sucesso.
      </p>
      <MadeWithDyad />
    </div>
  );
};

export default MainMenuPage;