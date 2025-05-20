
import React, { useState } from 'react';
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TextInputProps {
  onSubmit: (text: string) => void;
}

const TextInput: React.FC<TextInputProps> = ({ onSubmit }) => {
  const [inputText, setInputText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSubmit(inputText.trim());
      setInputText("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex-1 flex items-center">
      <input
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="Type your message..."
        className="w-full bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
      />
      <Button 
        type="submit" 
        size="icon"
        className="bg-secondary hover:bg-secondary/90 ml-2"
      >
        <Send className="h-5 w-5" />
      </Button>
    </form>
  );
};

export default TextInput;
