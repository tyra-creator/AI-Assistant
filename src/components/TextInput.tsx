
import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

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
    <form onSubmit={handleSubmit} className="flex w-full max-w-2xl gap-2">
      <Input
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="Type your message..."
        className="flex-1 bg-jarvis-primary/20 border-jarvis-secondary/30 text-jarvis-text placeholder:text-jarvis-text-muted"
      />
      <Button 
        type="submit" 
        size="icon"
        className="bg-jarvis-secondary hover:bg-jarvis-secondary/90"
      >
        <Send className="h-5 w-5" />
      </Button>
    </form>
  );
};

export default TextInput;
