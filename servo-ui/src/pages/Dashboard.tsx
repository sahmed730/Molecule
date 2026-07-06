import { useState, useEffect, useRef } from 'react';
import { Zap, LogOut, ArrowLeft, CheckCircle2, Loader2, LayoutTemplate, Brain, FolderOpen, Paperclip, Eye, X, Save } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import dagre from 'dagre';
import Sidebar from '../components/Sidebar';
import CanvasEditor from '../components/CanvasEditor';
import ModuleWorkspace from '../components/ModuleWorkspace';
import { useAppStore } from '../store';
import { collection, addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

const API_BASE = 'https://ali7277-molecule-engine.hf.space';

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

const nodeWidth = 450;
const nodeHeight = 150;

const getLayoutedElements = (nodes: any[], edges: any[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    if (dagreGraph.hasNode(edge.source) && dagreGraph.hasNode(edge.target)) {
      dagreGraph.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    if (nodeWithPosition) {
      node.position = {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      };
    }
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
      
      const res = await fetch(`${API_BASE}/api/upload-context`, {
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
    } catch (e: any) {
      console.error(e);
      alert(`Failed to save project: ${e.message || 'Unknown error'}`);
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
      const classifyRes = await fetch(`${API_BASE}/api/classify-system`, {
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
      const clarifyRes = await fetch(`${API_BASE}/api/clarify-architecture`, {
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
      const response = await fetch(`${API_BASE}/api/suggest-architecture-stream`, {
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
      
      const setArchitectureReasoning = useAppStore.getState().setArchitectureReasoning;
      const thinkMatch = fullMarkdown.match(/<think>([\s\S]*?)<\/think>/);
      if (thinkMatch) {
        setArchitectureReasoning(thinkMatch[1].trim());
      } else {
        setArchitectureReasoning(null);
      }
      
    } catch (error) {
      console.error('Architecture generation failed:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to connect to AI engine.'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExtractGraph = async () => {
    if (!streamingMarkdown) return;
    setIsExtracting(true);
    try {
      const response = await fetch(`${API_BASE}/api/extract-graph-json`, {
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
    <div className="flex w-full h-screen bg-neutral-primary text-body overflow-hidden">
      {/* Top Header */}
      <header className="fixed top-6 left-1/2 -translate-x-1/2 w-full max-w-[1280px] h-16 bg-neutral-primary-soft/80 backdrop-blur-[16px] border border-default rounded-[12px] flex items-center justify-between px-6 z-50 shadow-md">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setAppState('home')}>
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center transform group-hover:scale-105 transition-transform shadow-glow">
            <div className="w-3 h-3 bg-white rounded-full" />
          </div>
          <span className="font-bold text-xl tracking-tight text-heading group-hover:text-white transition-colors">
            EASEPR
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          {appState === 'canvas' && (
            <button
              onClick={handleSaveProject}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-strong text-white rounded-[12px] font-medium shadow-xs active:scale-95 transition-all text-sm disabled:opacity-70 disabled:cursor-not-allowed border border-transparent focus:ring-4 focus:ring-brand-medium focus:outline-none"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Project
            </button>
          )}
          <span className="text-sm font-medium text-body bg-neutral-primary px-3 py-1.5 rounded-[12px] border border-default">
            {user?.email}
          </span>
          <button
            onClick={() => logout()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-body hover:text-fg-danger hover:bg-danger-soft rounded-[12px] transition-all active:scale-95"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
          <div className="px-3 py-1 bg-brand-softer border border-brand-soft rounded-full text-xs font-bold text-fg-brand tracking-wider">
            V0.2.0-ALPHA
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex w-full h-full pt-[104px]"> {/* 104px to account for top-6 + h-16 + spacing */}
        {appState === 'home' ? (
          <div className="flex-1 flex flex-col items-center justify-start p-8 relative overflow-y-auto">
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-brand-softer rounded-full blur-[120px] opacity-30 -z-10 pointer-events-none"></div>

            <div className="w-full max-w-[1280px] bg-neutral-primary-soft rounded-[12px] shadow-sm border border-default transition-all duration-300 mb-24">
              {/* Tabs */}
              <div className="flex border-b border-default bg-neutral-primary rounded-t-[12px] overflow-hidden">
                <button
                  onClick={() => setActiveTab('ai')}
                  className={`flex-1 py-5 font-bold text-sm tracking-wider flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'ai' ? 'bg-brand-softer text-fg-brand border-b-2 border-brand' : 'text-body-subtle hover:bg-neutral-secondary-medium'}`}
                >
                  <Brain className="w-4 h-4" />
                  AI Architect
                </button>
                <button
                  onClick={() => setActiveTab('blank')}
                  className={`flex-1 py-5 font-bold text-sm tracking-wider flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'blank' ? 'bg-brand-softer text-fg-brand border-b-2 border-brand' : 'text-body-subtle hover:bg-neutral-secondary-medium'}`}
                >
                  <LayoutTemplate className="w-4 h-4" />
                  Blank Canvas
                </button>
                <button
                  onClick={() => setActiveTab('projects')}
                  className={`flex-1 py-5 font-bold text-sm tracking-wider flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'projects' ? 'bg-brand-softer text-fg-brand border-b-2 border-brand' : 'text-body-subtle hover:bg-neutral-secondary-medium'}`}
                >
                  <FolderOpen className="w-4 h-4" />
                  My Projects
                </button>
              </div>

              <div className="p-8">
                {activeTab === 'ai' ? (
                  <>
                    <h1 className="text-2xl font-semibold text-heading mb-1 tracking-tight">
                      Describe Your System
                    </h1>
                    <p className="text-body-subtle mb-6 text-[13px]">
                      The AI will classify your project, ask domain-specific questions, then reason through the architecture.
                    </p>

                    <div className="flex flex-wrap gap-2 mb-4">
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
                          className="text-xs px-3 py-1.5 bg-neutral-primary hover:bg-neutral-secondary-medium text-body border border-default rounded-[12px] transition-all font-medium active:scale-95"
                        >
                          {example}
                        </button>
                      ))}
                    </div>

                    <textarea
                      value={prompt}
                      onChange={(e) => { setPrompt(e.target.value); setClassification(null); setQuestions([]); }}
                      placeholder="Describe what you want to build in detail..."
                      className="w-full h-40 p-5 bg-neutral-primary border border-default rounded-[12px] focus:border-brand-medium focus:ring-1 focus:ring-brand-medium outline-none resize-none mb-6 text-body transition-all placeholder:text-body-subtle shadow-xs"
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
                          <div className="flex items-center gap-1 px-3 py-1.5 bg-neutral-primary border border-default rounded-[12px]">
                            <button
                              onClick={() => setShowDocModal(true)}
                              className="flex items-center gap-2 text-fg-info hover:text-white text-[13px] font-medium transition-colors"
                              title="View Document Context"
                            >
                              <Paperclip className="w-4 h-4" />
                              <span className="truncate max-w-[150px]">{attachedDocName}</span>
                              <Eye className="w-4 h-4 ml-1 opacity-70" />
                            </button>
                            <div className="w-px h-4 bg-border-default mx-1"></div>
                            <button
                              onClick={() => {
                                setAttachedDocName('');
                                setAttachedContext('');
                              }}
                              className="p-1 text-fg-danger hover:text-white hover:bg-danger rounded transition-colors"
                              title="Remove document"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="flex items-center gap-2 px-4 py-[10px] text-body bg-neutral-primary border border-default rounded-[12px] font-medium hover:bg-neutral-secondary-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
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
                        className="px-6 py-[10px] bg-brand text-white rounded-[12px] font-medium hover:bg-brand-strong flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:scale-95"
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
                      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6" role="dialog">
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDocModal(false)}></div>
                        <div className="relative bg-neutral-primary border border-default rounded-[12px] shadow-xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
                          <div className="p-4 border-b border-default flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-heading flex items-center gap-2">
                              <Paperclip className="w-5 h-5 text-fg-brand" />
                              {attachedDocName}
                            </h2>
                            <button onClick={() => setShowDocModal(false)} className="p-1.5 text-body hover:bg-neutral-secondary-medium rounded-[12px] transition-colors">
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                          <div className="p-6 overflow-y-auto flex-grow prose prose-invert max-w-none prose-headings:text-heading prose-a:text-fg-brand prose-code:text-fg-brand prose-code:bg-neutral-primary-strong prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md text-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {attachedContext}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Clarification Modal */}
                    {questions.length > 0 && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog">
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

                        <div className="relative bg-neutral-primary border border-default rounded-[12px] shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                          {/* Modal header with classification badge */}
                          <div className="p-6 border-b border-default bg-neutral-primary-soft">
                            <div className="flex items-center justify-between">
                              <div>
                                <h2 className="text-xl font-semibold text-heading flex items-center gap-2 tracking-tight">
                                  <Brain className="w-5 h-5 text-fg-brand" />
                                  Architecture Interview
                                </h2>
                                <p className="text-sm text-body-subtle mt-1">
                                  Domain-specific questions to sharpen the architecture.
                                </p>
                              </div>
                              {classification && (
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">{(ARCHETYPE_META[classification.primary_archetype] || {}).icon}</span>
                                  <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border ${(ARCHETYPE_META[classification.primary_archetype] || ARCHETYPE_META.crud_app).color}`}>
                                    {(ARCHETYPE_META[classification.primary_archetype] || ARCHETYPE_META.crud_app).label}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="p-6 overflow-y-auto flex-grow space-y-6 bg-neutral-primary">
                            {questions.map((q) => (
                              <div key={q.id} className="bg-neutral-primary-soft p-5 rounded-[12px] border border-default shadow-xs">
                                <label className="block text-base font-semibold text-heading mb-3">{q.question}</label>

                                {q.type === 'open_text' ? (
                                  <textarea
                                    value={answers[q.id] || ''}
                                    onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                    placeholder="Type your answer here..."
                                    className="w-full p-4 bg-neutral-primary border border-default rounded-[12px] focus:ring-1 focus:ring-brand-medium focus:border-brand-medium resize-none h-24 text-body transition-all placeholder:text-body-subtle outline-none"
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
                                          className={`px-4 py-2 text-sm rounded-[12px] transition-all border font-medium flex items-center gap-2 ${
                                            isSelected
                                              ? 'bg-brand-softer border-brand text-fg-brand shadow-xs'
                                              : 'bg-neutral-primary border-default text-body hover:bg-neutral-secondary-medium'
                                          }`}
                                        >
                                          <div className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors ${isSelected ? 'bg-brand border-brand text-white' : 'border-neutral-primary-strong'}`}>
                                            {isSelected && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                          </div>
                                          {opt}
                                        </button>
                                      );
                                    })}
                                    <div className="flex items-center gap-2 w-full mt-2">
                                      <span className="text-sm text-body-subtle font-medium whitespace-nowrap">Other:</span>
                                      <input
                                        type="text"
                                        placeholder="Specify..."
                                        className="flex-1 px-4 py-2 text-sm bg-neutral-primary border border-default rounded-[12px] focus:ring-1 focus:ring-brand-medium focus:border-brand-medium text-body transition-all outline-none placeholder:text-body-subtle"
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
                                        className={`px-4 py-2 text-sm rounded-[12px] transition-all border font-medium ${
                                          answers[q.id] === opt
                                            ? 'bg-brand-softer border-brand text-fg-brand shadow-xs'
                                            : 'bg-neutral-primary border-default text-body hover:bg-neutral-secondary-medium'
                                        }`}
                                      >
                                        {opt}
                                      </button>
                                    ))}
                                    <input
                                      type="text"
                                      placeholder="Other (specify)"
                                      className="px-4 py-2 text-sm bg-neutral-primary border border-default rounded-[12px] focus:ring-1 focus:ring-brand-medium focus:border-brand-medium text-body transition-all outline-none placeholder:text-body-subtle"
                                      value={!(q.options || []).includes(answers[q.id]) && answers[q.id] ? answers[q.id] : ''}
                                      onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                    />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="p-6 border-t border-default bg-neutral-primary-soft flex justify-between items-center">
                            <button
                              onClick={() => {
                                setQuestions([]);
                                setAnswers({});
                              }}
                              disabled={isGenerating}
                              className="text-body-subtle hover:text-heading font-medium text-sm transition-colors px-4 py-2 flex items-center gap-2 active:scale-95 disabled:opacity-50"
                            >
                              <ArrowLeft className="w-4 h-4" /> Back
                            </button>

                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => {
                                  setAnswers({});
                                  setQuestions([]);
                                  handleGenerateArchitecture();
                                }}
                                disabled={isGenerating}
                                className="text-body-subtle hover:text-heading font-medium text-sm transition-colors px-4 py-2 active:scale-95 disabled:opacity-50"
                              >
                                Skip & Generate
                              </button>

                              <button
                                onClick={() => {
                                  handleGenerateArchitecture();
                                  setQuestions([]);
                                }}
                                disabled={isGenerating}
                                className={`flex items-center gap-2 px-6 py-[10px] text-white rounded-[12px] font-medium shadow-xs transition-all active:scale-95 ${
                                  isGenerating
                                    ? 'bg-neutral-primary-strong cursor-not-allowed opacity-50 shadow-none'
                                    : 'bg-brand hover:bg-brand-strong'
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
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog">
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
                        <div className="relative bg-neutral-primary border border-default rounded-[12px] shadow-xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
                          <div className="p-6 border-b border-default bg-neutral-primary-soft flex justify-between items-center">
                            <h2 className="text-xl font-semibold text-heading tracking-tight flex items-center gap-2">
                              <Brain className="w-5 h-5 text-fg-brand" />
                              AI Architecture reasoning...
                            </h2>
                            {isGenerating && (
                              <span className="flex items-center gap-2 text-sm text-fg-brand font-medium">
                                <Loader2 className="w-4 h-4 animate-spin" /> Generating...
                              </span>
                            )}
                          </div>
                          
                          <div className="p-8 overflow-y-auto flex-grow prose prose-invert max-w-none text-[13px] bg-neutral-primary prose-headings:text-heading prose-a:text-fg-brand prose-code:text-fg-brand">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {streamingMarkdown}
                            </ReactMarkdown>
                          </div>
                          
                          <div className="p-6 border-t border-default bg-neutral-primary-soft flex justify-end">
                            <button
                              onClick={handleExtractGraph}
                              disabled={isGenerating || isExtracting}
                              className={`flex items-center gap-2 px-8 py-[10px] text-white rounded-[12px] font-medium shadow-xs transition-all ${
                                isGenerating || isExtracting
                                  ? 'bg-neutral-primary-strong cursor-not-allowed text-body-subtle'
                                  : 'bg-fg-success hover:opacity-90'
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
                    <h1 className="text-2xl font-semibold text-heading mb-2 tracking-tight">Manual Design</h1>
                    <p className="text-body-subtle mb-6 text-[13px]">Start from scratch by dragging modules onto the canvas.</p>
                    <div className="flex justify-center py-8">
                      <button
                        onClick={() => setAppState('canvas')}
                        className="flex items-center gap-2 px-8 py-4 bg-brand hover:bg-brand-strong text-white rounded-[12px] font-medium shadow-xs transition-all"
                      >
                        <LayoutTemplate className="w-5 h-5" />
                        Go to Canvas
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h1 className="text-2xl font-semibold text-heading mb-2 tracking-tight">My Projects</h1>
                    <p className="text-body-subtle mb-6 text-[13px]">Load a previously saved project.</p>
                    {isLoadingProjects ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin text-fg-brand" />
                      </div>
                    ) : projects.length === 0 ? (
                      <div className="text-center py-8 text-body-subtle">No projects found. Create one!</div>
                    ) : (
                      <div className="grid gap-4 max-h-[50vh] overflow-y-auto pr-2">
                        {projects.map((proj) => (
                          <div key={proj.id} className="flex items-center justify-between p-4 bg-neutral-primary-soft border border-default rounded-[12px] shadow-xs hover:border-brand-soft transition-colors">
                            <div>
                              <h3 className="font-medium text-heading text-lg">{proj.name}</h3>
                            </div>
                            <button
                              onClick={() => loadProject(proj)}
                              className="px-4 py-2 bg-neutral-primary hover:bg-neutral-secondary-medium text-body border border-default font-medium text-[13px] rounded-[12px] transition-colors"
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
            <div className="flex bg-neutral-primary border-b border-default px-4 pt-2 gap-2 mt-6">
              <button
                onClick={() => setActiveTabId('canvas')}
                className={`px-4 py-2 rounded-t-[12px] font-medium text-[13px] transition-colors ${activeTabId === 'canvas' ? 'bg-neutral-primary-soft text-heading border-t border-x border-default' : 'text-body-subtle hover:bg-neutral-secondary-medium border-t border-x border-transparent'}`}
              >
                Canvas
              </button>
              {openedTabs.map((tabId: string) => {
                const node = generatedNodes.find(n => n.id === tabId);
                const title = node ? node.data.moduleId : tabId;
                return (
                  <div key={tabId} className={`flex items-center rounded-t-[12px] border-t border-x transition-colors ${activeTabId === tabId ? 'bg-neutral-primary-soft text-heading border-default' : 'bg-transparent text-body-subtle border-transparent hover:bg-neutral-secondary-medium'}`}>
                    <button
                      onClick={() => setActiveTabId(tabId)}
                      className="px-4 py-2 font-medium text-[13px]"
                    >
                      {title}
                    </button>
                    <button
                      onClick={() => closeTab(tabId)}
                      className="px-2 py-2 hover:text-fg-danger hover:bg-danger rounded-tr-[12px]"
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
                    onExtractGraph={handleExtractGraph}
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
