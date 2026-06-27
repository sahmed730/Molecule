import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, Save, Send, MessageSquare, Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppStore } from '../store';

interface ModuleWorkspaceProps {
  moduleData: any;
  onUpdate: (id: string, data: any) => void;
}

const ModuleWorkspace: React.FC<ModuleWorkspaceProps> = ({ moduleData, onUpdate }) => {
  const [data, setData] = useState(moduleData);
  const [isReviewing, setIsReviewing] = useState(false);
  const [review, setReview] = useState<any>(null);
  const token = useAppStore(state => state.token);

  // Chat state
  const [chatMessage, setChatMessage] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'assistant', content: string}[]>([]);

  useEffect(() => {
    setData(moduleData);
  }, [moduleData]);

  const handleReview = async () => {
    setIsReviewing(true);
    setReview(null);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/review-module`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ module_data: data }),
      });
      const res = await response.json();
      if (res.status === 'success') {
        setReview(res.review);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to get localized module review.');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleSave = () => {
    onUpdate(moduleData.moduleId || data.moduleId, data);
    alert('Saved module data!');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    alert('Module copied to clipboard!');
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    const userMsg = chatMessage.trim();
    setChatMessage('');
    
    // Add user message and an empty assistant message to stream into
    setChatHistory(prev => [
      ...prev, 
      { role: 'user', content: userMsg },
      { role: 'assistant', content: '' }
    ]);
    setIsChatting(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/chat-module-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ module_data: data, user_message: userMsg }),
      });
      
      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        fullResponse += chunk;
        
        // Update the last assistant message in history with the accumulated text
        setChatHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1] = { role: 'assistant', content: fullResponse };
          return newHistory;
        });
      }

      // Try to extract JSON from the fullResponse (look for ```json ... ```)
      const jsonMatch = fullResponse.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          const updatedModule = JSON.parse(jsonMatch[1]);
          setData(updatedModule);
          onUpdate(moduleData.moduleId || updatedModule.moduleId, updatedModule);
        } catch (parseError) {
          console.error("Failed to parse module JSON from response:", parseError);
        }
      } else {
        // Fallback: try parsing the whole thing if there are no markdown fences
        try {
          const startIdx = fullResponse.indexOf('{');
          const endIdx = fullResponse.lastIndexOf('}');
          if (startIdx !== -1 && endIdx !== -1) {
             const updatedModule = JSON.parse(fullResponse.substring(startIdx, endIdx + 1));
             setData(updatedModule);
             onUpdate(moduleData.moduleId || updatedModule.moduleId, updatedModule);
          }
        } catch (fallbackError) {
           console.error("Failed to parse fallback JSON from response:", fallbackError);
        }
      }

    } catch (e) {
      console.error(e);
      setChatHistory(prev => {
         const newHistory = [...prev];
         newHistory[newHistory.length - 1] = { 
           role: 'assistant', 
           content: newHistory[newHistory.length - 1].content + '\n\n**Error:** Failed to update module.' 
         };
         return newHistory;
      });
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="flex-1 h-full flex overflow-hidden">
      {/* Left Pane: Module Configuration */}
      <div className="flex-1 bg-slate-50 flex flex-col p-6 overflow-y-auto border-r border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">
            Module: <span className="text-blue-600">{data.label || 'Unnamed Module'}</span>
          </h2>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded shadow-sm transition-colors"
            >
              <Copy className="w-4 h-4" />
              Copy
            </button>
            <button 
              onClick={handleReview}
              disabled={isReviewing}
              className="flex items-center gap-2 px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 font-bold text-sm rounded shadow-sm transition-colors"
            >
              {isReviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              AI Review
            </button>
            <button 
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded shadow transition-colors"
            >
              <Save className="w-4 h-4" />
              Save Module
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Module Name</label>
              <input 
                className="w-full p-2 border border-slate-200 rounded text-sm" 
                value={data.label || ''} 
                onChange={e => setData({...data, label: e.target.value})} 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Core Task</label>
              <textarea 
                className="w-full p-2 border border-slate-200 rounded text-sm h-24" 
                value={data.coreTask || ''} 
                onChange={e => setData({...data, coreTask: e.target.value})} 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data Shape (Input)</label>
              <textarea 
                className="w-full p-2 border border-slate-200 rounded text-sm h-24 font-mono text-xs" 
                value={data.dataShape || ''} 
                onChange={e => setData({...data, dataShape: e.target.value})} 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Expected Output</label>
              <textarea 
                className="w-full p-2 border border-slate-200 rounded text-sm h-24 font-mono text-xs" 
                value={data.expectedOutput || ''} 
                onChange={e => setData({...data, expectedOutput: e.target.value})} 
              />
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Rules</label>
              <textarea 
                className="w-full p-2 border border-slate-200 rounded text-sm h-24" 
                value={data.rules || ''} 
                onChange={e => setData({...data, rules: e.target.value})} 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Dependencies</label>
              <textarea 
                className="w-full p-2 border border-slate-200 rounded text-sm h-24" 
                value={data.dependencies || ''} 
                onChange={e => setData({...data, dependencies: e.target.value})} 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Error Handling</label>
              <textarea 
                className="w-full p-2 border border-slate-200 rounded text-sm h-24" 
                value={data.errorHandling || ''} 
                onChange={e => setData({...data, errorHandling: e.target.value})} 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Testing Requirements</label>
              <textarea 
                className="w-full p-2 border border-slate-200 rounded text-sm h-24" 
                value={data.testingRequirements || ''} 
                onChange={e => setData({...data, testingRequirements: e.target.value})} 
              />
            </div>
          </div>
        </div>
        
        {/* AI Review Results below the form */}
        {review && (
          <div className="mt-8 bg-purple-50 border border-purple-200 rounded-xl p-4 w-full">
            <h3 className="font-bold text-purple-800 mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Localized Module Review
            </h3>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-bold uppercase text-slate-500">Score</span>
              <span className={`font-black text-lg ${review.score >= 80 ? 'text-green-600' : 'text-orange-600'}`}>
                {review.score}/100
              </span>
            </div>
            
            {review.issues && review.issues.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Issues</h4>
                <ul className="space-y-2">
                  {review.issues.map((iss: any, i: number) => (
                    <li key={i} className="text-sm text-slate-700 bg-white p-2 rounded border border-red-100 border-l-4 border-l-red-500 shadow-sm">
                      <span className="font-bold text-red-700 mr-2">[{iss.type}]</span>
                      {iss.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {review.suggestions && review.suggestions.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Suggestions</h4>
                <ul className="space-y-2">
                  {review.suggestions.map((sug: string, i: number) => (
                    <li key={i} className="text-sm text-slate-700 bg-white p-2 rounded border border-blue-100 border-l-4 border-l-blue-500 shadow-sm">
                      {sug}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Pane: Module Chat Assistant */}
      <div className="w-96 bg-white flex flex-col border-l border-slate-200">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold text-slate-800">Module Assistant</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatHistory.length === 0 ? (
            <div className="text-center text-slate-400 text-sm mt-10">
              <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p>Ask the AI to update this module precisely.</p>
              <p className="mt-2">"Add retry logic to Error Handling"</p>
              <p>"Change language to Rust"</p>
            </div>
          ) : (
            chatHistory.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl p-3 text-sm ${
                  msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800 border border-slate-200'
                }`}>
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <div className="prose prose-sm prose-slate max-w-none prose-p:my-1 prose-pre:my-2 prose-pre:p-2">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {isChatting && chatHistory[chatHistory.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-xl p-3 text-sm bg-slate-100 text-slate-800 border border-slate-200 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                Updating module...
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200">
          <form onSubmit={handleChatSubmit} className="flex gap-2">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Suggest an update..."
              disabled={isChatting}
              className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
            />
            <button
              type="submit"
              disabled={isChatting || !chatMessage.trim()}
              className="p-2 bg-blue-600 text-white rounded-lg disabled:bg-blue-400 hover:bg-blue-700 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ModuleWorkspace;
