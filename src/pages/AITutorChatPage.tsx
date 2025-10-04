"use client";

import React from 'react';
import AITutorChat from '@/components/AITutorChat';

const AITutorChatPage = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100 p-4">
      <AITutorChat />
    </div>
  );
};

export default AITutorChatPage;