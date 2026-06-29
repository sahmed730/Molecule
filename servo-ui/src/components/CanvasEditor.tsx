import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, { 
  addEdge, 
  Background, 
  Controls, 
  Panel,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import type { 
  Connection, 
  ReactFlowInstance,
  NodeChange,
  EdgeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Plus, Copy, FileText, Check, Sparkles, Undo2, Trash2, GitMerge, Zap } from 'lucide-react';

import ServoNode from './ServoNode';
import dagre from 'dagre';
import { useAppStore } from '../store';

const nodeWidth = 250;
const nodeHeight = 150;

const getLayoutedElements = (nodes: any[], edges: any[], direction = 'TB') => {
  const isHorizontal = direction === 'LR';
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 100,
    ranksep: 150,
    edgesep: 40,
    marginx: 40,
    marginy: 40,
  });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(g);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    if (!nodeWithPosition) return node;
    const newNode = {
      ...node,
      targetPosition: isHorizontal ? 'left' : 'top',
      sourcePosition: isHorizontal ? 'right' : 'bottom',
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
    return newNode;
  });

  return { nodes: newNodes, edges };
};

const nodeTypes = {
  servo: ServoNode,
};

interface CanvasEditorProps {
  originalPrompt?: string;
  questions?: any[];
  answers?: Record<string, any>;
  initialNodes: any[];
  initialEdges: any[];
  onNodesChange: (nodes: any[]) => void;
  onEdgesChange: (edges: any[]) => void;
  onNewProject: () => void;
  onRegenerate: (prompt: string) => void;
}

const CanvasEditor: React.FC<CanvasEditorProps> = ({
  originalPrompt,
  questions,
  answers,
  initialNodes,
  initialEdges,
  onNodesChange,
  onEdgesChange,
  onNewProject,
  onRegenerate
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<any[]>(initialNodes);
  const [edges, setEdges] = useState<any[]>(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [promptTab, setPromptTab] = useState<'architecture' | 'claude' | 'standard'>('architecture');
  const [copied, setCopied] = useState(false);
  
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewData, setReviewData] = useState<any>(null);
  const [projectCapabilities, setProjectCapabilities] = useState<string[]>([]);
  
  const [expandPrompt, setExpandPrompt] = useState('');
  const [isClarifyingExpand, setIsClarifyingExpand] = useState(false);
  const [expandQuestions, setExpandQuestions] = useState<any[]>([]);
  const [expandAnswers, setExpandAnswers] = useState<Record<string, any>>({});
  const [showExpandChoice, setShowExpandChoice] = useState(false);

  const { openTab, isDarkMode } = useAppStore();

  const [pendingOptimize, setPendingOptimize] = useState<{delta: any, graph: any} | null>(null);

  // Undo history — stores up to 15 snapshots before AI mutations
  const [history, setHistory] = useState<{nodes: any[], edges: any[]}[]>([]);
  const pushSnapshot = useCallback(() => {
    setHistory(prev => [...prev.slice(-14), { nodes: [...nodes], edges: [...edges] }]);
  }, [nodes, edges]);
  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setHistory(h => h.slice(0, -1));
    setReviewData(null);
  };

  // Instruction input for Auto-Optimize
  const [optimizeInstruction, setOptimizeInstruction] = useState('');

  const handleApplyCapability = (capability: string) => {
    if (!projectCapabilities.includes(capability)) {
      setProjectCapabilities([...projectCapabilities, capability]);
    }
  };

  const handleMergeDuplicate = (dupId: string, origId: string) => {
    const newEdges = edges.map(e => {
        if (e.source === dupId) return { ...e, source: origId, id: `e_${origId}-${e.target}` };
        if (e.target === dupId) return { ...e, target: origId, id: `e_${e.source}-${origId}` };
        return e;
    });
    
    const filteredEdges = newEdges.filter(e => e.source !== e.target);
    const newNodes = nodes.filter(n => n.id !== dupId);
    
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        newNodes,
        filteredEdges,
        'TB'
    );
    
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    setReviewData(null);
  };

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges]);

  const onNodesChangeSync = useCallback(
    (changes: NodeChange[]) => {
      const nextNodes = applyNodeChanges(changes, nodes);
      setNodes(nextNodes);
      onNodesChange(nextNodes);
    },
    [nodes, onNodesChange]
  );

  const onEdgesChangeSync = useCallback(
    (changes: EdgeChange[]) => {
      const nextEdges = applyEdgeChanges(changes, edges);
      setEdges(nextEdges);
      onEdgesChange(nextEdges);
    },
    [edges, onEdgesChange]
  );

  // Called when user clicks "Apply Changes" in the diff preview
  const applyPendingOptimize = async () => {
    if (!pendingOptimize) return;
    const { graph } = pendingOptimize;
    pushSnapshot();
    if (graph.capabilities) setProjectCapabilities(graph.capabilities);

    const rawNewNodes = graph.modules.map((m: any) => {
      const existingNode = nodes.find((n: any) => n.id === m.id);
      return {
        id: m.id,
        type: 'servo',
        position: existingNode ? existingNode.position : { x: 0, y: 0 },
        data: {
          moduleId: m.id,
          label: existingNode ? existingNode.data.label : `${m.id} ${m.name || 'Module'}`,
          coreTask: m.coreTask || '',
          dataShape: m.dataShape || '',
          expectedOutput: m.expectedOutput || '',
          rules: m.rules || '',
          status: 'ready',
          language: m.language || m.platform || '',
          platform: m.platform || '',
          dependencies: m.dependencies || '',
          errorHandling: m.errorHandling || '',
          testingRequirements: m.testingRequirements || ''
        }
      };
    });
    const rawNewEdges = graph.connections.map((c: any, i: number) => ({
      id: `e_${c.from_node}-${c.to_node}_${i}`,
      source: c.from_node,
      target: c.to_node,
      animated: true,
      style: { stroke: '#64748b', strokeWidth: 2 }
    }));
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rawNewNodes, rawNewEdges, 'TB');
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    onNodesChange(layoutedNodes);
    onEdgesChange(layoutedEdges);
    setPendingOptimize(null);

    // Auto-review after applying
    try {
      const reviewResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/review-architecture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph_data: { nodes: layoutedNodes, edges: layoutedEdges } }),
      });
      const reviewJson = await reviewResponse.json();
      if (reviewJson.status === 'success') setReviewData(reviewJson.review);
    } catch (_) {}
  };

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdges = addEdge({ ...params, animated: true, style: { stroke: '#64748b', strokeWidth: 2 } }, edges);
      setEdges(newEdges);
      onEdgesChange(newEdges);
    },
    [edges, onEdgesChange]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current || !reactFlowInstance) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const rawData = event.dataTransfer.getData('application/reactflow');

      if (!rawData) return;

      const { type, data } = JSON.parse(rawData);

      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newNodeId = `servo_${Date.now()}`;
      
      const newNodes = [...nodes];
      const newEdges = [...edges];
      
      const nextIndex = nodes.length + 1;
      const moduleId = `M${String(nextIndex).padStart(3, '0')}`;
      
      const newModuleId = data.moduleId || moduleId;
      const newLabel = data.label === 'New Module' ? `${newModuleId} New Module` : data.label;
      
      const newNode = {
        id: newNodeId,
        type,
        position,
        data: { ...data, moduleId: newModuleId, label: newLabel },
      };
      
      newNodes.push(newNode);
      
      if (nodes.length > 0) {
        const lastNode = nodes[nodes.length - 1];
        newEdges.push({
          id: `e_${lastNode.id}-${newNodeId}`,
          source: lastNode.id,
          target: newNodeId,
          animated: true,
          style: { stroke: '#64748b', strokeWidth: 2 }
        });
      }
      
      setNodes(newNodes);
      setEdges(newEdges);
      onNodesChange(newNodes);
      onEdgesChange(newEdges);
    },
    [reactFlowInstance, nodes, edges, onNodesChange, onEdgesChange]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: any) => {
    openTab(node.id);
  }, [openTab]);

  const onPaneClick = useCallback(() => {
  }, []);

  const getMetrics = () => {
    const numModules = nodes.length;
    const estFiles = numModules * 3 + edges.length;
    const estApis = edges.length + numModules;
    const minHours = numModules * 8;
    const maxHours = numModules * 12;
    const estTime = `${minHours}-${maxHours} hours`;
    const complexity = numModules < 4 ? 'Beginner' : numModules < 9 ? 'Intermediate' : 'Advanced';
    
    let totalFields = 0;
    let filledFields = 0;
    nodes.forEach(node => {
      const data = node.data || {};
      const fields = ['coreTask', 'dataShape', 'expectedOutput', 'dependencies', 'errorHandling', 'testingRequirements'];
      fields.forEach(f => {
        totalFields++;
        if (data[f] && data[f].trim() !== '') filledFields++;
      });
    });
    const promptCompleteness = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

    return { numModules, estFiles, estApis, estTime, complexity, promptCompleteness };
  };  const formatQAContent = () => {
    if (!questions || !answers || questions.length === 0) return '';
    let qaText = '';
    questions.forEach(q => {
      const ans = answers[q.id];
      if (ans && (Array.isArray(ans) ? ans.length > 0 : true)) {
        qaText += `Q: ${q.question}\nA: ${Array.isArray(ans) ? ans.join(', ') : ans}\n\n`;
      }
    });
    return qaText.trim();
  };

  const generateArchitectureOverview = () => {
    let text = `# Architecture Overview\n\n`;
    if (originalPrompt) {
      text += `## Original Project Goal\n> ${originalPrompt}\n\n`;
    }
    const qaText = formatQAContent();
    if (qaText) {
      text += `## Additional Context (Q&A)\n${qaText}\n\n`;
    }
    text += `We are building a data processing pipeline consisting of ${nodes.length} interconnected modules.\n\n`;
    
    const metrics = getMetrics();
    text += `## Complexity Metrics\n`;
    text += `- **Modules**: ${metrics.numModules}\n`;
    text += `- **Estimated Files**: ${metrics.estFiles}\n`;
    text += `- **Estimated APIs**: ${metrics.estApis}\n`;
    text += `- **Estimated Dev Time**: ${metrics.estTime}\n`;
    text += `- **Complexity**: ${metrics.complexity}\n`;
    text += `- **Prompt Completeness**: ${metrics.promptCompleteness}%\n\n`;

    text += `## Project File Tree\n`;
    text += `project/\n`;
    text += `└── modules/\n`;
    nodes.forEach(n => {
       const fileName = (n.data.label || 'unnamed').toLowerCase().replace(/\s+/g, '_');
       text += `    ├── ${fileName}/\n`;
       const ext = (n.data.language || '').toLowerCase().includes('node') || (n.data.language || '').toLowerCase().includes('js') ? 'js' : 'py';
       text += `    │   ├── implementation.${ext}\n`;
       text += `    │   └── metadata.json\n`;
    });
    text += `└── tests/\n\n`;

    return text;
  };

  const generateStandardPrompt = () => {
    let text = `# EasePr Standard Implementation Contract\n\n`;
    if (originalPrompt) {
      text += `## Original Project Goal\n> ${originalPrompt}\n\n`;
    }
    const qaText = formatQAContent();
    if (qaText) {
      text += `## Additional Context (Q&A)\n${qaText}\n\n`;
    }
    text += `Please act as a senior software developer. Follow this contract to build the modules.\n\n`;
    
    nodes.forEach(node => {
      text += `### ${node.data.label || 'Unnamed Module'}\n\n`;
      text += `**Platform**: ${node.data.platform || node.data.language || 'Unknown'}\n\n`;
      
      const fileName = (node.data.label || 'unnamed').toLowerCase().replace(/\s+/g, '_');
      const ext = (node.data.language || '').toLowerCase().includes('node') || (node.data.language || '').toLowerCase().includes('js') ? 'js' : 'py';
      text += `**File**: modules/${fileName}/implementation.${ext}\n\n`;

      text += `**Dependencies**: ${node.data.dependencies || 'None'}\n\n`;
      text += `**Core Task**: ${node.data.coreTask || 'Not specified'}\n\n`;
      text += `**Data Shape (Input)**: ${node.data.dataShape || 'Not specified'}\n\n`;
      text += `**Expected Output**: ${node.data.expectedOutput || 'Not specified'}\n\n`;
      text += `**Error Handling**: ${node.data.errorHandling || 'None'}\n\n`;
      text += `**Unit Tests**: ${node.data.testingRequirements || 'None'}\n\n`;

      const incomingEdges = edges.filter(e => e.target === node.id);
      if (incomingEdges.length > 0) {
        text += `**Data Contracts**:\n`;
        incomingEdges.forEach(e => {
          const srcNode = nodes.find(n => n.id === e.source);
          if (srcNode) {
            text += `- Input from **${srcNode.data.label}**:\n`;
            text += `  Source Output: ${srcNode.data.expectedOutput || 'Not specified'}\n`;
          }
        });
        text += `\n`;
      }
      text += `---\n\n`;
    });
    return text;
  };

  const generateClaudePrompt = () => {
    let text = `<system>\nYou are an expert developer utilizing Test-Driven Development (TDD). Your job is to generate strict implementations for the provided architectural modules.\n`;
    text += `Output only fully complete, production-ready code. Do not output markdown codeblocks around the entire response. Wrap each file in XML tags.\n</system>\n\n`;
    
    if (originalPrompt) {
      text += `<project_goal>\n${originalPrompt}\n</project_goal>\n\n`;
    }
    const qaText = formatQAContent();
    if (qaText) {
      text += `<additional_context>\n${qaText}\n</additional_context>\n\n`;
    }

    text += `<modules>\n`;
    nodes.forEach(node => {
      const fileName = (node.data.label || 'unnamed').toLowerCase().replace(/\s+/g, '_');
      const ext = (node.data.language || '').toLowerCase().includes('node') || (node.data.language || '').toLowerCase().includes('js') ? 'js' : 'py';
      text += `  <module>\n`;
      text += `    <name>${node.data.label}</name>\n`;
      text += `    <platform>${node.data.platform || node.data.language || 'Unknown'}</platform>\n`;
      text += `    <file>modules/${fileName}/implementation.${ext}</file>\n`;
      text += `    <dependencies>${node.data.dependencies || 'None'}</dependencies>\n`;
      text += `    <task>${node.data.coreTask || 'None'}</task>\n`;
      text += `    <inputs>${node.data.dataShape || 'None'}</inputs>\n`;
      text += `    <outputs>${node.data.expectedOutput || 'None'}</outputs>\n`;
      text += `    <errors>${node.data.errorHandling || 'None'}</errors>\n`;
      text += `    <tests>${node.data.testingRequirements || 'None'}</tests>\n`;
      text += `  </module>\n`;
    });
    text += `</modules>\n`;
    return text;
  };

  const getCurrentPrompt = () => {
    if (promptTab === 'architecture') return generateArchitectureOverview();
    if (promptTab === 'claude') return generateClaudePrompt();
    return generateStandardPrompt();
  };

  const copyToClipboard = () => {
    const text = getCurrentPrompt();
    if (text) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };



  // OPTIMIZE: calls /api/auto-improve-architecture, shows diff preview before applying
  const handleAutoImprove = async (instruction?: string) => {
    if (reviewData && reviewData.score >= 90) {
        alert("Architecture is already highly optimized (Score 90+). No improvements needed.");
        return;
    }
    setIsReviewing(true);
    setReviewData(null);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/auto-improve-architecture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph_data: { nodes, edges, projectCapabilities }, instruction: instruction || null }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        // Show diff preview — don't apply yet
        setPendingOptimize({ delta: data.graph.delta, graph: data.graph });
      } else {
        alert('Failed to auto-optimize');
      }
    } catch (e) {
      console.error(e);
      alert('Error during architecture optimization');
    } finally {
      setIsReviewing(false);
    }
  };

  // EXPAND: calls /api/expand-architecture to add a single missing module
  const handleExpandModule = async (moduleName: string, reason: string) => {
    setIsReviewing(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/expand-architecture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph_data: { nodes, edges }, module_name: moduleName, reason }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        pushSnapshot();
        const { new_module: nm, new_connections: newConns } = data.result;
        
        let maxIndex = nodes.length;
        for (const n of nodes) {
           const match = n.id.match(/^M(\d+)$/);
           if (match) {
               const num = parseInt(match[1], 10);
               if (num > maxIndex) maxIndex = num;
           }
        }
        
        const moduleId = nm.id || `M${String(maxIndex + 1).padStart(3, '0')}`;
        const newNode = {
          id: moduleId,
          type: 'servo',
          position: { x: 0, y: 0 },
          data: {
            moduleId,
            label: `${moduleId} ${nm.name}`,
            coreTask: nm.coreTask || '',
            dataShape: nm.dataShape || '',
            expectedOutput: nm.expectedOutput || '',
            rules: nm.rules || '',
            status: 'ready',
            language: nm.language || nm.platform || '',
            platform: nm.platform || '',
            dependencies: nm.dependencies || '',
            errorHandling: nm.errorHandling || '',
            testingRequirements: nm.testingRequirements || ''
          }
        };
        const addedEdges = newConns.map((c: any, i: number) => ({
          id: `e_${c.from_node}-${c.to_node}_expand_${i}_${Date.now()}`,
          source: c.from_node,
          target: c.to_node,
          animated: true,
          style: { stroke: '#8b5cf6', strokeWidth: 2 }
        }));
        
        const allNodes = [...nodes, newNode];
        const allEdges = [...edges, ...addedEdges];
        
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(allNodes, allEdges, 'TB');
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        onNodesChange(layoutedNodes);
        onEdgesChange(layoutedEdges);
        
        const reviewResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/review-architecture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ graph_data: { nodes: layoutedNodes, edges: layoutedEdges } }),
        });
        const reviewData = await reviewResponse.json();
        if (reviewData.status === 'success') setReviewData(reviewData.review);
      } else {
        alert('Failed to expand architecture');
      }
    } catch (e) {
      console.error(e);
      alert('Error adding module');
    } finally {
      setIsReviewing(false);
    }
  };

  // BATCH EXPAND: calls /api/batch-expand-architecture to add all critical modules at once
  const handleBatchExpandModules = async () => {
    if (!reviewData || !reviewData.critical || reviewData.critical.length === 0) return;
    setIsReviewing(true);
    const modulesToAdd = reviewData.critical.map((m: any) => ({
        name: m.name || m,
        reason: m.reason || 'Critical missing logic'
    }));

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/batch-expand-architecture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph_data: { nodes, edges }, modules: modulesToAdd }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        pushSnapshot();
        const { new_modules, new_connections } = data.result;
        
        let maxIndex = nodes.length;
        for (const n of nodes) {
           const match = n.id.match(/^M(\d+)$/);
           if (match) {
               const num = parseInt(match[1], 10);
               if (num > maxIndex) maxIndex = num;
           }
        }
        
        const addedNodes = new_modules.map((nm: any, idx: number) => {
            const moduleId = nm.id || `M${String(maxIndex + 1 + idx).padStart(3, '0')}`;
            return {
              id: moduleId,
              type: 'servo',
              position: { x: 0, y: 0 },
              data: {
                moduleId,
                label: `${moduleId} ${nm.name}`,
                coreTask: nm.coreTask || '',
                dataShape: nm.dataShape || '',
                expectedOutput: nm.expectedOutput || '',
                rules: nm.rules || '',
                status: 'ready',
                language: nm.language || nm.platform || '',
                platform: nm.platform || '',
                dependencies: nm.dependencies || '',
                errorHandling: nm.errorHandling || '',
                testingRequirements: nm.testingRequirements || ''
              }
            };
        });

        const addedEdges = new_connections.map((c: any, i: number) => ({
          id: `e_${c.from_node}-${c.to_node}_batchexpand_${i}_${Date.now()}`,
          source: c.from_node,
          target: c.to_node,
          animated: true,
          style: { stroke: '#8b5cf6', strokeWidth: 2 }
        }));
        
        const allNodes = [...nodes, ...addedNodes];
        const allEdges = [...edges, ...addedEdges];
        
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(allNodes, allEdges, 'TB');
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        onNodesChange(layoutedNodes);
        onEdgesChange(layoutedEdges);
        
        // Refresh review instead of closing
        const reviewResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/review-architecture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ graph_data: { nodes: layoutedNodes, edges: layoutedEdges } }),
        });
        const reviewDataNew = await reviewResponse.json();
        if (reviewDataNew.status === 'success') setReviewData(reviewDataNew.review);
      } else {
        alert('Failed to batch expand architecture');
      }
    } catch (e) {
      console.error(e);
      alert('Error expanding modules');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleStartExpandClarification = async () => {
    if (!expandPrompt.trim()) return;

    setIsClarifyingExpand(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/clarify-architecture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: expandPrompt }),
      });
      const data = await response.json();

      if (data.status === 'success' && data.data.questions && data.data.questions.length > 0) {
        setExpandQuestions(data.data.questions);
        const initialAnswers: Record<string, any> = {};
        data.data.questions.forEach((q: any) => {
          if (q.type === 'multi_select') initialAnswers[q.id] = [];
          else initialAnswers[q.id] = '';
        });
        setExpandAnswers(initialAnswers);
      } else {
        // Skip clarification if none returned
        setShowExpandChoice(true);
      }
    } catch (e) {
      console.error(e);
      setShowExpandChoice(true);
    } finally {
      setIsClarifyingExpand(false);
    }
  };

  const finalizeExpandChoice = async (choice: 'append' | 'regenerate') => {
    let finalPrompt = expandPrompt;
    if (expandQuestions.length > 0) {
        const answersText = expandQuestions.map(q => {
          let ansStr = '';
          const ans = expandAnswers[q.id];
          if (Array.isArray(ans)) {
            ansStr = ans.length > 0 ? ans.join(', ') : 'None specified';
          } else {
            ansStr = ans || 'Not specified';
          }
          return `Q: ${q.question}\nA: ${ansStr}`;
        }).join('\n\n');
        finalPrompt = `${expandPrompt}\n\nAdditional Requirements:\n${answersText}`;
    }

    setExpandQuestions([]);
    setShowExpandChoice(false);
    setExpandPrompt('');

    if (choice === 'regenerate') {
       onRegenerate(finalPrompt);
    } else {
       // Append flow - use batch expand trick
       setIsReviewing(true);
       try {
         const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/batch-expand-architecture`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ 
             graph_data: { nodes, edges }, 
             modules: [{ name: "User Custom Expansion", reason: finalPrompt }] 
           }),
         });
         const data = await response.json();
         if (data.status === 'success') {
           pushSnapshot();
           const { new_modules, new_connections } = data.result;
           
           let maxIndex = nodes.length;
           for (const n of nodes) {
              const match = n.id.match(/^M(\d+)$/);
              if (match) {
                  const num = parseInt(match[1], 10);
                  if (num > maxIndex) maxIndex = num;
              }
           }

           const newNodes = new_modules.map((nm: any, idx: number) => {
               const moduleId = nm.id || `M${String(maxIndex + 1 + idx).padStart(3, '0')}`;
               return {
                   id: moduleId,
                   type: 'servo',
                   position: { x: 0, y: 0 },
                   data: {
                       moduleId,
                       label: `${moduleId} ${nm.name}`,
                       coreTask: nm.coreTask || '',
                       dataShape: nm.dataShape || '',
                       expectedOutput: nm.expectedOutput || '',
                       rules: nm.rules || '',
                       status: 'ready',
                       language: nm.language || nm.platform || '',
                       platform: nm.platform || '',
                       dependencies: nm.dependencies || '',
                       errorHandling: nm.errorHandling || '',
                       testingRequirements: nm.testingRequirements || ''
                   }
               };
           });

           const allNodes = [...nodes, ...newNodes];
           const newEdges = new_connections.map((c: any, i: number) => ({
             id: `e_${c.from_node}-${c.to_node}_expand_${i}_${Date.now()}`,
             source: c.from_node,
             target: c.to_node,
             animated: true,
             style: { stroke: '#8b5cf6', strokeWidth: 2 }
           }));
           const allEdges = [...edges, ...newEdges];

           const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(allNodes, allEdges, 'TB');
           setNodes(layoutedNodes);
           setEdges(layoutedEdges);
           onNodesChange(layoutedNodes);
           onEdgesChange(layoutedEdges);

           const reviewResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/review-architecture`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ graph_data: { nodes: layoutedNodes, edges: layoutedEdges } }),
           });
           const reviewData = await reviewResponse.json();
           if (reviewData.status === 'success') setReviewData(reviewData.review);
         }
       } catch (e) {
         console.error(e);
       } finally {
         setIsReviewing(false);
       }
    }
  };

  const metrics = getMetrics();

  return (
    <div className="flex-grow h-full relative" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChangeSync}
        onEdgesChange={onEdgesChangeSync}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background color={isDarkMode ? "#334155" : "#cbd5e1"} gap={20} />
        <Controls className={isDarkMode ? 'dark-controls' : ''} />
        
        <Panel position="top-left" className="flex flex-col gap-2 p-2">
          {projectCapabilities.length > 0 && (
            <div className="flex gap-2 flex-wrap max-w-2xl bg-white/50 backdrop-blur-sm p-2 rounded-xl">
              {projectCapabilities.map(cap => (
                 <div key={cap} className="px-3 py-1.5 bg-gradient-to-r from-purple-100 to-blue-100 text-purple-800 text-xs font-bold uppercase tracking-wider rounded-md shadow-sm border border-purple-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> {cap}
                 </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel position="top-right" className="flex gap-2 items-center">
          {history.length > 0 && (
            <button
              onClick={handleUndo}
              title="Undo last AI action"
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-300 text-amber-700 rounded-md shadow-sm text-sm font-bold hover:bg-amber-100 transition-colors"
            >
              <Undo2 className="w-4 h-4" />
              Undo
            </button>
          )}

          <button 
            onClick={onNewProject}
            className="flex items-center gap-2 px-4 py-2 bg-slate-500 text-white rounded-md shadow-lg text-sm font-bold hover:bg-slate-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
          


          <button 
            onClick={() => setIsModalOpen(true)}
            disabled={nodes.length === 0}
            className={`flex items-center gap-2 px-4 py-2 text-white rounded-md shadow-lg text-sm font-bold transition-colors ${nodes.length === 0 ? 'bg-slate-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
          >
            <FileText className="w-4 h-4" />
            Generate Mega Prompt
          </button>
        </Panel>
      </ReactFlow>

      {/* Mega Prompt Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50 rounded-t-xl">
              <h2 className="text-lg font-black tracking-tight text-slate-800 uppercase flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                Software Architecture Workbench
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold px-3 py-1 bg-white border border-slate-200 rounded shadow-sm"
              >
                Close
              </button>
            </div>
            
            {/* Dashboard */}
            <div className="grid grid-cols-6 divide-x divide-slate-100 border-b border-slate-100 bg-white">
              <div className="p-4 text-center">
                <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Modules</div>
                <div className="text-2xl font-black text-slate-800">{metrics.numModules}</div>
              </div>
              <div className="p-4 text-center">
                <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Est. Files</div>
                <div className="text-2xl font-black text-blue-600">{metrics.estFiles}</div>
              </div>
              <div className="p-4 text-center">
                <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400">APIs / Edges</div>
                <div className="text-2xl font-black text-slate-800">{metrics.estApis}</div>
              </div>
              <div className="p-4 text-center">
                <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Dev Time</div>
                <div className="text-xl font-black text-emerald-600 pt-1">{metrics.estTime}</div>
              </div>
              <div className="p-4 text-center">
                <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Complexity</div>
                <div className="text-xl font-black text-purple-600 pt-1">{metrics.complexity}</div>
              </div>
              <div className="p-4 text-center bg-blue-50">
                <div className="text-[10px] uppercase font-bold tracking-widest text-blue-600">Completeness</div>
                <div className="text-2xl font-black text-blue-600 pt-1">{metrics.promptCompleteness}%</div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-slate-50 border-b border-slate-200">
              <button 
                onClick={() => setPromptTab('architecture')}
                className={`px-6 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${promptTab === 'architecture' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                1. Architecture Overview
              </button>
              <button 
                onClick={() => setPromptTab('standard')}
                className={`px-6 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${promptTab === 'standard' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                2. Module Contracts
              </button>
              <button 
                onClick={() => setPromptTab('claude')}
                className={`px-6 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${promptTab === 'claude' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                3. Claude / Cursor Prompt
              </button>
            </div>
            
            <div className="p-4 bg-slate-50 overflow-y-auto flex-grow relative">
              <pre className="text-sm font-mono text-slate-700 whitespace-pre-wrap p-4 bg-white rounded-lg border border-slate-200 shadow-inner">
                {getCurrentPrompt()}
              </pre>
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-white rounded-b-xl flex justify-end">
              <button 
                onClick={copyToClipboard}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold shadow-lg transition-colors text-white ${copied ? 'bg-green-500' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                {copied ? 'Copied to Clipboard!' : `Copy ${promptTab.charAt(0).toUpperCase() + promptTab.slice(1)} Prompt`}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Review Modal */}
      {reviewData && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-gradient-to-r from-purple-600 to-blue-600 rounded-t-xl">
              <h2 className="text-lg font-black tracking-tight text-white uppercase flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-200" />
                AI Architecture Review
              </h2>
              <button 
                onClick={() => setReviewData(null)}
                className="text-white hover:text-slate-200 font-bold px-3 py-1 bg-white/10 rounded shadow-sm"
              >
                Close
              </button>
            </div>

            <div className="p-6 bg-slate-50 overflow-y-auto flex-grow flex flex-col gap-6">
              <div className="flex items-center justify-between bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div>
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Health Score</h3>
                  <div className={`text-5xl font-black ${reviewData.score >= 90 ? 'text-green-600' : reviewData.score > 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {reviewData.score}<span className="text-2xl text-slate-400">/100</span>
                  </div>
                  {reviewData.complexityPenalty > 0 && (
                    <div className="mt-2 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded inline-block">
                      Complexity Penalty: -{reviewData.complexityPenalty}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">Architecture Maturity</div>
                  <div className={`font-black uppercase tracking-tight text-xl ${reviewData.score >= 90 ? 'text-green-600' : 'text-yellow-600'}`}>
                    {reviewData.architectureMaturity || (reviewData.score >= 90 ? 'Production Ready' : 'Draft')}
                  </div>
                </div>
              </div>

              {reviewData.missingCapabilities && reviewData.missingCapabilities.length > 0 && (
                <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded-r-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-purple-800 font-bold uppercase text-sm tracking-wider">Missing Platform Capabilities</h3>
                  </div>
                  <div className="space-y-3">
                    {reviewData.missingCapabilities.filter((c: string) => !projectCapabilities.includes(c)).map((cap: string, i: number) => (
                      <div key={i} className="flex items-center justify-between bg-white p-3 rounded-lg border border-purple-100 shadow-sm">
                        <div className="font-bold text-purple-700 flex items-center gap-2">
                           <Sparkles className="w-4 h-4" /> {cap}
                        </div>
                        <button 
                          onClick={() => handleApplyCapability(cap)}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded shadow transition-colors"
                        >
                          Apply Capability
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {reviewData.duplicates && reviewData.duplicates.length > 0 && (
                <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-orange-800 font-bold uppercase text-sm tracking-wider">Architecture Duplicates Found</h3>
                  </div>
                  <div className="space-y-3">
                    {reviewData.duplicates.map((dup: any, i: number) => (
                      <div key={i} className="flex items-center justify-between bg-white p-3 rounded-lg border border-orange-200 shadow-sm">
                        <div>
                          <div className="font-bold text-orange-700">{dup.name || dup.id} <span className="text-orange-400 font-normal ml-1">duplicates {dup.duplicatesId}</span></div>
                          {dup.reason && <div className="text-xs text-orange-600/80 mt-1">{dup.reason}</div>}
                        </div>
                        <button 
                          onClick={() => handleMergeDuplicate(dup.id, dup.duplicatesId)}
                          className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded shadow transition-colors"
                        >
                          Merge Duplicate
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-4 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-center">
                <div className="flex flex-col text-left">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-400 text-[10px] font-bold uppercase">Modularity</span>
                    <span className="font-bold text-slate-700 text-sm">{reviewData.modularity || 0}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${reviewData.modularity || 0}%` }} />
                  </div>
                </div>
                <div className="flex flex-col text-left">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-400 text-[10px] font-bold uppercase">Scalability</span>
                    <span className="font-bold text-slate-700 text-sm">{reviewData.scalability || 0}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${reviewData.scalability || 0}%` }} />
                  </div>
                </div>
                <div className="flex flex-col text-left">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-400 text-[10px] font-bold uppercase">Security</span>
                    <span className="font-bold text-slate-700 text-sm">{reviewData.security || 0}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${reviewData.security || 0}%` }} />
                  </div>
                </div>
                <div className="flex flex-col text-left">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-400 text-[10px] font-bold uppercase">Maintain</span>
                    <span className="font-bold text-slate-700 text-sm">{reviewData.maintainability || 0}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${reviewData.maintainability || 0}%` }} />
                  </div>
                </div>
              </div>

              {reviewData.critical && reviewData.critical.length > 0 && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-red-800 font-bold uppercase text-sm tracking-wider">Critical Missing Components</h3>
                    <button 
                      onClick={handleBatchExpandModules}
                      disabled={isReviewing}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded shadow transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {isReviewing ? 'Generating...' : 'Generate All Critical'}
                    </button>
                  </div>
                  <div className="space-y-3">
                    {reviewData.critical.map((m: any, i: number) => (
                      <div key={i} className="flex items-center justify-between bg-white p-3 rounded-lg border border-red-100 shadow-sm">
                        <div>
                          <div className="font-bold text-red-700">{m.name || m}</div>
                          {m.reason && <div className="text-xs text-red-600/80 mt-1">{m.reason}</div>}
                          {m.improvementScore && <div className="text-[10px] font-mono bg-red-100 text-red-800 inline-block px-1.5 py-0.5 rounded mt-1">+{m.improvementScore} Score</div>}
                        </div>
                        <button 
                          onClick={() => handleExpandModule(m.name || m, m.reason || 'Missing critical business logic component')}
                          disabled={isReviewing}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded shadow transition-colors disabled:opacity-50"
                        >
                          {isReviewing ? 'Adding...' : 'Generate Module'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {reviewData.risks && reviewData.risks.length > 0 && (
                <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-xl">
                  <h3 className="text-yellow-800 font-bold uppercase text-sm tracking-wider mb-2">Architecture Risks</h3>
                  <ul className="list-disc pl-5 text-yellow-700 text-sm space-y-1">
                    {reviewData.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}

              {reviewData.recommended && reviewData.recommended.length > 0 && (
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-xl">
                  <h3 className="text-blue-800 font-bold uppercase text-sm tracking-wider mb-4">Recommended Enhancements</h3>
                  <div className="space-y-2">
                    {reviewData.recommended.map((s: any, i: number) => (
                      <div key={i} className="flex items-start justify-between bg-white p-3 rounded-lg border border-blue-100 shadow-sm">
                        <div>
                          <div className="font-bold text-blue-700 flex items-center gap-2">
                            <Check className="w-4 h-4 text-blue-500" />
                            {s.name || s.title || s}
                          </div>
                          {s.reason && <div className="text-xs text-blue-600/80 mt-1 ml-6">{s.reason}</div>}
                        </div>
                        {s.improvementScore && <div className="text-[10px] font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded">+{s.improvementScore} Score</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {reviewData.optional && reviewData.optional.length > 0 && (
                <div className="bg-slate-50 border-l-4 border-slate-300 p-4 rounded-r-xl">
                  <h3 className="text-slate-600 font-bold uppercase text-sm tracking-wider mb-4">Optional Optimizations</h3>
                  <div className="space-y-2">
                    {reviewData.optional.map((s: any, i: number) => (
                      <div key={i} className="flex items-start justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-sm opacity-80">
                        <div>
                          <div className="font-bold text-slate-700 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full ml-1 mr-2" />
                            {s.name || s.title || s}
                          </div>
                          {s.reason && <div className="text-xs text-slate-500 mt-1 ml-6">{s.reason}</div>}
                        </div>
                        {s.improvementScore && <div className="text-[10px] font-mono bg-slate-100 text-slate-500 px-2 py-1 rounded">+{s.improvementScore} Score</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 mt-2 pb-4">
                {reviewData.score >= 90 ? (
                  <div className="w-full flex items-center justify-center gap-3 py-4 bg-green-50 border-2 border-green-500 text-green-700 font-black text-lg rounded-xl shadow-sm mb-4">
                    <Check className="w-6 h-6" />
                    ARCHITECTURE COMPLETE (NO CLEANUP NEEDED)
                  </div>
                ) : (
                  <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Auto-Cleanup</h4>
                    <p className="text-xs text-slate-500 mb-3">Your score is low. Run auto-cleanup to merge duplicates and optimize layout.</p>
                    <input
                      type="text"
                      value={optimizeInstruction}
                      onChange={e => setOptimizeInstruction(e.target.value)}
                      placeholder="Optional instruction: e.g. 'Keep auth separate'"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-purple-400 mb-2"
                    />
                    <button 
                      disabled={isReviewing}
                      onClick={() => handleAutoImprove(optimizeInstruction || undefined)}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-slate-600 to-slate-800 hover:from-slate-700 hover:to-slate-900 text-white font-bold rounded-lg shadow transition-all hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
                    >
                      {isReviewing ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Sparkles className="w-5 h-5" />}
                      {isReviewing ? 'ANALYZING...' : 'RUN AUTO-CLEANUP'}
                    </button>
                  </div>
                )}

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2 flex items-center gap-1"><Zap className="w-4 h-4"/> Expand / Add Feature</h4>
                  <p className="text-xs text-blue-600/80 mb-3">Add a major new feature or change requirements.</p>
                  <input
                    type="text"
                    value={expandPrompt}
                    onChange={e => setExpandPrompt(e.target.value)}
                    placeholder="e.g. 'Add a Stripe payment gateway'"
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 mb-2"
                  />
                  <button 
                    disabled={isClarifyingExpand || isReviewing || !expandPrompt.trim()}
                    onClick={handleStartExpandClarification}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow transition-all hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
                  >
                    {isClarifyingExpand || isReviewing ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Zap className="w-5 h-5" />}
                    {isClarifyingExpand ? 'CLARIFYING...' : 'EXPAND ARCHITECTURE'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Diff Preview Modal */}
      {pendingOptimize && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-gradient-to-r from-purple-600 to-blue-600 rounded-t-xl">
              <h2 className="text-base font-black tracking-tight text-white uppercase flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                Proposed Optimizations
              </h2>
              <button onClick={() => setPendingOptimize(null)} className="text-white/80 hover:text-white font-bold px-3 py-1 bg-white/10 rounded text-sm">Cancel</button>
            </div>
            <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[60vh]">
              <p className="text-slate-500 text-sm">Review what the AI proposes to change before it touches your canvas:</p>

              {pendingOptimize.delta?.merges?.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-orange-700 font-bold text-sm mb-2"><GitMerge className="w-4 h-4" /> Merge Duplicates</div>
                  {pendingOptimize.delta.merges.map((m: any, i: number) => (
                    <div key={i} className="text-sm text-orange-600">• Keep <span className="font-mono bg-orange-100 px-1 rounded">{m.keepId}</span>, remove <span className="font-mono bg-orange-100 px-1 rounded">{m.duplicateId}</span></div>
                  ))}
                </div>
              )}

              {pendingOptimize.delta?.conversionsToCapabilities?.length > 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-purple-700 font-bold text-sm mb-2"><Zap className="w-4 h-4" /> Convert to Capabilities</div>
                  {pendingOptimize.delta.conversionsToCapabilities.map((c: any, i: number) => (
                    <div key={i} className="text-sm text-purple-600">• Module <span className="font-mono bg-purple-100 px-1 rounded">{c.moduleId}</span> → capability <span className="font-bold">{c.capability}</span></div>
                  ))}
                </div>
              )}

              {pendingOptimize.delta?.deletions?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-red-700 font-bold text-sm mb-2"><Trash2 className="w-4 h-4" /> Delete Dead Modules</div>
                  {pendingOptimize.delta.deletions.map((id: string, i: number) => (
                    <div key={i} className="text-sm text-red-600">• Remove <span className="font-mono bg-red-100 px-1 rounded">{id}</span></div>
                  ))}
                </div>
              )}

              {pendingOptimize.delta?.newCapabilities?.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-green-700 font-bold text-sm mb-2"><Sparkles className="w-4 h-4" /> Add Capabilities</div>
                  {pendingOptimize.delta.newCapabilities.map((cap: string, i: number) => (
                    <div key={i} className="text-sm text-green-600">• {cap}</div>
                  ))}
                </div>
              )}

              {!pendingOptimize.delta?.merges?.length &&
               !pendingOptimize.delta?.conversionsToCapabilities?.length &&
               !pendingOptimize.delta?.deletions?.length &&
               !pendingOptimize.delta?.newCapabilities?.length && (
                <div className="text-center text-slate-500 text-sm py-4">✅ Architecture looks clean — no changes proposed.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expand Clarification Modal */}
      {expandQuestions.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"></div>
          
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-600" /> Clarify Expansion
                </h2>
                <p className="text-sm text-slate-500 mt-1">Answer these quick questions to refine your new feature.</p>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto flex-grow space-y-6">
              {expandQuestions.map((q) => (
                <div key={q.id} className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm transition-colors hover:border-slate-300">
                  <label className="block text-base font-bold text-slate-800 mb-3">{q.question}</label>
                  
                  {q.type === 'open_text' ? (
                    <textarea
                      value={expandAnswers[q.id] || ''}
                      onChange={(e) => setExpandAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder="Type your answer here..."
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none h-24"
                    />
                  ) : q.type === 'multi_select' ? (
                    <div className="flex flex-wrap gap-2">
                      {q.options.map((opt: string) => {
                        const isSelected = (expandAnswers[q.id] || []).includes(opt);
                        return (
                          <button
                            key={opt}
                            onClick={() => {
                              setExpandAnswers(prev => {
                                const current = prev[q.id] || [];
                                if (isSelected) {
                                  return { ...prev, [q.id]: current.filter((x: string) => x !== opt) };
                                } else {
                                  return { ...prev, [q.id]: [...current, opt] };
                                }
                              });
                            }}
                            className={`px-4 py-2 text-sm rounded-lg transition-all border font-medium flex items-center gap-2 ${
                              isSelected
                                ? 'bg-blue-100 border-blue-400 text-blue-800 shadow-sm scale-[1.02]' 
                                : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100 hover:border-slate-400'
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
                          className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          onBlur={(e) => {
                            if(e.target.value.trim()) {
                              setExpandAnswers(prev => {
                                const current = prev[q.id] || [];
                                if (!current.includes(e.target.value)) {
                                  return { ...prev, [q.id]: [...current, e.target.value] };
                                }
                                return prev;
                              });
                              e.target.value = '';
                            }
                          }}
                          onKeyDown={(e) => {
                            if(e.key === 'Enter') e.currentTarget.blur();
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {q.options.map((opt: string) => (
                        <button
                          key={opt}
                          onClick={() => setExpandAnswers(prev => ({ ...prev, [q.id]: opt }))}
                          className={`px-4 py-2 text-sm rounded-lg transition-all border font-medium ${
                            expandAnswers[q.id] === opt 
                              ? 'bg-blue-100 border-blue-400 text-blue-800 shadow-sm scale-[1.02]' 
                              : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100 hover:border-slate-400'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                      <input 
                        type="text" 
                        placeholder="Other (specify)"
                        className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        value={!q.options.includes(expandAnswers[q.id]) && expandAnswers[q.id] ? expandAnswers[q.id] : ''}
                        onChange={(e) => setExpandAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end items-center">
               <button
                 onClick={() => {
                   setExpandQuestions([]);
                   setShowExpandChoice(true);
                 }}
                 className={`flex items-center gap-2 px-8 py-3 text-white rounded-xl font-bold shadow-lg transition-all bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/25 hover:-translate-y-0.5`}
               >
                 Continue
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Expand Choice Modal (Append vs Regenerate) */}
      {showExpandChoice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col p-6 animate-in fade-in zoom-in-95">
            <h2 className="text-xl font-black text-slate-800 mb-2">How should we apply this?</h2>
            <p className="text-sm text-slate-500 mb-6">Your requested change might require major structural updates.</p>

            <div className="flex flex-col gap-4">
              <button
                onClick={() => finalizeExpandChoice('append')}
                className="flex flex-col items-start p-4 border-2 border-blue-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
              >
                <div className="font-bold text-blue-800 text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5"/> Append to Current Flow
                </div>
                <div className="text-sm text-blue-600/80 mt-1">
                  Adds new modules to the existing graph without destroying your layout.
                </div>
              </button>

              <button
                onClick={() => finalizeExpandChoice('regenerate')}
                className="flex flex-col items-start p-4 border-2 border-red-200 rounded-xl hover:border-red-500 hover:bg-red-50 transition-colors text-left"
              >
                <div className="font-bold text-red-800 text-lg flex items-center gap-2">
                  <Trash2 className="w-5 h-5"/> Regenerate from Scratch
                </div>
                <div className="text-sm text-red-600/80 mt-1">
                  <span className="font-bold uppercase">Warning:</span> Destroys the current flowchart and generates a brand new one based on your updated needs.
                </div>
              </button>
            </div>

            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => {
                   setShowExpandChoice(false);
                   setExpandPrompt('');
                }}
                className="px-5 py-2 text-slate-500 hover:text-slate-800 font-bold text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diff Preview Modal */}
      {pendingOptimize && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-gradient-to-r from-purple-600 to-blue-600 rounded-t-xl">
              <h2 className="text-base font-black tracking-tight text-white uppercase flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                Proposed Optimizations
              </h2>
              <button onClick={() => setPendingOptimize(null)} className="text-white/80 hover:text-white font-bold px-3 py-1 bg-white/10 rounded text-sm">Cancel</button>
            </div>
            <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[60vh]">
              <p className="text-slate-500 text-sm">Review what the AI proposes to change before it touches your canvas:</p>

              {pendingOptimize.delta?.merges?.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-orange-700 font-bold text-sm mb-2"><GitMerge className="w-4 h-4" /> Merge Duplicates</div>
                  {pendingOptimize.delta.merges.map((m: any, i: number) => (
                    <div key={i} className="text-sm text-orange-600">• Keep <span className="font-mono bg-orange-100 px-1 rounded">{m.keepId}</span>, remove <span className="font-mono bg-orange-100 px-1 rounded">{m.duplicateId}</span></div>
                  ))}
                </div>
              )}

              {pendingOptimize.delta?.conversionsToCapabilities?.length > 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-purple-700 font-bold text-sm mb-2"><Zap className="w-4 h-4" /> Convert to Capabilities</div>
                  {pendingOptimize.delta.conversionsToCapabilities.map((c: any, i: number) => (
                    <div key={i} className="text-sm text-purple-600">• Module <span className="font-mono bg-purple-100 px-1 rounded">{c.moduleId}</span> → capability <span className="font-bold">{c.capability}</span></div>
                  ))}
                </div>
              )}

              {pendingOptimize.delta?.deletions?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-red-700 font-bold text-sm mb-2"><Trash2 className="w-4 h-4" /> Delete Dead Modules</div>
                  {pendingOptimize.delta.deletions.map((id: string, i: number) => (
                    <div key={i} className="text-sm text-red-600">• Remove <span className="font-mono bg-red-100 px-1 rounded">{id}</span></div>
                  ))}
                </div>
              )}

              {pendingOptimize.delta?.newCapabilities?.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-green-700 font-bold text-sm mb-2"><Sparkles className="w-4 h-4" /> Add Capabilities</div>
                  {pendingOptimize.delta.newCapabilities.map((cap: string, i: number) => (
                    <div key={i} className="text-sm text-green-600">• {cap}</div>
                  ))}
                </div>
              )}

              {!pendingOptimize.delta?.merges?.length &&
               !pendingOptimize.delta?.conversionsToCapabilities?.length &&
               !pendingOptimize.delta?.deletions?.length &&
               !pendingOptimize.delta?.newCapabilities?.length && (
                <div className="text-center text-slate-500 text-sm py-4">✅ Architecture looks clean — no changes proposed.</div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setPendingOptimize(null)} className="px-5 py-2 text-slate-600 border border-slate-200 rounded-lg font-bold text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={applyPendingOptimize} className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-bold text-sm hover:from-purple-700 hover:to-blue-700 shadow">Apply Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CanvasEditor;
