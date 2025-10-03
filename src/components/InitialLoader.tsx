"use client";

import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const InitialLoader = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const todoistToken = localStorage.getItem("todoist_token");
    if (todoistToken) {
      navigate("/main-menu", { replace: true });
    } else {
      navigate("/setup", { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <p className="text-lg text-gray-600">Carregando...</p>
    </div>
  );
};

export default InitialLoader;