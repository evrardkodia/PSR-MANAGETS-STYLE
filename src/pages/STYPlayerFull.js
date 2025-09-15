import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

/* ──────────────────────────────────────────────────────────────
   Knob simple (drag vertical, molette, clavier)
   ────────────────────────────────────────────────────────────── */
function Knob({ label, min=0, max=100, step=1, value, onChange, caption }) {
  const clamp = (v) => Math.min(max, Math.max(min, v));
  const pct = (value - min) / (max - min);
  const angle = -135 + pct * 270;
  const knobRef = useRef(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(value);

  const setFromDelta = (dy) => {
    const range = max - min;
    const delta = -(dy / 100) * range;
    const raw = startVal.current + delta;
    const stepped = Math.round(raw / step) * step;
    onChange(clamp(stepped));
  };

  const onMouseDown = (e) => {
    dragging.current = true;
    startY.current = e.clientY;
    startVal.current = value;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp, { once: true });
  };
  const onMouseMove = (e) => {
    if (!dragging.current) return;
    const dy = e.clientY - startY.current;
    setFromDelta(dy);
  };
  const onMouseUp = () => {
    dragging.current = false;
    window.removeEventListener('mousemove', onMouseMove);
  };

  const onWheel = (e) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    onChange(clamp(value + dir * step));
  };

  const onKeyDown = (e) => {
    let next = value;
    if (e.key === 'ArrowUp') next = value + step;
    else if (e.key === 'ArrowDown') next = value - step;
    else if (e.key === 'PageUp') next = value + 5 * step;
    else if (e.key === 'PageDown') next = value - 5 * step;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    if (next !== value) {
      e.preventDefault();
      onChange(clamp(next));
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div
        ref={knobRef}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value)}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
        className="w-28 h-28 rounded-full bg-[#2b2b2b] shadow-inner border border-black/30 relative grid place-items-center cursor-grab active:cursor-grabbing"
      >
        <svg width="84" height="84" viewBox="0 0 84 84">
          <defs>
            <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#3d3d3d" />
              <stop offset="100%" stopColor="#1f1f1f" />
            </linearGradient>
          </defs>
          <circle cx="42" cy="42" r="36" fill="url(#g)" stroke="#111" strokeWidth="2" />
          {[...Array(11)].map((_, i) => {
            const a = (-135 + (270 * i) / 10) * (Math.PI / 180);
            const x1 = 42 + Math.cos(a) * 28;
            const y1 = 42 + Math.sin(a) * 28;
            const x2 = 42 + Math.cos(a) * 34;
            const y2 = 42 + Math.sin(a) * 34;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#666" strokeWidth="2" />;
          })}
          <g transform={`rotate(${angle} 42 42)`}>
            <line x1="42" y1="42" x2="42" y2="14" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
            <circle cx="42" cy="42" r="5" fill="#0f0f0f" stroke="#f59e0b" />
          </g>
        </svg>
        <div className="absolute bottom-1 text-xs text-gray-300">{Math.round(value)}</div>
      </div>
      <div className="text-sm font-semibold tracking-wide">{label}</div>
      {caption && <div className="text-xs text-gray-400">{caption}</div>}
    </div>
  );
}

export default function STYPlayer() {
  const [beats, setBeats] = useState([]);
  const [selectedBeat, setSelectedBeat] = useState(null);
  const [sectionsAvailability, setSectionsAvailability] = useState({});
  const [page, setPage] = useState(0);
  const [controls, setControls] = useState({
    acmp:false,
    intro:'',
    main:'A',
    ending:'',
    play:false,
  });
  const [mainBlinking, setMainBlinking] = useState(null);
  const [playColor, setPlayColor] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const [volume, setVolume] = useState(80);
  const [tempo, setTempo] = useState(120);
  const baseTempoRef = useRef(120);

  // Audio + état courant impératif
  const mainAudioRef = useRef(null);
  const oneShotAudioRef = useRef(null);
  const currentMainRef = useRef('A');             // lettre Main courante
  const sessionRef = useRef(0);                   // playSessionId (anti callbacks fantômes)
  const togglePlayRef = useRef(null);             // pour la barre d'espace

  const playTimerRef = useRef(null);
  const blinkStepIndex = useRef(0);
  const navigate = useNavigate();
  const ITEMS_PER_PAGE = 10;

  const blinkSequence = [
    { color: 'blue', duration: 100 }, { color: null, duration: 500 },
    { color: 'orange', duration: 100 }, { color: null, duration: 500 },
    { color: 'orange', duration: 100 }, { color: null, duration: 500 },
    { color: 'orange', duration: 100 }, { color: null, duration: 500 },
  ];

  const getSupabaseWavUrl = (beatId, sectionName) => {
    const filename = `${beatId}_${sectionName.replace(/ /g, '_')}.wav`;
    return `https://swtbkiudmfvnywcgpzfe.supabase.co/storage/v1/object/public/midiAndWav/${beatId}/${filename}`;
  };

  /* ─────────── Volume & Tempo ─────────── */
  useEffect(() => {
    const v = Math.max(0, Math.min(1, volume / 100));
    if (mainAudioRef.current) mainAudioRef.current.volume = v;
    if (oneShotAudioRef.current) oneShotAudioRef.current.volume = v;
  }, [volume]);

  useEffect(() => {
    const base = baseTempoRef.current || 120;
    const rate = Math.max(0.25, Math.min(4, tempo / base));
    if (mainAudioRef.current) mainAudioRef.current.playbackRate = rate;
    if (oneShotAudioRef.current) oneShotAudioRef.current.playbackRate = rate;
  }, [tempo]);

  /* ─────────── Blink Play ─────────── */
  useEffect(() => {
    if (controls.play) {
      blinkStepIndex.current = 0;
      const runBlink = () => {
        const step = blinkSequence[blinkStepIndex.current];
        setPlayColor(step.color);
        playTimerRef.current = setTimeout(() => {
          blinkStepIndex.current = (blinkStepIndex.current + 1) % blinkSequence.length;
          runBlink();
        }, step.duration);
      };
      runBlink();
    } else {
      clearTimeout(playTimerRef.current);
      setPlayColor(null);
    }
    return () => clearTimeout(playTimerRef.current);
  }, [controls.play]);

  /* ─────────── Charger beats ─────────── */
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/auth'); return; }
    axios.get('/api/beats', { headers:{ Authorization:`Bearer ${token}` } })
      .then(res => setBeats(res.data.beats.sort((a,b)=>a.title.localeCompare(b.title))))
      .catch(()=>navigate('/auth'));
  }, [navigate]);

  /* ─────────── Cleanup ─────────── */
  useEffect(() => {
    return () => {
      if (mainAudioRef.current) {
        mainAudioRef.current.onended = null;
        mainAudioRef.current.pause();
        mainAudioRef.current.src='';
        mainAudioRef.current.load();
      }
      if (oneShotAudioRef.current) {
        oneShotAudioRef.current.onended=null;
        oneShotAudioRef.current.pause();
        oneShotAudioRef.current.src='';
        oneShotAudioRef.current.load();
      }
      clearTimeout(playTimerRef.current);
      sessionRef.current++; // invalide toute tâche asynchrone restante
    };
  }, []);

  /* ─────────── Helpers audio ─────────── */
  const startNewSession = () => (++sessionRef.current);      // renvoie l'ID courant
  const getSession = () => sessionRef.current;

  // STRICT LOOP: on désactive loop natif et on relance manuellement la même Main
  const playMainLoop = async (beatId, letter) => {
    const mainEl = mainAudioRef.current;
    const oneEl  = oneShotAudioRef.current;
    if (!mainEl) return;

    // coupe tout one-shot
    if (oneEl) {
      oneEl.onended = null;
      oneEl.pause();
      oneEl.currentTime = 0;
      oneEl.src='';
      try { oneEl.load(); } catch {}
    }

    const sid = getSession(); // session au moment où on (re)lance la Main
    currentMainRef.current = letter;

    mainEl.onended = null;   // supprime toute boucle précédente
    mainEl.loop = false;     // loop manuel pour garder le contrôle strict
    mainEl.src = getSupabaseWavUrl(beatId, `Main ${letter}`);
    mainEl.preload = 'auto';
    mainEl.currentTime = 0;

    try { await mainEl.play(); } catch(e){ console.error('play main error', e); }

    // Boucle manuelle: rejoue EXACTEMENT la même Main si la session/le choix n'ont pas changé
    mainEl.onended = async () => {
      if (sessionRef.current !== sid) return;              // session invalidée → ne rien faire
      if (currentMainRef.current !== letter) return;       // l’utilisateur a choisi une autre Main
      try {
        mainEl.currentTime = 0;
        await mainEl.play();
      } catch (e) {
        // en secours, on recharge la source
        try {
          mainEl.src = getSupabaseWavUrl(beatId, `Main ${letter}`);
          mainEl.currentTime = 0;
          await mainEl.play();
        } catch (e2) {
          console.error('strict loop retry failed', e2);
        }
      }
    };

    setControls((p)=>({ ...p, play:true, main:letter }));
    setMainBlinking(letter);
    setTimeout(()=>setMainBlinking(null), 1500);
  };

  const playOneShotThenResumeMain = async (beatId, sectionName) => {
    const oneEl = oneShotAudioRef.current;
    const mainEl = mainAudioRef.current;
    if (!oneEl || !mainEl) return;

    // capture contexte strict
    const sid = getSession();
    const resumeLetter = currentMainRef.current || 'A';

    // suspend la boucle main
    try {
      mainEl.onended = null;    // stop boucle manuelle
      mainEl.pause();
    } catch {}

    // configure one-shot
    oneEl.onended = null;
    oneEl.src = getSupabaseWavUrl(beatId, sectionName);
    oneEl.loop = false;
    oneEl.preload = 'auto';

    try {
      await oneEl.play();
      setControls((p)=>({ ...p, play:true }));
    } catch (err) {
      console.error('oneshot play error', err);
      // fallback: reprendre la même Main si la session est toujours valide
      if (sessionRef.current === sid) {
        await playMainLoop(beatId, resumeLetter);
      }
      return;
    }

    // à la fin, si la session est toujours valide, reprendre EXACTEMENT la Main capturée
    oneEl.onended = async () => {
      if (sessionRef.current !== sid) return;
      await playMainLoop(beatId, resumeLetter);
    };
  };

  /* ─────────── Sélection beat ─────────── */
  const handleSelectBeat = async (beat) => {
    if (isLoading) return;
    setIsLoading(true);
    setSelectedBeat(beat);

    // reset UI
    setControls({ acmp:false, intro:'', main:'A', ending:'', play:false });
    currentMainRef.current = 'A';
    setMainBlinking(null);
    setPlayColor(null);
    clearTimeout(playTimerRef.current);

    // stop audio + purge handlers/sources
    if (mainAudioRef.current) {
      mainAudioRef.current.onended = null;
      mainAudioRef.current.pause();
      mainAudioRef.current.currentTime=0;
      mainAudioRef.current.src='';
      try { mainAudioRef.current.load(); } catch {}
    }
    if (oneShotAudioRef.current) {
      oneShotAudioRef.current.onended=null;
      oneShotAudioRef.current.pause();
      oneShotAudioRef.current.currentTime=0;
      oneShotAudioRef.current.src='';
      try { oneShotAudioRef.current.load(); } catch {}
    }
    startNewSession(); // invalide toute ancienne fin de one-shot / boucle

    // tempo de base
    const newBase = beat?.tempo || 120;
    baseTempoRef.current = newBase;
    setTempo(newBase);

    try {
      const token = localStorage.getItem('token');
      const r = await axios.post('/api/player/prepare-all', { beatId: beat.id }, { headers:{ Authorization:`Bearer ${token}` } });
      setSectionsAvailability(r.data.sections || {});
    } catch (e) {
      console.error('prepare-all failed', e);
      alert('❌ Échec de la préparation du beat');
      setSectionsAvailability({});
    } finally {
      setIsLoading(false);
    }
  };

  /* ─────────── Play/Pause ─────────── */
  const togglePlay = async () => {
    if (!selectedBeat || isLoading) {
      alert('⚠️ Aucun beat sélectionné ou chargement en cours.');
      return;
    }

    // STOP
    if (controls.play) {
      startNewSession(); // invalide callbacks
      if (oneShotAudioRef.current) {
        oneShotAudioRef.current.onended = null;
        oneShotAudioRef.current.pause();
        oneShotAudioRef.current.currentTime = 0;
        oneShotAudioRef.current.src = '';
        try { oneShotAudioRef.current.load(); } catch {}
      }
      if (mainAudioRef.current) {
        mainAudioRef.current.onended = null;
        mainAudioRef.current.pause();
        mainAudioRef.current.currentTime = 0;
        mainAudioRef.current.src = '';
        try { mainAudioRef.current.load(); } catch {}
      }
      setControls((p)=>({ ...p, play:false }));
      setPlayColor(null);
      clearTimeout(playTimerRef.current);
      return;
    }

    // START — STRICT : démarrer toujours sur Main sélectionné
    const mainLetter = controls.main || 'A';
    if (sectionsAvailability[`Main ${mainLetter}`] === 1) {
      startNewSession();
      await playMainLoop(selectedBeat.id, mainLetter);
    } else {
      // fallback: première Main dispo
      const fb = ['A','B','C','D'].find(L => sectionsAvailability[`Main ${L}`] === 1);
      if (!fb) { alert('Aucune section Main disponible.'); return; }
      startNewSession();
      await playMainLoop(selectedBeat.id, fb);
    }
  };

  useEffect(() => { togglePlayRef.current = togglePlay; });
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
      const isEditable = e.target && (e.target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT');
      if ((e.code === 'Space' || e.key === ' ') && !e.repeat && !isEditable) {
        e.preventDefault();
        if (togglePlayRef.current) togglePlayRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /* ─────────── UI events ─────────── */
  const handleControlClick = (type, value = null) => {
    if (!type) return;
    const letter = value ? String(value).toUpperCase() : '';

    // À l'arrêt
    if (!controls.play) {
      if (type === 'main') {
        setControls((p)=>({ ...p, main:letter, intro:'', ending:'' })); // nettoie one-shots
        currentMainRef.current = letter;
        setMainBlinking(letter); setTimeout(()=>setMainBlinking(null), 1200);
        return;
      }
      if (type === 'intro') { setControls((p)=>({ ...p, intro:letter, ending:'' })); return; }
      if (type === 'ending') { setControls((p)=>({ ...p, ending:letter, intro:'' })); return; }
      if (type === 'acmp')   { setControls((p)=>({ ...p, acmp:!p.acmp })); return; }
      if (type === 'play')   { togglePlay(); return; }
      return;
    }

    // En lecture
    if (type === 'main') {
      if (!letter || currentMainRef.current === letter) return;
      currentMainRef.current = letter;
      // STRICT: bascule directe sur le Main demandé (aucun fill-in implicite)
      playMainLoop(selectedBeat.id, letter);
      setControls((p)=>({ ...p, main:letter }));
      setMainBlinking(letter); setTimeout(()=>setMainBlinking(null), 1500);
      return;
    }

    if (type === 'intro' || type === 'ending') {
      // One-shot seulement si cliqué explicitement (jamais automatique)
      // On choisit la clé existante: "Ending X" OU "End X"
      const primary = `${type[0].toUpperCase()+type.slice(1)} ${letter}`;   // "Intro X" / "Ending X"
      const alt     = type === 'ending' ? `End ${letter}` : primary;
      const sectionKey = sectionsAvailability[primary] === 1 ? primary
                        : sectionsAvailability[alt] === 1 ? alt
                        : null;
      if (!sectionKey) return;
      // ne pas changer currentMainRef : on reprend le Main courant après
      playOneShotThenResumeMain(selectedBeat.id, sectionKey);
      setControls((p)=> type==='intro' ? { ...p, intro:letter, ending:'' } : { ...p, ending:letter, intro:'' });
      return;
    }

    if (type === 'acmp') { setControls((p)=>({ ...p, acmp:!p.acmp })); return; }
    if (type === 'play') { togglePlay(); return; }
  };

  /* ─────────── Rendu UI ─────────── */
  const currentPageBeats = beats.slice(page * 10, (page + 1) * 10);
  const leftColumn = currentPageBeats.slice(0, 5);
  const rightColumn = currentPageBeats.slice(5);

  const renderBeatCard = (beat) => (
    <div
      key={beat.id}
      onClick={() => handleSelectBeat(beat)}
      className={`flex items-center gap-3 cursor-pointer p-2 mb-2 rounded-md transition hover:bg-blue-700 ${
        selectedBeat?.id === beat.id ? 'bg-blue-800' : 'bg-[#3a3a3a]'
      }`}
      style={{ height: '1cm', minHeight: '1cm' }}
    >
      <div className="w-10 h-10 bg-white flex items-center justify-center rounded-sm">
        <img src={getIconPath(beat.title)} alt="icon" className="w-8 h-8 object-contain" />
      </div>
      <div style={{ fontSize: '0.8rem', lineHeight: '1rem' }}>
        <p className="font-semibold">{beat.title}</p>
        {beat.user?.username && (
          <p className="text-sm text-gray-400">
            {beat.signature} - {beat.tempo} BPM - Auteur : {beat.user.username}
          </p>
        )}
      </div>
    </div>
  );

  const getIconPath = (title) => `/icons/${(Array.from(title).reduce((s,c)=>s+c.charCodeAt(0),0)%10)+1}.png`;

  const renderButton = (type, label, isActive, onClick, isBlinking = false, disabled = false) => {
    let colorClass = 'bg-transparent';
    if (type === 'acmp') colorClass = isActive ? 'bg-orange-400 glow' : 'bg-black';
    else if (type === 'main') colorClass = isBlinking ? 'animate-orange-blue-blink' : isActive ? 'bg-blue-500 glow' : 'bg-orange-400';
    else colorClass = isActive ? 'bg-orange-400 glow' : 'bg-transparent';
    if (disabled) colorClass = 'bg-black';

    return (
      <div
        onClick={disabled ? undefined : onClick}
        className={`flex flex-col items-center select-none ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      >
        <div className={`w-8 h-2 mb-1 rounded-sm transition-all duration-300 ${colorClass}`} />
        <button
          className="text-white bg-[#333] w-16 h-[60px] rounded-md font-bold"
          style={{ fontSize: type === 'main' ? '1.2rem' : '0.65rem' }}
          disabled={(isLoading && type === 'play') || disabled}
        >
          {label}
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white p-6 select-none">
      <audio ref={mainAudioRef} hidden />
      <audio ref={oneShotAudioRef} hidden />
      <h1 className="text-3xl font-bold text-center mb-4">🎧 PSR MANAGER STYLE</h1>

      {/* knobs aux extrémités + centre élargi légèrement */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-stretch md:justify-between gap-4 mb-6">
        <div className="md:w-[160px] w-full bg-[#2a2a2a] rounded-xl p-4 grid place-items-center">
          <Knob label="VOLUME" min={0} max={100} step={1} value={volume} caption={`${Math.round(volume)}%`} onChange={setVolume} />
        </div>

        <div className="flex-1 md:basis-[720px] md:max-w-[calc(100%-320px-1rem)] grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#2a2a2a] p-4 rounded-xl shadow-inner">
            {leftColumn.length === 0 ? <p className="text-gray-400 text-center">Aucun beat disponible</p> : leftColumn.map(renderBeatCard)}
          </div>
          <div className="bg-[#2a2a2a] p-4 rounded-xl shadow-inner">
            {rightColumn.length === 0 ? <p className="text-gray-400 text-center">Rien à afficher</p> : rightColumn.map(renderBeatCard)}
          </div>
        </div>

        <div className="md:w-[160px] w-full bg-[#2a2a2a] rounded-xl p-4 grid place-items-center">
          <Knob label="TEMPO" min={40} max={240} step={1} value={tempo} caption={`${Math.round(tempo)} BPM`} onChange={setTempo} />
        </div>
      </div>

      {selectedBeat && (
        <div className="bg-[#2a2a2a] p-4 rounded-xl text-center space-y-3 max-w-6xl mx-auto">
          <div className="flex flex-nowrap overflow-x-auto justify-center gap-2 mt-6 bg-[#1c1c1c] p-3 rounded-lg">
            {renderButton('acmp', 'ACMP', controls.acmp, () => handleControlClick('acmp'))}

            {['A','B','C','D'].map((i) => {
              const enabled = sectionsAvailability[`Intro ${i}`] === 1;
              return renderButton('intro', `INTRO ${i}`, controls.intro === i && enabled, () => handleControlClick('intro', i), false, !enabled);
            })}

            {['A','B','C','D'].map((m) => {
              const enabled = sectionsAvailability[`Main ${m}`] === 1;
              return renderButton('main', m, controls.main === m && enabled, () => handleControlClick('main', m), mainBlinking === m, !enabled);
            })}

            {['A','B','C','D'].map((i) => {
              // bouton actif si Ending X OU End X existe
              const enabled = sectionsAvailability[`Ending ${i}`] === 1 || sectionsAvailability[`End ${i}`] === 1;
              return renderButton('ending', `END ${i}`, controls.ending === i && enabled, () => handleControlClick('ending', i), false, !enabled);
            })}

            <div className="flex flex-col items-center cursor-pointer" onClick={() => handleControlClick('play')}>
              <div className={`w-8 h-2 mb-1 rounded-sm ${playColor === 'blue' ? 'bg-blue-500 glow' : playColor === 'orange' ? 'bg-orange-400 glow' : 'bg-black'}`} />
              <button className="text-[10px] bg-gray-300 hover:bg-gray-400 text-black w-16 h-[60px] rounded-md font-bold"
                disabled={isLoading}
                title={isLoading ? 'Chargement en cours...' : controls.play ? 'Arrêter la lecture' : 'Lire le beat'}>
                {isLoading ? '⏳' : controls.play ? '⏹ STOP' : '▶️ PLAY'}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">Astuce : <span className="font-semibold">Espace</span> = Play/Pause.</p>
        </div>
      )}

      <style>{`
        .glow { box-shadow: 0 0 8px 3px currentColor; }
        @keyframes orangeBlueBlink { 0%, 100% { background-color: orange; } 50% { background-color: blue; } }
        .animate-orange-blue-blink { animation: orangeBlueBlink 1.5s infinite; }
        .flex-nowrap { white-space: nowrap; }
        .cursor-not-allowed { cursor: not-allowed !important; }
      `}</style>
    </div>
  );
}
