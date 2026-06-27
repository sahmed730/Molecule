import { useState, useEffect, useRef } from 'react';
import { Loader2, Zap, LayoutTemplate, Brain, CheckCircle2, LogOut, Save, FolderOpen, ArrowLeft, Paperclip, Eye, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import dagre from 'dagre';
import Sidebar from '../components/Sidebar';
import CanvasEditor from '../components/CanvasEditor';
import ModuleWorkspace from '../components/ModuleWorkspace';
import { useAppStore } from '../store';
import { collection, addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

// Archetype display config
const ARCHETYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  crud_app:           { label: 'CRUD Application',    color: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: '📋' },
  saas_platform:      { label: 'SaaS Platform',       color: 'bg-violet-100 text-violet-800 border-violet-300',    icon: '☁️' },
  autonomous_agent:   { label: 'Autonomous Agent',    color: 'bg-amber-100 text-amber-800 border-amber-300',      icon: '🤖' },
  workflow_engine:    { label: 'Workflow Engine',      color: 'bg-blue-100 text-blue-800 border-blue-300',         icon: '⚙️' },
  embedded_system:    { label: 'Embedded System',      color: 'bg-red-100 text-red-800 border-red-300',            icon: '🔌' },
  compiler_toolchain: { label: 'Compiler / Toolchain', color: 'bg-orange-100 text-orange-800 border-orange-300',   icon: '🔧' },
  data_pipeline:      { label: 'Data Pipeline',        color: 'bg-cyan-100 text-cyan-800 border-cyan-300',         icon: '🔀' },
  cognitive_system:   { label: 'Cognitive System',     color: 'bg-pink-100 text-pink-800 border-pink-300',         icon: '🧠' },
  realtime_system:    { label: 'Real-time System',     color: 'bg-indigo-100 text-indigo-800 border-indigo-300',   icon: '⚡' },
  marketplace:        { label: 'Marketplace',          color: 'bg-teal-100 text-teal-800 border-teal-300',         icon: '🏪' },
};

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 450;
const nodeHeight = 150;

const getLayoutedElements = (nodes: any[], edges: any[], direction = 'TB') => {
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
  });

  return { nodes, edges };
};

function Dashboard() {
  const [appState, setAppState] = useState<'home' | 'canvas'>('home');
  const [activeTab, setActiveTab] = useState<'ai' | 'blank' | 'projects'>('ai');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedNodes, setGeneratedNodes] = useState<any[]>([]);
  const [generatedEdges, setGeneratedEdges] = useState<any[]>([]);

  // Global Tab State
  const { activeTabId, openedTabs, setActiveTabId, closeTab, token, user, logout } = useAppStore();

  // Pipeline state
  const [isClassifying, setIsClassifying] = useState(false);
  const [classification, setClassification] = useState<any>(null);
  const [isClarifying, setIsClarifying] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  
  // File Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [attachedContext, setAttachedContext] = useState('');
  const [attachedDocName, setAttachedDocName] = useState('');
  const [showDocModal, setShowDocModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch('http://127.0.0.1:8000/api/upload-context', {
        method: 'POST',
        body: formData
      });
      
      const data = await res.json();
      if (data.status === 'success') {
        setAttachedContext(data.markdown);
        setAttachedDocName(file.name);
      } else {
        alert('Failed to parse document: ' + (data.detail || 'Unknown error'));
      }
    } catch (err) {
      alert('Error uploading document.');
      console.error(err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  // Streaming Generation State
  const [streamingMarkdown, setStreamingMarkdown] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveProject = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, "projects"), {
        userId: user.id,
        name: prompt ? (prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt) : 'New Project',
        nodes_json: JSON.stringify(generatedNodes),
        edges_json: JSON.stringify(generatedEdges),
        createdAt: Timestamp.now()
      });
      alert('Project saved successfully!');
      fetchProjects();
    } catch (e) {
      console.error(e);
      alert('Failed to save project');
    } finally {
      setIsSaving(false);
    }
  };

  const [projects, setProjects] = useState<any[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  const fetchProjects = async () => {
    if (!user) return;
    setIsLoadingProjects(true);
    try {
      const q = query(collection(db, "projects"), where("userId", "==", user.id));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(data);
    } catch (e) {
      console.error('Failed to fetch projects', e);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'projects') {
      fetchProjects();
    }
  }, [activeTab, user]);

  const loadProject = (project: any) => {
    try {
      setGeneratedNodes(JSON.parse(project.nodes_json));
      setGeneratedEdges(JSON.parse(project.edges_json));
      setPrompt(project.name);
      setAppState('canvas');
    } catch (e) {
      console.error("Failed to parse project data", e);
      alert("Failed to load project data");
    }
  };

  // ── Stage 1: Classify → Stage 2: Clarify ──────────────────

  const handleStartPipeline = async () => {
    if (!prompt.trim()) return;

    setIsClassifying(true);
    setClassification(null);
    
    const finalPrompt = attachedContext 
      ? `${prompt}\n\n--- Context from ${attachedDocName} ---\n${attachedContext}\n-------------------------\n` 
      : prompt;

    try {
      // Stage 1: Classify the system type
      const classifyRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/classify-system`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ prompt: finalPrompt }),
      });
      const classifyData = await classifyRes.json();
      let classificationResult = null;

      if (classifyData.status === 'success') {
        classificationResult = classifyData.classification;
        setClassification(classificationResult);
      }

      setIsClassifying(false);
      setIsClarifying(true);

      // Stage 2: Generate domain-adaptive questions
      const clarifyRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/clarify-architecture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ prompt: finalPrompt, classification: classificationResult }),
      });
      const clarifyData = await clarifyRes.json();

      if (clarifyData.status === 'success' && clarifyData.data.questions?.length > 0) {
        setQuestions(clarifyData.data.questions);
        // Also update classification if returned with questions
        if (clarifyData.data.classification) {
          setClassification(clarifyData.data.classification);
        }
        // Pre-fill answers
        const initial: Record<string, any> = {};
        clarifyData.data.questions.forEach((q: any) => {
          initial[q.id] = q.type === 'multi_select' ? [] : '';
        });
        setAnswers(initial);
      } else {
        // No questions → go straight to generation
        handleGenerateArchitecture(undefined, classificationResult);
      }
    } catch (e) {
      console.error('Pipeline start failed:', e);
      handleGenerateArchitecture();
    } finally {
      setIsClassifying(false);
      setIsClarifying(false);
    }
  };

  // ── Stage 3: Generate Architecture ─────────────────────────

  const handleGenerateArchitecture = async (
    finalPromptOverride?: string,
    classificationOverride?: any
  ) => {
    let basePrompt = finalPromptOverride || prompt;
    const finalPrompt = attachedContext 
      ? `${basePrompt}\n\n--- Context from ${attachedDocName} ---\n${attachedContext}\n-------------------------\n` 
      : basePrompt;
      
    if (!basePrompt.trim()) return;

    // Build structured answers dict for the API
    const structuredAnswers: Record<string, string> = {};
    if (questions.length > 0) {
      questions.forEach(q => {
        const ans = answers[q.id];
        const label = q.question;
        if (Array.isArray(ans)) {
          structuredAnswers[label] = ans.length > 0 ? ans.join(', ') : 'Not specified';
        } else {
          structuredAnswers[label] = ans || 'Not specified';
        }
      });
    }

    setIsGenerating(true);
    setStreamingMarkdown('');
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/suggest-architecture-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          prompt: finalPrompt,
          classification: classificationOverride || classification,
          answers: Object.keys(structuredAnswers).length > 0 ? structuredAnswers : null,
        }),
      });
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { detail: 'Unknown server error' };
        }
        if (response.status === 401 || response.status === 403) {
           throw new Error(errorData.detail || 'Authentication failed. Please sign out and sign back in.');
        }
        throw new Error(errorData.detail || 'Failed to connect to AI engine');
      }
      
      if (!response.body) throw new Error('No response body');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let fullMarkdown = '';
      
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          fullMarkdown += chunk;
          setStreamingMarkdown(fullMarkdown);
        }
      }
      
    } catch (error) {
      console.error('Architecture generation failed:', error);
      alert('Failed to connect to AI engine.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExtractGraph = async () => {
    if (!streamingMarkdown) return;
    setIsExtracting(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/extract-graph-json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ markdown_text: streamingMarkdown }),
      });
      const data = await response.json();

      if (data.status === 'success' && data.graph) {
        const rawModules = data.graph.modules || data.graph.module || [];
        const rawConnections = data.graph.connections || data.graph.connection || [];

        const newNodes = rawModules.map((mod: any, index: number) => {
          const moduleId = mod.id || `M${String(index + 1).padStart(3, '0')}`;
          return {
            id: moduleId,
            type: 'servo',
            position: { x: 250 + (index * 250), y: 200 + (index % 2 === 0 ? 0 : 150) },
            data: {
              moduleId,
              label: `${moduleId} ${mod.name}`,
              coreTask: mod.coreTask,
              dataShape: mod.dataShape,
              expectedOutput: mod.expectedOutput,
              rules: mod.rules,
              status: 'ready',
              language: mod.language || mod.platform || '',
              platform: mod.platform || '',
              dependencies: mod.dependencies || '',
              errorHandling: mod.errorHandling || '',
              testingRequirements: mod.testingRequirements || '',
            },
          };
        });

        const newEdges = (rawConnections || []).map((conn: any, index: number) => ({
          id: `e_${conn.from_node}-${conn.to_node}_${index}`,
          source: conn.from_node,
          target: conn.to_node,
          animated: true,
          style: { stroke: '#94a3b8', strokeWidth: 2, strokeDasharray: '5,5' },
        }));

        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
          newNodes,
          newEdges,
          'TB'
        );

        setGeneratedNodes(layoutedNodes);
        setGeneratedEdges(layoutedEdges);
        setAppState('canvas');
      }
    } catch (e) {
      console.error('Extraction failed:', e);
      alert('Failed to extract graph from markdown.');
    } finally {
      setIsExtracting(false);
    }
  };

  // ── Archetype badge rendering ──────────────────────────────

  const renderClassificationBadge = () => {
    if (!classification) return null;
    const archetype = classification.primary_archetype || 'crud_app';
    const meta = ARCHETYPE_META[archetype] || ARCHETYPE_META.crud_app;
    return (
      <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-top-2">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">{meta.icon}</span>
          <div>
            <span className={`inline-block px-3 py-1 text-xs font-black uppercase tracking-wider rounded-full border ${meta.color}`}>
              {meta.label}
            </span>
            {classification.secondary_archetype && (
              <span className="ml-2 inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 rounded-full border border-slate-200">
                + {(ARCHETYPE_META[classification.secondary_archetype] || { label: classification.secondary_archetype }).label}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div className="text-center p-2 bg-white rounded-lg border border-slate-100">
            <div className="text-[9px] uppercase font-bold tracking-widest text-slate-400">Domain</div>
            <div className="text-sm font-bold text-slate-700 capitalize">{classification.core_domain}</div>
          </div>
          <div className="text-center p-2 bg-white rounded-lg border border-slate-100">
            <div className="text-[9px] uppercase font-bold tracking-widest text-slate-400">Entity</div>
            <div className="text-sm font-bold text-slate-700 capitalize">{classification.primary_entity}</div>
          </div>
          <div className="text-center p-2 bg-white rounded-lg border border-slate-100">
            <div className="text-[9px] uppercase font-bold tracking-widest text-slate-400">Complexity</div>
            <div className="text-sm font-bold text-slate-700 capitalize">{classification.complexity_tier}</div>
          </div>
        </div>
        {classification.critical_path && (
          <div className="mt-2 text-xs text-slate-500 italic">
            <span className="font-bold text-slate-600">Critical path:</span> {classification.critical_path}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex w-full h-screen bg-white">
      {/* App Header */}
      <div className="fixed top-0 left-0 right-0 h-12 bg-slate-900 border-b border-slate-800 flex items-center px-4 z-50">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-500 rounded rotate-45 flex items-center justify-center">
            <div className="w-3 h-3 bg-white rounded-full"></div>
          </div>
          <span className="text-white font-black tracking-tighter text-lg uppercase">
            Ease<span className="text-blue-400">Pr</span>
          </span>
        </div>
        <div className="ml-auto flex items-center gap-4">
          {appState === 'canvas' && (
            <button
              onClick={handleSaveProject}
              disabled={isSaving}
              className="flex items-center gap-1.5 text-xs text-white transition-colors bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-md shadow disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Project
            </button>
          )}
          {user && (
            <span className="text-sm text-slate-300 font-medium">
              {user.email}
            </span>
          )}
          <button 
            onClick={() => logout()} 
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-md"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest border border-slate-700 px-2 py-0.5 rounded">
            v0.2.0-alpha
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex w-full h-full pt-12">
        {appState === 'home' ? (
          <div className="flex flex-col items-center justify-center w-full h-full bg-slate-50 p-8">
            <div className="max-w-2xl w-full bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
              <div className="flex border-b border-slate-200">
                <button
                  onClick={() => setActiveTab('ai')}
                  className={`flex-1 py-4 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'ai' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  <Brain className="w-4 h-4" />
                  AI Architect
                </button>
                <button
                  onClick={() => setActiveTab('blank')}
                  className={`flex-1 py-4 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'blank' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  <LayoutTemplate className="w-4 h-4" />
                  Blank Canvas
                </button>
                <button
                  onClick={() => setActiveTab('projects')}
                  className={`flex-1 py-4 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'projects' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  <FolderOpen className="w-4 h-4" />
                  My Projects
                </button>
              </div>

              <div className="p-8">
                {activeTab === 'ai' ? (
                  <>
                    <h1 className="text-2xl font-black text-slate-800 mb-1 uppercase tracking-tight">
                      Describe Your System
                    </h1>
                    <p className="text-slate-500 mb-4 text-sm">
                      The AI will classify your project, ask domain-specific questions, then reason through the architecture.
                    </p>

                    <div className="flex flex-wrap gap-2 mb-3">
                      {[
                        'E-commerce platform with payments & inventory',
                        'AI agent with tool use, memory, and sub-agents',
                        'Real-time collaborative code editor',
                        'IoT sensor data pipeline with alerting',
                        'Multi-tenant SaaS with role-based access',
                      ].map(example => (
                        <button
                          key={example}
                          onClick={() => { setPrompt(example); setClassification(null); setQuestions([]); }}
                          className="text-xs px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-full transition-colors font-medium"
                        >
                          {example}
                        </button>
                      ))}
                    </div>

                    <textarea
                      value={prompt}
                      onChange={(e) => { setPrompt(e.target.value); setClassification(null); setQuestions([]); }}
                      placeholder="Describe what you want to build in detail..."
                      className="w-full h-36 p-4 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:ring-0 resize-none mb-4 text-slate-700"
                    />

                    {/* Classification badge */}
                    {renderClassificationBadge()}

                    <div className="flex justify-between items-center">
                      <div>
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          className="hidden" 
                          onChange={handleFileUpload}
                          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.json,.html"
                        />
                        {attachedDocName ? (
                          <div className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                            <button
                              onClick={() => setShowDocModal(true)}
                              className="flex items-center gap-2 text-blue-700 hover:text-blue-800 text-sm font-medium transition-colors"
                              title="View Document Context"
                            >
                              <Paperclip className="w-4 h-4" />
                              <span className="truncate max-w-[150px]">{attachedDocName}</span>
                              <Eye className="w-4 h-4 ml-1 opacity-70" />
                            </button>
                            <div className="w-px h-4 bg-blue-200 mx-1"></div>
                            <button
                              onClick={() => {
                                setAttachedDocName('');
                                setAttachedContext('');
                              }}
                              className="p-1 text-blue-500 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                              title="Remove document"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="flex items-center gap-2 px-4 py-2 text-slate-600 bg-white border border-slate-300 rounded-lg font-medium hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Attach document context"
                          >
                            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                            {isUploading ? 'Parsing...' : 'Attach Doc'}
                          </button>
                        )}
                      </div>
                      
                      <button
                        onClick={handleStartPipeline}
                        disabled={isClassifying || isClarifying || isGenerating || !prompt.trim()}
                        className={`flex items-center gap-2 px-6 py-3 text-white rounded-lg font-bold shadow-lg transition-all ${
                          isClassifying || isClarifying || isGenerating || !prompt.trim()
                            ? 'bg-slate-300 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/25'
                        }`}
                      >
                        {isClassifying ? (
                          <><Loader2 className="w-5 h-5 animate-spin" /> Classifying System...</>
                        ) : isClarifying ? (
                          <><Loader2 className="w-5 h-5 animate-spin" /> Generating Questions...</>
                        ) : isGenerating ? (
                          <><Loader2 className="w-5 h-5 animate-spin" /> Reasoning...</>
                        ) : (
                          <><Zap className="w-5 h-5" /> Design Architecture</>
                        )}
                      </button>
                    </div>

                    {/* Document Context Modal */}
                    {showDocModal && (
                      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
                        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowDocModal(false)}></div>
                        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
                          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                              <Paperclip className="w-5 h-5 text-blue-600" />
                              {attachedDocName}
                            </h2>
                            <button onClick={() => setShowDocModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                          <div className="p-6 overflow-y-auto flex-grow prose prose-slate max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {attachedContext}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Clarification Modal */}
                    {questions.length > 0 && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"></div>

                        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                          {/* Modal header with classification badge */}
                          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex items-center justify-between">
                              <div>
                                <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                                  <Brain className="w-5 h-5 text-blue-600" />
                                  Architecture Interview
                                </h2>
                                <p className="text-sm text-slate-500 mt-1">
                                  Domain-specific questions to sharpen the architecture.
                                </p>
                              </div>
                              {classification && (
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">{(ARCHETYPE_META[classification.primary_archetype] || {}).icon}</span>
                                  <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-full border ${(ARCHETYPE_META[classification.primary_archetype] || ARCHETYPE_META.crud_app).color}`}>
                                    {(ARCHETYPE_META[classification.primary_archetype] || ARCHETYPE_META.crud_app).label}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="p-6 overflow-y-auto flex-grow space-y-6">
                            {questions.map((q) => (
                              <div key={q.id} className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm">
                                <label className="block text-base font-bold text-slate-800 mb-3">{q.question}</label>

                                {q.type === 'open_text' ? (
                                  <textarea
                                    value={answers[q.id] || ''}
                                    onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                    placeholder="Type your answer here..."
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none h-24"
                                  />
                                ) : q.type === 'multi_select' ? (
                                  <div className="flex flex-wrap gap-2">
                                    {(q.options || []).map((opt: string) => {
                                      const isSelected = (answers[q.id] || []).includes(opt);
                                      return (
                                        <button
                                          key={opt}
                                          onClick={() => {
                                            setAnswers(prev => {
                                              const current = prev[q.id] || [];
                                              return {
                                                ...prev,
                                                [q.id]: isSelected
                                                  ? current.filter((x: string) => x !== opt)
                                                  : [...current, opt],
                                              };
                                            });
                                          }}
                                          className={`px-4 py-2 text-sm rounded-lg transition-all border font-medium flex items-center gap-2 ${
                                            isSelected
                                              ? 'bg-blue-100 border-blue-400 text-blue-800 shadow-sm'
                                              : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                                          }`}
                                        >
                                          <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-400'}`}>
                                            {isSelected && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                          </div>
                                          {opt}
                                        </button>
                                      );
                                    })}
                                    <div className="flex items-center gap-2 w-full mt-2">
                                      <span className="text-sm text-slate-500 font-medium whitespace-nowrap">Other:</span>
                                      <input
                                        type="text"
                                        placeholder="Specify..."
                                        className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        onBlur={(e) => {
                                          if (e.target.value.trim()) {
                                            setAnswers(prev => {
                                              const current = prev[q.id] || [];
                                              if (!current.includes(e.target.value)) {
                                                return { ...prev, [q.id]: [...current, e.target.value] };
                                              }
                                              return prev;
                                            });
                                            e.target.value = '';
                                          }
                                        }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap gap-2">
                                    {(q.options || []).map((opt: string) => (
                                      <button
                                        key={opt}
                                        onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                                        className={`px-4 py-2 text-sm rounded-lg transition-all border font-medium ${
                                          answers[q.id] === opt
                                            ? 'bg-blue-100 border-blue-400 text-blue-800 shadow-sm'
                                            : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                                        }`}
                                      >
                                        {opt}
                                      </button>
                                    ))}
                                    <input
                                      type="text"
                                      placeholder="Other (specify)"
                                      className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                      value={!(q.options || []).includes(answers[q.id]) && answers[q.id] ? answers[q.id] : ''}
                                      onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                    />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
                            <button
                              onClick={() => {
                                setQuestions([]);
                                setAnswers({});
                              }}
                              disabled={isGenerating}
                              className="text-slate-500 hover:text-slate-800 font-medium text-sm transition-colors px-4 py-2 flex items-center gap-2"
                            >
                              <ArrowLeft className="w-4 h-4" /> Back
                            </button>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setAnswers({});
                                  setQuestions([]);
                                  handleGenerateArchitecture();
                                }}
                                disabled={isGenerating}
                                className="text-slate-500 hover:text-slate-800 font-medium text-sm transition-colors px-4 py-2"
                              >
                                Skip & Generate
                              </button>

                            <button
                              onClick={() => {
                                handleGenerateArchitecture();
                                setQuestions([]);
                              }}
                              disabled={isGenerating}
                              className={`flex items-center gap-2 px-8 py-3 text-white rounded-xl font-bold shadow-lg transition-all ${
                                isGenerating
                                  ? 'bg-slate-300 cursor-not-allowed'
                                  : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/25 hover:-translate-y-0.5'
                              }`}
                            >
                              {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Brain className="w-5 h-5" />}
                              {isGenerating ? 'Reasoning...' : 'Reason & Generate'}
                            </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Streaming Markdown Viewer */}
                    {streamingMarkdown && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"></div>
                        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
                          <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                              <Brain className="w-5 h-5 text-blue-600" />
                              AI Architecture reasoning...
                            </h2>
                            {isGenerating && (
                              <span className="flex items-center gap-2 text-sm text-blue-600 font-bold">
                                <Loader2 className="w-4 h-4 animate-spin" /> Generating...
                              </span>
                            )}
                          </div>
                          
                          <div className="p-8 overflow-y-auto flex-grow prose prose-slate max-w-none text-sm bg-white">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {streamingMarkdown}
                            </ReactMarkdown>
                          </div>
                          
                          <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
                            <button
                              onClick={handleExtractGraph}
                              disabled={isGenerating || isExtracting}
                              className={`flex items-center gap-2 px-8 py-3 text-white rounded-xl font-bold shadow-lg transition-all ${
                                isGenerating || isExtracting
                                  ? 'bg-slate-300 cursor-not-allowed'
                                  : 'bg-green-600 hover:bg-green-700 hover:shadow-green-500/25'
                              }`}
                            >
                              {isExtracting ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> Extracting to Canvas...</>
                              ) : (
                                <><CheckCircle2 className="w-5 h-5" /> Deploy to Canvas</>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : activeTab === 'blank' ? (
                  <>
                    <h1 className="text-2xl font-black text-slate-800 mb-2 uppercase tracking-tight">Manual Design</h1>
                    <p className="text-slate-500 mb-6 text-sm">Start from scratch by dragging modules onto the canvas.</p>
                    <div className="flex justify-center py-8">
                      <button
                        onClick={() => setAppState('canvas')}
                        className="flex items-center gap-2 px-8 py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold shadow-xl hover:shadow-2xl transition-all"
                      >
                        <LayoutTemplate className="w-5 h-5" />
                        Go to Canvas
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h1 className="text-2xl font-black text-slate-800 mb-2 uppercase tracking-tight">My Projects</h1>
                    <p className="text-slate-500 mb-6 text-sm">Load a previously saved project.</p>
                    {isLoadingProjects ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                      </div>
                    ) : projects.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">No projects found. Create one!</div>
                    ) : (
                      <div className="grid gap-4 max-h-[50vh] overflow-y-auto">
                        {projects.map((proj) => (
                          <div key={proj.id} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                            <div>
                              <h3 className="font-bold text-slate-800 text-lg">{proj.name}</h3>
                            </div>
                            <button
                              onClick={() => loadProject(proj)}
                              className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-sm rounded-md transition-colors"
                            >
                              Load Project
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col w-full h-full">
            {/* Tab Bar */}
            <div className="flex bg-slate-100 border-b border-slate-200 px-4 pt-2 gap-2">
              <button
                onClick={() => setActiveTabId('canvas')}
                className={`px-4 py-2 rounded-t-lg font-bold text-sm transition-colors ${activeTabId === 'canvas' ? 'bg-white text-blue-600 shadow-sm border-t border-x border-slate-200' : 'text-slate-500 hover:bg-slate-200'}`}
              >
                Canvas
              </button>
              {openedTabs.map((tabId: string) => {
                const node = generatedNodes.find(n => n.id === tabId);
                const title = node ? node.data.moduleId : tabId;
                return (
                  <div key={tabId} className={`flex items-center rounded-t-lg border-t border-x transition-colors ${activeTabId === tabId ? 'bg-white text-blue-600 shadow-sm border-slate-200' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-200'}`}>
                    <button
                      onClick={() => setActiveTabId(tabId)}
                      className="px-4 py-2 font-bold text-sm"
                    >
                      {title}
                    </button>
                    <button
                      onClick={() => closeTab(tabId)}
                      className="px-2 py-2 hover:text-red-500 hover:bg-slate-100 rounded-tr-lg"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
            
            {/* Workspace Content */}
            <div className="flex flex-1 overflow-hidden">
              {activeTabId === 'canvas' ? (
                <>
                  <Sidebar />
                  <CanvasEditor
                    originalPrompt={prompt}
                    questions={questions}
                    answers={answers}
                    initialNodes={generatedNodes}
                    initialEdges={generatedEdges}
                    onNodesChange={setGeneratedNodes}
                    onEdgesChange={setGeneratedEdges}
                    onRegenerate={(p?: string) => handleGenerateArchitecture(p)}
                    onNewProject={() => {
                      setAppState('home');
                      setPrompt('');
                      setGeneratedNodes([]);
                      setGeneratedEdges([]);
                      setClassification(null);
                      setQuestions([]);
                      setAnswers({});
                      setStreamingMarkdown('');
                    }}
                  />
                </>
              ) : (
                <ModuleWorkspace
                  moduleData={generatedNodes.find(n => n.id === activeTabId)?.data || {}}
                  onUpdate={(id: string, data: any) => {
                    setGeneratedNodes(nodes => nodes.map(n => n.id === id || n.data.moduleId === id ? { ...n, data } : n));
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
