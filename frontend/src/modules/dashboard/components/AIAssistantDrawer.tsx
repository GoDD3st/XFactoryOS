import React, { useState } from 'react';
import { Bot, Send, X, Sparkles, MessageSquare, Shield, HelpCircle, RefreshCw } from 'lucide-react';
import { askXFactoryAI } from '@/services/ai/aiAssistantService';
import { AIAssistantMessage } from '@/frontend/src/types';

interface AIAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: string;
}

export const AIAssistantDrawer: React.FC<AIAssistantDrawerProps> = ({ isOpen, onClose, userRole }) => {
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<AIAssistantMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Bonjour ! Je suis l\'assistant IA **XFactory OS** (OCP Safi Site). Comment puis-je vous assister aujourd\'hui ?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestions: [
        'Quels sont les postes libres ?',
        'Expliquer la politique No-Show',
        'Supervision matériel IoT',
        'Consulter l\'occupation des clusters'
      ]
    }
  ]);

  if (!isOpen) return null;

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || inputQuery;
    if (!query.trim()) return;

    const userMsg: AIAssistantMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputQuery('');
    setLoading(true);

    try {
      const response = await askXFactoryAI(query, userRole);
      setMessages((prev) => [...prev, response]);
    } catch (err) {
      console.error('AI error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-md bg-slate-900 text-slate-100 h-full flex flex-col shadow-2xl border-l border-slate-800 animate-in slide-in-from-right duration-200">
        
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#008751] flex items-center justify-center text-white ring-2 ring-amber-400/40 shadow-sm">
              <Bot className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-sm text-white">XFactory AI Assistant</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Safi Site
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Assistance intelligente Smart Open Space</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Container */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-[#008751] text-white rounded-br-none shadow-sm'
                    : 'bg-slate-800/90 text-slate-100 border border-slate-700/80 rounded-bl-none shadow-sm'
                }`}
              >
                <div className="whitespace-pre-line">{msg.text}</div>
                <div
                  className={`text-[9px] mt-1.5 text-right ${
                    msg.sender === 'user' ? 'text-emerald-200' : 'text-slate-400'
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>

              {/* Suggestions chips */}
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 max-w-[90%]">
                  {msg.suggestions.map((sug, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(sug)}
                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full font-medium transition-all text-left flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                      {sug}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center space-x-2 text-xs text-slate-400 p-2">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
              <span>L'assistant IA réfléchit...</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center space-x-2">
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Posez une question sur les espaces..."
            className="flex-1 bg-slate-900 text-slate-100 border border-slate-800 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-[#008751] transition-colors"
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputQuery.trim() || loading}
            className="p-2.5 bg-[#008751] hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl transition-all cursor-pointer shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
