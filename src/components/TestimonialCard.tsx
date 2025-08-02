import React from 'react';
import { Star } from 'lucide-react';

interface TestimonialCardProps {
  name: string;
  role: string;
  company: string;
  content: string;
  avatar?: string;
}

export const TestimonialCard: React.FC<TestimonialCardProps> = ({ 
  name, 
  role, 
  company, 
  content, 
  avatar 
}) => {
  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
      {/* Stars */}
      <div className="flex space-x-1 mb-4">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
        ))}
      </div>

      {/* Content */}
      <blockquote className="text-muted-foreground mb-6 leading-relaxed">
        "{content}"
      </blockquote>

      {/* Author */}
      <div className="flex items-center space-x-3">
        <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full flex items-center justify-center">
          {avatar ? (
            <img src={avatar} alt={name} className="w-12 h-12 rounded-full object-cover" />
          ) : (
            <span className="text-primary font-semibold text-lg">
              {name.split(' ').map(n => n[0]).join('')}
            </span>
          )}
        </div>
        <div>
          <div className="font-semibold text-foreground">{name}</div>
          <div className="text-sm text-muted-foreground">{role} at {company}</div>
        </div>
      </div>
    </div>
  );
};