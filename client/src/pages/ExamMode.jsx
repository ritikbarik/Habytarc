import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createExamSubject,
  deleteExamSubject,
  subscribeToExamSubjects,
  updateExamSubject
} from '../utils/firebaseService';
import { deleteLocalFile, getLocalFileEntry, getLocalFileUrl, saveLocalFile } from '../utils/localFileVault';

const AI_API_BASE_URL = String(import.meta.env.VITE_AI_API_BASE_URL || '').trim();
const resolveApiBaseUrl = () => {
  if (!AI_API_BASE_URL) return '';

  try {
    const configuredUrl = new URL(AI_API_BASE_URL);
    const browserHost = typeof window !== 'undefined' ? window.location.hostname : '';
    const configuredHost = configuredUrl.hostname;
    const configuredIsLocalhost =
      configuredHost === 'localhost' ||
      configuredHost === '127.0.0.1' ||
      configuredHost === '::1';
    const browserIsLocalhost =
      browserHost === 'localhost' ||
      browserHost === '127.0.0.1' ||
      browserHost === '::1';

    if (configuredIsLocalhost && browserHost && !browserIsLocalhost) {
      return '';
    }

    return AI_API_BASE_URL.replace(/\/+$/, '');
  } catch {
    return AI_API_BASE_URL.replace(/\/+$/, '');
  }
};

const API_BASE_URL = resolveApiBaseUrl();
const SYLLABUS_ENDPOINT = API_BASE_URL
  ? `${API_BASE_URL}/api/exam-syllabus`
  : '/api/exam-syllabus';

const emptySubjectDraft = {
  name: '',
  examName: '',
  manualSyllabus: ''
};

const emptyMaterialDraft = {
  title: '',
  description: '',
  type: 'notes',
  link: '',
  youtubeLink: '',
  selectedSyllabusIds: []
};

const makeId = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

const slugYoutubeEmbed = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    if (url.hostname.includes('youtu.be')) {
      return `https://www.youtube.com/embed/${url.pathname.replace(/\//g, '')}`;
    }
    if (url.hostname.includes('youtube.com')) {
      const videoId = url.searchParams.get('v');
      if (videoId) return `https://www.youtube.com/embed/${videoId}`;
      const parts = url.pathname.split('/').filter(Boolean);
      const embedId = parts[parts.length - 1];
      if (embedId) return `https://www.youtube.com/embed/${embedId}`;
    }
  } catch (_) {
    return '';
  }

  return '';
};

const formatBytes = (bytes = 0) => {
  const value = Number(bytes || 0);
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });

const getSyllabusProgress = (subject) => {
  const items = Array.isArray(subject?.syllabusItems) ? subject.syllabusItems : [];
  if (items.length === 0) return 0;
  const completed = items.filter((item) => item.status === 'completed').length;
  return Math.round((completed / items.length) * 100);
};

const getMaterialProgress = (subject) => {
  const items = Array.isArray(subject?.materials) ? subject.materials : [];
  if (items.length === 0) return 0;
  const completed = items.filter((item) => item.status === 'completed').length;
  return Math.round((completed / items.length) * 100);
};

const getQuestionProgress = (stats) => {
  const total = Number(stats?.total || 0);
  const solved = Number(stats?.solved || 0);
  if (!total) return 0;
  return Math.min(100, Math.round((solved / total) * 100));
};

const normalizeTopicsFromText = (text, source = 'manual') => {
  let currentUnit = 'General';
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\-\d.)\s]+/, '').trim())
    .filter(Boolean)
    .flatMap((line) => {
      if (/^(unit|module|chapter|section)\b/i.test(line)) {
        currentUnit = line;
        return [];
      }

      return [{
        id: makeId('syllabus'),
        unit: currentUnit,
        title: line,
        status: 'pending',
        source
      }];
    });
};

const formatTopicsForTextarea = (items = []) => {
  const groups = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const unit = String(item?.unit || 'General').trim() || 'General';
    const bucket = groups.get(unit) || [];
    bucket.push(String(item?.title || '').trim());
    groups.set(unit, bucket);
  });

  return Array.from(groups.entries())
    .flatMap(([unit, topics]) => [unit, ...topics.map((topic) => `- ${topic}`), ''])
    .join('\n')
    .trim();
};

const syncUnitCounters = (units = [], counters = []) =>
  units.map((unit, index) => {
    const existing = (Array.isArray(counters) ? counters : []).find((item) => String(item?.unit || '') === unit);
    const total = Math.max(0, Number(existing?.total || 0));
    const solved = Math.max(0, Math.min(Number(existing?.solved || 0), total));
    return {
      id: String(existing?.id || `unit_counter_${Date.now()}_${index}_${Math.floor(Math.random() * 10000)}`),
      unit,
      total,
      solved
    };
  });

function ExamMode({ user }) {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState(emptySubjectDraft);
  const [syllabusEntryMode, setSyllabusEntryMode] = useState('manual');
  const [subjectSourceFile, setSubjectSourceFile] = useState(null);
  const [creating, setCreating] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [extractStatus, setExtractStatus] = useState('');
  const [activeSubjectId, setActiveSubjectId] = useState('');
  const [expandedUnits, setExpandedUnits] = useState({});
  const [activeWorkspacePanel, setActiveWorkspacePanel] = useState('syllabus');
  const [materialDraft, setMaterialDraft] = useState(emptyMaterialDraft);
  const [materialFile, setMaterialFile] = useState(null);
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [materialUploadProgress, setMaterialUploadProgress] = useState(0);
  const [materialUploadStatus, setMaterialUploadStatus] = useState('');
  const [subjectUploadProgress, setSubjectUploadProgress] = useState(0);
  const [subjectUploadStatus, setSubjectUploadStatus] = useState('');
  const [previewTarget, setPreviewTarget] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const syllabusSourceInputRef = useRef(null);
  const previewSurfaceRef = useRef(null);

  useEffect(() => {
    const unsubscribe = subscribeToExamSubjects(user.uid, (items) => {
      setSubjects(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user.uid]);

  useEffect(() => {
    if (subjects.length === 0) {
      if (activeSubjectId) setActiveSubjectId('');
      return;
    }

    const stillExists = subjects.some((item) => item.id === activeSubjectId);
    if (!activeSubjectId || !stillExists) {
      setActiveSubjectId(subjects[0].id);
    }
  }, [subjects, activeSubjectId]);

  useEffect(() => {
    if (!previewTarget?.localFileId) return undefined;

    let mounted = true;
    let objectUrl = '';
    setPreviewError('');

    getLocalFileUrl(previewTarget.localFileId)
      .then((url) => {
        if (!mounted) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url || '';
        if (!objectUrl) {
          setPreviewError('This local file is not available in this browser anymore.');
        }
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (mounted) {
          setPreviewError('This local file could not be opened.');
          setPreviewUrl('');
        }
      });

    return () => {
      mounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [previewTarget]);

  const activeSubject = useMemo(
    () => subjects.find((item) => item.id === activeSubjectId) || null,
    [subjects, activeSubjectId]
  );

  const groupedSyllabus = useMemo(() => {
    const groups = new Map();
    (activeSubject?.syllabusItems || []).forEach((item) => {
      const unit = String(item?.unit || 'General').trim() || 'General';
      if (!groups.has(unit)) {
        groups.set(unit, []);
      }
      groups.get(unit).push(item);
    });

    return Array.from(groups.entries()).map(([unit, items]) => ({
      unit,
      items,
      progress: items.length ? Math.round((items.filter((item) => item.status === 'completed').length / items.length) * 100) : 0
    }));
  }, [activeSubject]);

  const subjectUnits = useMemo(
    () => groupedSyllabus.map((group) => group.unit),
    [groupedSyllabus]
  );

  const syllabusItemLookup = useMemo(() => {
    const entries = new Map();
    (activeSubject?.syllabusItems || []).forEach((item) => {
      entries.set(item.id, item);
    });
    return entries;
  }, [activeSubject]);

  const groupedMaterials = useMemo(() => {
    const sections = new Map();

    (activeSubject?.materials || []).forEach((material) => {
      const linkedUnits = Array.from(
        new Set(
          (material.syllabusItemIds || [])
            .map((id) => syllabusItemLookup.get(id))
            .filter(Boolean)
            .map((item) => String(item.unit || 'General').trim() || 'General')
        )
      );

      const primaryUnit = linkedUnits[0] || 'Unlinked Materials';
      if (!sections.has(primaryUnit)) {
        sections.set(primaryUnit, []);
      }

      sections.get(primaryUnit).push({
        ...material,
        linkedUnits
      });
    });

    return Array.from(sections.entries()).map(([unit, items]) => ({
      unit,
      items
    }));
  }, [activeSubject, syllabusItemLookup]);

  useEffect(() => {
    if (!activeSubject?.id) return;
    setExpandedUnits((prev) => {
      const next = {};
      groupedSyllabus.forEach((group, index) => {
        const key = `${activeSubject.id}::${group.unit}`;
        next[key] = Object.prototype.hasOwnProperty.call(prev, key) ? prev[key] : index < 2;
      });
      return next;
    });
  }, [activeSubject?.id, groupedSyllabus]);

  useEffect(() => {
    if (!activeSubject?.id) return;
    setActiveWorkspacePanel('syllabus');
  }, [activeSubject?.id]);

  const overallStats = useMemo(() => {
    const syllabusCount = subjects.reduce((sum, subject) => sum + (subject.syllabusItems?.length || 0), 0);
    const completedSyllabus = subjects.reduce(
      (sum, subject) => sum + (subject.syllabusItems || []).filter((item) => item.status === 'completed').length,
      0
    );

    return {
      syllabusProgress: syllabusCount ? Math.round((completedSyllabus / syllabusCount) * 100) : 0,
      materialsCount: subjects.reduce((sum, subject) => sum + (subject.materials?.length || 0), 0),
      subjectsCount: subjects.length
    };
  }, [subjects]);

  const syncSubjectUnits = (subject) => {
    const units = Array.from(
      new Set((subject?.syllabusItems || []).map((item) => String(item?.unit || 'General').trim() || 'General'))
    );

    return {
      questionBankByUnit: syncUnitCounters(units, subject?.questionBankByUnit),
      previousYearByUnit: syncUnitCounters(units, subject?.previousYearByUnit)
    };
  };

  const saveSubjectPatch = async (subjectId, updates) => {
    try {
      await updateExamSubject(user.uid, subjectId, updates);
    } catch (error) {
      console.error('Failed to update exam subject:', error);
      alert(error?.message || 'Failed to save changes.');
    }
  };

  const resetSubjectModal = () => {
    setShowSubjectModal(false);
    setSubjectDraft(emptySubjectDraft);
    setSyllabusEntryMode('manual');
    setSubjectSourceFile(null);
    setExtracting(false);
    setExtractProgress(0);
    setExtractStatus('');
    setSubjectUploadProgress(0);
    setSubjectUploadStatus('');
  };

  const createSubject = async () => {
    const syllabusItems = normalizeTopicsFromText(subjectDraft.manualSyllabus, syllabusEntryMode === 'ai' ? 'ai' : 'manual');

    if (!subjectDraft.name.trim()) {
      alert('Subject name is required.');
      return;
    }

    setCreating(true);
    setSubjectUploadProgress(0);
    setSubjectUploadStatus('');
    try {
      let syllabusSource = null;
      if (subjectSourceFile) {
        setSubjectUploadStatus('Saving syllabus file locally...');
        const localMeta = await saveLocalFile(subjectSourceFile, user.uid);
        setSubjectUploadProgress(100);
        syllabusSource = {
          id: makeId('syllabus_source'),
          title: subjectSourceFile.name || 'Syllabus file',
          link: '',
          storagePath: '',
          localFileId: localMeta.id,
          fileName: localMeta.name,
          mimeType: localMeta.type,
          sizeBytes: localMeta.size,
          isLocalOnly: true,
          createdAtMs: Date.now()
        };
      }

      const subjectId = await createExamSubject(user.uid, {
        name: subjectDraft.name,
        examName: subjectDraft.examName,
        syllabusItems: syllabusItems.map((item) => ({
          ...item,
          source: syllabusEntryMode === 'ai' ? 'ai' : 'manual'
        })),
        syllabusSources: syllabusSource ? [syllabusSource] : [],
        materials: [],
        questionBank: { total: 0, solved: 0 },
        previousYear: { total: 0, solved: 0 },
        questionBankByUnit: syncUnitCounters(
          Array.from(new Set(syllabusItems.map((item) => item.unit || 'General'))),
          []
        ),
        previousYearByUnit: syncUnitCounters(
          Array.from(new Set(syllabusItems.map((item) => item.unit || 'General'))),
          []
        )
      });
      setSubjectDraft(emptySubjectDraft);
      setSyllabusEntryMode('manual');
      setSubjectSourceFile(null);
      setShowSubjectModal(false);
      setActiveSubjectId(subjectId);
    } catch (error) {
      console.error('Failed to create exam subject:', error);
      alert(error?.message || 'Failed to create subject.');
    } finally {
      setCreating(false);
      setSubjectUploadProgress(0);
      setSubjectUploadStatus('');
    }
  };

  const extractSyllabus = async () => {
    if (!subjectDraft.manualSyllabus.trim() && !subjectSourceFile) {
      alert('Add syllabus text or select a PDF/image first.');
      return;
    }

    setExtracting(true);
    setExtractProgress(10);
    setExtractStatus('Preparing...');
    try {
      const fileKind = subjectSourceFile?.type === 'application/pdf'
        ? 'pdf'
        : subjectSourceFile?.type?.startsWith('image/')
          ? 'image'
          : '';
      setExtractProgress(28);
      setExtractStatus(fileKind ? 'Reading syllabus...' : 'Preparing text...');
      const fileDataUrl = subjectSourceFile ? await readAsDataUrl(subjectSourceFile) : '';
      setExtractProgress(56);
      setExtractStatus('Extracting with AI...');
      const response = await fetch(SYLLABUS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manualText: subjectDraft.manualSyllabus,
          fileDataUrl,
          fileKind
        })
      });
      const raw = await response.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = null;
      }
      if (!data) {
        throw new Error('AI server returned an invalid response. Check the API server and try again.');
      }
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to extract syllabus.');
      }
      setExtractProgress(88);
      setExtractStatus('Organizing units...');
      const extractedItems = Array.isArray(data?.topics)
        ? data.topics
            .map((item) => ({
              unit: String(item?.unit || 'General').trim() || 'General',
              title: String(item?.title || '').trim()
            }))
            .filter((item) => item.title)
        : [];
      setSubjectDraft((prev) => ({
        ...prev,
        manualSyllabus: extractedItems.length > 0 ? formatTopicsForTextarea(extractedItems) : prev.manualSyllabus
      }));
      setSyllabusEntryMode('ai');
      setExtractProgress(100);
      setExtractStatus('Done');
    } catch (error) {
      console.error('Syllabus extraction failed:', error);
      alert(error?.message || 'Failed to extract syllabus.');
    } finally {
      setExtracting(false);
      setTimeout(() => {
        setExtractProgress(0);
        setExtractStatus('');
      }, 600);
    }
  };

  const toggleSyllabusStatus = async (itemId, nextStatus) => {
    if (!activeSubject) return;
    const updated = (activeSubject.syllabusItems || []).map((item) =>
      item.id === itemId ? { ...item, status: nextStatus } : item
    );
    await saveSubjectPatch(activeSubject.id, {
      syllabusItems: updated,
      ...syncSubjectUnits({ ...activeSubject, syllabusItems: updated })
    });
  };

  const addSyllabusItem = async () => {
    if (!activeSubject) return;
    const title = window.prompt('Add syllabus topic');
    if (!title || !title.trim()) return;
    await saveSubjectPatch(activeSubject.id, {
      syllabusItems: [
        ...(activeSubject.syllabusItems || []),
        { id: makeId('syllabus'), unit: 'General', title: title.trim(), status: 'pending', source: 'manual' }
      ],
      ...syncSubjectUnits({
        ...activeSubject,
        syllabusItems: [
          ...(activeSubject.syllabusItems || []),
          { id: makeId('syllabus_preview'), unit: 'General', title: title.trim(), status: 'pending', source: 'manual' }
        ]
      })
    });
  };

  const removeSyllabusItem = async (itemId) => {
    if (!activeSubject) return;
    const nextItems = (activeSubject.syllabusItems || []).filter((item) => item.id !== itemId);
    const nextMaterials = (activeSubject.materials || []).map((material) => ({
      ...material,
      syllabusItemIds: (material.syllabusItemIds || []).filter((id) => id !== itemId)
    }));
    await saveSubjectPatch(activeSubject.id, {
      syllabusItems: nextItems,
      materials: nextMaterials,
      ...syncSubjectUnits({ ...activeSubject, syllabusItems: nextItems })
    });
  };

  const addSyllabusSource = async (file) => {
    if (!activeSubject || !file) return;
    try {
      const localMeta = await saveLocalFile(file, user.uid);
      const nextSources = [
        ...(activeSubject.syllabusSources || []),
        {
          id: makeId('syllabus_source'),
          title: file.name || 'Syllabus file',
          link: '',
          storagePath: '',
          localFileId: localMeta.id,
          fileName: localMeta.name,
          mimeType: localMeta.type,
          sizeBytes: localMeta.size,
          isLocalOnly: true,
          createdAtMs: Date.now()
        }
      ];
      await saveSubjectPatch(activeSubject.id, { syllabusSources: nextSources });
    } catch (error) {
      console.error('Failed to add syllabus source:', error);
      alert(error?.message || 'Failed to add syllabus source.');
    }
  };

  const removeSyllabusSource = async (sourceId) => {
    if (!activeSubject) return;
    const source = (activeSubject.syllabusSources || []).find((item) => item.id === sourceId);
    if (source?.localFileId) {
      await deleteLocalFile(source.localFileId).catch(() => {});
    }
    const nextSources = (activeSubject.syllabusSources || []).filter((item) => item.id !== sourceId);
    await saveSubjectPatch(activeSubject.id, { syllabusSources: nextSources });
  };

  const addMaterial = async () => {
    if (!activeSubject) return;
    if (!materialDraft.title.trim()) {
      alert('Material title is required.');
      return;
    }

    setSavingMaterial(true);
    setMaterialUploadProgress(0);
    setMaterialUploadStatus('');
    try {
      let localMeta = null;
      if (materialFile) {
        setMaterialUploadStatus('Saving material locally...');
        localMeta = await saveLocalFile(materialFile, user.uid);
        setMaterialUploadProgress(100);
      }

      const nextMaterials = [
        ...(activeSubject.materials || []),
        {
          id: makeId('material'),
          title: materialDraft.title.trim(),
          description: materialDraft.description.trim(),
          type: materialDraft.type,
          youtubeLink: materialDraft.youtubeLink.trim(),
          syllabusItemIds: materialDraft.selectedSyllabusIds,
          status: 'pending',
          localFileId: localMeta?.id || '',
          storagePath: '',
          link: materialDraft.link.trim(),
          fileName: localMeta?.name || '',
          mimeType: localMeta?.type || '',
          sizeBytes: localMeta?.size || 0,
          isLocalOnly: Boolean(localMeta),
          createdAtMs: Date.now()
        }
      ];

      await saveSubjectPatch(activeSubject.id, { materials: nextMaterials });
      setMaterialDraft(emptyMaterialDraft);
      setMaterialFile(null);
      setMaterialUploadProgress(0);
      setMaterialUploadStatus('');
    } catch (error) {
      console.error('Failed to add material:', error);
      alert(error?.message || 'Failed to add material.');
    } finally {
      setSavingMaterial(false);
      setMaterialUploadProgress(0);
      setMaterialUploadStatus('');
    }
  };

  const updateMaterialStatus = async (materialId, status) => {
    if (!activeSubject) return;
    const nextMaterials = (activeSubject.materials || []).map((item) =>
      item.id === materialId ? { ...item, status } : item
    );
    await saveSubjectPatch(activeSubject.id, { materials: nextMaterials });
  };

  const removeMaterial = async (materialId) => {
    if (!activeSubject) return;
    const material = (activeSubject.materials || []).find((item) => item.id === materialId);
    if (material?.localFileId) {
      await deleteLocalFile(material.localFileId).catch(() => {});
    }
    const nextMaterials = (activeSubject.materials || []).filter((item) => item.id !== materialId);
    await saveSubjectPatch(activeSubject.id, { materials: nextMaterials });
  };

  const updateCounter = async (key, field, value) => {
    if (!activeSubject) return;
    const current = activeSubject[key] || { total: 0, solved: 0 };
    const nextValue = Math.max(0, Number(value || 0));
    const nextStats = { ...current, [field]: nextValue };
    if (field === 'solved' && nextStats.total && nextStats.solved > nextStats.total) {
      nextStats.solved = nextStats.total;
    }
    if (field === 'total' && nextStats.solved > nextStats.total) {
      nextStats.solved = nextStats.total;
    }
    await saveSubjectPatch(activeSubject.id, { [key]: nextStats });
  };

  const updateUnitCounter = async (key, unit, field, value) => {
    if (!activeSubject) return;
    const currentItems = Array.isArray(activeSubject[key]) ? activeSubject[key] : [];
    const nextItems = currentItems.map((item) => {
      if (item.unit !== unit) return item;
      const nextValue = Math.max(0, Number(value || 0));
      const updated = { ...item, [field]: nextValue };
      if (field === 'solved' && updated.total && updated.solved > updated.total) {
        updated.solved = updated.total;
      }
      if (field === 'total' && updated.solved > updated.total) {
        updated.solved = updated.total;
      }
      return updated;
    });

    const total = nextItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const solved = nextItems.reduce((sum, item) => sum + Number(item.solved || 0), 0);
    await saveSubjectPatch(activeSubject.id, {
      [key]: nextItems,
      [key === 'questionBankByUnit' ? 'questionBank' : 'previousYear']: { total, solved }
    });
  };

  const openMaterial = async (material) => {
    if (material.localFileId) {
      const entry = await getLocalFileEntry(material.localFileId);
      if (!entry) {
        alert('This local file is not available in this browser anymore.');
        return;
      }
    }
    setPreviewTarget(material);
    setPreviewUrl('');
    setPreviewError('');
  };

  const closePreview = () => {
    setPreviewTarget(null);
    setPreviewUrl('');
    setPreviewError('');
  };

  const deleteSubject = async (subject) => {
    if (!window.confirm(`Delete ${subject.name}?`)) return;
    try {
      await Promise.all([
        ...(subject.materials || []).map((item) => item?.localFileId ? deleteLocalFile(item.localFileId).catch(() => {}) : Promise.resolve()),
        ...(subject.syllabusSources || []).map((item) => item?.localFileId ? deleteLocalFile(item.localFileId).catch(() => {}) : Promise.resolve())
      ]);
      await deleteExamSubject(user.uid, subject.id);
      if (activeSubjectId === subject.id) {
        setActiveSubjectId('');
      }
    } catch (error) {
      console.error('Failed to delete subject:', error);
      alert(error?.message || 'Failed to delete subject.');
    }
  };

  const previewKind = useMemo(() => {
    if (!previewTarget) return 'none';
    const mime = String(previewTarget.mimeType || '').toLowerCase();
    const link = String(previewTarget.link || '').trim();
    if (previewTarget.youtubeLink) return 'youtube';
    if (mime.startsWith('image/')) return 'image';
    if (mime === 'application/pdf' || /\.pdf($|\?)/i.test(link)) return 'pdf';
    if (mime.startsWith('text/')) return 'text';
    if (/officedocument|presentation|powerpoint|msword|wordprocessingml/i.test(mime) || /\.(ppt|pptx|doc|docx)($|\?)/i.test(link)) return 'office';
    if (link) return 'link';
    return previewTarget.localFileId ? 'download' : 'link';
  }, [previewTarget]);

  const youtubeEmbedUrl = slugYoutubeEmbed(previewTarget?.youtubeLink || '');
  const officePreviewUrl =
    previewTarget?.link
      ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewTarget.link)}`
      : '';

  const togglePreviewFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      if (previewSurfaceRef.current?.requestFullscreen) {
        await previewSurfaceRef.current.requestFullscreen();
      }
    } catch (error) {
      console.error('Failed to toggle preview fullscreen:', error);
      alert('Fullscreen could not be opened in this browser.');
    }
  };

  const toggleUnitPanel = (unit) => {
    if (!activeSubject?.id) return;
    const key = `${activeSubject.id}::${unit}`;
    setExpandedUnits((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-content">
          <div className="loading-screen">
            <div className="loading-spinner"></div>
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Loading exam mode...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-content">
        <div className="page-header exam-page-header">
          <div>
            <h1>Zenvy</h1>
            <p className="page-subtitle">Plan syllabus units and study materials in one dedicated exam workspace</p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setSubjectDraft(emptySubjectDraft);
              setSyllabusEntryMode('manual');
              setSubjectSourceFile(null);
              setShowSubjectModal(true);
            }}
          >
            + Add Subject
          </button>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Subjects</div>
            <div className="stat-value">{overallStats.subjectsCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Syllabus Progress</div>
            <div className="stat-value">{overallStats.syllabusProgress}%</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Study Materials</div>
            <div className="stat-value">{overallStats.materialsCount}</div>
          </div>
        </div>

        {subjects.length === 0 ? (
          <div className="chart-container exam-empty-state">
            <h2>Build your first exam workspace</h2>
            <p>Add a subject, paste the syllabus or upload a syllabus image, and start tracking every topic and resource.</p>
          </div>
        ) : (
          <div className="exam-main-shell">
            <div className="chart-container exam-top-tabs">
              <div className="exam-panel-header">
                <div>
                  <h2>Subjects</h2>
                  <p className="page-subtitle">Switch subjects here without compressing the syllabus and materials workspace.</p>
                </div>
                <span className="badge">{subjects.length} subject(s)</span>
              </div>
              <div className="exam-subject-list">
                {subjects.map((subject) => (
                  <button
                    key={subject.id}
                    type="button"
                    className={`exam-subject-card ${subject.id === activeSubjectId ? 'active' : ''}`}
                    onClick={() => setActiveSubjectId(subject.id)}
                  >
                    <strong>{subject.name}</strong>
                    <span>{subject.examName || 'General exam prep'}</span>
                    <span>{getSyllabusProgress(subject)}% syllabus done</span>
                  </button>
                ))}
              </div>
            </div>

            {activeSubject && (
              <section className="exam-main">
                <div className="chart-container">
                  <div className="exam-panel-header">
                    <div>
                      <h2>{activeSubject.name}</h2>
                      <p className="page-subtitle">{activeSubject.examName || 'Exam workspace'}</p>
                    </div>
                    <div className="exam-subject-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => syllabusSourceInputRef.current?.click()}
                      >
                        Add PDF / Image
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={addSyllabusItem}>
                        Add Topic
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => deleteSubject(activeSubject)}>
                        Delete Subject
                      </button>
                    </div>
                  </div>

                  <div className="exam-progress-grid">
                    <div className="exam-progress-card">
                      <span>Syllabus</span>
                      <strong>{getSyllabusProgress(activeSubject)}%</strong>
                      <div className="exam-linear-progress">
                        <span style={{ width: `${getSyllabusProgress(activeSubject)}%` }} />
                      </div>
                    </div>
                    <div className="exam-progress-card">
                      <span>Materials</span>
                      <strong>{getMaterialProgress(activeSubject)}%</strong>
                      <div className="exam-linear-progress">
                        <span style={{ width: `${getMaterialProgress(activeSubject)}%` }} />
                      </div>
                    </div>
                  </div>
                  <input
                    ref={syllabusSourceInputRef}
                    type="file"
                    accept="application/pdf,image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (file) addSyllabusSource(file);
                      e.target.value = '';
                    }}
                  />
                </div>

                <div className="exam-workspace-tabs">
                  <button
                    type="button"
                    className={`exam-workspace-tab ${activeWorkspacePanel === 'syllabus' ? 'active' : ''}`}
                    onClick={() => setActiveWorkspacePanel('syllabus')}
                  >
                    <span>Syllabus</span>
                    <span className="badge">{activeSubject.syllabusItems?.length || 0} topic(s)</span>
                  </button>
                  <button
                    type="button"
                    className={`exam-workspace-tab ${activeWorkspacePanel === 'materials' ? 'active' : ''}`}
                    onClick={() => setActiveWorkspacePanel('materials')}
                  >
                    <span>Study Materials</span>
                    <span className="badge">{activeSubject.materials?.length || 0} item(s)</span>
                  </button>
                </div>

                {activeWorkspacePanel === 'syllabus' && (
                  <div className="chart-container exam-workspace-panel">
                    <div className="exam-panel-header">
                      <div>
                        <h2>Syllabus</h2>
                        <p className="page-subtitle">Use the syllabus tracker to manage units, chapters, and topic completion.</p>
                      </div>
                      <span className="badge">{activeSubject.syllabusItems?.length || 0} topic(s)</span>
                    </div>
                    
                      {(activeSubject.syllabusSources || []).length > 0 && (
                        <div className="exam-topic-list" style={{ marginBottom: '1rem' }}>
                          {(activeSubject.syllabusSources || []).map((source) => (
                            <div key={source.id} className="exam-topic-row">
                              <div>
                                <strong>{source.title}</strong>
                                <div className="exam-meta-row">
                                  <span className="badge">{source.mimeType?.startsWith('image/') ? 'Image' : source.mimeType === 'application/pdf' ? 'PDF' : 'File'}</span>
                                  {source.fileName ? <span className="badge">{source.fileName} • {formatBytes(source.sizeBytes)}</span> : null}
                                  {source.isLocalOnly ? <span className="badge">Local browser file</span> : null}
                                </div>
                              </div>
                              <div className="exam-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => openMaterial(source)}>
                                  Open
                                </button>
                                <button type="button" className="btn btn-secondary" onClick={() => removeSyllabusSource(source.id)}>
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="exam-topic-list">
                        {groupedSyllabus.map((group) => (
                          <div key={group.unit} className="exam-unit-block">
                            <button
                              type="button"
                              className="exam-unit-toggle"
                              onClick={() => toggleUnitPanel(group.unit)}
                            >
                              <div>
                                <h3>{group.unit}</h3>
                                <p>{group.items.length} topic(s)</p>
                              </div>
                              <div className="exam-unit-progress">
                                <strong>{group.progress}%</strong>
                                <span className={`exam-unit-chevron ${expandedUnits[`${activeSubject.id}::${group.unit}`] ? 'open' : ''}`}>⌄</span>
                              </div>
                            </button>
                            {expandedUnits[`${activeSubject.id}::${group.unit}`] && (
                              <>
                                <div className="exam-linear-progress" style={{ marginBottom: '0.9rem' }}>
                                  <span style={{ width: `${group.progress}%` }} />
                                </div>
                                <div className="exam-topic-list exam-topic-stack">
                                  {group.items.map((item) => (
                                    <div key={item.id} className="exam-topic-row exam-topic-row-compact">
                                      <div>
                                        <strong>{item.title}</strong>
                                        <div className="exam-meta-row">
                                          <span className="badge">Source: {item.source || 'manual'}</span>
                                          <span className="badge">Status: {item.status}</span>
                                        </div>
                                      </div>
                                      <div className="exam-actions">
                                        <button type="button" className="btn btn-primary" onClick={() => toggleSyllabusStatus(item.id, 'completed')}>
                                          Done
                                        </button>
                                        <button type="button" className="btn btn-secondary" onClick={() => toggleSyllabusStatus(item.id, 'skipped')}>
                                          Skip
                                        </button>
                                        <button type="button" className="btn btn-secondary" onClick={() => toggleSyllabusStatus(item.id, 'pending')}>
                                          Reset
                                        </button>
                                        <button type="button" className="btn btn-secondary" onClick={() => removeSyllabusItem(item.id)}>
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                        {(activeSubject.syllabusItems || []).length === 0 && (
                          <p style={{ color: 'var(--text-secondary)' }}>No syllabus topics yet for this subject.</p>
                        )}
                      </div>
                  </div>
                )}

                {activeWorkspacePanel === 'materials' && (
                  <div className="chart-container exam-workspace-panel">
                    <div className="exam-panel-header">
                      <div>
                        <h2>Study Materials</h2>
                        <p className="page-subtitle">Use the materials library to add, open, and track resources beside the syllabus.</p>
                      </div>
                      <span className="badge">{activeSubject.materials?.length || 0} item(s)</span>
                    </div>
                    <div className="exam-materials-shell">
                      <div className="exam-material-form-card">
                        <div className="exam-panel-header">
                          <h3>Add Study Material</h3>
                          <span className="badge">Local file or link</span>
                        </div>
                        <p className="page-subtitle" style={{ marginBottom: '0.9rem' }}>
                          Add study materials here and connect them directly to syllabus topics.
                        </p>
                        <div className="exam-material-form">
                        <div className="form-group">
                          <label>Title</label>
                          <input
                            type="text"
                            value={materialDraft.title}
                            onChange={(e) => setMaterialDraft((prev) => ({ ...prev, title: e.target.value }))}
                            placeholder="e.g., Unit 2 class notes"
                          />
                        </div>
                        <div className="form-group">
                          <label>Type</label>
                          <select
                            value={materialDraft.type}
                            onChange={(e) => setMaterialDraft((prev) => ({ ...prev, type: e.target.value }))}
                          >
                            <option value="notes">Notes</option>
                            <option value="book">Book</option>
                            <option value="pdf">PDF</option>
                            <option value="ppt">PPT</option>
                            <option value="docx">DOCX</option>
                            <option value="video">Video</option>
                            <option value="question-bank">Question Bank</option>
                            <option value="pyq">PYQ</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Description</label>
                          <input
                            type="text"
                            value={materialDraft.description}
                            onChange={(e) => setMaterialDraft((prev) => ({ ...prev, description: e.target.value }))}
                            placeholder="Short note for this resource"
                          />
                        </div>
                        <div className="form-group">
                          <label>Study Material Link</label>
                          <input
                            type="url"
                            value={materialDraft.link}
                            onChange={(e) => setMaterialDraft((prev) => ({ ...prev, link: e.target.value }))}
                            placeholder="https://..."
                          />
                        </div>
                        <div className="form-group">
                          <label>YouTube Link</label>
                          <input
                            type="url"
                            value={materialDraft.youtubeLink}
                            onChange={(e) => setMaterialDraft((prev) => ({ ...prev, youtubeLink: e.target.value }))}
                            placeholder="https://youtube.com/..."
                          />
                        </div>
                        <div className="form-group">
                          <label>Upload File</label>
                          <input type="file" onChange={(e) => setMaterialFile(e.target.files?.[0] || null)} />
                          {savingMaterial && materialFile ? (
                            <div className="exam-task-progress">
                              <div className="exam-task-progress-bar">
                                <span style={{ width: `${materialUploadProgress}%` }} />
                              </div>
                              <p>{materialUploadStatus || 'Uploading material...'} {materialUploadProgress}%</p>
                            </div>
                          ) : null}
                        </div>
                        <div className="form-group exam-syllabus-linker">
                          <label>Link to syllabus topic(s)</label>
                          <div className="exam-linked-topic-groups">
                            {groupedSyllabus.map((group) => (
                              <div key={group.unit} className="exam-linked-topic-group">
                                <strong>{group.unit}</strong>
                                <div className="exam-checkbox-grid">
                                  {group.items.map((item) => (
                                    <label key={item.id} className="exam-checkbox-chip">
                                      <input
                                        type="checkbox"
                                        checked={materialDraft.selectedSyllabusIds.includes(item.id)}
                                        onChange={(e) => {
                                          setMaterialDraft((prev) => ({
                                            ...prev,
                                            selectedSyllabusIds: e.target.checked
                                              ? [...prev.selectedSyllabusIds, item.id]
                                              : prev.selectedSyllabusIds.filter((id) => id !== item.id)
                                          }));
                                        }}
                                      />
                                      <span>{item.title}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <button type="button" className="btn btn-primary" onClick={addMaterial} disabled={savingMaterial}>
                          {savingMaterial ? 'Saving...' : 'Add Material'}
                        </button>
                      </div>
                      </div>

                      <div className="exam-library-card">
                        <div className="exam-panel-header">
                          <h3>Library by Unit</h3>
                          <span className="badge">Grouped with syllabus</span>
                        </div>
                        <div className="exam-library-scroll">
                          {groupedMaterials.map((section) => (
                            <div key={section.unit} className="exam-library-unit">
                              <div className="exam-panel-header">
                                <h3>{section.unit}</h3>
                                <span className="badge">{section.items.length} item(s)</span>
                              </div>
                              <div className="exam-topic-list exam-topic-stack">
                                {section.items.map((material) => (
                                  <div key={material.id} className="exam-topic-row exam-topic-row-compact">
                                    <div>
                                      <strong>{material.title}</strong>
                                      <div className="exam-meta-row">
                                        <span className="badge">{material.type}</span>
                                        <span className="badge">{material.status}</span>
                                        {material.linkedUnits?.slice(1).map((unit) => (
                                          <span key={`${material.id}_${unit}`} className="badge">{unit}</span>
                                        ))}
                                        {material.fileName ? <span className="badge">{material.fileName} • {formatBytes(material.sizeBytes)}</span> : null}
                                        {material.isLocalOnly ? <span className="badge">Local browser file</span> : null}
                                      </div>
                                      {material.description ? <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>{material.description}</p> : null}
                                    </div>
                                    <div className="exam-actions">
                                      <button type="button" className="btn btn-primary" onClick={() => updateMaterialStatus(material.id, 'completed')}>
                                        Done
                                      </button>
                                      <button type="button" className="btn btn-secondary" onClick={() => updateMaterialStatus(material.id, 'skipped')}>
                                        Skip
                                      </button>
                                      <button type="button" className="btn btn-secondary" onClick={() => openMaterial(material)}>
                                        Open
                                      </button>
                                      <button type="button" className="btn btn-secondary" onClick={() => removeMaterial(material.id)}>
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          {(activeSubject.materials || []).length === 0 && (
                            <p style={{ color: 'var(--text-secondary)' }}>No study materials added yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {showSubjectModal && (
          <div className="modal-overlay" onClick={() => !creating && resetSubjectModal()}>
            <div className="modal-content exam-subject-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Create Exam Subject</h2>
                <button type="button" className="modal-close" onClick={resetSubjectModal} disabled={creating}>
                  ×
                </button>
              </div>
              <div className="auth-form">
                <div className="form-group">
                  <label>Subject Name</label>
                  <input
                    type="text"
                    value={subjectDraft.name}
                    onChange={(e) => setSubjectDraft((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Physics"
                  />
                </div>
                <div className="form-group">
                  <label>Exam Name</label>
                  <input
                    type="text"
                    value={subjectDraft.examName}
                    onChange={(e) => setSubjectDraft((prev) => ({ ...prev, examName: e.target.value }))}
                    placeholder="e.g., Semester 4 Finals"
                  />
                </div>
                <div className="form-group">
                  <label>Syllabus Input</label>
                  <div className="period-selector" role="group" aria-label="Select syllabus input mode">
                    <button
                      type="button"
                      className={syllabusEntryMode === 'manual' ? 'active' : ''}
                      onClick={() => setSyllabusEntryMode('manual')}
                    >
                      Manual
                    </button>
                    <button
                      type="button"
                      className={syllabusEntryMode === 'ai' ? 'active' : ''}
                      onClick={() => setSyllabusEntryMode('ai')}
                    >
                      AI Extract
                    </button>
                  </div>
                </div>
                {syllabusEntryMode === 'manual' ? (
                  <div className="form-group">
                    <label>Manual Syllabus</label>
                    <textarea
                      className="exam-textarea"
                      value={subjectDraft.manualSyllabus}
                      onChange={(e) => setSubjectDraft((prev) => ({ ...prev, manualSyllabus: e.target.value }))}
                      placeholder={'Paste one topic per line.\nUnit 1 - Electrostatics\nUnit 2 - Current Electricity'}
                    />
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <label>Upload Syllabus PDF / Image</label>
                      <div className="exam-upload-row">
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          onChange={(e) => setSubjectSourceFile(e.target.files?.[0] || null)}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={extractSyllabus}
                          disabled={extracting || creating}
                        >
                          {extracting ? 'Extracting...' : 'Use AI to Clean'}
                        </button>
                      </div>
                      {extracting && (
                        <div className="exam-task-progress">
                          <div className="exam-task-progress-bar">
                            <span style={{ width: `${extractProgress}%` }} />
                          </div>
                          <p>{extractStatus || 'Extracting syllabus...'} {extractProgress}%</p>
                        </div>
                      )}
                    </div>
                    <div className="form-group">
                      <label>Optional Extra Text</label>
                      <textarea
                        className="exam-textarea"
                        value={subjectDraft.manualSyllabus}
                        onChange={(e) => setSubjectDraft((prev) => ({ ...prev, manualSyllabus: e.target.value }))}
                        placeholder={'Optional: paste extra syllabus text or corrections.\nAfter AI extraction, edit the result here before saving.'}
                      />
                    </div>
                  </>
                )}
                <div className="exam-modal-actions">
                  <button type="button" className="btn btn-primary" onClick={createSubject} disabled={creating}>
                    {creating ? 'Creating...' : 'Create Subject'}
                  </button>
                </div>
                {creating && subjectSourceFile ? (
                  <div className="exam-task-progress">
                    <div className="exam-task-progress-bar">
                      <span style={{ width: `${subjectUploadProgress}%` }} />
                    </div>
                    <p>{subjectUploadStatus || 'Uploading syllabus file...'} {subjectUploadProgress}%</p>
                  </div>
                ) : null}
                {syllabusEntryMode === 'ai' && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    AI extraction fills the syllabus box first. Review and modify it before creating the subject.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {previewTarget && (
          <div className="modal-overlay" onClick={closePreview}>
            <div className="modal-content exam-preview-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{previewTarget.title}</h2>
                <div className="exam-preview-toolbar">
                  <button type="button" className="btn btn-secondary exam-preview-fullscreen" onClick={togglePreviewFullscreen}>
                    Full Screen
                  </button>
                  <button type="button" className="modal-close" onClick={closePreview}>
                    ×
                  </button>
                </div>
              </div>

              <div className="exam-preview-surface" ref={previewSurfaceRef}>
                {previewError ? <p className="error-message">{previewError}</p> : null}

                {previewKind === 'youtube' && youtubeEmbedUrl ? (
                  <iframe title={previewTarget.title} src={youtubeEmbedUrl} className="exam-preview-frame" allowFullScreen />
                ) : null}
                {previewKind === 'image' && (previewUrl || previewTarget.link) ? (
                  <img src={previewUrl || previewTarget.link} alt={previewTarget.title} className="exam-preview-image" />
                ) : null}
                {previewKind === 'pdf' && (previewUrl || previewTarget.link) ? (
                  <iframe title={previewTarget.title} src={previewUrl || previewTarget.link} className="exam-preview-frame" />
                ) : null}
                {previewKind === 'text' && (previewUrl || previewTarget.link) ? (
                  <iframe title={previewTarget.title} src={previewUrl || previewTarget.link} className="exam-preview-frame" />
                ) : null}
                {previewKind === 'office' && officePreviewUrl ? (
                  <iframe title={previewTarget.title} src={officePreviewUrl} className="exam-preview-frame" />
                ) : null}
                {previewKind === 'download' && previewUrl ? (
                  <div className="exam-preview-fallback">
                    <p>Inline preview is limited for this file type in the browser, but you can still open it.</p>
                    <a className="btn btn-primary" href={previewUrl} target="_blank" rel="noreferrer">
                      Open File
                    </a>
                  </div>
                ) : null}
                {previewKind === 'link' && previewTarget.link ? (
                  <div className="exam-preview-fallback">
                    <p>Open the linked resource in a new tab.</p>
                    <a className="btn btn-primary" href={previewTarget.link} target="_blank" rel="noreferrer">
                      Open Link
                    </a>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ExamMode;
